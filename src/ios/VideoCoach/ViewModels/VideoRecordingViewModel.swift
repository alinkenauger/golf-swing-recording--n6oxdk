import Foundation // iOS 14.0+
import AVFoundation // iOS 14.0+
import Combine // iOS 14.0+
import Network // iOS 14.0+

/// Comprehensive error types for video recording operations
public enum RecordingError: Error, LocalizedError {
    case permissionDenied(String)
    case setupFailed(String)
    case recordingFailed(String)
    case processingFailed(String)
    case networkError(String)
    case resourceError(String)
    case qualityAdaptationFailed(String)
    
    public var errorDescription: String? {
        switch self {
        case .permissionDenied(let message): return "Permission denied: \(message)"
        case .setupFailed(let message): return "Setup failed: \(message)"
        case .recordingFailed(let message): return "Recording failed: \(message)"
        case .processingFailed(let message): return "Processing failed: \(message)"
        case .networkError(let message): return "Network error: \(message)"
        case .resourceError(let message): return "Resource error: \(message)"
        case .qualityAdaptationFailed(let message): return "Quality adaptation failed: \(message)"
        }
    }
}

/// ViewModel managing video recording functionality with comprehensive error handling and resource management
@MainActor
@available(iOS 14.0, *)
public final class VideoRecordingViewModel: ObservableObject {
    // MARK: - Published Properties
    
    @Published private(set) var isRecording: Bool = false
    @Published private(set) var recordingDuration: TimeInterval = 0
    @Published private(set) var recordingQuality: VideoQualityPreset = .high
    @Published private(set) var error: RecordingError?
    @Published private(set) var processingProgress: Double = 0
    @Published private(set) var uploadProgress: Double = 0
    
    // MARK: - Private Properties
    
    private let captureSession = AVCaptureSession()
    private var videoOutput = AVCaptureMovieFileOutput()
    private let videoService: VideoService
    private let permissionManager: PermissionManager
    private var cancellables = Set<AnyCancellable>()
    private var backgroundTaskID: UIBackgroundTaskIdentifier?
    private let processingQueue: OperationQueue
    private var networkMonitor: NetworkMonitor?
    private var durationTimer: Timer?
    private var temporaryFileURL: URL?
    
    // MARK: - Initialization
    
    public init() {
        self.videoService = VideoService.shared
        self.permissionManager = PermissionManager.shared
        
        // Configure processing queue
        self.processingQueue = OperationQueue()
        self.processingQueue.maxConcurrentOperationCount = 1
        self.processingQueue.qualityOfService = .userInitiated
        
        // Initialize network monitoring
        self.networkMonitor = NetworkMonitor.shared
        
        setupMemoryWarningObserver()
        setupNetworkQualityObserver()
    }
    
    // MARK: - Public Methods
    
