import Foundation // iOS 14.0+
import Combine   // iOS 14.0+
import XCTest   // iOS 14.0+

/// Custom errors for mock video service
public enum MockVideoServiceError: Error {
    case simulatedError
    case networkError
    case quotaExceeded
    case resourceContention
}

/// Operation types for tracking service usage
public enum OperationType {
    case upload
    case download
    case annotate
    case voiceOver
}

/// Thread-safe mock implementation of VideoService for testing
@available(iOS 14.0, *)
public final class MockVideoService {
    
    // MARK: - Private Properties
    
    private let queue: DispatchQueue
    private var shouldSimulateError: Bool
    private var networkLatency: TimeInterval
    private var processingDelay: TimeInterval
    private var storageQuota: Int
    private var currentStorage: Int
    
    // Thread-safe storage containers
    private var uploadedVideos: [Video] = []
    private var downloadedVideos: [String: URL] = [:]
    private var annotations: [String: [Annotation]] = [:]
    private var voiceOvers: [String: [TimeRange: URL]] = [:]
    
    // Operation tracking
    private var operationCounts: [OperationType: Int] = [:]
    private var operationHistory: [String] = []
    private var lastOperation: OperationType?
    
    // MARK: - Initialization
    
    public init(
        networkLatency: TimeInterval = 0.1,
        processingDelay: TimeInterval = 0.1,
        storageQuota: Int = 1024 * 1024 * 100 // 100MB default
    ) {
        self.queue = DispatchQueue(label: "com.videocoach.mockservice", attributes: .concurrent)
        self.shouldSimulateError = false
        self.networkLatency = networkLatency
        self.processingDelay = processingDelay
        self.storageQuota = storageQuota
        self.currentStorage = 0
        
        // Initialize operation tracking
        OperationType.allCases.forEach { operationCounts[$0] = 0 }
    }
    
    // MARK: - Public Methods
    
    /// Thread-safe video upload simulation
    public func uploadVideo(
        fileURL: URL,
        quality: VideoQualityPreset
    ) -> AnyPublisher<Video, VideoServiceError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.processingFailed(reason: "Service unavailable")))
                return
            }
            
            self.queue.async(flags: .barrier) {
                // Simulate network delay
                Thread.sleep(forTimeInterval: self.networkLatency)
                
                // Check for simulated errors
                if self.shouldSimulateError {
                    promise(.failure(.processingFailed(reason: "Simulated error")))
                    return
                }
                
                // Check storage quota
                let fileSize = (try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? Int) ?? 0
                if self.currentStorage + fileSize > self.storageQuota {
                    promise(.failure(.storageError(reason: "Storage quota exceeded")))
                    return
                }
                
                // Process upload
                do {
                    let video = try Video(
                        title: fileURL.lastPathComponent,
                        description: "Mock video upload",
                        userId: "test_user",
                        coachId: "test_coach",
                        originalUrl: fileURL
                    )
                    
                    // Update storage and tracking
                    self.currentStorage += fileSize
                    self.uploadedVideos.append(video)
                    self.trackOperation(.upload)
                    
                    // Simulate processing delay
                    Thread.sleep(forTimeInterval: self.processingDelay)
                    
                    promise(.success(video))
                } catch {
                    promise(.failure(.processingFailed(reason: error.localizedDescription)))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    /// Thread-safe video download simulation
    public func downloadVideo(
        videoId: String
    ) -> AnyPublisher<URL, VideoServiceError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.downloadFailed(reason: "Service unavailable")))
                return
            }
            
            self.queue.async {
                // Simulate network delay
                Thread.sleep(forTimeInterval: self.networkLatency)
                
                // Check for simulated errors
                if self.shouldSimulateError {
                    promise(.failure(.downloadFailed(reason: "Simulated error")))
                    return
                }
                
                // Check if video exists
                if let url = self.downloadedVideos[videoId] {
                    self.trackOperation(.download)
                    promise(.success(url))
                } else {
                    promise(.failure(.downloadFailed(reason: "Video not found")))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    /// Resets all mock storage and tracking data
    public func reset() {
        queue.async(flags: .barrier) {
            self.uploadedVideos.removeAll()
            self.downloadedVideos.removeAll()
            self.annotations.removeAll()
            self.voiceOvers.removeAll()
            self.operationCounts.removeAll()
            self.operationHistory.removeAll()
            self.currentStorage = 0
            self.shouldSimulateError = false
            
            // Reset operation counts
            OperationType.allCases.forEach { self.operationCounts[$0] = 0 }
        }
    }
    
    // MARK: - Private Methods
    
    private func trackOperation(_ type: OperationType) {
        queue.async(flags: .barrier) {
            self.operationCounts[type, default: 0] += 1
            self.lastOperation = type
            self.operationHistory.append("\(type) at \(Date())")
        }
    }
}

// MARK: - Testing Helpers

extension MockVideoService {
    /// Sets error simulation state
    public func setErrorSimulation(_ shouldSimulate: Bool) {
        queue.async(flags: .barrier) {
            self.shouldSimulateError = shouldSimulate
        }
    }
    
    /// Gets operation count for specific type
    public func getOperationCount(_ type: OperationType) -> Int {
        queue.sync {
            return operationCounts[type] ?? 0
        }
    }
    
    /// Gets complete operation history
    public func getOperationHistory() -> [String] {
        queue.sync {
            return operationHistory
        }
    }
    
    /// Gets current storage usage
    public func getCurrentStorageUsage() -> Int {
        queue.sync {
            return currentStorage
        }
    }
}