//
// VideoProcessor.swift
// VideoCoach
//
// Handles video processing operations with optimized performance and resource management
// Version: 1.0.0
// Requires: iOS 14.0+
//

import Foundation // iOS 14.0+
import AVFoundation // iOS 14.0+
import CoreImage // iOS 14.0+

// MARK: - Error Types
public enum VideoProcessingError: Error {
    case invalidFormat
    case processingFailed
    case compressionFailed
    case thumbnailGenerationFailed
    case memoryWarning
    case deviceNotSupported
    case temporaryStorageFull
    case backgroundTaskExpired
}

// MARK: - Processing Types
public enum VideoQualityPreset {
    case ultra
    case high
    case medium
    case low
    case adaptive
}

public enum ProcessingStage {
    case validation
    case compression
    case thumbnailGeneration
    case cleanup
}

public struct ProcessingProgress {
    public let progress: Double
    public let stage: ProcessingStage
}

// MARK: - Video Processing Result Types
public struct ProcessedVideo {
    public let url: URL
    public let duration: TimeInterval
    public let fileSize: Int64
    public let thumbnailURL: URL
    public let quality: VideoQualityPreset
    public let metadata: [String: Any]
}

public struct VideoMetadata {
    public let duration: TimeInterval
    public let dimensions: CGSize
    public let fileSize: Int64
    public let codec: String
    public let bitrate: Int64
}

public struct CompressionOptions {
    public let maxBitrate: Int64
    public let preserveAlpha: Bool
    public let hardwareAccelerated: Bool
}

// MARK: - VideoProcessor
@available(iOS 14.0, *)
public class VideoProcessor {
    
    // MARK: - Private Properties
    private let processingQueue: OperationQueue
    private let maxDuration: TimeInterval
    private let supportedFormats: Set<String>
    private var activeProcessingTasks: Set<UUID>
    private let memoryWarningThreshold: Double
    private let temporaryFileManager: TemporaryFileManager
    private let backgroundTaskIdentifier: String
    
    // MARK: - Initialization
    public init(configuration: VideoProcessorConfiguration = .default) {
        self.processingQueue = OperationQueue()
        self.processingQueue.qualityOfService = .userInitiated
        self.processingQueue.maxConcurrentOperationCount = 1
        
        self.maxDuration = VideoConfig.maxDuration
        self.supportedFormats = Set(VideoConfig.supportedCodecs)
        self.activeProcessingTasks = Set<UUID>()
        self.memoryWarningThreshold = 0.8
        self.backgroundTaskIdentifier = "com.videocoach.videoprocessing"
        
        self.temporaryFileManager = TemporaryFileManager()
        
        setupMemoryWarningObserver()
    }
    
    // MARK: - Public Methods
    public func processVideo(
        at videoURL: URL,
        quality: VideoQualityPreset,
        progressHandler: @escaping (ProcessingProgress) -> Void
    ) -> Result<ProcessedVideo, VideoProcessingError> {
        let taskId = UUID()
        activeProcessingTasks.insert(taskId)
        
        var backgroundTask: UIBackgroundTaskIdentifier = .invalid
        backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.handleBackgroundTaskExpiration(taskId: taskId)
            UIApplication.shared.endBackgroundTask(backgroundTask)
        }
        
        defer {
            activeProcessingTasks.remove(taskId)
            UIApplication.shared.endBackgroundTask(backgroundTask)
        }
        
        // Validate device capabilities
        guard isDeviceCapable() else {
            return .failure(.deviceNotSupported)
        }
        
        // Check storage availability
        guard temporaryFileManager.hasAvailableStorage() else {
            return .failure(.temporaryStorageFull)
        }
        
