import Foundation // iOS 14.0+
import Combine // iOS 14.0+
import Starscream // v4.0.0
import CryptoKit // iOS 14.0+
import Network // iOS 14.0+

// MARK: - Constants
private let SOCKET_URL = Configuration.chatServiceUrl
private let TYPING_TIMEOUT: TimeInterval = 3.0
private let MAX_RECONNECT_ATTEMPTS = 5
private let RECONNECT_BASE_DELAY: TimeInterval = 1.0
private let MAX_MESSAGE_QUEUE_SIZE = 1000
private let MESSAGE_BATCH_SIZE = 50

// MARK: - Enums
public enum ConnectionState {
    case connected
    case disconnected
    case connecting
    case reconnecting
}

public enum ChatError: Error {
    case connectionFailed(String)
    case messageSendFailed(String)
    case encryptionFailed(String)
    case queueOverflow
    case invalidMessage
    case networkUnavailable
}

// MARK: - ThreadSafe Wrapper
final class ThreadSafe<T> {
    private var value: T
    private let queue = DispatchQueue(label: "com.videocoach.chat.threadsafe")
    
    init(_ value: T) {
        self.value = value
    }
    
    func read() -> T {
        return queue.sync { value }
    }
    
    func write(_ newValue: T) {
        queue.sync { value = newValue }
    }
    
    func modify(_ modification: (inout T) -> Void) {
        queue.sync {
            modification(&value)
        }
    }
}

// MARK: - ChatService
@MainActor
public final class ChatService {
    // MARK: - Singleton
    public static let shared = ChatService()
    
    // MARK: - Properties
    private var socket: WebSocket?
    private var isConnected = false
    private var reconnectAttempts = 0
    private var reconnectTimer: Timer?
    private var messageQueue = ThreadSafe<[Message]>([])
    private var encryptionKey: SymmetricKey?
    private var subscriptions = Set<AnyCancellable>()
    private var networkMonitor: NWPathMonitor?
    
    // MARK: - Publishers
    public let messageReceived = PassthroughSubject<Message, Never>()
    public let messageDelivered = PassthroughSubject<Message, Never>()
    public let messageRead = PassthroughSubject<Message, Never>()
    public let typingStatus = PassthroughSubject<(String, Bool), Never>()
    public let connectionStatus = CurrentValueSubject<ConnectionState, Never>(.disconnected)
    public let errorPublisher = PassthroughSubject<ChatError, Never>()
    
    // MARK: - Initialization
    private init() {
        setupEncryption()
        setupNetworkMonitoring()
        setupMessagePersistence()
    }
    
    // MARK: - Setup Methods
    private func setupEncryption() {
        do {
            encryptionKey = SymmetricKey(size: .bits256)
        } catch {
            errorPublisher.send(.encryptionFailed("Failed to initialize encryption key"))
        }
    }
    
