import Foundation // iOS 14.0+
import Combine // iOS 14.0+
import SwiftUI // iOS 14.0+

/// Comprehensive error types for video store operations
public enum VideoStoreError: Error {
    case uploadFailed(reason: String)
    case downloadFailed(reason: String)
    case processingFailed(reason: String)
    case annotationFailed(reason: String)
    case networkError(reason: String)
    case storageError(reason: String)
}

/// Represents the current stage of video processing
public enum VideoProcessingStage {
    case preparing
    case uploading
    case processing
    case compressing
    case generating_variants
    case completing
}

/// Thread-safe ObservableObject store managing video lifecycle with background processing support
@available(iOS 14.0, *)
@MainActor
public final class VideoStore: ObservableObject {
    
    // MARK: - Singleton
    
    public static let shared = VideoStore()
    
    // MARK: - Private Properties
    
    private let videoService: VideoService
    private let queue = DispatchQueue(label: "com.videocoach.videostore", qos: .userInitiated)
    private let cache = NSCache<NSString, Video>()
    private var cancellables = Set<AnyCancellable>()
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    
    // MARK: - Published Properties
    
    @Published private(set) var videos: [Video] = []
    @Published private(set) var currentVideo: Video?
    @Published private(set) var isUploading: Bool = false
    @Published private(set) var uploadProgress: Double = 0.0
    @Published private(set) var currentStage: VideoProcessingStage = .preparing
    @Published private(set) var networkQuality: ConnectionQuality = .unknown
    
    // MARK: - Initialization
    
    private init() {
        self.videoService = VideoService.shared
        
        // Configure video cache
        cache.countLimit = 50
        cache.totalCostLimit = Int(StorageConfig.videoCacheLimit)
        
        // Setup network quality monitoring
        NetworkMonitor.shared.connectionQuality
            .receive(on: DispatchQueue.main)
            .assign(to: \.networkQuality, on: self)
            .store(in: &cancellables)
        
        // Setup memory warning observer
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    // MARK: - Public Methods
    
    /// Uploads a video file with progress tracking and background processing support
    public func uploadVideo(
        fileURL: URL,
        quality: VideoQuality,
        enableBackgroundProcessing: Bool = true
    ) -> AnyPublisher<Video, VideoStoreError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.uploadFailed(reason: "Store unavailable")))
                return
            }
            
            // Begin background task if enabled
            if enableBackgroundProcessing {
                self.backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
                    self?.endBackgroundTask()
                }
            }
            
            // Update state
            Task { @MainActor in
                self.isUploading = true
                self.uploadProgress = 0.0
                self.currentStage = .preparing
            }
            
            // Validate network quality
            guard self.networkQuality != .poor else {
                promise(.failure(.networkError(reason: "Poor network connection")))
                return
            }
            
            // Configure upload
            let config = UploadConfiguration(
                chunkSize: 1024 * 1024, // 1MB chunks
                compressionQuality: 0.8,
                allowsCellular: true,
                backgroundTaskIdentifier: enableBackgroundProcessing ? "com.videocoach.upload" : nil
            )
            
            // Start upload
            self.videoService.uploadVideo(
                fileURL: fileURL,
                filename: fileURL.lastPathComponent,
                config: config
            )
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    switch completion {
                    case .finished:
                        Task { @MainActor in
                            self.currentStage = .completing
                            self.isUploading = false
                            self.uploadProgress = 1.0
                        }
                    case .failure(let error):
                        promise(.failure(.uploadFailed(reason: error.localizedDescription)))
                        Task { @MainActor in
                            self.isUploading = false
                            self.uploadProgress = 0.0
                        }
                    }
                    self.endBackgroundTask()
                },
                receiveValue: { progress in
                    Task { @MainActor in
                        self.uploadProgress = progress.progress
                        self.currentStage = progress.progress < 0.5 ? .uploading : .processing
                    }
                }
            )
            .store(in: &self.cancellables)
            
            // Clean up temporary files
            self.queue.async {
                try? FileManager.default.removeItem(at: fileURL)
            }
        }
        .eraseToAnyPublisher()
    }
    
    /// Downloads a video by ID with caching support
    public func downloadVideo(
        videoId: String,
        preferredQuality: VideoQuality
    ) -> AnyPublisher<URL, VideoStoreError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.downloadFailed(reason: "Store unavailable")))
                return
            }
            
            // Check cache first
            if let cachedVideo = self.cache.object(forKey: videoId as NSString) {
                promise(.success(cachedVideo.originalUrl))
                return
            }
            
            // Verify network quality
            guard self.networkQuality != .poor else {
                promise(.failure(.networkError(reason: "Poor network connection")))
                return
            }
            
            // Download video
            self.videoService.downloadVideo(videoId: videoId)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            promise(.failure(.downloadFailed(reason: error.localizedDescription)))
                        }
                    },
                    receiveValue: { url in
                        // Cache the downloaded video
                        if let video = try? Video(
                            title: url.lastPathComponent,
                            description: nil,
                            userId: "", // Will be set from response
                            coachId: nil,
                            originalUrl: url
                        ) {
                            self.cache.setObject(video, forKey: videoId as NSString)
                        }
                        promise(.success(url))
                    }
                )
                .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func endBackgroundTask() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }
    
    @objc private func handleMemoryWarning() {
        cache.removeAllObjects()
        cancellables.removeAll()
    }
}