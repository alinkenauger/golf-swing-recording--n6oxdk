//
// VideoListView.swift
// VideoCoach
//
// SwiftUI view that displays a performant, accessible scrollable grid of video thumbnails
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // iOS 14.0+
import Combine // iOS 14.0+
import Network // iOS 14.0+

// MARK: - View Layout Enum
private enum VideoListLayout: String, CaseIterable {
    case grid = "Grid"
    case list = "List"
}

// MARK: - Sort Options
private enum VideoSortOption: String, CaseIterable {
    case dateCreated = "Date"
    case title = "Title"
    case duration = "Duration"
}

// MARK: - List Errors
private enum VideoListError: Error {
    case network
    case loading
    case empty
}

// MARK: - VideoListView
@available(iOS 14.0, *)
struct VideoListView: View {
    // MARK: - Properties
    @StateObject private var videoStore = VideoStore.shared
    @State private var searchText = ""
    @State private var selectedLayout: VideoListLayout = .grid
    @State private var sortOption: VideoSortOption = .dateCreated
    @State private var isRefreshing = false
    @State private var error: VideoListError?
    @State private var isLoadingMore = false
    
    private let gridColumns = [
        GridItem(.flexible(), spacing: UIConfig.spacing["medium"]),
        GridItem(.flexible(), spacing: UIConfig.spacing["medium"])
    ]
    
    // MARK: - Body
    var body: some View {
        NavigationView {
            ZStack {
                // Main Content
                ScrollView {
                    LazyVStack(spacing: UIConfig.spacing["medium"]) {
                        // Search and Controls
                        controlsSection
                            .padding(.horizontal)
                        
                        // Videos Grid/List
                        if selectedLayout == .grid {
                            gridContent
                        } else {
                            listContent
                        }
                        
                        // Loading More Indicator
                        if isLoadingMore {
                            ProgressView()
                                .padding()
                                .accessibilityLabel("Loading more videos")
                        }
                    }
                }
                .refreshable {
                    await refreshVideos()
                }
                
                // Error Overlay
                if let error = error {
                    errorView(for: error)
                }
            }
            .navigationTitle("Videos")
            .standardAnimation()
        }
        .onAppear {
            Task {
                await refreshVideos()
            }
        }
    }
    
    // MARK: - Content Sections
    private var controlsSection: some View {
        VStack(spacing: UIConfig.spacing["small"]) {
            // Search Bar
            SearchBar(text: $searchText)
                .accessibilityLabel("Search videos")
            
            HStack {
                // Layout Picker
                Picker("Layout", selection: $selectedLayout) {
                    ForEach(VideoListLayout.allCases, id: \.self) { layout in
                        Text(layout.rawValue)
                            .tag(layout)
                    }
                }
                .pickerStyle(SegmentedPickerStyle())
                .accessibilityLabel("Select view layout")
                
                Spacer()
                
                // Sort Picker
                Picker("Sort by", selection: $sortOption) {
                    ForEach(VideoSortOption.allCases, id: \.self) { option in
                        Text(option.rawValue)
                            .tag(option)
                    }
                }
                .accessibilityLabel("Sort videos by")
            }
        }
    }
    
    private var gridContent: some View {
        LazyVGrid(columns: gridColumns, spacing: UIConfig.spacing["medium"]) {
            ForEach(filteredVideos) { video in
                VideoThumbnailView(video: video, size: .medium)
                    .onTapGesture {
                        handleVideoSelection(video)
                    }
                    .onAppear {
                        if video == filteredVideos.last {
                            Task {
                                await loadMoreContent()
                            }
                        }
                    }
            }
        }
        .padding(.horizontal)
    }
    
    private var listContent: some View {
        LazyVStack(spacing: UIConfig.spacing["small"]) {
            ForEach(filteredVideos) { video in
                HStack {
                    VideoThumbnailView(video: video, size: .small)
                    
                    VStack(alignment: .leading) {
                        Text(video.title)
                            .standardTextStyle(.headline)
                        
                        Text(formatDuration(video.duration))
                            .standardTextStyle(.caption)
                    }
                    
                    Spacer()
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    handleVideoSelection(video)
                }
                .onAppear {
                    if video == filteredVideos.last {
                        Task {
                            await loadMoreContent()
                        }
                    }
                }
            }
        }
        .padding(.horizontal)
    }
    
    // MARK: - Helper Views
    private func errorView(for error: VideoListError) -> some View {
        VStack(spacing: UIConfig.spacing["medium"]) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(.red)
            
            Text(errorMessage(for: error))
                .standardTextStyle(.headline)
            
            Button("Try Again") {
                Task {
                    await refreshVideos()
                }
            }
            .buttonStyle(.bordered)
            .accessibleTouchTarget()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
    
    // MARK: - Helper Methods
    private var filteredVideos: [Video] {
        var videos = videoStore.videos
        
        // Apply search filter
        if !searchText.isEmpty {
            videos = videos.filter { video in
                video.title.localizedCaseInsensitiveContains(searchText)
            }
        }
        
        // Apply sorting
        videos.sort { first, second in
            switch sortOption {
            case .dateCreated:
                return first.createdAt > second.createdAt
            case .title:
                return first.title < second.title
            case .duration:
                return first.duration < second.duration
            }
        }
        
        return videos
    }
    
    private func handleVideoSelection(_ video: Video) {
        videoStore.setCurrentVideo(video)
        // Navigation handled by parent view
    }
    
    private func refreshVideos() async {
        isRefreshing = true
        error = nil
        
        guard NetworkMonitor.shared.isConnected.value else {
            error = .network
            isRefreshing = false
            return
        }
        
        do {
            try await videoStore.loadMoreVideos(reset: true)
        } catch {
            self.error = .loading
        }
        
        isRefreshing = false
    }
    
    private func loadMoreContent() async {
        guard !isLoadingMore else { return }
        
        isLoadingMore = true
        do {
            try await videoStore.loadMoreVideos()
        } catch {
            // Silently fail on pagination errors
        }
        isLoadingMore = false
    }
    
    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
    
    private func errorMessage(for error: VideoListError) -> String {
        switch error {
        case .network:
            return "No internet connection"
        case .loading:
            return "Failed to load videos"
        case .empty:
            return "No videos found"
        }
    }
}

// MARK: - SearchBar Component
private struct SearchBar: View {
    @Binding var text: String
    
    var body: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            
            TextField("Search videos", text: $text)
                .standardTextStyle()
                .textFieldStyle(RoundedBorderTextFieldStyle())
            
            if !text.isEmpty {
                Button(action: { text = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.vertical, UIConfig.spacing["small"])
    }
}