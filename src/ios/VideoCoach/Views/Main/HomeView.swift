import SwiftUI

@available(iOS 14.0, *)
struct HomeView: View {
    // MARK: - View Model
    @StateObject private var viewModel = HomeViewModel()
    
    // MARK: - State
    @State private var selectedTab: Int = 0
    @State private var isRefreshing: Bool = false
    @State private var contentOffset: CGFloat = 0
    
    // MARK: - Environment
    @Environment(\.scenePhase) var scenePhase
    
    // MARK: - Constants
    private let gridColumns = [
        GridItem(.adaptive(minimum: 160), spacing: UIConfig.spacing["medium"]),
        GridItem(.adaptive(minimum: 160), spacing: UIConfig.spacing["medium"])
    ]
    
    // MARK: - Body
    var body: some View {
        NavigationView {
            ScrollView {
                LazyVStack(spacing: UIConfig.spacing["large"]) {
                    // Featured Coaches Section
                    featuredCoachesSection
                    
                    // Recent Videos Section
                    recentVideosSection
                    
                    // Recommended Content Section
                    recommendedContentSection
                }
                .padding(.vertical, UIConfig.spacing["medium"])
            }
            .navigationTitle("Home")
            .refreshable {
                await viewModel.refreshContent(forceRefresh: true)
            }
            .overlay(
                Group {
                    if viewModel.isLoading {
                        ProgressView()
                            .scaleEffect(1.5)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(Color.black.opacity(0.2))
                    }
                }
            )
            .alert(item: Binding(
                get: { viewModel.error.map { ErrorWrapper(error: $0) } },
                set: { _ in }
            )) { wrapper in
                Alert(
                    title: Text("Error"),
                    message: Text(wrapper.error.localizedDescription),
                    primaryButton: .default(Text("Retry")) {
                        Task {
                            await viewModel.refreshContent(forceRefresh: true)
                        }
                    },
                    secondaryButton: .cancel()
                )
            }
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                Task {
                    await viewModel.refreshContent()
                }
            }
        }
    }
    
    // MARK: - Featured Coaches Section
    private var featuredCoachesSection: some View {
        VStack(alignment: .leading, spacing: UIConfig.spacing["small"]) {
            HStack {
                Text("Featured Coaches")
                    .font(.title2)
                    .fontWeight(.bold)
                
                Spacer()
                
                NavigationLink(destination: CoachListView()) {
                    Text("See All")
                        .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, UIConfig.spacing["medium"])
            
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: UIConfig.spacing["medium"]) {
                    ForEach(viewModel.featuredCoaches) { coach in
                        CoachCard(coach: coach) {
                            // Handle coach selection
                        }
                        .frame(width: 280)
                    }
                }
                .padding(.horizontal, UIConfig.spacing["medium"])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Featured Coaches")
    }
    
    // MARK: - Recent Videos Section
    private var recentVideosSection: some View {
        VStack(alignment: .leading, spacing: UIConfig.spacing["small"]) {
            HStack {
                Text("Recent Videos")
                    .font(.title2)
                    .fontWeight(.bold)
                
                Spacer()
                
                NavigationLink(destination: VideoListView()) {
                    Text("See All")
                        .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, UIConfig.spacing["medium"])
            
            LazyVGrid(columns: gridColumns, spacing: UIConfig.spacing["medium"]) {
                ForEach(viewModel.recentVideos) { video in
                    NavigationLink(destination: VideoDetailView(video: video)) {
                        VideoThumbnailView(video: video)
                            .aspectRatio(16/9, contentMode: .fit)
                    }
                }
            }
            .padding(.horizontal, UIConfig.spacing["medium"])
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Recent Videos")
    }
    
    // MARK: - Recommended Content Section
    private var recommendedContentSection: some View {
        VStack(alignment: .leading, spacing: UIConfig.spacing["small"]) {
            Text("Recommended For You")
                .font(.title2)
                .fontWeight(.bold)
                .padding(.horizontal, UIConfig.spacing["medium"])
            
            LazyVStack(spacing: UIConfig.spacing["medium"]) {
                ForEach(viewModel.recommendedContent) { video in
                    NavigationLink(destination: VideoDetailView(video: video)) {
                        VideoThumbnailView(video: video, size: .large)
                            .aspectRatio(16/9, contentMode: .fit)
                    }
                }
            }
            .padding(.horizontal, UIConfig.spacing["medium"])
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Recommended Content")
    }
}

// MARK: - Error Wrapper
private struct ErrorWrapper: Identifiable {
    let id = UUID()
    let error: Error
}

// MARK: - Preview Provider
@available(iOS 14.0, *)
struct HomeView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Light Mode
            HomeView()
                .previewDisplayName("Light Mode")
            
            // Dark Mode
            HomeView()
                .preferredColorScheme(.dark)
                .previewDisplayName("Dark Mode")
            
            // Loading State
            HomeView()
                .previewDisplayName("Loading State")
                .onAppear {
                    // Simulate loading state
                }
            
            // Error State
            HomeView()
                .previewDisplayName("Error State")
                .onAppear {
                    // Simulate error state
                }
        }
    }
}