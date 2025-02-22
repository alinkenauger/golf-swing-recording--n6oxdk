import Foundation // iOS 14.0+
import Combine // iOS 14.0+

// MARK: - Constants
private let MESSAGE_PAGE_SIZE: Int = 20
private let TYPING_DEBOUNCE_INTERVAL: TimeInterval = 0.5
private let MESSAGE_RETRY_ATTEMPTS: Int = 3
private let MESSAGE_RETRY_DELAY: TimeInterval = 1.0

// MARK: - Supporting Types
struct ThreadState {
    var messages: [Message]
    var unreadCount: Int
    var lastMessage: Message?
    var isTyping: Bool
    var hasMoreMessages: Bool
    var error: Error?
}

struct RetryMessage {
    let message: Message
    var attempts: Int
    var nextRetryDate: Date
}

enum ChatError: Error {
    case invalidThread
    case messageValidation
    case sendFailure(String)
    case loadFailure(String)
    case networkError
    case encryptionError
}

// MARK: - ViewModel
@MainActor
final class ChatViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published private(set) var threads: [String: ThreadState] = [:]
    @Published var activeThread: String? = nil
    @Published private(set) var isLoading: Bool = false
    @Published var error: ChatError? = nil
    
    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private let chatService: ChatService
    private let queue = DispatchQueue(label: "com.videocoach.chat", qos: .userInitiated)
    private var typingSubject = PassthroughSubject<(String, Bool), Never>()
    private var messageRetryQueue: [RetryMessage] = []
    
    // MARK: - Initialization
    init(chatService: ChatService = .shared) {
        self.chatService = chatService
        setupSubscriptions()
    }
    
    private func setupSubscriptions() {
        // Message received subscription
        chatService.messageReceived
            .receive(on: queue)
            .sink { [weak self] message in
                self?.handleNewMessage(message)
            }
            .store(in: &cancellables)
        
        // Typing indicator with debounce
        typingSubject
            .debounce(for: .seconds(TYPING_DEBOUNCE_INTERVAL), scheduler: queue)
            .sink { [weak self] threadId, isTyping in
                self?.updateTypingStatus(threadId: threadId, isTyping: isTyping)
            }
            .store(in: &cancellables)
        
        // Connection status monitoring
        chatService.connectionStatus
            .receive(on: queue)
            .sink { [weak self] state in
                if case .disconnected = state {
                    self?.handleDisconnection()
                }
            }
            .store(in: &cancellables)
        
        // Error handling
        chatService.errorPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] chatError in
                self?.handleServiceError(chatError)
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Public Methods
    func loadThread(_ threadId: String, loadMore: Bool = false) -> AnyPublisher<ThreadState, Error> {
        guard !threadId.isEmpty else {
            return Fail(error: ChatError.invalidThread).eraseToAnyPublisher()
        }
        
        return Future { [weak self] promise in
            guard let self = self else { return }
            
            self.isLoading = true
            let currentState = self.threads[threadId] ?? ThreadState(
                messages: [],
                unreadCount: 0,
                lastMessage: nil,
                isTyping: false,
                hasMoreMessages: true,
                error: nil
            )
            
            let offset = loadMore ? currentState.messages.count : 0
            
            Task {
                do {
                    let messages = try await self.fetchMessages(
                        threadId: threadId,
                        offset: offset,
                        limit: MESSAGE_PAGE_SIZE
                    )
                    
                    await MainActor.run {
                        var newState = currentState
                        newState.messages = loadMore ? (currentState.messages + messages) : messages
                        newState.hasMoreMessages = messages.count >= MESSAGE_PAGE_SIZE
                        newState.lastMessage = messages.last
                        
                        self.threads[threadId] = newState
                        self.isLoading = false
                        promise(.success(newState))
                    }
                } catch {
                    await MainActor.run {
                        self.error = .loadFailure(error.localizedDescription)
                        self.isLoading = false
                        promise(.failure(error))
                    }
                }
            }
        }.eraseToAnyPublisher()
    }
    
    func sendMessage(content: String, type: MessageType) -> AnyPublisher<Message, Error> {
        guard let threadId = activeThread, !content.isEmpty else {
            return Fail(error: ChatError.messageValidation).eraseToAnyPublisher()
        }
        
        return Future { [weak self] promise in
            guard let self = self else { return }
            
            Task {
                do {
                    let message = try Message(
                        id: UUID().uuidString,
                        threadId: threadId,
                        senderId: UserDefaults.standard.string(forKey: "userId") ?? "",
                        type: type,
                        content: content
                    )
                    
                    // Add to local state immediately
                    await self.updateThreadWithMessage(message)
                    
                    // Send via service
                    let status = try await self.chatService.sendMessage(message)
                        .asyncThrowingStream()
                        .first(where: { _ in true })
                    
                    if status == .sent {
                        promise(.success(message))
                    } else {
                        self.queueMessageForRetry(message)
                        promise(.failure(ChatError.sendFailure("Message queued for retry")))
                    }
                } catch {
                    promise(.failure(error))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    func markAsRead(_ messages: [Message], in threadId: String) {
        guard !messages.isEmpty else { return }
        
        Task {
            do {
                try await withThrowingTaskGroup(of: Void.self) { group in
                    for message in messages {
                        group.addTask {
                            try await self.chatService.markAsRead(message)
                        }
                    }
                }
                
                await MainActor.run {
                    if var state = threads[threadId] {
                        state.unreadCount = max(0, state.unreadCount - messages.count)
                        threads[threadId] = state
                    }
                }
            } catch {
                self.error = .sendFailure("Failed to mark messages as read")
            }
        }
    }
    
    func setTypingStatus(_ isTyping: Bool) {
        guard let threadId = activeThread else { return }
        typingSubject.send((threadId, isTyping))
    }
    
    // MARK: - Private Methods
    private func handleNewMessage(_ message: Message) {
        Task { @MainActor in
            await updateThreadWithMessage(message)
            
            if message.threadId != activeThread {
                if var state = threads[message.threadId] {
                    state.unreadCount += 1
                    threads[message.threadId] = state
                }
            }
        }
    }
    
    private func updateThreadWithMessage(_ message: Message) async {
        await MainActor.run {
            var state = threads[message.threadId] ?? ThreadState(
                messages: [],
                unreadCount: 0,
                lastMessage: nil,
                isTyping: false,
                hasMoreMessages: true,
                error: nil
            )
            
            state.messages.append(message)
            state.lastMessage = message
            threads[message.threadId] = state
        }
    }
    
    private func queueMessageForRetry(_ message: Message) {
        let retryMessage = RetryMessage(
            message: message,
            attempts: 0,
            nextRetryDate: Date().addingTimeInterval(MESSAGE_RETRY_DELAY)
        )
        messageRetryQueue.append(retryMessage)
        scheduleRetry()
    }
    
    private func scheduleRetry() {
        guard !messageRetryQueue.isEmpty else { return }
        
        Task {
            try await Task.sleep(nanoseconds: UInt64(MESSAGE_RETRY_DELAY * 1_000_000_000))
            await processRetryQueue()
        }
    }
    
    private func processRetryQueue() async {
        messageRetryQueue.removeAll { retryMessage in
            retryMessage.attempts >= MESSAGE_RETRY_ATTEMPTS
        }
        
        for (index, retryMessage) in messageRetryQueue.enumerated() {
            if retryMessage.nextRetryDate <= Date() {
                do {
                    let status = try await chatService.sendMessage(retryMessage.message)
                        .asyncThrowingStream()
                        .first(where: { _ in true })
                    
                    if status == .sent {
                        messageRetryQueue.remove(at: index)
                    } else {
                        messageRetryQueue[index].attempts += 1
                        messageRetryQueue[index].nextRetryDate = Date().addingTimeInterval(
                            MESSAGE_RETRY_DELAY * pow(2.0, Double(retryMessage.attempts))
                        )
                    }
                } catch {
                    continue
                }
            }
        }
        
        if !messageRetryQueue.isEmpty {
            scheduleRetry()
        }
    }
    
    private func handleServiceError(_ error: ChatService.ChatError) {
        switch error {
        case .connectionFailed(let message):
            self.error = .networkError
        case .messageSendFailed(let message):
            self.error = .sendFailure(message)
        case .encryptionFailed(let message):
            self.error = .encryptionError
        default:
            self.error = .networkError
        }
    }
    
    private func handleDisconnection() {
        Task { @MainActor in
            for (threadId, var state) in threads {
                state.error = ChatError.networkError
                threads[threadId] = state
            }
        }
    }
    
    private func updateTypingStatus(threadId: String, isTyping: Bool) {
        Task {
            do {
                try await chatService.setTypingStatus(isTyping)
                
                await MainActor.run {
                    if var state = threads[threadId] {
                        state.isTyping = isTyping
                        threads[threadId] = state
                    }
                }
            } catch {
                // Silently fail typing status updates
            }
        }
    }
    
    private func fetchMessages(threadId: String, offset: Int, limit: Int) async throws -> [Message] {
        // Implementation would interact with ChatService to fetch messages
        // This is a placeholder that would be implemented based on the actual API
        return []
    }
}