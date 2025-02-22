import Foundation // iOS 14.0+
import Combine // iOS 14.0+

// MARK: - Constants
private let MAX_MESSAGE_RETRY: Int = 3
private let MESSAGE_CACHE_LIMIT: Int = 100
private let OFFLINE_QUEUE_LIMIT: Int = 50
private let MESSAGE_BATCH_SIZE: Int = 20

// MARK: - ChatStore
@MainActor
public final class ChatStore {
    // MARK: - Singleton
    public static let shared = ChatStore()
    
    // MARK: - Published Properties
    @Published private(set) var messages: [String: [Message]] = [:]
    @Published private(set) var unreadCounts: [String: Int] = [:]
    @Published private(set) var activeThread: String?
    @Published private(set) var connectionState: ConnectionState = .disconnected
    
    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private var messageCache: NSCache<NSString, NSArray>
    private var offlineQueue: [Message] = []
    private let chatService = ChatService.shared
    private var retryTimers: [String: Timer] = [:]
    
    // MARK: - Initialization
    private init() {
        // Initialize message cache
        messageCache = NSCache<NSString, NSArray>()
        messageCache.countLimit = MESSAGE_CACHE_LIMIT
        
        // Set up message received subscription
        chatService.messageReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.handleIncomingMessage(message)
            }
            .store(in: &cancellables)
        
