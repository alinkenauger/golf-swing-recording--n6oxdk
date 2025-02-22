import SwiftUI // v14.0+
import Combine // v14.0+

/// Constants for chat detail view configuration
private struct ChatConstants {
    static let MESSAGE_PAGE_SIZE: Int = 20
    static let SCROLL_THRESHOLD: CGFloat = 50.0
    static let MAX_RETRY_ATTEMPTS: Int = 3
    static let MINIMUM_TOUCH_TARGET: CGFloat = 44.0
}

/// A SwiftUI view implementing a fully accessible chat detail screen
@available(iOS 14.0, *)
struct ChatDetailView: View {
    // MARK: - Properties
    let threadId: String
    
    @StateObject private var viewModel: ChatDetailViewModel
    @State private var scrollOffset: CGFloat = 0
    @State private var isLoadingMore: Bool = false
    @State private var mediaPickerPresented: Bool = false
    @State private var errorAlert: ErrorAlert? = nil
    
    private let messageAppeared = PassthroughSubject<Message, Never>()
    
    // MARK: - Initialization
    init(threadId: String) {
        self.threadId = threadId
        _viewModel = StateObject(wrappedValue: ChatDetailViewModel(chatService: ChatService.shared))
    }
    
    // MARK: - Body
    var body: some View {
        VStack(spacing: 0) {
            // Message list
            messageList()
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Message history")
            
            // Input area
            ChatInputView(threadId: threadId)
                .environmentObject(viewModel)
        }
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.loadMessages(loadMore: false)
        }
        .alert(item: $errorAlert) { error in
            Alert(
                title: Text("Error"),
                message: Text(error.message),
                dismissButton: .default(Text("OK"))
            )
        }
    }
    
    // MARK: - Message List
    @ViewBuilder
    private func messageList() -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: UIConfig.spacing["small"]) {
                    if isLoadingMore {
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: ChatConstants.MINIMUM_TOUCH_TARGET)
                            .accessibilityLabel("Loading more messages")
                    }
                    
                    ForEach(viewModel.messages) { message in
                        MessageBubble(
                            message: message,
                            isFromCurrentUser: message.senderId == UserDefaults.standard.string(forKey: "userId")
                        )
                        .id(message.id)
                        .onAppear {
                            messageAppeared.send(message)
                            handleScroll(message: message)
                        }
                    }
                }
                .padding(.vertical, UIConfig.spacing["small"])
            }
            .simultaneousGesture(
                DragGesture().onChanged { value in
                    handleScroll(offset: value.translation.height)
                }
            )
            .onChange(of: viewModel.messages) { messages in
                if let lastMessage = messages.last {
                    withAnimation {
                        proxy.scrollTo(lastMessage.id, anchor: .bottom)
                    }
                }
            }
        }
    }
    
    // MARK: - Scroll Handling
    private func handleScroll(offset: CGFloat) {
        scrollOffset = offset
        
        if scrollOffset > ChatConstants.SCROLL_THRESHOLD && !isLoadingMore {
            isLoadingMore = true
            viewModel.loadMessages(loadMore: true)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        isLoadingMore = false
                        if case .failure(let error) = completion {
                            errorAlert = ErrorAlert(message: error.localizedDescription)
                        }
                    },
                    receiveValue: { _ in }
                )
                .store(in: &viewModel.cancellables)
        }
    }
    
    private func handleScroll(message: Message) {
        if message.status != .read {
            viewModel.markMessageAsRead(message)
        }
        
        // Load more messages when reaching the top
        if let firstMessage = viewModel.messages.first,
           message.id == firstMessage.id {
            viewModel.loadMessages(loadMore: true)
        }
    }
}

// MARK: - View Model
@MainActor
class ChatDetailViewModel: ObservableObject {
    // MARK: - Properties
    @Published private(set) var messages: [Message] = []
    @Published private(set) var isLoading: Bool = false
    
    private let chatService: ChatService
    private var currentPage: Int = 1
    private var hasMoreMessages: Bool = true
    var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    init(chatService: ChatService) {
        self.chatService = chatService
        setupSubscriptions()
    }
    
    // MARK: - Message Management
    func loadMessages(loadMore: Bool) -> AnyPublisher<Void, Error> {
        guard !isLoading && (hasMoreMessages || !loadMore) else {
            return Just(()).setFailureType(to: Error.self).eraseToAnyPublisher()
        }
        
        isLoading = true
        let page = loadMore ? currentPage + 1 : 1
        
        return chatService.fetchMessages(page: page, pageSize: ChatConstants.MESSAGE_PAGE_SIZE)
            .receive(on: DispatchQueue.main)
            .handleEvents(receiveOutput: { [weak self] messages in
                guard let self = self else { return }
                
                if loadMore {
                    self.messages.append(contentsOf: messages)
                    self.currentPage = page
                } else {
                    self.messages = messages
                    self.currentPage = 1
                }
                
                self.hasMoreMessages = messages.count == ChatConstants.MESSAGE_PAGE_SIZE
                self.isLoading = false
            })
            .map { _ in () }
            .eraseToAnyPublisher()
    }
    
    func markMessageAsRead(_ message: Message) {
        chatService.markAsRead(messageId: message.id)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] updatedMessage in
                    guard let self = self else { return }
                    if let index = self.messages.firstIndex(where: { $0.id == updatedMessage.id }) {
                        self.messages[index] = updatedMessage
                    }
                }
            )
            .store(in: &cancellables)
    }
    
    // MARK: - Private Methods
    private func setupSubscriptions() {
        chatService.messageReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                guard let self = self else { return }
                self.messages.append(message)
            }
            .store(in: &cancellables)
    }
}

// MARK: - Supporting Types
struct ErrorAlert: Identifiable {
    let id = UUID()
    let message: String
}