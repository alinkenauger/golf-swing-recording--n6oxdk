//
// Constants.swift
// VideoCoach
//
// Global configuration constants for the Video Coaching Platform iOS app
// Version: 1.0.0
// Requires: iOS 14.0+
//

import Foundation

/// Video quality configuration type
public struct VideoQuality {
    let resolution: String
    let bitrate: Int
    let fps: Int
}

/// API configuration and endpoints
public struct API {
    /// Base URL for API requests
    public static let baseURL: String = "https://api.videocoach.com"
    
    /// API version
    public static let version: String = "v1"
    
    /// Request timeout in seconds
    public static let timeout: TimeInterval = 30.0
    
    /// Maximum number of API request retries
    public static let maxRetries: Int = 3
    
    /// Environment-specific configurations
    public static let environments: [String: String] = [
        "development": "https://dev-api.videocoach.com",
        "staging": "https://staging-api.videocoach.com",
        "production": "https://api.videocoach.com"
    ]
}

/// Video processing and management configuration
public struct VideoConfig {
    /// Maximum video duration in seconds
    public static let maxDuration: TimeInterval = 600.0 // 10 minutes
    
    /// Maximum video file size in bytes (500MB)
    public static let maxFileSize: Int64 = 524_288_000
    
    /// Supported video codecs
    public static let supportedCodecs: [String] = [
        "h264",
        "h265",
        "av1"
    ]
    
    /// Video quality presets
    public static let qualityPresets: [String: VideoQuality] = [
        "high": VideoQuality(resolution: "1920x1080", bitrate: 6_000_000, fps: 60),
        "medium": VideoQuality(resolution: "1280x720", bitrate: 2_500_000, fps: 30),
        "low": VideoQuality(resolution: "854x480", bitrate: 1_000_000, fps: 30)
    ]
    
    /// Processing timeout durations for different operations
    public static let processingTimeouts: [String: TimeInterval] = [
        "upload": 300.0,      // 5 minutes
        "analysis": 180.0,    // 3 minutes
        "encoding": 600.0,    // 10 minutes
        "annotation": 120.0   // 2 minutes
    ]
}

/// UI configuration constants
public struct UIConfig {
    /// Default animation duration
    public static let animationDuration: TimeInterval = 0.3
    
    /// Default corner radius for UI elements
    public static let cornerRadius: CGFloat = 8.0
    
    /// Font sizes for different text styles
    public static let fontSizes: [String: CGFloat] = [
        "title1": 28.0,
        "title2": 22.0,
        "headline": 17.0,
        "body": 15.0,
        "caption": 12.0
    ]
    
    /// Spacing constants for layout
    public static let spacing: [String: CGFloat] = [
        "xsmall": 4.0,
        "small": 8.0,
        "medium": 16.0,
        "large": 24.0,
        "xlarge": 32.0
    ]
}

/// Storage and caching configuration
public struct StorageConfig {
    /// Maximum cache size in bytes (1GB)
    public static let maxCacheSize: Int64 = 1_073_741_824
    
    /// Video cache limit in bytes (500MB)
    public static let videoCacheLimit: Int64 = 524_288_000
    
    /// Cache cleanup threshold (80%)
    public static let cleanupThreshold: Double = 0.8
    
    /// Enable data encryption
    public static let encryptionEnabled: Bool = true
}

/// Feature flags for app capabilities
public struct FeatureFlags {
    /// Enable video annotation features
    public static let enableVideoAnnotations: Bool = true
    
    /// Enable voice-over recording features
    public static let enableVoiceOver: Bool = true
    
    /// Enable background video processing
    public static let enableBackgroundProcessing: Bool = true
}