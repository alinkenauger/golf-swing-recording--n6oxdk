//
// VideoThumbnailView.swift
// VideoCoach
//
// SwiftUI view component for displaying video thumbnails with accessibility support
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // iOS 14.0+
import Kingfisher // v7.0.0

/// Defines supported thumbnail sizes
public enum ThumbnailSize {
    case small
    case medium
    case large
    
    var dimensions: CGSize {
        switch self {
        case .small: return CGSize(width: 120, height: 68)
        case .medium: return CGSize(width: 240, height: 135)
        case .large: return CGSize(width: 360, height: 203)
        }
    }
}

/// Configuration for image caching
private struct ImageCacheConfig {
    static let maxMemoryMB: Int = 50
    static let cleanupInterval: TimeInterval = 300 // 5 minutes
}

/// A SwiftUI view that displays a video thumbnail with loading states and overlays
@available(iOS 14.0, *)
public struct VideoThumbnailView: View {
    // MARK: - Properties
    private let video: Video
    private let size: ThumbnailSize
    private let showPlayIndicator: Bool
    private let showDuration: Bool
    
    @State private var isLoading: Bool = true
    @State private var loadError: Bool = false
    
    private let minTouchTarget = CGSize(width: 44, height: 44)
    private let durationOverlayColor = Color.black.opacity(0.6)
    
    // MARK: - Initialization
    public init(
        video: Video,
        size: ThumbnailSize = .medium,
        showPlayIndicator: Bool = true,
        showDuration: Bool = true
    ) {
        self.video = video
        self.size = size
        self.showPlayIndicator = showPlayIndicator
        self.showDuration = showDuration
        
        // Configure Kingfisher cache
        configureImageCache()
    }
    
    // MARK: - Body
    public var body: some View {
        ZStack {
            // Base thumbnail image
            KFImage(video.thumbnailUrl)
                .setProcessor(DownsamplingImageProcessor(size: size.dimensions))
                .cacheMemoryOnly()
                .fade(duration: UIConfig.animationDuration)
                .onSuccess { _ in isLoading = false }
                .onFailure { _ in loadError = true }
                .placeholder {
                    Rectangle()
                        .fill(Color.gray.opacity(0.2))
                        .frame(width: size.dimensions.width, height: size.dimensions.height)
                }
                .frame(width: size.dimensions.width, height: size.dimensions.height)
                .roundedCorners()
            
            // Play indicator overlay
            if showPlayIndicator && !isLoading && !loadError {
                Image(systemName: "play.circle.fill")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 44, height: 44)
                    .foregroundColor(.white)
                    .shadow(radius: 2)
                    .accessibilityHidden(true)
            }
            
            // Duration overlay
            if showDuration && !isLoading && !loadError {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Text(formatDuration(video.duration))
                            .font(.caption)
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(durationOverlayColor)
                            .roundedCorners(4)
                            .padding(8)
                    }
                }
            }
            
            // Loading overlay
            if isLoading {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black.opacity(0.3))
            }
            
            // Error overlay
            if loadError {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black.opacity(0.3))
            }
        }
        .frame(
            minWidth: max(size.dimensions.width, minTouchTarget.width),
            minHeight: max(size.dimensions.height, minTouchTarget.height)
        )
        .standardShadow()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Video thumbnail for \(video.title)")
        .accessibilityValue(loadError ? "Failed to load" : isLoading ? "Loading" : "Duration \(formatDuration(video.duration))")
        .accessibilityAddTraits(.isImage)
        .onDisappear {
            // Clear memory cache when view disappears
            KingfisherManager.shared.cache.clearMemoryCache()
        }
    }
    
    // MARK: - Helper Methods
    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
    
    private func configureImageCache() {
        // Set memory cache size limit
        ImageCache.default.memoryStorage.config.totalCostLimit = ImageCacheConfig.maxMemoryMB * 1024 * 1024
        
        // Configure cache cleanup interval
        ImageCache.default.memoryStorage.config.cleanInterval = ImageCacheConfig.cleanupInterval
    }
}