        // Monitor connection state
        chatService.connectionStatus
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.handleConnectionStateChange(state)
            }
            .store(in: &cancellables)
        
        // Set up delivery status monitoring
        chatService.messageDelivered
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.updateMessageStatus(message, status: .delivered)
            }
            .store(in: &cancellables)
        
        // Set up read status monitoring
        chatService.messageRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.updateMessageStatus(message, status: .read)
            }
            .store(in: &cancellables)
        
        // Set up background/foreground observers
        NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
            .sink { [weak self] _ in
                self?.handleAppBackground()
            }
            .store(in: &cancellables)
        
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                self?.handleAppForeground()
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Public Methods
    public func sendMessage(content: String, type: MessageType, threadId: String) -> AnyPublisher<Message, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(NSError(domain: "ChatStore", code: -1, userInfo: nil)))
                return
            }
            
            do {
                let message = try Message(
                    id: UUID().uuidString,
                    threadId: threadId,
                    senderId: UserDefaults.standard.string(forKey: "userId") ?? "",
                    type: type,
                    content: content
                )
                
                // Add to local state
                self.addMessageToThread(message)
                
                if self.connectionState == .connected {
                    // Send via service
                    self.chatService.sendMessage(message)
                        .sink(
                            receiveCompletion: { completion in
                                if case .failure(let error) = completion {
                                    self.handleMessageSendFailure(message, error: error)
                                    promise(.failure(error))
                                }
                            },
                            receiveValue: { status in
                                self.updateMessageStatus(message, status: status)
                                promise(.success(message))
                            }
                        )
                        .store(in: &self.cancellables)
                } else {
                    // Queue for offline handling
                    self.queueOfflineMessage(message)
                    promise(.success(message))
                }
            } catch {
                promise(.failure(error))
            }
        }
        .eraseToAnyPublisher()
    }
    
    public func markThreadAsRead(_ threadId: String) {
        guard let threadMessages = messages[threadId] else { return }
        
        let unreadMessages = threadMessages.filter { $0.status != .read }
        let batches = stride(from: 0, to: unreadMessages.count, by: MESSAGE_BATCH_SIZE).map {
            Array(unreadMessages[$0..<min($0 + MESSAGE_BATCH_SIZE, unreadMessages.count)])
        }
        
        for batch in batches {
            for message in batch {
                chatService.markAsRead(message)
                    .sink(
                        receiveCompletion: { _ in },
                        receiveValue: { status in
                            self.updateMessageStatus(message, status: status)
                        }
                    )
                    .store(in: &cancellables)
            }
        }
        
        unreadCounts[threadId] = 0
    }
    
    public func loadMessages(threadId: String, limit: Int = MESSAGE_BATCH_SIZE, before: String? = nil) -> AnyPublisher<[Message], Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(NSError(domain: "ChatStore", code: -1, userInfo: nil)))
                return
            }
            
            // Check cache first
            if let cachedMessages = self.messageCache.object(forKey: threadId as NSString) as? [Message],
               before == nil {
                promise(.success(cachedMessages))
                return
            }
            
            // Fetch from service
            self.chatService.fetchMessages(threadId: threadId, limit: limit, before: before)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            promise(.failure(error))
                        }
                    },
                    receiveValue: { messages in
                        self.messages[threadId] = messages
                        self.messageCache.setObject(messages as NSArray, forKey: threadId as NSString)
                        promise(.success(messages))
                    }
                )
                .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    private func handleConnectionStateChange(_ newState: ConnectionState) {
        connectionState = newState
        
        if newState == .connected {
            processOfflineQueue()
        }
        
        // Update retry timers based on connection state
        if newState != .connected {
            retryTimers.values.forEach { $0.invalidate() }
            retryTimers.removeAll()
        }
    }
    
    private func handleIncomingMessage(_ message: Message) {
        addMessageToThread(message)
        updateUnreadCount(for: message.threadId)
        updateMessageCache(message)
    }
    
    private func addMessageToThread(_ message: Message) {
        var threadMessages = messages[message.threadId] ?? []
        threadMessages.append(message)
        threadMessages.sort { $0.createdAt < $1.createdAt }
        messages[message.threadId] = threadMessages
    }
    
    private func updateMessageStatus(_ message: Message, status: MessageStatus) {
        guard var threadMessages = messages[message.threadId] else { return }
        
        if let index = threadMessages.firstIndex(where: { $0.id == message.id }) {
            threadMessages[index] = message
            messages[message.threadId] = threadMessages
            updateMessageCache(message)
        }
    }
    
    private func updateUnreadCount(for threadId: String) {
        if threadId != activeThread {
            unreadCounts[threadId] = (unreadCounts[threadId] ?? 0) + 1
        }
    }
    
    private func updateMessageCache(_ message: Message) {
        if var cachedMessages = messageCache.object(forKey: message.threadId as NSString) as? [Message] {
            if let index = cachedMessages.firstIndex(where: { $0.id == message.id }) {
                cachedMessages[index] = message
            } else {
                cachedMessages.append(message)
            }
            messageCache.setObject(cachedMessages as NSArray, forKey: message.threadId as NSString)
        }
    }
    
    private func queueOfflineMessage(_ message: Message) {
        guard offlineQueue.count < OFFLINE_QUEUE_LIMIT else { return }
        offlineQueue.append(message)
    }
    
    private func processOfflineQueue() {
        let messages = offlineQueue
        offlineQueue.removeAll()
        
        for message in messages {
            chatService.sendMessage(message)
                .sink(
                    receiveCompletion: { [weak self] completion in
                        if case .failure = completion {
                            self?.queueOfflineMessage(message)
                        }
                    },
                    receiveValue: { [weak self] status in
                        self?.updateMessageStatus(message, status: status)
                    }
                )
                .store(in: &cancellables)
        }
    }
    
    private func handleAppBackground() {
        // Persist offline queue and clean up resources
        // Implementation details would go here
    }
    
    private func handleAppForeground() {
        // Restore state and reconnect if needed
        if connectionState != .connected {
            chatService.connect()
                .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { [weak self] state in
                        self?.handleConnectionStateChange(state)
                    }
                )
                .store(in: &cancellables)
        }
    }
    
    private func handleMessageSendFailure(_ message: Message, error: Error) {
        updateMessageStatus(message, status: .failed)
        
        if message.retryCount < MAX_MESSAGE_RETRY {
            setupRetryTimer(for: message)
        }
    }
    
    private func setupRetryTimer(for message: Message) {
        retryTimers[message.id]?.invalidate()
        
        let timer = Timer.scheduledTimer(withTimeInterval: pow(2.0, Double(message.retryCount)), repeats: false) { [weak self] _ in
            guard let self = self,
                  self.connectionState == .connected else { return }
            
            self.chatService.sendMessage(message)
                .sink(
                    receiveCompletion: { [weak self] completion in
                        if case .failure(let error) = completion {
                            self?.handleMessageSendFailure(message, error: error)
                        }
                    },
                    receiveValue: { [weak self] status in
                        self?.updateMessageStatus(message, status: status)
                        self?.retryTimers[message.id]?.invalidate()
                        self?.retryTimers.removeValue(forKey: message.id)
                    }
                )
                .store(in: &self.cancellables)
        }
        
        retryTimers[message.id] = timer
    }
}