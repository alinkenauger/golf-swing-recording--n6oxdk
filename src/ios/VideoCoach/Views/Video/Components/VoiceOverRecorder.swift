import SwiftUI      // iOS 14.0+
import AVFoundation // iOS 14.0+
import Combine      // iOS 14.0+

/// Represents the current state of voice-over recording
public enum RecordingState {
    case idle
    case recording
    case paused
    case processing
}

/// Custom errors for voice-over recording operations
public enum RecordingError: Error {
    case permissionDenied
    case audioSessionError
    case recordingFailed
    case processingFailed
}

/// SwiftUI view component that provides comprehensive voice-over recording functionality
@available(iOS 14.0, *)
public final class VoiceOverRecorder: NSObject, ObservableObject {
    
    // MARK: - Private Properties
    
    private let videoService: VideoService
    private var audioRecorder: AVAudioRecorder?
    private let audioSession = AVAudioSession.sharedInstance()
    private var backgroundTask: UIBackgroundTaskIdentifier?
    private var cancellables = Set<AnyCancellable>()
    private var durationTimer: Timer?
    
    private let recordingSettings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 44100.0,
        AVNumberOfChannelsKey: 2,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        AVEncoderBitRateKey: 128000
    ]
    
    // MARK: - Published Properties
    
    @Published private(set) var recordingState: RecordingState = .idle
    @Published private(set) var recordingDuration: TimeInterval = 0
    @Published var error: RecordingError?
    
    // MARK: - Initialization
    
    public init(videoService: VideoService = VideoService.shared) {
        self.videoService = videoService
        super.init()
        
        setupAudioSession()
        setupNotifications()
    }
    
    // MARK: - Public Methods
    
    /// Starts voice-over recording with error handling and background support
    public func startRecording(timeRange: TimeRange) {
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] allowed in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                guard allowed else {
                    self.error = .permissionDenied
                    return
                }
                
                do {
                    try self.configureAudioSession()
                    let recordingURL = self.generateRecordingURL()
                    
                    self.audioRecorder = try AVAudioRecorder(url: recordingURL,
                                                           settings: self.recordingSettings)
                    self.audioRecorder?.delegate = self
                    self.audioRecorder?.isMeteringEnabled = true
                    
                    self.beginBackgroundTask()
                    
                    guard self.audioRecorder?.record() == true else {
                        self.error = .recordingFailed
                        return
                    }
                    
                    self.recordingState = .recording
                    self.startDurationTimer()
                    self.monitorAudioLevels()
                    
                } catch {
                    self.error = .recordingFailed
                }
            }
        }
    }
    
    /// Pauses current recording session with state preservation
    public func pauseRecording() {
        guard recordingState == .recording else { return }
        
        audioRecorder?.pause()
        durationTimer?.invalidate()
        recordingState = .paused
    }
    
    /// Resumes paused recording session with state restoration
    public func resumeRecording() {
        guard recordingState == .paused else { return }
        
        do {
            try configureAudioSession()
            
            guard audioRecorder?.record() == true else {
                error = .recordingFailed
                return
            }
            
            recordingState = .recording
            startDurationTimer()
            monitorAudioLevels()
            
        } catch {
            self.error = .recordingFailed
        }
    }
    
    /// Stops and processes the recording with cleanup
    public func stopRecording() -> AnyPublisher<Video, RecordingError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.processingFailed))
                return
            }
            
            self.audioRecorder?.stop()
            self.durationTimer?.invalidate()
            self.recordingState = .processing
            
            guard let recordingURL = self.audioRecorder?.url else {
                promise(.failure(.processingFailed))
                return
            }
            
            self.videoService.processAudioBuffer(recordingURL)
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .failure:
                            promise(.failure(.processingFailed))
                        case .finished:
                            break
                        }
                        self.cleanup()
                    },
                    receiveValue: { video in
                        promise(.success(video))
                    }
                )
                .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupAudioSession() {
        do {
            try audioSession.setCategory(.playAndRecord,
                                       mode: .videoRecording,
                                       options: [.allowBluetooth, .defaultToSpeaker])
            try audioSession.setActive(true)
        } catch {
            self.error = .audioSessionError
        }
    }
    
    private func configureAudioSession() throws {
        try audioSession.setCategory(.playAndRecord,
                                   mode: .videoRecording,
                                   options: [.allowBluetooth, .defaultToSpeaker])
        try audioSession.setActive(true)
    }
    
    private func setupNotifications() {
        NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)
            .sink { [weak self] notification in
                self?.handleAudioInterruption(notification)
            }
            .store(in: &cancellables)
        
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                self?.handleBackgroundTransition()
            }
            .store(in: &cancellables)
    }
    
    private func generateRecordingURL() -> URL {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documentsPath.appendingPathComponent("voiceover_\(UUID().uuidString).m4a")
    }
    
    private func startDurationTimer() {
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.recordingDuration += 0.1
        }
    }
    
    private func monitorAudioLevels() {
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            guard let self = self,
                  self.recordingState == .recording,
                  let recorder = self.audioRecorder else {
                timer.invalidate()
                return
            }
            
            recorder.updateMeters()
            let averagePower = recorder.averagePower(forChannel: 0)
            let peakPower = recorder.peakPower(forChannel: 0)
            
            // Log levels for debugging if needed
            print("Average: \(averagePower) dB, Peak: \(peakPower) dB")
        }
    }
    
    private func beginBackgroundTask() {
        backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.endBackgroundTask()
        }
    }
    
    private func endBackgroundTask() {
        if let task = backgroundTask {
            UIApplication.shared.endBackgroundTask(task)
            backgroundTask = nil
        }
    }
    
    private func handleAudioInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSessionInterruptionType(rawValue: typeValue) else {
            return
        }
        
        switch type {
        case .began:
            pauseRecording()
        case .ended:
            guard let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt else { return }
            let options = AVAudioSessionInterruptionOptions(rawValue: optionsValue)
            if options.contains(.shouldResume) {
                resumeRecording()
            }
        @unknown default:
            break
        }
    }
    
    private func handleBackgroundTransition() {
        if recordingState == .recording {
            beginBackgroundTask()
        }
    }
    
    private func cleanup() {
        audioRecorder = nil
        durationTimer?.invalidate()
        durationTimer = nil
        recordingDuration = 0
        recordingState = .idle
        endBackgroundTask()
        
        do {
            try audioSession.setActive(false)
        } catch {
            print("Failed to deactivate audio session: \(error)")
        }
    }
}

// MARK: - AVAudioRecorderDelegate
extension VoiceOverRecorder: AVAudioRecorderDelegate {
    public func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            error = .recordingFailed
        }
    }
    
    public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        self.error = .recordingFailed
    }
}