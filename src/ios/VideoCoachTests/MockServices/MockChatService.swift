import Foundation // iOS 14.0+
import Combine // iOS 14.0+
import XCTest // iOS 14.0+
@testable import VideoCoach

// MARK: - Constants
private let MOCK_DELAY: TimeInterval = 0.1
private let MOCK_NETWORK_ERROR_PROBABILITY: Double = 0.1
private let MOCK_MAX_RETRY_ATTEMPTS: Int = 3

// MARK: - Mock Errors
enum MockChatError: Error {
    case networkError
    case invalidMessage
    case notConnected
    case retryLimitExceeded
}

final class MockChatService: ChatService {
    // MARK: - Singleton
    static let shared = MockChatService()
    
    // MARK: - Thread Safety
    private let queue = DispatchQueue(label: "com.videocoach.mockchat", attributes: .concurrent)
    
    // MARK: - Properties
    private var isConnected = false
    private var messages: [Message] = []
    private var retryAttempts: [String: Int] = [:]
    
    // MARK: - Publishers
    let messageReceived = PassthroughSubject<Message, Never>()
    let messageDelivered = PassthroughSubject<Message, Never>()
    let messageRead = PassthroughSubject<Message, Never>()
    let typingStatus = PassthroughSubject<(String, Bool), Never>()
    let connectionStatus = CurrentValueSubject<Bool, Never>(false)
    let networkError = PassthroughSubject<Error, Never>()
    
    // MARK: - Initialization
    private init() {
        messages.reserveCapacity(1000)
    }
    
    // MARK: - Connection Management
    func connect() -> AnyPublisher<Bool, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(MockChatError.networkError))
                return
            }
            
            self.queue.asyncAfter(deadline: .now() + MOCK_DELAY) {
                if Double.random(in: 0...1) < MOCK_NETWORK_ERROR_PROBABILITY {
                    promise(.failure(MockChatError.networkError))
                    return
                }
                
                self.queue.async(flags: .barrier) {
                    self.isConnected = true
                    self.connectionStatus.send(true)
                    promise(.success(true))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    func disconnect() {
        queue.async(flags: .barrier) {
            self.isConnected = false
            self.messages.removeAll()
            self.retryAttempts.removeAll()
            self.connectionStatus.send(false)
        }
    }
    
    // MARK: - Message Handling
    func sendMessage(_ message: Message) -> AnyPublisher<Message, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(MockChatError.networkError))
                return
            }
            
            self.queue.asyncAfter(deadline: .now() + MOCK_DELAY) {
                guard self.isConnected else {
                    promise(.failure(MockChatError.notConnected))
                    return
                }
                
                let messageId = message.id
                let currentRetries = self.retryAttempts[messageId] ?? 0
                
                if Double.random(in: 0...1) < MOCK_NETWORK_ERROR_PROBABILITY {
                    if currentRetries >= MOCK_MAX_RETRY_ATTEMPTS {
                        promise(.failure(MockChatError.retryLimitExceeded))
                        return
                    }
                    
                    self.retryAttempts[messageId] = currentRetries + 1
                    promise(.failure(MockChatError.networkError))
                    return
                }
                
                self.queue.async(flags: .barrier) {
                    self.messages.append(message)
                    self.messageDelivered.send(message)
                    promise(.success(message))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    func markAsRead(_ messages: [Message]) -> AnyPublisher<Void, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(MockChatError.networkError))
                return
            }
            
            self.queue.asyncAfter(deadline: .now() + MOCK_DELAY) {
                guard self.isConnected else {
                    promise(.failure(MockChatError.notConnected))
                    return
                }
                
                self.queue.async(flags: .barrier) {
                    messages.forEach { message in
                        self.messageRead.send(message)
                    }
                    promise(.success(()))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    func sendTypingStatus(threadId: String, isTyping: Bool) {
        guard isConnected else { return }
        
        queue.asyncAfter(deadline: .now() + MOCK_DELAY) {
            self.typingStatus.send((threadId, isTyping))
        }
    }
    
    // MARK: - Test Helpers
    func simulateIncomingMessage(_ message: Message) {
        guard isConnected else { return }
        
        queue.async(flags: .barrier) {
            self.messages.append(message)
            self.messageReceived.send(message)
        }
    }
    
    func simulateNetworkError() {
        networkError.send(MockChatError.networkError)
    }
    
    func simulateDisconnection() {
        disconnect()
    }
    
    func getMessageCount() -> Int {
        queue.sync { messages.count }
    }
    
    func clearMessages() {
        queue.async(flags: .barrier) {
            self.messages.removeAll()
        }
    }
}