        // Validate video
        let validationResult = validateVideo(at: videoURL, options: .default)
        switch validationResult {
        case .success(let metadata):
            progressHandler(ProcessingProgress(progress: 0.2, stage: .validation))
            
            // Compress video
            let compressionOptions = determineCompressionOptions(for: quality, metadata: metadata)
            let compressionResult = compressVideo(at: videoURL, quality: quality, options: compressionOptions)
            
            switch compressionResult {
            case .success(let compressedVideo):
                progressHandler(ProcessingProgress(progress: 0.6, stage: .compression))
                
                // Generate thumbnail
                let thumbnailResult = generateThumbnail(for: compressedVideo.url)
                switch thumbnailResult {
                case .success(let thumbnailURL):
                    progressHandler(ProcessingProgress(progress: 0.8, stage: .thumbnailGeneration))
                    
                    // Prepare final result
                    let processedVideo = ProcessedVideo(
                        url: compressedVideo.url,
                        duration: metadata.duration,
                        fileSize: compressedVideo.fileSize,
                        thumbnailURL: thumbnailURL,
                        quality: quality,
                        metadata: generateMetadata(video: compressedVideo, thumbnail: thumbnailURL)
                    )
                    
                    progressHandler(ProcessingProgress(progress: 1.0, stage: .cleanup))
                    return .success(processedVideo)
                    
                case .failure(let error):
                    return .failure(error)
                }
                
            case .failure(let error):
                return .failure(error)
            }
            
        case .failure(let error):
            return .failure(error)
        }
    }
    
    public func validateVideo(
        at videoURL: URL,
        options: ValidationOptions
    ) -> Result<VideoMetadata, VideoProcessingError> {
        let asset = AVAsset(url: videoURL)
        
        guard let track = asset.tracks(withMediaType: .video).first else {
            return .failure(.invalidFormat)
        }
        
        let duration = CMTimeGetSeconds(asset.duration)
        guard duration <= maxDuration else {
            return .failure(.invalidFormat)
        }
        
        let dimensions = track.naturalSize
        let codec = determineCodec(from: track)
        
        guard supportedFormats.contains(codec) else {
            return .failure(.invalidFormat)
        }
        
        let metadata = VideoMetadata(
            duration: duration,
            dimensions: dimensions,
            fileSize: try? videoURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0,
            codec: codec,
            bitrate: track.estimatedDataRate
        )
        
        return .success(metadata)
    }
    
    // MARK: - Private Methods
    private func compressVideo(
        at videoURL: URL,
        quality: VideoQualityPreset,
        options: CompressionOptions
    ) -> Result<ProcessedVideo, VideoProcessingError> {
        let asset = AVAsset(url: videoURL)
        let composition = AVMutableComposition()
        
        guard let videoTrack = asset.tracks(withMediaType: .video).first,
              let compositionTrack = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
              ) else {
            return .failure(.compressionFailed)
        }
        
        do {
            try compositionTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: asset.duration),
                of: videoTrack,
                at: .zero
            )
            
            let preset = determineExportPreset(for: quality)
            guard let exportSession = AVAssetExportSession(
                asset: composition,
                presetName: preset
            ) else {
                return .failure(.compressionFailed)
            }
            
            let outputURL = temporaryFileManager.generateTemporaryURL(withExtension: "mp4")
            exportSession.outputURL = outputURL
            exportSession.outputFileType = .mp4
            exportSession.shouldOptimizeForNetworkUse = true
            
            let semaphore = DispatchSemaphore(value: 0)
            var exportError: VideoProcessingError?
            
            exportSession.exportAsynchronously {
                switch exportSession.status {
                case .completed:
                    break
                case .failed, .cancelled:
                    exportError = .compressionFailed
                default:
                    exportError = .processingFailed
                }
                semaphore.signal()
            }
            
            semaphore.wait()
            
            if let error = exportError {
                return .failure(error)
            }
            
            let processedVideo = ProcessedVideo(
                url: outputURL,
                duration: CMTimeGetSeconds(asset.duration),
                fileSize: try? outputURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0,
                thumbnailURL: URL(fileURLWithPath: ""), // Placeholder
                quality: quality,
                metadata: [:]
            )
            
            return .success(processedVideo)
            
        } catch {
            return .failure(.compressionFailed)
        }
    }
    
    private func generateThumbnail(for videoURL: URL) -> Result<URL, VideoProcessingError> {
        let asset = AVAsset(url: videoURL)
        let imageGenerator = AVAssetImageGenerator(asset: asset)
        imageGenerator.appliesPreferredTrackTransform = true
        
        do {
            let thumbnailTime = CMTime(seconds: 0, preferredTimescale: 600)
            let cgImage = try imageGenerator.copyCGImage(at: thumbnailTime, actualTime: nil)
            let thumbnail = UIImage(cgImage: cgImage)
            
            let thumbnailURL = temporaryFileManager.generateTemporaryURL(withExtension: "jpg")
            guard let data = thumbnail.jpegData(compressionQuality: 0.8) else {
                return .failure(.thumbnailGenerationFailed)
            }
            
            try data.write(to: thumbnailURL)
            return .success(thumbnailURL)
            
        } catch {
            return .failure(.thumbnailGenerationFailed)
        }
    }
    
    private func determineExportPreset(for quality: VideoQualityPreset) -> String {
        switch quality {
        case .ultra:
            return AVAssetExportPresetHighestQuality
        case .high:
            return AVAssetExportPreset1920x1080
        case .medium:
            return AVAssetExportPreset1280x720
        case .low:
            return AVAssetExportPreset854x480
        case .adaptive:
            return AVAssetExportPresetMediumQuality
        }
    }
    
    private func setupMemoryWarningObserver() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    @objc private func handleMemoryWarning() {
        temporaryFileManager.clearTemporaryFiles()
        processingQueue.cancelAllOperations()
    }
    
    private func handleBackgroundTaskExpiration(taskId: UUID) {
        activeProcessingTasks.remove(taskId)
        processingQueue.cancelAllOperations()
        temporaryFileManager.clearTemporaryFiles()
    }
    
    private func isDeviceCapable() -> Bool {
        let processorCount = ProcessInfo.processInfo.processorCount
        let physicalMemory = ProcessInfo.processInfo.physicalMemory
        return processorCount >= 2 && physicalMemory >= 2_147_483_648 // 2GB
    }
    
    private func generateMetadata(video: ProcessedVideo, thumbnail: URL) -> [String: Any] {
        return [
            "processingDate": Date(),
            "originalSize": video.fileSize,
            "codec": VideoConfig.supportedCodecs[0],
            "thumbnailSize": (try? thumbnail.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        ]
    }
    
    private func determineCodec(from track: AVAssetTrack) -> String {
        let formatDescriptions = track.formatDescriptions as! [CMFormatDescription]
        guard let firstFormat = formatDescriptions.first else { return "" }
        return CMFormatDescriptionGetMediaSubType(firstFormat).toString()
    }
}

// MARK: - Helper Extensions
private extension CMVideoCodecType {
    func toString() -> String {
        switch self {
        case .h264: return "h264"
        case .hevc: return "h265"
        default: return "unknown"
        }
    }
}