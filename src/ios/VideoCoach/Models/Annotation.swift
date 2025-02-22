import Foundation

// Version: Built-in iOS Framework
import CoreGraphics

/// Defines the types of annotations supported by the video coaching platform
@objc public enum AnnotationType: String, Codable {
    case drawing
    case voiceOver
    case combined
}

/// Available drawing tools for video annotations
@objc public enum DrawingTool: String, Codable {
    case pen
    case line
    case arrow
    case rectangle
    case circle
    case freeform
}

/// Supported audio formats for voice-over annotations
public struct SupportedAudioFormats {
    static let formats = ["audio/m4a", "audio/mp4", "audio/aac"]
    static let maxDuration: TimeInterval = 300 // 5 minutes
    static let maxSizeBytes: Int = 50 * 1024 * 1024 // 50MB
}

/// Represents a single point in a drawing annotation with pressure sensitivity
@objc public class DrawingPoint: NSObject, Codable, Equatable {
    public let x: CGFloat
    public let y: CGFloat
    public let pressure: CGFloat
    public let timestamp: CGFloat
    public private(set) var isValid: Bool
    
    public init(x: CGFloat, y: CGFloat, pressure: CGFloat, timestamp: CGFloat) {
        self.x = max(0, min(x, UIScreen.main.bounds.width))
        self.y = max(0, min(y, UIScreen.main.bounds.height))
        self.pressure = max(0, min(pressure, 1.0))
        self.timestamp = timestamp
        self.isValid = x >= 0 && x <= UIScreen.main.bounds.width &&
                      y >= 0 && y <= UIScreen.main.bounds.height &&
                      pressure >= 0 && pressure <= 1.0
        super.init()
    }
    
    public static func == (lhs: DrawingPoint, rhs: DrawingPoint) -> Bool {
        return lhs.x == rhs.x &&
               lhs.y == rhs.y &&
               lhs.pressure == rhs.pressure &&
               lhs.timestamp == rhs.timestamp
    }
}

/// Model for drawing-based annotations with validation and optimization
@objc public class DrawingAnnotation: NSObject, Codable, Equatable {
    public let toolType: DrawingTool
    public private(set) var points: [DrawingPoint]
    public let color: String
    public let strokeWidth: CGFloat
    public let isFilled: Bool
    public let opacity: CGFloat
    public var isAccessibilityEnabled: Bool
    
    private static let maxPoints = 10000
    private static let minStrokeWidth: CGFloat = 1.0
    private static let maxStrokeWidth: CGFloat = 20.0
    
    public init(toolType: DrawingTool,
               points: [DrawingPoint],
               color: String,
               strokeWidth: CGFloat,
               isFilled: Bool,
               opacity: CGFloat) {
        self.toolType = toolType
        self.points = Array(points.prefix(DrawingAnnotation.maxPoints))
        self.color = color.matches(regex: "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$") ? color : "#000000"
        self.strokeWidth = max(DrawingAnnotation.minStrokeWidth,
                             min(strokeWidth, DrawingAnnotation.maxStrokeWidth))
        self.isFilled = isFilled
        self.opacity = max(0, min(opacity, 1.0))
        self.isAccessibilityEnabled = true
        super.init()
    }
    
    public func validate() -> Bool {
        guard points.count > 0 && points.count <= DrawingAnnotation.maxPoints else {
            return false
        }
        
        guard points.allSatisfy({ $0.isValid }) else {
            return false
        }
        
        guard color.matches(regex: "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$") else {
            return false
        }
        
        guard strokeWidth >= DrawingAnnotation.minStrokeWidth &&
              strokeWidth <= DrawingAnnotation.maxStrokeWidth else {
            return false
        }
        
        guard opacity >= 0 && opacity <= 1.0 else {
            return false
        }
        
        return true
    }
    
    public static func == (lhs: DrawingAnnotation, rhs: DrawingAnnotation) -> Bool {
        return lhs.toolType == rhs.toolType &&
               lhs.points == rhs.points &&
               lhs.color == rhs.color &&
               lhs.strokeWidth == rhs.strokeWidth &&
               lhs.isFilled == rhs.isFilled &&
               lhs.opacity == rhs.opacity
    }
}

/// Model for voice-over annotations with format and memory management
@objc public class VoiceOverAnnotation: NSObject, Codable, Equatable {
    public let audioUrl: URL
    public let duration: TimeInterval
    public let format: String
    public let sizeBytes: Int
    public private(set) var isCompressed: Bool
    public private(set) var cachedData: Data?
    
    public init(audioUrl: URL,
               duration: TimeInterval,
               format: String,
               sizeBytes: Int) {
        self.audioUrl = audioUrl
        self.duration = min(duration, SupportedAudioFormats.maxDuration)
        self.format = format
        self.sizeBytes = min(sizeBytes, SupportedAudioFormats.maxSizeBytes)
        self.isCompressed = false
        super.init()
    }
    
    public func validate() -> Bool {
        guard FileManager.default.fileExists(atPath: audioUrl.path) else {
            return false
        }
        
        guard SupportedAudioFormats.formats.contains(format.lowercased()) else {
            return false
        }
        
        guard duration > 0 && duration <= SupportedAudioFormats.maxDuration else {
            return false
        }
        
        guard sizeBytes > 0 && sizeBytes <= SupportedAudioFormats.maxSizeBytes else {
            return false
        }
        
        return true
    }
    
    public func loadCachedData() {
        if cachedData == nil {
            cachedData = try? Data(contentsOf: audioUrl)
        }
    }
    
    public func clearCache() {
        cachedData = nil
    }
    
    public static func == (lhs: VoiceOverAnnotation, rhs: VoiceOverAnnotation) -> Bool {
        return lhs.audioUrl == rhs.audioUrl &&
               lhs.duration == rhs.duration &&
               lhs.format == rhs.format &&
               lhs.sizeBytes == rhs.sizeBytes
    }
}

// Extension for string validation
private extension String {
    func matches(regex: String) -> Bool {
        return self.range(of: regex, options: .regularExpression) != nil
    }
}