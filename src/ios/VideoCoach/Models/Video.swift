import Foundation
// Version: Built-in iOS Framework
import AVFoundation

/// Represents the current processing state of a video
@objc public enum VideoProcessingStatus: String, Codable {
    case pending
    case processing
    case completed
    case failed
}

/// Supported video quality variants
@objc public enum VideoQuality: String, Codable {
    case hd1080p
    case sd720p
    case mobile480p
}

/// Represents validation errors for video content
public enum VideoValidationError: Error {
    case invalidTitle
    case invalidURL
    case invalidUserReference
    case invalidProcessingStatus
    case memoryLimitExceeded
    case variantIntegrityError
    case annotationConsistencyError
}

/// Represents errors related to video variants
public enum VariantError: Error {
    case qualityDuplicate
    case invalidData
    case memoryLimitExceeded
}

/// Represents errors related to annotations
public enum AnnotationError: Error {
    case invalidTimestamp
    case invalidData
    case memoryLimitExceeded
}

/// Thread-safe model representing a specific quality variant of a video
@objc public class VideoVariant: NSObject, Codable, Equatable {
    public let url: URL
    public let quality: VideoQuality
    public let bitrate: Int
    public let resolution: CGSize
    public let sizeBytes: Int
    public let duration: TimeInterval
    public private(set) var compressionRatio: Double
    public private(set) var isCompatible: Bool
    
    private static let maxBitrate = 20_000_000 // 20 Mbps
    private static let maxSizeBytes = 2_000_000_000 // 2 GB
    private static let maxDuration: TimeInterval = 3600 // 1 hour
    
    public init(url: URL,
               quality: VideoQuality,
               bitrate: Int,
               resolution: CGSize,
               sizeBytes: Int,
               duration: TimeInterval) throws {
        // Validate URL
        guard url.scheme?.lowercased() == "https" else {
            throw VideoValidationError.invalidURL
        }
        
        self.url = url
        self.quality = quality
        
        // Validate and set bitrate
        self.bitrate = min(max(bitrate, 0), VideoVariant.maxBitrate)
        
        // Validate resolution
        let aspectRatio = resolution.width / resolution.height
        guard aspectRatio >= 1.0 && aspectRatio <= 2.0 else {
            throw VideoValidationError.invalidData
        }
        self.resolution = resolution
        
        // Validate and set size
        self.sizeBytes = min(max(sizeBytes, 0), VideoVariant.maxSizeBytes)
        
        // Validate and set duration
        self.duration = min(max(duration, 0), VideoVariant.maxDuration)
        
        // Calculate compression ratio
        let theoreticalSize = Double(bitrate) * duration / 8
        self.compressionRatio = Double(sizeBytes) / theoreticalSize
        
        // Check format compatibility
        let asset = AVAsset(url: url)
        self.isCompatible = asset.isPlayable && asset.isExportable
        
        super.init()
    }
    
    public static func == (lhs: VideoVariant, rhs: VideoVariant) -> Bool {
        return lhs.url == rhs.url &&
               lhs.quality == rhs.quality &&
               lhs.bitrate == rhs.bitrate &&
               lhs.resolution == rhs.resolution &&
               lhs.sizeBytes == rhs.sizeBytes &&
               lhs.duration == rhs.duration
    }
}

/// Thread-safe main video model with enhanced memory management
@objc public class Video: NSObject, Codable, Identifiable {
    public let id: UUID
    public let title: String
    public let description: String?
    public let userId: String
    public let coachId: String?
    public private(set) var status: VideoProcessingStatus
    public let originalUrl: URL
    public private(set) var thumbnailUrl: URL
    private var variants: [VideoVariant]
    private let variantsLock = NSLock()
    private var annotations: [Annotation]
    private let annotationsLock = NSLock()
    public private(set) var duration: TimeInterval
    public let createdAt: Date
    public private(set) var updatedAt: Date
    
    private static let maxTitleLength = 100
    private static let maxDescriptionLength = 1000
    private static let maxVariants = 5
    private static let maxAnnotations = 100
    
