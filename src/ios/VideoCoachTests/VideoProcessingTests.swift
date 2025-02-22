import XCTest
import AVFoundation
@testable import VideoCoach

@available(iOS 14.0, *)
class VideoProcessingTests: XCTestCase {
    
    // MARK: - Private Properties
    private var videoProcessor: VideoProcessor!
    private var mockVideoService: MockVideoService!
    private var testVideoURL: URL!
    private var testVideoData: Data!
    private var processingQueue: DispatchQueue!
    
    // MARK: - Setup & Teardown
    
    override func setUpWithError() throws {
        // Initialize thread-safe processing queue
        processingQueue = DispatchQueue(label: "com.videocoach.tests.processing", qos: .userInitiated)
        
        // Initialize video processor
        videoProcessor = VideoProcessor()
        
        // Initialize mock service
        mockVideoService = MockVideoService(networkLatency: 0.1, processingDelay: 0.1)
        
        // Set up test video resources
        let testBundle = Bundle(for: type(of: self))
        guard let videoPath = testBundle.path(forResource: "test_video", ofType: "mp4") else {
            throw XCTError(.failureWithMessage("Test video not found"))
        }
        testVideoURL = URL(fileURLWithPath: videoPath)
        testVideoData = try Data(contentsOf: testVideoURL)
    }
    
    override func tearDownWithError() throws {
        // Reset mock service state
        mockVideoService.reset()
        
        // Clean up test files
        let fileManager = FileManager.default
        let tempDirectory = NSTemporaryDirectory()
        let tempFiles = try fileManager.contentsOfDirectory(atPath: tempDirectory)
        for file in tempFiles where file.contains("test_") {
            try fileManager.removeItem(atPath: tempDirectory + file)
        }
        
        // Clear processing queue
        processingQueue.sync {}
        
        // Release resources
        videoProcessor = nil
        mockVideoService = nil
        testVideoURL = nil
        testVideoData = nil
        processingQueue = nil
    }
    
    // MARK: - Video Validation Tests
    
    func testVideoValidation() throws {
        // Test supported format validation
        let validationResult = videoProcessor.validateVideo(at: testVideoURL, options: .default)
        switch validationResult {
        case .success(let metadata):
            // Verify duration limits
            XCTAssertLessThanOrEqual(metadata.duration, VideoConfig.maxDuration)
            
            // Verify resolution requirements
            let minDimension: CGFloat = 480
            let maxDimension: CGFloat = 3840
            XCTAssertGreaterThanOrEqual(metadata.dimensions.width, minDimension)
            XCTAssertGreaterThanOrEqual(metadata.dimensions.height, minDimension)
            XCTAssertLessThanOrEqual(metadata.dimensions.width, maxDimension)
            XCTAssertLessThanOrEqual(metadata.dimensions.height, maxDimension)
            
            // Verify file size
            XCTAssertLessThanOrEqual(metadata.fileSize, VideoConfig.maxFileSize)
            
            // Verify codec support
            XCTAssertTrue(VideoConfig.supportedCodecs.contains(metadata.codec))
            
        case .failure(let error):
            XCTFail("Video validation failed: \(error)")
        }
        
        // Test corrupt file handling
        let corruptData = Data(repeating: 0, count: 1024)
        let corruptURL = FileManager.default.temporaryDirectory.appendingPathComponent("corrupt.mp4")
        try corruptData.write(to: corruptURL)
        
        let corruptResult = videoProcessor.validateVideo(at: corruptURL, options: .default)
        switch corruptResult {
        case .success:
            XCTFail("Corrupt file validation should fail")
        case .failure(let error):
            XCTAssertEqual(error, .invalidFormat)
        }
    }
    
    // MARK: - Video Compression Tests
    
    func testVideoCompression() throws {
        let qualities: [VideoQualityPreset] = [.high, .medium, .low]
        
        for quality in qualities {
            let expectation = XCTestExpectation(description: "Video compression for \(quality)")
            
            processingQueue.async {
                let result = self.videoProcessor.processVideo(
                    at: self.testVideoURL,
                    quality: quality
                ) { progress in
                    // Verify progress updates
                    XCTAssertGreaterThanOrEqual(progress.progress, 0)
                    XCTAssertLessThanOrEqual(progress.progress, 1)
                }
                
                switch result {
                case .success(let processedVideo):
                    // Verify output file exists
                    XCTAssertTrue(FileManager.default.fileExists(atPath: processedVideo.url.path))
                    
                    // Verify compression ratio
                    let originalSize = self.testVideoData.count
                    let compressedSize = try! Data(contentsOf: processedVideo.url).count
                    let compressionRatio = Double(compressedSize) / Double(originalSize)
                    
                    switch quality {
                    case .high:
                        XCTAssertLessThanOrEqual(compressionRatio, 0.8)
                    case .medium:
                        XCTAssertLessThanOrEqual(compressionRatio, 0.5)
                    case .low:
                        XCTAssertLessThanOrEqual(compressionRatio, 0.3)
                    default:
                        break
                    }
                    
                    // Verify video playability
                    let asset = AVAsset(url: processedVideo.url)
                    XCTAssertTrue(asset.isPlayable)
                    
                case .failure(let error):
                    XCTFail("Compression failed for \(quality): \(error)")
                }
                
                expectation.fulfill()
            }
            
            wait(for: [expectation], timeout: 60.0)
        }
    }
    
