import Foundation // iOS 14.0+
import AVFoundation // iOS 14.0+
import Combine // iOS 14.0+
import BackgroundTasks // iOS 14.0+

/// Comprehensive error types for video service operations
public enum VideoServiceError: Error {
    case processingFailed(reason: String)
    case uploadFailed(reason: String)
    case downloadFailed(reason: String)
    case invalidVideo(reason: String)
    case annotationFailed(reason: String)
    case networkError(underlying: Error)
    case storageError(reason: String)
}

/// Represents the current stage of video processing
public enum ProcessingStage {
    case validation
    case compression
    case thumbnailGeneration
    case upload
    case cleanup
}

/// Progress information for video processing operations
public struct VideoProcessingProgress {
    let progress: Double
    let stage: ProcessingStage
}

/// Thread-safe service managing all video-related operations
@available(iOS 14.0, *)
public final class VideoService {
    
    // MARK: - Singleton
    
    public static let shared = VideoService()
    
    // MARK: - Private Properties
    
    private let processor: VideoProcessor
    private let networkService: NetworkService
    private let processingQueue: OperationQueue
    private let progressSubject = CurrentValueSubject<VideoProcessingProgress, Never>(
        VideoProcessingProgress(progress: 0, stage: .validation)
    )
    private let cache: NSCache<NSString, Video>
    private var backgroundTaskIdentifier: UIBackgroundTaskIdentifier?
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private init() {
        // Initialize video processor with optimized settings
        self.processor = VideoProcessor()
        
        // Get network service instance
        self.networkService = NetworkService.shared
        
        // Configure processing queue
        self.processingQueue = OperationQueue()
        self.processingQueue.maxConcurrentOperationCount = 1
        self.processingQueue.qualityOfService = .userInitiated
        
        // Initialize video cache
        self.cache = NSCache<NSString, Video>()
        self.cache.countLimit = 50
        self.cache.totalCostLimit = Int(StorageConfig.videoCacheLimit)
        
        // Setup memory warning observer
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    // MARK: - Public Methods
    
    /// Uploads a video with processing and progress tracking
    public func uploadVideo(
        fileURL: URL,
        quality: VideoQualityPreset,
        networkCondition: ConnectionQuality
    ) -> AnyPublisher<Video, VideoServiceError> {
        // Begin background task
        backgroundTaskIdentifier = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.endBackgroundTask()
        }
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.processingFailed(reason: "Service unavailable")))
                return
            }
            
            // Validate video file
            let validationResult = self.processor.validateVideo(at: fileURL, options: .default)
            switch validationResult {
            case .success(let metadata):
                guard metadata.duration <= VideoConfig.maxDuration else {
                    promise(.failure(.invalidVideo(reason: "Video exceeds maximum duration")))
                    return
                }
                
                self.progressSubject.send(VideoProcessingProgress(progress: 0.2, stage: .validation))
                
                // Adapt quality based on network condition
                let adaptedQuality = self.adaptQualityForNetwork(quality, condition: networkCondition)
                
                // Process video
                let processingResult = self.processor.processVideo(
                    at: fileURL,
                    quality: adaptedQuality
                ) { progress in
                    self.progressSubject.send(
                        VideoProcessingProgress(progress: 0.2 + (progress.progress * 0.4),
                                             stage: .compression)
                    )
                }
                
                switch processingResult {
                case .success(let processedVideo):
                    // Generate thumbnail
                    let thumbnailResult = self.processor.generateThumbnail(for: processedVideo.url)
                    
                    switch thumbnailResult {
                    case .success(let thumbnailURL):
                        self.progressSubject.send(
                            VideoProcessingProgress(progress: 0.7, stage: .thumbnailGeneration)
                        )
                        
                        // Upload video
                        let config = UploadConfiguration(
                            chunkSize: 1024 * 1024, // 1MB chunks
                            compressionQuality: 0.8,
                            allowsCellular: true,
                            backgroundTaskIdentifier: "com.videocoach.upload"
                        )
                        
                        self.networkService.uploadVideo(
                            fileURL: processedVideo.url,
                            filename: processedVideo.url.lastPathComponent,
                            config: config
                        )
                        .sink(
                            receiveCompletion: { completion in
                                switch completion {
                                case .finished:
                                    self.progressSubject.send(
                                        VideoProcessingProgress(progress: 1.0, stage: .cleanup)
                                    )
                                    // Create and cache video object
                                    do {
                                        let video = try Video(
                                            title: processedVideo.url.deletingPathExtension().lastPathComponent,
                                            description: nil,
                                            userId: UUID().uuidString, // Replace with actual user ID
                                            coachId: nil,
                                            originalUrl: processedVideo.url
                                        )
                                        self.cache.setObject(video, forKey: video.id.uuidString as NSString)
                                        promise(.success(video))
                                    } catch {
                                        promise(.failure(.processingFailed(reason: error.localizedDescription)))
                                    }
                                case .failure(let error):
                                    promise(.failure(.uploadFailed(reason: error.localizedDescription)))
                                }
                                self.endBackgroundTask()
                            },
                            receiveValue: { progress in
                                self.progressSubject.send(
                                    VideoProcessingProgress(
                                        progress: 0.7 + (progress.progress * 0.3),
                                        stage: .upload
                                    )
                                )
                            }
                        )
                        .store(in: &self.cancellables)
                        
                    case .failure(let error):
                        promise(.failure(.processingFailed(reason: error.localizedDescription)))
                        self.endBackgroundTask()
                    }
                    
                case .failure(let error):
                    promise(.failure(.processingFailed(reason: error.localizedDescription)))
                    self.endBackgroundTask()
                }
                
            case .failure(let error):
                promise(.failure(.invalidVideo(reason: error.localizedDescription)))
                self.endBackgroundTask()
            }
        }
        .eraseToAnyPublisher()
    }
    
    /// Downloads a video with caching support
    public func downloadVideo(
        videoId: String,
        forceRefresh: Bool = false
    ) -> AnyPublisher<URL, VideoServiceError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.downloadFailed(reason: "Service unavailable")))
                return
            }
            
            // Check cache first
            if !forceRefresh, let cachedVideo = self.cache.object(forKey: videoId as NSString) {
                promise(.success(cachedVideo.originalUrl))
                return
            }
            
            // Download video
            self.networkService.request(
                endpoint: "/videos/\(videoId)/download",
                method: .get
            )
            .mapError { error -> VideoServiceError in
                .networkError(underlying: error)
            }
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        promise(.failure(error))
                    }
                },
                receiveValue: { (response: URL) in
                    promise(.success(response))
                }
            )
            .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func adaptQualityForNetwork(
        _ quality: VideoQualityPreset,
        condition: ConnectionQuality
    ) -> VideoQualityPreset {
        switch condition {
        case .excellent:
            return quality
        case .good:
            return quality == .ultra ? .high : quality
        case .fair:
            return quality == .ultra || quality == .high ? .medium : quality
        case .poor:
            return .low
        case .unknown:
            return .medium
        }
    }
    
    private func endBackgroundTask() {
        if let identifier = backgroundTaskIdentifier {
            UIApplication.shared.endBackgroundTask(identifier)
            backgroundTaskIdentifier = nil
        }
    }
    
    @objc private func handleMemoryWarning() {
        cache.removeAllObjects()
        processingQueue.cancelAllOperations()
    }
}