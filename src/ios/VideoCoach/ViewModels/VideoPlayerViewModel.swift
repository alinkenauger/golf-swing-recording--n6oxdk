import Foundation // iOS 14.0+
import AVFoundation // iOS 14.0+
import Combine // iOS 14.0+
import BackgroundTasks // iOS 14.0+

/// Comprehensive error types for video player operations
public enum VideoPlayerError: Error {
    case invalidVideo(String)
    case playbackFailed(String)
    case networkError(String)
    case bufferingFailed(String)
    case qualityChangeError(String)
    case backgroundTaskExpired
}

/// Thread-safe view model managing video playback with enhanced features
@MainActor
@available(iOS 14.0, *)
public final class VideoPlayerViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published private(set) var video: Video?
    @Published var isPlaying: Bool = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackRate: Float = DEFAULT_PLAYBACK_RATE
    @Published var selectedQuality: VideoQuality = .hd1080p
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var bufferingProgress: Double = 0
    @Published private(set) var downloadProgress: Double = 0
    @Published private(set) var error: VideoPlayerError?
    
    // MARK: - Private Properties
    
    private var player: AVPlayer?
    private var playerItem: AVPlayerItem?
    private var timeObserver: Any?
    private var bufferObserver: NSKeyValueObservation?
    private var retryAttempts: Int = 0
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var cancellables = Set<AnyCancellable>()
    private let videoService = VideoService.shared
    
    // MARK: - Constants
    
    private let DEFAULT_PLAYBACK_RATE: Float = 1.0
    private let MIN_PLAYBACK_RATE: Float = 0.5
    private let MAX_PLAYBACK_RATE: Float = 2.0
    private let BUFFER_DURATION: TimeInterval = 30
    private let MAX_RETRY_ATTEMPTS: Int = 3
    private let BACKGROUND_TASK_IDENTIFIER = "com.videocoach.videoprocessing"
    
    // MARK: - Initialization
    
    public init(videoId: UUID) {
        setupBackgroundHandling()
        loadVideo(id: videoId)
    }
    
    // MARK: - Public Methods
    
    /// Loads video with enhanced error handling and progress tracking
    public func loadVideo(id: UUID) {
        Task {
            do {
                isLoading = true
                error = nil
                retryAttempts = 0
                
                // Begin background task
                backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
                    self?.handleBackgroundTaskExpiration()
                }
                
                // Attempt to load video
                let videoURL = try await videoService.downloadVideo(videoId: id.uuidString)
                    .receive(on: DispatchQueue.main)
                    .catch { error -> AnyPublisher<URL, Error> in
                        if self.retryAttempts < self.MAX_RETRY_ATTEMPTS {
                            self.retryAttempts += 1
                            return self.videoService.downloadVideo(videoId: id.uuidString)
                        }
                        throw error
                    }
                    .eraseToAnyPublisher()
                    .await()
                
                // Configure player
                let asset = AVAsset(url: videoURL)
                let playerItem = AVPlayerItem(asset: asset)
                player = AVPlayer(playerItem: playerItem)
                
                // Configure playback settings
                player?.automaticallyWaitsToMinimizeStalling = true
                player?.volume = 1.0
                playerItem.preferredForwardBufferDuration = BUFFER_DURATION
                
                // Setup time observation
                setupTimeObserver()
                setupBufferObserver()
                
                // Update metadata
                duration = CMTimeGetSeconds(asset.duration)
                
                // End background task
                UIApplication.shared.endBackgroundTask(backgroundTask)
                backgroundTask = .invalid
                
                isLoading = false
                
            } catch {
                handleError(error)
            }
        }
    }
    
    /// Controls video playback with error handling
    public func togglePlayback() {
        guard let player = player else { return }
        
        if isPlaying {
            player.pause()
        } else {
            player.play()
        }
        isPlaying = !isPlaying
    }
    
    /// Seeks to specified time with validation
    public func seek(to time: TimeInterval) {
        guard let player = player else { return }
        
        let targetTime = min(max(0, time), duration)
        let cmTime = CMTime(seconds: targetTime, preferredTimescale: 600)
        
        player.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
            if finished {
                self?.currentTime = targetTime
            }
        }
    }
    
    /// Updates playback rate with bounds checking
    public func setPlaybackRate(_ rate: Float) {
        let boundedRate = min(max(rate, MIN_PLAYBACK_RATE), MAX_PLAYBACK_RATE)
        player?.rate = boundedRate
        playbackRate = boundedRate
    }
    
    /// Changes video quality with error handling
    public func changeQuality(_ quality: VideoQuality) {
        Task {
            do {
                guard let video = video else { return }
                
                isLoading = true
                selectedQuality = quality
                
                // Store current time
                let currentPosition = currentTime
                
                // Load new quality variant
                let variant = video.variants.first { $0.quality == quality }
                guard let variantURL = variant?.url else {
                    throw VideoPlayerError.qualityChangeError("Quality variant not available")
                }
                
                // Configure new player item
                let asset = AVAsset(url: variantURL)
                let playerItem = AVPlayerItem(asset: asset)
                player?.replaceCurrentItem(with: playerItem)
                
                // Restore position
                seek(to: currentPosition)
                
                isLoading = false
                
            } catch {
                handleError(error)
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            self?.currentTime = CMTimeGetSeconds(time)
        }
    }
    
    private func setupBufferObserver() {
        bufferObserver = player?.currentItem?.observe(\.loadedTimeRanges) { [weak self] item, _ in
            guard let self = self else { return }
            
            let loadedRanges = item.loadedTimeRanges
            guard let timeRange = loadedRanges.first?.timeRangeValue else { return }
            
            let bufferedDuration = CMTimeGetSeconds(timeRange.duration)
            self.bufferingProgress = bufferedDuration / self.BUFFER_DURATION
        }
    }
    
    private func setupBackgroundHandling() {
        NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
            .sink { [weak self] _ in
                self?.handleBackgroundTransition()
            }
            .store(in: &cancellables)
        
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                self?.handleForegroundTransition()
            }
            .store(in: &cancellables)
    }
    
    private func handleError(_ error: Error) {
        let playerError: VideoPlayerError
        
        switch error {
        case let networkError as NetworkError:
            playerError = .networkError(networkError.localizedDescription)
        case let videoError as VideoValidationError:
            playerError = .invalidVideo(videoError.localizedDescription)
        default:
            playerError = .playbackFailed(error.localizedDescription)
        }
        
        self.error = playerError
        isLoading = false
        
        // End background task if active
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }
    
    private func handleBackgroundTransition() {
        // Reduce quality to conserve bandwidth
        if selectedQuality == .hd1080p {
            changeQuality(.sd720p)
        }
        
        // Update background task
        backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.handleBackgroundTaskExpiration()
        }
    }
    
    private func handleForegroundTransition() {
        // Restore original quality if needed
        if NetworkMonitor.shared.connectionQuality.value == .excellent {
            changeQuality(.hd1080p)
        }
        
        // End background task
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }
    
    private func handleBackgroundTaskExpiration() {
        isPlaying = false
        player?.pause()
        error = .backgroundTaskExpired
        
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }
    
    // MARK: - Cleanup
    
    deinit {
        if let timeObserver = timeObserver {
            player?.removeTimeObserver(timeObserver)
        }
        bufferObserver?.invalidate()
        cancellables.removeAll()
        
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
        }
    }
}