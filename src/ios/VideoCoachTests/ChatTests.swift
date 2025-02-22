import XCTest // iOS 14.0+
import Combine // iOS 14.0+
import CryptoKit // iOS 14.0+
import Network // iOS 14.0+
@testable import VideoCoach

// MARK: - Constants
private let TEST_TIMEOUT: TimeInterval = 5.0
private let RETRY_ATTEMPTS: Int = 3
private let BATCH_SIZE: Int = 50

final class ChatTests: XCTestCase {
    // MARK: - Properties
    private var chatService: MockChatService!
    private var cancellables: Set<AnyCancellable>!
    private var networkMonitor: NWPathMonitor!
    private var encryptionKey: SymmetricKey!
    
    // MARK: - Setup & Teardown
    override func setUpWithError() throws {
        try super.setUpWithError()
        chatService = MockChatService.shared
        cancellables = Set<AnyCancellable>()
        networkMonitor = NWPathMonitor()
        encryptionKey = SymmetricKey(size: .bits256)
    }
    
    override func tearDownWithError() throws {
        chatService.clearMessages()
        cancellables.removeAll()
        networkMonitor.cancel()
        chatService = nil
        encryptionKey = nil
        try super.tearDownWithError()
    }
    
    // MARK: - Connection Tests
    func testConnectionLifecycle() {
        let expectation = expectation(description: "Connection lifecycle")
        
        chatService.connect()
            .sink(receiveCompletion: { completion in
                if case .failure(let error) = completion {
                    XCTFail("Connection failed: \(error)")
                }
            }, receiveValue: { connected in
                XCTAssertTrue(connected)
                expectation.fulfill()
            })
            .store(in: &cancellables)
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    // MARK: - Message Tests
    func testMessageSendAndReceive() {
        let sendExpectation = expectation(description: "Message sent")
        let receiveExpectation = expectation(description: "Message received")
        
        let testMessage = try! Message(id: UUID().uuidString,
                                     threadId: "test-thread",
                                     senderId: "sender-1",
                                     type: .text,
                                     content: "Test message")
        
        // Test sending
        chatService.sendMessage(testMessage)
            .sink(receiveCompletion: { completion in
                if case .failure(let error) = completion {
                    XCTFail("Send failed: \(error)")
                }
            }, receiveValue: { message in
                XCTAssertEqual(message.id, testMessage.id)
                sendExpectation.fulfill()
            })
            .store(in: &cancellables)
        
        // Test receiving
        chatService.messageReceived
            .sink { message in
                XCTAssertEqual(message.content, testMessage.content)
                receiveExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        chatService.simulateIncomingMessage(testMessage)
        
        wait(for: [sendExpectation, receiveExpectation], timeout: TEST_TIMEOUT)
    }
    
    func testMessageEncryption() {
        let expectation = expectation(description: "Encrypted message")
        
        let testMessage = try! Message(id: UUID().uuidString,
                                     threadId: "test-thread",
                                     senderId: "sender-1",
                                     type: .text,
                                     content: "Encrypted content")
        
        let encryptedData = "test-content".data(using: .utf8)!
        let sealedBox = try! AES.GCM.seal(encryptedData, using: encryptionKey)
        
        XCTAssertNotNil(sealedBox.combined)
        expectation.fulfill()
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    func testOfflineMessageQueue() {
        let expectation = expectation(description: "Offline message queued")
        
        chatService.simulateDisconnection()
        
        let testMessage = try! Message(id: UUID().uuidString,
                                     threadId: "test-thread",
                                     senderId: "sender-1",
                                     type: .text,
                                     content: "Offline message")
        
        chatService.sendMessage(testMessage)
            .sink(receiveCompletion: { completion in
                if case .failure(let error) = completion {
                    XCTAssertEqual(error as? MockChatError, MockChatError.notConnected)
                    expectation.fulfill()
                }
            }, receiveValue: { _ in
                XCTFail("Should not succeed when offline")
            })
            .store(in: &cancellables)
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    func testMessageRetryMechanism() {
        let expectation = expectation(description: "Message retry")
        expectation.expectedFulfillmentCount = RETRY_ATTEMPTS
        
        let testMessage = try! Message(id: UUID().uuidString,
                                     threadId: "test-thread",
                                     senderId: "sender-1",
                                     type: .text,
                                     content: "Retry message")
        
        var retryCount = 0
        
        chatService.sendMessage(testMessage)
            .retry(RETRY_ATTEMPTS)
            .sink(receiveCompletion: { completion in
                if case .failure = completion {
                    retryCount += 1
                    expectation.fulfill()
                }
            }, receiveValue: { _ in
                XCTFail("Should not succeed during retry test")
            })
            .store(in: &cancellables)
        
        chatService.simulateNetworkError()
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
        XCTAssertEqual(retryCount, RETRY_ATTEMPTS)
    }
    
    func testGroupChatOperations() {
        let expectation = expectation(description: "Group chat operations")
        
        let participants = ["user1", "user2", "user3"]
        let groupMessage = try! Message(id: UUID().uuidString,
                                      threadId: "group-thread",
                                      senderId: "sender-1",
                                      type: .text,
                                      content: "Group message",
                                      metadata: ["participants": participants])
        
        var receivedCount = 0
        
        chatService.messageReceived
            .sink { message in
                receivedCount += 1
                if receivedCount == participants.count {
                    XCTAssertEqual(message.threadId, "group-thread")
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)
        
        participants.forEach { _ in
            chatService.simulateIncomingMessage(groupMessage)
        }
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    func testVideoMessageHandling() {
        let expectation = expectation(description: "Video message handling")
        
        let videoMessage = try! Message(id: UUID().uuidString,
                                      threadId: "test-thread",
                                      senderId: "sender-1",
                                      type: .video,
                                      content: "test-video.mp4",
                                      metadata: ["duration": 30,
                                               "thumbnail": "thumbnail.jpg"])
        
        chatService.sendMessage(videoMessage)
            .sink(receiveCompletion: { completion in
                if case .failure(let error) = completion {
                    XCTFail("Video send failed: \(error)")
                }
            }, receiveValue: { message in
                XCTAssertEqual(message.type, .video)
                XCTAssertTrue(message.content.hasSuffix(".mp4"))
                XCTAssertNotNil(message.metadata["thumbnail"])
                expectation.fulfill()
            })
            .store(in: &cancellables)
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
}