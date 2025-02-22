//
// VideoUITests.swift
// VideoCoachUITests
//
// Version: 1.0
// UI test suite for video-related functionality
// XCTest version: Built-in with Xcode

import XCTest

/// Test data structure for video testing
struct TestVideoData {
    let sampleVideoURL: URL
    let expectedDuration: TimeInterval
    let expectedFileSize: Int64
    let supportedFormats: [String]
    let compressionQualities: [String: Float]
}

/// Mock pipeline for testing video processing
class MockVideoProcessingPipeline {
    var currentStage: String = ""
    var processingComplete: Bool = false
    var generatedVariants: [String] = []
    var compressionQuality: Float = 1.0
    
    func reset() {
        currentStage = ""
        processingComplete = false
        generatedVariants = []
        compressionQuality = 1.0
    }
}

class VideoUITests: XCTestCase {
    var app: XCUIApplication!
    var testVideoData: TestVideoData!
    var mockProcessingPipeline: MockVideoProcessingPipeline!
    
    override func setUp() {
        super.setUp()
        
        // Initialize application
        app = XCUIApplication()
        
        // Configure test environment
        app.launchArguments += ["UI_TESTING"]
        app.launchEnvironment["TESTING_MODE"] = "1"
        
        // Initialize mock pipeline
        mockProcessingPipeline = MockVideoProcessingPipeline()
        
        // Set up test video data
        testVideoData = TestVideoData(
            sampleVideoURL: Bundle(for: type(of: self)).url(forResource: "sample_video", withExtension: "mp4")!,
            expectedDuration: 30.0,
            expectedFileSize: 15_000_000,
            supportedFormats: ["mp4", "mov", "m4v"],
            compressionQualities: ["high": 1.0, "medium": 0.7, "low": 0.5]
        )
        
        // Configure permission handling
        addUIInterruptionMonitor(withDescription: "Camera Permission") { alert -> Bool in
            alert.buttons["Allow"].tap()
            return true
        }
        
        addUIInterruptionMonitor(withDescription: "Microphone Permission") { alert -> Bool in
            alert.buttons["Allow"].tap()
            return true
        }
        
        app.launch()
    }
    
    override func tearDown() {
        // Clean up test artifacts
        let fileManager = FileManager.default
        let tempDirectory = NSTemporaryDirectory()
        try? fileManager.removeItem(atPath: tempDirectory + "test_videos")
        
        // Reset mock pipeline
        mockProcessingPipeline.reset()
        
        // Clear app state
        app.terminate()
        
        super.tearDown()
    }
    
    func testVideoRecording() {
        // Navigate to recording screen
        let recordButton = app.buttons["StartRecording"]
        XCTAssertTrue(recordButton.exists, "Recording button should be visible")
        
        // Test recording controls
        recordButton.tap()
        
        // Verify recording indicator
        let recordingIndicator = app.otherElements["RecordingIndicator"]
        XCTAssertTrue(recordingIndicator.exists, "Recording indicator should be visible")
        
        // Verify timer
        let timer = app.staticTexts["RecordingTimer"]
        XCTAssertTrue(timer.exists, "Recording timer should be visible")
        
        // Record for test duration
        sleep(5)
        
        // Stop recording
        app.buttons["StopRecording"].tap()
        
        // Verify format validation
        let processingIndicator = app.activityIndicators["ProcessingIndicator"]
        XCTAssertTrue(processingIndicator.exists, "Processing indicator should be visible")
        
        // Verify processing pipeline stages
        let stageLabel = app.staticTexts["ProcessingStage"]
        XCTAssertTrue(stageLabel.waitForExistence(timeout: 5.0))
        
        // Verify compression options
        let qualitySelector = app.segmentedControls["QualitySelector"]
        XCTAssertTrue(qualitySelector.exists, "Quality selector should be visible")
        
        // Test quality selection
        qualitySelector.buttons["High"].tap()
        
        // Verify processing completion
        let completionStatus = app.staticTexts["ProcessingStatus"]
        XCTAssertTrue(completionStatus.waitForExistence(timeout: 30.0))
        XCTAssertEqual(completionStatus.label, "Processing Complete")
        
        // Verify generated variants
        let variantList = app.tables["VariantList"]
        XCTAssertTrue(variantList.exists, "Variant list should be visible")
        XCTAssertEqual(variantList.cells.count, 4) // HD, SD, Mobile, Thumbnail
    }
    
    func testVoiceOverRecording() {
        // Navigate to annotation view
        app.buttons["AnnotationMode"].tap()
        
        // Verify voice-over controls
        let voiceOverButton = app.buttons["StartVoiceOver"]
        XCTAssertTrue(voiceOverButton.exists, "Voice-over button should be visible")
        
        // Start voice-over recording
        voiceOverButton.tap()
        
        // Verify recording UI
        let waveformView = app.otherElements["WaveformView"]
        XCTAssertTrue(waveformView.exists, "Waveform view should be visible")
        
        // Record test audio
        sleep(3)
        
        // Stop recording
        app.buttons["StopVoiceOver"].tap()
        
        // Verify synchronization
        let syncIndicator = app.otherElements["SyncIndicator"]
        XCTAssertTrue(syncIndicator.exists, "Sync indicator should be visible")
        
        // Test multiple layers
        app.buttons["AddLayer"].tap()
        let layersList = app.tables["VoiceOverLayers"]
        XCTAssertEqual(layersList.cells.count, 2, "Should have two voice-over layers")
        
        // Test editing
        let editButton = layersList.cells.element(boundBy: 0).buttons["Edit"]
        editButton.tap()
        
        // Verify edit controls
        let trimControl = app.sliders["TrimControl"]
        XCTAssertTrue(trimControl.exists, "Trim control should be visible")
        
        // Save changes
        app.buttons["SaveChanges"].tap()
        
        // Verify persistence
        app.terminate()
        app.launch()
        
        // Navigate back to annotation view
        app.buttons["AnnotationMode"].tap()
        
        // Verify layers preserved
        XCTAssertEqual(app.tables["VoiceOverLayers"].cells.count, 2, "Voice-over layers should persist")
    }
}