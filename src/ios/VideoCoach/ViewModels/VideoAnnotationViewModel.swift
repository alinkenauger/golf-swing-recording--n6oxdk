import Foundation // iOS 14.0+
import Combine // iOS 14.0+
import AVFoundation // iOS 14.0+

/// Represents the current state of the annotation view
public enum AnnotationViewState {
    case idle
    case drawing
    case recording
    case processing
    case error
}

/// Custom errors for annotation operations
public enum AnnotationError: LocalizedError {
    case invalidState
    case recordingFailed(String)
    case processingFailed(String)
    case saveFailed(String)
    case networkError(Error)
    case memoryWarning
    
    public var errorDescription: String? {
        switch self {
        case .invalidState: return "Invalid annotation state"
        case .recordingFailed(let reason): return "Recording failed: \(reason)"
        case .processingFailed(let reason): return "Processing failed: \(reason)"
        case .saveFailed(let reason): return "Save failed: \(reason)"
        case .networkError(let error): return "Network error: \(error.localizedDescription)"
        case .memoryWarning: return "Memory warning received"
        }
    }
}

/// ViewModel managing video annotation state and operations
@available(iOS 14.0, *)
@MainActor
public final class VideoAnnotationViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published private(set) var currentVideo: Video?
    @Published private(set) var viewState: AnnotationViewState = .idle
    @Published var selectedTool: DrawingTool = .pen
    @Published var strokeColor: String = "#FF0000"
    @Published var strokeWidth: CGFloat = 2.0
    @Published private(set) var currentAnnotation: Annotation?
    @Published private(set) var isRecording: Bool = false
    @Published private(set) var error: AnnotationError?
    
    // MARK: - Private Properties
    
    private let videoService: VideoService
    private var cancellables = Set<AnyCancellable>()
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var currentDrawingPoints: [DrawingPoint] = []
    private var voiceOverRecorder: AVAudioRecorder?
    private var voiceOverURL: URL?
    private let memoryThreshold: Double = 0.8
    
    // MARK: - Initialization
    
    public init(video: Video) {
        self.currentVideo = video
        self.videoService = VideoService.shared
        
        setupMemoryWarningObserver()
        setupNetworkMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Starts a new drawing annotation
    public func startDrawing(at point: CGPoint) -> AnyPublisher<Bool, AnnotationError> {
        guard viewState == .idle else {
            return Fail(error: .invalidState).eraseToAnyPublisher()
        }
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.invalidState))
                return
            }
            
            self.beginBackgroundTask()
            self.viewState = .drawing
            self.currentDrawingPoints = []
            
            let drawingPoint = DrawingPoint(
                x: point.x,
                y: point.y,
                pressure: 1.0,
                timestamp: CACurrentMediaTime()
            )
            
            self.currentDrawingPoints.append(drawingPoint)
            promise(.success(true))
        }
        .eraseToAnyPublisher()
    }
    
    /// Updates current drawing with new point
    public func updateDrawing(at point: CGPoint, pressure: CGFloat) {
        guard viewState == .drawing else { return }
        
        let drawingPoint = DrawingPoint(
            x: point.x,
            y: point.y,
            pressure: pressure,
            timestamp: CACurrentMediaTime()
        )
        
        currentDrawingPoints.append(drawingPoint)
    }
    
    /// Finishes current drawing annotation
    public func finishDrawing() -> AnyPublisher<Bool, AnnotationError> {
        guard viewState == .drawing else {
            return Fail(error: .invalidState).eraseToAnyPublisher()
        }
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.invalidState))
                return
            }
            
            let drawingAnnotation = DrawingAnnotation(
                toolType: self.selectedTool,
                points: self.currentDrawingPoints,
                color: self.strokeColor,
                strokeWidth: self.strokeWidth,
                isFilled: false,
                opacity: 1.0
            )
            
            guard drawingAnnotation.validate() else {
                self.viewState = .idle
                promise(.failure(.processingFailed("Invalid annotation data")))
                return
            }
            
            self.viewState = .processing
            
            self.videoService.annotateVideo(
                self.currentVideo?.id.uuidString ?? "",
                annotation: drawingAnnotation
            )
            .sink(
                receiveCompletion: { completion in
                    switch completion {
                    case .finished:
                        self.viewState = .idle
                        self.currentDrawingPoints = []
                        self.endBackgroundTask()
                        promise(.success(true))
                    case .failure(let error):
                        self.viewState = .error
                        self.error = .processingFailed(error.localizedDescription)
                        self.endBackgroundTask()
                        promise(.failure(.processingFailed(error.localizedDescription)))
                    }
                },
                receiveValue: { _ in }
            )
            .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    /// Starts voice-over recording
    public func startVoiceOver() -> AnyPublisher<Bool, AnnotationError> {
        guard viewState == .idle else {
            return Fail(error: .invalidState).eraseToAnyPublisher()
        }
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.invalidState))
                return
            }
            
            self.beginBackgroundTask()
            
            do {
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.record, mode: .default)
                try audioSession.setActive(true)
                
                let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                self.voiceOverURL = documentsPath.appendingPathComponent("voiceover_\(UUID().uuidString).m4a")
                
                let settings: [String: Any] = [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 44100.0,
                    AVNumberOfChannelsKey: 1,
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
                ]
                
                guard let url = self.voiceOverURL else {
                    throw AnnotationError.recordingFailed("Invalid recording URL")
                }
                
                self.voiceOverRecorder = try AVAudioRecorder(url: url, settings: settings)
                self.voiceOverRecorder?.delegate = self
                
                guard self.voiceOverRecorder?.record() == true else {
                    throw AnnotationError.recordingFailed("Failed to start recording")
                }
                
                self.viewState = .recording
                self.isRecording = true
                promise(.success(true))
                
            } catch {
                self.viewState = .error
                self.error = .recordingFailed(error.localizedDescription)
                self.endBackgroundTask()
                promise(.failure(.recordingFailed(error.localizedDescription)))
            }
        }
        .eraseToAnyPublisher()
    }
    
    /// Stops voice-over recording
    public func stopVoiceOver() -> AnyPublisher<Bool, AnnotationError> {
        guard viewState == .recording else {
            return Fail(error: .invalidState).eraseToAnyPublisher()
        }
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.invalidState))
                return
            }
            
            self.voiceOverRecorder?.stop()
            
            guard let url = self.voiceOverURL else {
                promise(.failure(.recordingFailed("No recording URL")))
                return
            }
            
            do {
                let audioData = try Data(contentsOf: url)
                let voiceOverAnnotation = VoiceOverAnnotation(
                    audioUrl: url,
                    duration: self.voiceOverRecorder?.currentTime ?? 0,
                    format: "audio/m4a",
                    sizeBytes: audioData.count
                )
                
                guard voiceOverAnnotation.validate() else {
                    throw AnnotationError.processingFailed("Invalid voice-over data")
                }
                
                self.viewState = .processing
                
                self.videoService.recordVoiceOver(
                    self.currentVideo?.id.uuidString ?? "",
                    annotation: voiceOverAnnotation
                )
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .finished:
                            self.viewState = .idle
                            self.isRecording = false
                            self.voiceOverURL = nil
                            self.endBackgroundTask()
                            promise(.success(true))
                        case .failure(let error):
                            self.viewState = .error
                            self.error = .processingFailed(error.localizedDescription)
                            self.endBackgroundTask()
                            promise(.failure(.processingFailed(error.localizedDescription)))
                        }
                    },
                    receiveValue: { _ in }
                )
                .store(in: &self.cancellables)
                
            } catch {
                self.viewState = .error
                self.error = .processingFailed(error.localizedDescription)
                self.endBackgroundTask()
                promise(.failure(.processingFailed(error.localizedDescription)))
            }
        }
        .eraseToAnyPublisher()
    }
    
    /// Clears current annotation
    public func clearAnnotation() {
        currentDrawingPoints = []
        voiceOverURL = nil
        voiceOverRecorder?.stop()
        voiceOverRecorder = nil
        viewState = .idle
        isRecording = false
        error = nil
    }
    
    // MARK: - Private Methods
    
    private func setupMemoryWarningObserver() {
        NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)
            .sink { [weak self] _ in
                self?.handleMemoryWarning()
            }
            .store(in: &cancellables)
    }
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.connectionQuality
            .sink { [weak self] quality in
                if quality == .poor {
                    self?.adjustQualityForPoorNetwork()
                }
            }
            .store(in: &cancellables)
    }
    
    private func handleMemoryWarning() {
        clearAnnotation()
        error = .memoryWarning
    }
    
    private func adjustQualityForPoorNetwork() {
        strokeWidth = max(1.0, strokeWidth * 0.8)
    }
    
    private func beginBackgroundTask() {
        backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.endBackgroundTask()
        }
    }
    
    private func endBackgroundTask() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }
}

// MARK: - AVAudioRecorderDelegate
extension VideoAnnotationViewModel: AVAudioRecorderDelegate {
    public func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            viewState = .error
            error = .recordingFailed("Recording finished unsuccessfully")
        }
    }
    
    public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        viewState = .error
        self.error = .recordingFailed(error?.localizedDescription ?? "Unknown encoding error")
    }
}