    private func setupNetworkMonitoring() {
        networkMonitor = NWPathMonitor()
        networkMonitor?.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            if path.status == .satisfied {
                if !self.isConnected {
                    Task { await self.connect() }
                }
            } else {
                self.handleDisconnection()
            }
        }
        networkMonitor?.start(queue: DispatchQueue.global())
    }
    
    private func setupMessagePersistence() {
        // Setup periodic message queue persistence
        Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            self?.persistMessageQueue()
        }
    }
    
    // MARK: - Connection Management
    public func connect() -> AnyPublisher<ConnectionState, ChatError> {
        guard networkMonitor?.currentPath.status == .satisfied else {
            return Fail(error: ChatError.networkUnavailable).eraseToAnyPublisher()
        }
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.connectionFailed("Service deallocated")))
                return
            }
            
            let request = URLRequest(url: URL(string: SOCKET_URL)!)
            var socketConfig = WebSocketConfiguration()
            socketConfig.enabledSSLCipherSuites = ["TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384"]
            socketConfig.security = SSLSecurity(certs: [], usePublicKeys: true)
            
            self.socket = WebSocket(request: request, configuration: socketConfig)
            self.setupSocketEventHandlers()
            
            self.connectionStatus.send(.connecting)
            self.socket?.connect()
            
            // Connection timeout handler
            DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
                if self?.connectionStatus.value == .connecting {
                    self?.handleConnectionTimeout()
                    promise(.failure(.connectionFailed("Connection timeout")))
                }
            }
        }
        .handleEvents(receiveSubscription: { [weak self] _ in
            self?.setupAutomaticReconnection()
        })
        .eraseToAnyPublisher()
    }
    
    private func setupSocketEventHandlers() {
        socket?.onEvent = { [weak self] event in
            guard let self = self else { return }
            
            switch event {
            case .connected:
                self.handleConnection()
                
            case .disconnected(let reason, let code):
                self.handleDisconnection(reason: reason, code: code)
                
            case .text(let string):
                self.handleIncomingMessage(string)
                
            case .binary(let data):
                self.handleIncomingBinaryMessage(data)
                
            case .error(let error):
                self.handleError(error)
                
            case .cancelled:
                self.handleCancellation()
                
            case .viabilityChanged(let isViable):
                self.handleViabilityChange(isViable)
                
            case .reconnectSuggested(let shouldReconnect):
                if shouldReconnect {
                    self.attemptReconnection()
                }
            }
        }
    }
    
    // MARK: - Message Handling
    public func sendMessage(_ message: Message) -> AnyPublisher<MessageStatus, ChatError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.messageSendFailed("Service deallocated")))
                return
            }
            
            do {
                let encryptedMessage = try self.encryptMessage(message)
                
                if self.isConnected {
                    self.socket?.write(string: encryptedMessage) { 
                        promise(.success(.sent))
                    }
                } else {
                    try self.queueMessage(message)
                    promise(.success(.sending))
                }
            } catch {
                promise(.failure(.messageSendFailed(error.localizedDescription)))
            }
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    private func processMessageQueue() -> AnyPublisher<[MessageStatus], ChatError> {
        let queue = messageQueue.read()
        guard !queue.isEmpty else {
            return Just([]).setFailureType(to: ChatError.self).eraseToAnyPublisher()
        }
        
        let batches = stride(from: 0, to: queue.count, by: MESSAGE_BATCH_SIZE).map {
            Array(queue[$0..<min($0 + MESSAGE_BATCH_SIZE, queue.count)])
        }
        
        return batches.publisher
            .flatMap { batch in
                self.processBatch(batch)
            }
            .collect()
            .eraseToAnyPublisher()
    }
    
    // MARK: - Helper Methods
    private func encryptMessage(_ message: Message) throws -> String {
        guard let encryptionKey = encryptionKey else {
            throw ChatError.encryptionFailed("Encryption key not initialized")
        }
        
        // Implement encryption logic here
        // This is a placeholder for the actual encryption implementation
        return "encrypted_message"
    }
    
    private func queueMessage(_ message: Message) throws {
        messageQueue.modify { queue in
            guard queue.count < MAX_MESSAGE_QUEUE_SIZE else {
                throw ChatError.queueOverflow
            }
            queue.append(message)
        }
    }
    
    private func processBatch(_ batch: [Message]) -> AnyPublisher<MessageStatus, ChatError> {
        // Implement batch processing logic here
        return Just(.sent)
            .setFailureType(to: ChatError.self)
            .eraseToAnyPublisher()
    }
    
    private func persistMessageQueue() {
        // Implement message queue persistence logic here
    }
    
    // MARK: - Connection Helpers
    private func handleConnection() {
        isConnected = true
        reconnectAttempts = 0
        connectionStatus.send(.connected)
        
        Task {
            await processMessageQueue()
                .sink(
                    receiveCompletion: { [weak self] completion in
                        if case .failure(let error) = completion {
                            self?.errorPublisher.send(error)
                        }
                    },
                    receiveValue: { _ in }
                )
                .store(in: &subscriptions)
        }
    }
    
    private func handleDisconnection(reason: String? = nil, code: UInt16? = nil) {
        isConnected = false
        connectionStatus.send(.disconnected)
        
        if let reason = reason {
            errorPublisher.send(.connectionFailed(reason))
        }
    }
    
    private func handleConnectionTimeout() {
        socket?.disconnect()
        connectionStatus.send(.disconnected)
        errorPublisher.send(.connectionFailed("Connection timeout"))
    }
    
    private func attemptReconnection() {
        guard reconnectAttempts < MAX_RECONNECT_ATTEMPTS else {
            errorPublisher.send(.connectionFailed("Max reconnection attempts reached"))
            return
        }
        
        reconnectAttempts += 1
        let delay = pow(2.0, Double(reconnectAttempts)) * RECONNECT_BASE_DELAY
        
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            Task {
                await self?.connect()
            }
        }
    }
    
    // MARK: - Deinitialization
    deinit {
        networkMonitor?.cancel()
        socket?.disconnect()
        subscriptions.removeAll()
    }
}