    // MARK: - Thumbnail Generation Tests
    
    func testThumbnailGeneration() throws {
        let timestamps: [TimeInterval] = [0, 1, 5]
        
        for timestamp in timestamps {
            let expectation = XCTestExpectation(description: "Thumbnail generation at \(timestamp)")
            
            processingQueue.async {
                let result = self.videoProcessor.generateThumbnail(for: self.testVideoURL)
                
                switch result {
                case .success(let thumbnailURL):
                    // Verify thumbnail exists
                    XCTAssertTrue(FileManager.default.fileExists(atPath: thumbnailURL.path))
                    
                    // Verify thumbnail format
                    let image = UIImage(contentsOfFile: thumbnailURL.path)
                    XCTAssertNotNil(image)
                    
                    // Verify dimensions
                    XCTAssertGreaterThan(image!.size.width, 0)
                    XCTAssertGreaterThan(image!.size.height, 0)
                    
                    // Verify file size
                    let thumbnailSize = try! FileManager.default.attributesOfItem(atPath: thumbnailURL.path)[.size] as! Int64
                    XCTAssertLessThan(thumbnailSize, 1024 * 1024) // Max 1MB
                    
                case .failure(let error):
                    XCTFail("Thumbnail generation failed at \(timestamp): \(error)")
                }
                
                expectation.fulfill()
            }
            
            wait(for: [expectation], timeout: 30.0)
        }
    }
    
    // MARK: - Performance Tests
    
    func testProcessingPerformance() throws {
        let expectation = XCTestExpectation(description: "Processing performance validation")
        
        processingQueue.async {
            let startTime = Date()
            
            let result = self.videoProcessor.processVideo(
                at: self.testVideoURL,
                quality: .medium
            ) { _ in }
            
            let processingTime = Date().timeIntervalSince(startTime)
            
            // Verify processing time limit (60 seconds requirement)
            XCTAssertLessThanOrEqual(processingTime, 60.0)
            
            switch result {
            case .success(let processedVideo):
                // Verify memory usage
                let memoryUsage = self.getMemoryUsage()
                XCTAssertLessThan(memoryUsage, 512 * 1024 * 1024) // Max 512MB
                
                // Verify CPU usage
                let cpuUsage = self.getCPUUsage()
                XCTAssertLessThan(cpuUsage, 80.0) // Max 80%
                
                // Verify output quality
                let asset = AVAsset(url: processedVideo.url)
                XCTAssertTrue(asset.isPlayable)
                XCTAssertTrue(asset.isExportable)
                
            case .failure(let error):
                XCTFail("Performance test failed: \(error)")
            }
            
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 60.0)
    }
    
    // MARK: - Helper Methods
    
    private func getMemoryUsage() -> UInt64 {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size)/4
        
        let kerr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        
        return kerr == KERN_SUCCESS ? info.resident_size : 0
    }
    
    private func getCPUUsage() -> Double {
        var totalUsageOfCPU: Double = 0.0
        var threadList: thread_act_array_t?
        var threadCount: mach_msg_type_number_t = 0
        
        let threadsResult = task_threads(mach_task_self_, &threadList, &threadCount)
        
        if threadsResult == KERN_SUCCESS, let threadList = threadList {
            for index in 0..<threadCount {
                var threadInfo = thread_basic_info()
                var count = mach_msg_type_number_t(THREAD_BASIC_INFO_COUNT)
                let infoResult = withUnsafeMutablePointer(to: &threadInfo) {
                    $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                        thread_info(threadList[Int(index)], thread_flavor_t(THREAD_BASIC_INFO), $0, &count)
                    }
                }
                
                if infoResult == KERN_SUCCESS {
                    totalUsageOfCPU += (Double(threadInfo.cpu_usage) / Double(TH_USAGE_SCALE)) * 100.0
                }
            }
            
            vm_deallocate(mach_task_self_, vm_address_t(UInt(bitPattern: threadList)), vm_size_t(Int(threadCount) * MemoryLayout<thread_t>.stride))
        }
        
        return totalUsageOfCPU
    }
}