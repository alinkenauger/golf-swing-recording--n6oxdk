import SwiftUI
import Combine

/// A SwiftUI view that displays a list of chat threads with real-time updates,
/// enhanced accessibility features, and offline support
struct ChatListView: View {
    // MARK: - Properties
    
    @StateObject private var chatStore = ChatStore.shared
    @State private var isLoading = false
    @State private var searchText = ""
    @State private var currentPage = 1
    @State private var hasMorePages = true
    @State private var errorMessage: String?
    
    // Constants
    private let batchSize = 20
    private let searchDebouncer = PassthroughSubject<String, Never>()
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    init() {
        setupSearchDebouncer()
        setupNotificationObservers()
    }
    
    // MARK: - Body
    
    var body: some View {
        NavigationView {
            ZStack {
                // Main content
                VStack(spacing: UIConfig.spacing["small"]) {
                    // Connection status banner
                    connectionStatusBanner
                    
                    // Search bar
                    searchBar
                    
                    // Chat threads list
                    chatThreadsList
                }
                .navigationTitle("Messages")
                .navigationBarItems(trailing: navigationBarItems)
                
                // Loading overlay
                if isLoading {
                    LoadingView(text: "Loading messages...")
                }
                
                // Error message
                if let error = errorMessage {
                    errorBanner(message: error)
                }
            }
        }
    }
    
    // MARK: - Subviews
    
    private var connectionStatusBanner: some View {
        Group {
            if chatStore.connectionState != .connected {
                HStack {
                    Image(systemName: "wifi.slash")
                    Text("Offline Mode")
                        .font(.system(.subheadline, design: .rounded))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(UIConfig.spacing["small"])
                .background(Color.orange)
                .transition(.move(edge: .top))
                .accessibilityAddTraits(.isStatusElement)
            }
        }
    }
    
    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.gray)
            
            TextField("Search messages", text: $searchText)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .accessibilityLabel("Search messages")
                .onChange(of: searchText) { newValue in
                    searchDebouncer.send(newValue)
                }
        }
        .padding(.horizontal)
    }
    
    private var chatThreadsList: some View {
        ScrollView {
            LazyVStack(spacing: UIConfig.spacing["medium"]) {
                ForEach(filteredThreads, id: \.0) { threadId, messages in
                    NavigationLink(destination: ChatDetailView(threadId: threadId)) {
                        ChatThreadCell(
                            threadId: threadId,
                            messages: messages,
                            unreadCount: chatStore.unreadCounts[threadId] ?? 0
                        )
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(makeThreadAccessibilityLabel(threadId: threadId, messages: messages))
                    
                    if threadId == filteredThreads.last?.0 && hasMorePages {
                        loadMoreTrigger
                    }
                }
            }
            .padding()
        }
        .refreshable {
            await refreshThreads()
        }
    }
    
    private var loadMoreTrigger: some View {
        Group {
            if !isLoading {
                Color.clear
                    .frame(height: 50)
                    .onAppear {
                        loadMoreThreads()
                    }
            }
        }
    }
    
    private var navigationBarItems: some View {
        HStack {
            Button(action: { refreshThreads() }) {
                Image(systemName: "arrow.clockwise")
                    .accessibilityLabel("Refresh messages")
            }
            
            Button(action: { showNewMessageComposer() }) {
                Image(systemName: "square.and.pencil")
                    .accessibilityLabel("New message")
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func setupSearchDebouncer() {
        searchDebouncer
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.currentPage = 1
                self?.refreshThreads()
            }
            .store(in: &cancellables)
    }
    
    private func setupNotificationObservers() {
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                self?.refreshThreads()
            }
            .store(in: &cancellables)
    }
    
    private func refreshThreads() {
        guard !isLoading else { return }
        
        isLoading = true
        currentPage = 1
        
        Task {
            do {
                let threads = try await chatStore.loadMessages(limit: batchSize)
                hasMorePages = threads.count == batchSize
                isLoading = false
                errorMessage = nil
            } catch {
                isLoading = false
                errorMessage = "Failed to load messages"
                print("Error loading threads: \(error)")
            }
        }
    }
    
    private func loadMoreThreads() {
        guard !isLoading && hasMorePages else { return }
        
        isLoading = true
        currentPage += 1
        
        Task {
            do {
                let threads = try await chatStore.loadMessages(
                    limit: batchSize,
                    page: currentPage
                )
                hasMorePages = threads.count == batchSize
                isLoading = false
                errorMessage = nil
            } catch {
                isLoading = false
                currentPage -= 1
                errorMessage = "Failed to load more messages"
                print("Error loading more threads: \(error)")
            }
        }
    }
    
    private var filteredThreads: [(String, [Message])] {
        let threads = chatStore.messages
        
        if searchText.isEmpty {
            return threads.sorted { $0.1.last?.createdAt ?? Date() > $1.1.last?.createdAt ?? Date() }
        }
        
        return threads.filter { threadId, messages in
            messages.contains { message in
                message.content.localizedCaseInsensitiveContains(searchText)
            }
        }
        .sorted { $0.1.last?.createdAt ?? Date() > $1.1.last?.createdAt ?? Date() }
    }
    
    private func makeThreadAccessibilityLabel(threadId: String, messages: [Message]) -> String {
        let unreadCount = chatStore.unreadCounts[threadId] ?? 0
        let lastMessage = messages.last?.content ?? ""
        return "Chat with \(threadId), \(unreadCount) unread messages, last message: \(lastMessage)"
    }
    
    private func showNewMessageComposer() {
        // Implementation for new message composer
        // This would typically navigate to a new view for composing messages
    }
    
    private func errorBanner(message: String) -> some View {
        Text(message)
            .foregroundColor(.white)
            .padding()
            .background(Color.red)
            .cornerRadius(UIConfig.cornerRadius)
            .padding()
            .transition(.move(edge: .top))
            .accessibilityAddTraits(.isAlert)
    }
}

// MARK: - Preview Provider

#if DEBUG
struct ChatListView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ChatListView()
                .previewDisplayName("Default")
            
            ChatListView()
                .preferredColorScheme(.dark)
                .previewDisplayName("Dark Mode")
        }
    }
}
#endif