    /// Sets up camera capture session with error handling and resource validation
    public func setupCamera() -> AnyPublisher<Void, RecordingError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.setupFailed("ViewModel deallocated")))
                return
            }
            
            // Request permissions
            Publishers.CombineLatest(
                self.permissionManager.requestCameraAccess(),
                self.permissionManager.requestMicrophoneAccess()
            )
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        promise(.failure(.permissionDenied(error.localizedDescription)))
                    }
                },
                receiveValue: { [weak self] (cameraGranted, micGranted) in
                    guard let self = self else { return }
                    guard cameraGranted && micGranted else {
                        promise(.failure(.permissionDenied("Camera or microphone access denied")))
                        return
                    }
                    
                    do {
                        // Configure capture session
                        self.captureSession.beginConfiguration()
                        self.captureSession.sessionPreset = .high
                        
                        // Add video input
                        guard let videoDevice = AVCaptureDevice.default(for: .video) else {
                            throw RecordingError.setupFailed("No video device available")
                        }
                        let videoInput = try AVCaptureDeviceInput(device: videoDevice)
                        guard self.captureSession.canAddInput(videoInput) else {
                            throw RecordingError.setupFailed("Cannot add video input")
                        }
                        self.captureSession.addInput(videoInput)
                        
                        // Add audio input
                        guard let audioDevice = AVCaptureDevice.default(for: .audio) else {
                            throw RecordingError.setupFailed("No audio device available")
                        }
                        let audioInput = try AVCaptureDeviceInput(device: audioDevice)
                        guard self.captureSession.canAddInput(audioInput) else {
                            throw RecordingError.setupFailed("Cannot add audio input")
                        }
                        self.captureSession.addInput(audioInput)
                        
                        // Configure video output
                        guard self.captureSession.canAddOutput(self.videoOutput) else {
                            throw RecordingError.setupFailed("Cannot add video output")
                        }
                        self.captureSession.addOutput(self.videoOutput)
                        
                        self.captureSession.commitConfiguration()
                        
                        // Start running session
                        self.captureSession.startRunning()
                        promise(.success(()))
                        
                    } catch {
                        promise(.failure(.setupFailed(error.localizedDescription)))
                    }
                }
            )
            .store(in: &self.cancellables)
        }.eraseToAnyPublisher()
    }
    
    /// Starts video recording with resource management and background task handling
    public func startRecording() {
        guard !isRecording else { return }
        
        // Begin background task
        backgroundTaskID = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.stopRecording()
            self?.endBackgroundTask()
        }
        
        // Create temporary file URL
        temporaryFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        
        guard let fileURL = temporaryFileURL else {
            error = .recordingFailed("Failed to create temporary file")
            return
        }
        
        // Configure recording settings based on network quality
        let connectionQuality = networkMonitor?.connectionQuality.value ?? .unknown
        recordingQuality = adaptQualityToNetwork(connectionQuality)
        configureRecordingSettings(for: recordingQuality)
        
        // Start recording
        videoOutput.startRecording(to: fileURL, recordingDelegate: self)
        isRecording = true
        
        // Start duration timer
        startDurationTimer()
    }
    
    /// Stops current recording and processes video with quality adaptation
    public func stopRecording() -> AnyPublisher<URL, RecordingError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.recordingFailed("ViewModel deallocated")))
                return
            }
            
            guard self.isRecording else {
                promise(.failure(.recordingFailed("No active recording")))
                return
            }
            
            self.videoOutput.stopRecording()
            self.stopDurationTimer()
            
            guard let fileURL = self.temporaryFileURL else {
                promise(.failure(.recordingFailed("No temporary file URL")))
                return
            }
            
            // Process video
            let processor = VideoProcessor()
            let result = processor.processVideo(
                at: fileURL,
                quality: self.recordingQuality
            ) { [weak self] progress in
                self?.processingProgress = progress.progress
            }
            
            switch result {
            case .success(let processedVideo):
                // Clean up
                self.cleanupTemporaryFiles()
                self.endBackgroundTask()
                self.isRecording = false
                promise(.success(processedVideo.url))
                
            case .failure(let error):
                self.cleanupTemporaryFiles()
                self.endBackgroundTask()
                self.isRecording = false
                promise(.failure(.processingFailed(error.localizedDescription)))
            }
        }.eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupMemoryWarningObserver() {
        NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)
            .sink { [weak self] _ in
                self?.handleMemoryWarning()
            }
            .store(in: &cancellables)
    }
    
    private func setupNetworkQualityObserver() {
        networkMonitor?.connectionQuality
            .sink { [weak self] quality in
                self?.adaptQualityToNetwork(quality)
            }
            .store(in: &cancellables)
    }
    
    private func handleMemoryWarning() {
        if isRecording {
            // Lower quality if possible
            if recordingQuality != .low {
                recordingQuality = .low
                configureRecordingSettings(for: .low)
            }
        }
        
        // Clear non-essential resources
        processingQueue.cancelAllOperations()
        cleanupTemporaryFiles()
    }
    
    private func adaptQualityToNetwork(_ quality: ConnectionQuality) -> VideoQualityPreset {
        switch quality {
        case .excellent:
            return .high
        case .good:
            return .medium
        case .fair, .poor:
            return .low
        case .unknown:
            return .medium
        }
    }
    
    private func configureRecordingSettings(for quality: VideoQualityPreset) {
        guard let connection = videoOutput.connection(with: .video) else { return }
        
        // Configure video stabilization
        if connection.isVideoStabilizationSupported {
            connection.preferredVideoStabilizationMode = .auto
        }
        
        // Configure video orientation
        connection.videoOrientation = .portrait
        
        // Configure maximum duration
        videoOutput.maxRecordedDuration = CMTime(seconds: VideoConfig.maxDuration, preferredTimescale: 600)
        
        // Configure quality settings
        switch quality {
        case .high:
            videoOutput.movieFragmentInterval = .invalid
            connection.videoMaxFrameDuration = CMTime(value: 1, timescale: 60)
        case .medium:
            videoOutput.movieFragmentInterval = CMTime(seconds: 1, preferredTimescale: 600)
            connection.videoMaxFrameDuration = CMTime(value: 1, timescale: 30)
        case .low:
            videoOutput.movieFragmentInterval = CMTime(seconds: 2, preferredTimescale: 600)
            connection.videoMaxFrameDuration = CMTime(value: 1, timescale: 24)
        default:
            break
        }
    }
    
    private func startDurationTimer() {
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.recordingDuration += 0.1
        }
    }
    
    private func stopDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
    }
    
    private func cleanupTemporaryFiles() {
        if let url = temporaryFileURL {
            try? FileManager.default.removeItem(at: url)
            temporaryFileURL = nil
        }
    }
    
    private func endBackgroundTask() {
        if let taskID = backgroundTaskID {
            UIApplication.shared.endBackgroundTask(taskID)
            backgroundTaskID = nil
        }
    }
}

// MARK: - AVCaptureFileOutputRecordingDelegate

extension VideoRecordingViewModel: AVCaptureFileOutputRecordingDelegate {
    public func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        Task { @MainActor in
            isRecording = true
        }
    }
    
    public func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        Task { @MainActor in
            if let error = error {
                self.error = .recordingFailed(error.localizedDescription)
            }
            isRecording = false
        }
    }
}