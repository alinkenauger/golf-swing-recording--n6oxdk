import Foundation // iOS 14.0+
import Combine // iOS 14.0+

/// Manages state and business logic for the home screen with enhanced performance optimizations
@MainActor
public final class HomeViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published private(set) var featuredCoaches: [Coach] = []
    @Published private(set) var recentVideos: [Video] = []
    @Published private(set) var recommendedContent: [Video] = []
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var loadingProgress: Double = 0.0
    @Published private(set) var errorMessage: String? = nil
    
    // MARK: - Private Properties
    
    private let videoService: VideoService
    private let analyticsService: AnalyticsService
    private var cancellables = Set<AnyCancellable>()
    private var refreshTask: Task<Void, Never>?
    private let contentCache = NSCache<NSString, AnyObject>()
    private let refreshInterval: TimeInterval = ContentRefreshPolicy.interval
    private let retryAttempts = ContentRefreshPolicy.retryAttempts
    private let cacheExpiration = ContentRefreshPolicy.cacheExpiration
    
    // MARK: - Initialization
    
    public init(videoService: VideoService = .shared,
                analyticsService: AnalyticsService = .shared) {
        self.videoService = videoService
        self.analyticsService = analyticsService
        
        // Configure cache
        contentCache.countLimit = 100
        contentCache.totalCostLimit = 50_000_000 // 50MB
        
        // Setup automatic refresh
        setupAutoRefresh()
        
        // Track screen view
        analyticsService.trackEvent(.sessionStart, metadata: ["screen": "home"])
        
        // Initial content load
        Task {
            await refreshContent(forceRefresh: false)
        }
    }
    
    // MARK: - Public Methods
    
    /// Refreshes all content sections with retry mechanism and progress tracking
    public func refreshContent(forceRefresh: Bool = false) async {
        // Cancel any existing refresh task
        refreshTask?.cancel()
        
        // Check cache if not force refresh
        if !forceRefresh {
            if let cachedContent = contentCache.object(forKey: "homeContent" as NSString) as? HomeContent,
               Date().timeIntervalSince(cachedContent.timestamp) < cacheExpiration {
                self.featuredCoaches = cachedContent.coaches
                self.recentVideos = cachedContent.videos
                self.recommendedContent = cachedContent.recommendations
                return
            }
        }
        
        isLoading = true
        loadingProgress = 0.0
        errorMessage = nil
        
        do {
            async let coachesPublisher = loadFeaturedCoaches()
            async let videosPublisher = loadRecentVideos(page: 1, pageSize: 10)
            async let recommendationsPublisher = generateRecommendations()
            
            // Load content concurrently
            let (coaches, videos, recommendations) = try await (coachesPublisher, videosPublisher, recommendationsPublisher)
            
            // Update UI
            await MainActor.run {
                self.featuredCoaches = coaches
                self.recentVideos = videos
                self.recommendedContent = recommendations
                self.isLoading = false
                self.loadingProgress = 1.0
                
                // Cache results
                let content = HomeContent(coaches: coaches,
                                       videos: videos,
                                       recommendations: recommendations,
                                       timestamp: Date())
                self.contentCache.setObject(content, forKey: "homeContent" as NSString)
                
                // Track success
                self.analyticsService.trackEvent(.videoView, metadata: [
                    "content_type": "home_refresh",
                    "success": true
                ])
            }
        } catch {
            await handleError(error)
        }
    }
    
    // MARK: - Private Methods
    
    private func loadFeaturedCoaches() async throws -> [Coach] {
        var attempt = 0
        
        while attempt < retryAttempts {
            do {
                let coaches = try await fetchCoaches()
                
                // Track analytics
                analyticsService.trackEvent(.videoView, metadata: [
                    "content_type": "featured_coaches",
                    "count": coaches.count
                ])
                
                return coaches
            } catch {
                attempt += 1
                if attempt == retryAttempts { throw error }
                try await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(attempt)) * 1_000_000_000))
            }
        }
        
        throw HomeViewModelError.contentLoadFailed
    }
    
    private func loadRecentVideos(page: Int, pageSize: Int) async throws -> [Video] {
        var attempt = 0
        
        while attempt < retryAttempts {
            do {
                let videos = try await fetchVideos(page: page, pageSize: pageSize)
                
                // Pre-cache video thumbnails
                for video in videos {
                    Task {
                        try? await videoService.downloadVideo(videoId: video.id.uuidString, forceRefresh: false)
                    }
                }
                
                // Track analytics
                analyticsService.trackEvent(.videoView, metadata: [
                    "content_type": "recent_videos",
                    "count": videos.count,
                    "page": page
                ])
                
                return videos
            } catch {
                attempt += 1
                if attempt == retryAttempts { throw error }
                try await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(attempt)) * 1_000_000_000))
            }
        }
        
        throw HomeViewModelError.contentLoadFailed
    }
    
    private func generateRecommendations() async throws -> [Video] {
        var attempt = 0
        
        while attempt < retryAttempts {
            do {
                let recommendations = try await fetchRecommendations()
                
                // Track analytics
                analyticsService.trackEvent(.videoView, metadata: [
                    "content_type": "recommendations",
                    "count": recommendations.count
                ])
                
                return recommendations
            } catch {
                attempt += 1
                if attempt == retryAttempts { throw error }
                try await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(attempt)) * 1_000_000_000))
            }
        }
        
        throw HomeViewModelError.contentLoadFailed
    }
    
    private func setupAutoRefresh() {
        Timer.publish(every: refreshInterval, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                Task {
                    await self?.refreshContent(forceRefresh: false)
                }
            }
            .store(in: &cancellables)
    }
    
    private func handleError(_ error: Error) async {
        await MainActor.run {
            isLoading = false
            errorMessage = error.localizedDescription
            
            // Track error
            analyticsService.trackEvent(.errorOccurred, metadata: [
                "error_type": String(describing: type(of: error)),
                "error_message": error.localizedDescription
            ])
        }
    }
    
    deinit {
        analyticsService.trackEvent(.sessionEnd, metadata: ["screen": "home"])
    }
}

// MARK: - Supporting Types

private struct HomeContent {
    let coaches: [Coach]
    let videos: [Video]
    let recommendations: [Video]
    let timestamp: Date
}

public enum HomeViewModelError: Error {
    case contentLoadFailed
    case networkError
    case invalidData
    case cacheError
    case rateLimitExceeded
}

public struct ContentRefreshPolicy {
    static let interval: TimeInterval = 300 // 5 minutes
    static let retryAttempts: Int = 3
    static let cacheExpiration: TimeInterval = 3600 // 1 hour
}