    public init(title: String,
               description: String?,
               userId: String,
               coachId: String?,
               originalUrl: URL) throws {
        // Generate UUID
        self.id = UUID()
        
        // Validate title
        guard title.count > 0 && title.count <= Video.maxTitleLength else {
            throw VideoValidationError.invalidTitle
        }
        self.title = title
        
        // Validate description
        if let desc = description {
            guard desc.count <= Video.maxDescriptionLength else {
                throw VideoValidationError.invalidData
            }
            self.description = desc
        } else {
            self.description = nil
        }
        
        // Validate user references
        guard !userId.isEmpty else {
            throw VideoValidationError.invalidUserReference
        }
        self.userId = userId
        self.coachId = coachId
        
        // Validate URL
        guard originalUrl.scheme?.lowercased() == "https" else {
            throw VideoValidationError.invalidURL
        }
        self.originalUrl = originalUrl
        
        // Initialize thumbnail URL
        self.thumbnailUrl = originalUrl.deletingLastPathComponent()
            .appendingPathComponent("thumb_\(id.uuidString).jpg")
        
        // Initialize collections
        self.variants = []
        self.annotations = []
        
        // Set initial status
        self.status = .pending
        
        // Set timestamps
        let now = Date()
        self.createdAt = now
        self.updatedAt = now
        
        // Initialize duration
        self.duration = 0
        
        super.init()
        
        // Calculate initial duration
        let asset = AVAsset(url: originalUrl)
        self.duration = CMTimeGetSeconds(asset.duration)
    }
    
    public func validate() -> Result<Bool, VideoValidationError> {
        variantsLock.lock()
        defer { variantsLock.unlock() }
        
        annotationsLock.lock()
        defer { annotationsLock.unlock() }
        
        // Validate title and description
        guard title.count > 0 && title.count <= Video.maxTitleLength else {
            return .failure(.invalidTitle)
        }
        
        if let desc = description {
            guard desc.count <= Video.maxDescriptionLength else {
                return .failure(.invalidData)
            }
        }
        
        // Validate URLs
        guard originalUrl.scheme?.lowercased() == "https",
              thumbnailUrl.scheme?.lowercased() == "https" else {
            return .failure(.invalidURL)
        }
        
        // Validate user references
        guard !userId.isEmpty else {
            return .failure(.invalidUserReference)
        }
        
        // Validate variants
        guard variants.count <= Video.maxVariants else {
            return .failure(.memoryLimitExceeded)
        }
        
        // Validate annotations
        guard annotations.count <= Video.maxAnnotations else {
            return .failure(.memoryLimitExceeded)
        }
        
        // Validate annotations consistency
        for annotation in annotations {
            guard annotation.validate() else {
                return .failure(.annotationConsistencyError)
            }
        }
        
        return .success(true)
    }
    
    public func addVariant(_ variant: VideoVariant) -> Result<Bool, VariantError> {
        variantsLock.lock()
        defer { variantsLock.unlock() }
        
        // Check for duplicates
        guard !variants.contains(where: { $0.quality == variant.quality }) else {
            return .failure(.qualityDuplicate)
        }
        
        // Check memory limits
        guard variants.count < Video.maxVariants else {
            return .failure(.memoryLimitExceeded)
        }
        
        // Add variant and update timestamp
        variants.append(variant)
        updatedAt = Date()
        
        return .success(true)
    }
    
    public func addAnnotation(_ annotation: Annotation) -> Result<Bool, AnnotationError> {
        annotationsLock.lock()
        defer { annotationsLock.unlock() }
        
        // Validate annotation
        guard annotation.validate() else {
            return .failure(.invalidData)
        }
        
        // Check memory limits
        guard annotations.count < Video.maxAnnotations else {
            return .failure(.memoryLimitExceeded)
        }
        
        // Add annotation and update timestamp
        annotations.append(annotation)
        updatedAt = Date()
        
        return .success(true)
    }
}