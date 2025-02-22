import SwiftUI // v14.0+
import AVKit // built-in
import Combine // built-in

/// A comprehensive SwiftUI video player view with enhanced playback controls,
/// annotation support, and accessibility features
@available(iOS 14.0, *)
struct VideoPlayerView: View {
    // MARK: - Properties
    
    @StateObject private var viewModel: VideoPlayerViewModel
    @State private var isShowingControls = true
    @State private var isShowingQualityPicker = false
    @State private var controlAutoHideTask: DispatchWorkItem?
    @Environment(\.scenePhase) private var scenePhase
    
    private let player = AVPlayer()
    private let aspectRatio: CGFloat = 16/9
    private let controlPadding: CGFloat = 16.0
    private let controlAutoHideDelay: TimeInterval = 3.0
    
    // MARK: - Initialization
    
    init(videoId: UUID, preferredQuality: Video.VideoQuality = .hd1080p) {
        _viewModel = StateObject(wrappedValue: VideoPlayerViewModel(videoId: videoId))
    }
    
    // MARK: - Body
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Video Layer
                videoPlayerLayer(size: geometry.size)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Video player")
                    .accessibilityAddTraits(.startsMediaSession)
                
                // Loading Overlay
                if viewModel.loadingState {
                    loadingOverlay()
                }
                
                // Error Overlay
                if let error = viewModel.errorState {
                    errorOverlay(error: error)
                }
                
                // Controls Overlay
                if isShowingControls {
                    controlsOverlay()
                }
            }
            .gesture(
                TapGesture()
                    .onEnded { toggleControls() }
            )
        }
        .aspectRatio(aspectRatio, contentMode: .fit)
        .onChange(of: scenePhase) { newPhase in
            handleBackgroundTransition(to: newPhase)
        }
    }
    
    // MARK: - Component Views
    
    private func videoPlayerLayer(size: CGSize) -> some View {
        VideoPlayer(player: player)
            .frame(width: size.width, height: size.width / aspectRatio)
            .onAppear {
                setupPlayer()
            }
            .onDisappear {
                cleanupPlayer()
            }
    }
    
    private func loadingOverlay() -> some View {
        ProgressView()
            .progressViewStyle(CircularProgressViewStyle())
            .scaleEffect(1.5)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black.opacity(0.4))
            .accessibilityLabel("Loading video")
    }
    
    private func errorOverlay(error: VideoPlayerError) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundColor(.red)
            
            Text(error.localizedDescription)
                .standardTextStyle(.body)
                .multilineTextAlignment(.center)
                .padding()
            
            Button("Retry") {
                viewModel.loadVideo(id: viewModel.video?.id ?? UUID())
            }
            .standardTextStyle(.headline)
            .padding()
            .background(Color.accentColor)
            .roundedCorners()
        }
        .padding()
        .background(Color.black.opacity(0.7))
        .roundedCorners()
        .padding()
        .accessibilityElement(children: .combine)
    }
    
    private func controlsOverlay() -> some View {
        VStack {
            Spacer()
            
            VideoControls(
                isPlaying: $viewModel.isPlaying,
                currentTime: $viewModel.currentTime,
                duration: $viewModel.duration,
                playbackRate: $viewModel.playbackRate
            )
            .transition(.move(edge: .bottom))
        }
        .padding(.bottom, controlPadding)
    }
    
    // MARK: - Helper Methods
    
    private func setupPlayer() {
        // Configure AVPlayer
        player.automaticallyWaitsToMinimizeStalling = true
        player.allowsExternalPlayback = true
        
        // Bind player state to view model
        viewModel.$isPlaying
            .sink { [weak player] isPlaying in
                if isPlaying {
                    player?.play()
                } else {
                    player?.pause()
                }
            }
            .store(in: &viewModel.cancellables)
        
        // Setup periodic time observation
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak viewModel] time in
            viewModel?.currentTime = time.seconds
        }
        
        // Setup control auto-hide
        setupControlAutoHide()
    }
    
    private func cleanupPlayer() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        controlAutoHideTask?.cancel()
    }
    
    private func toggleControls() {
        withAnimation(.easeInOut(duration: 0.3)) {
            isShowingControls.toggle()
        }
        
        if isShowingControls {
            setupControlAutoHide()
        } else {
            controlAutoHideTask?.cancel()
        }
    }
    
    private func setupControlAutoHide() {
        controlAutoHideTask?.cancel()
        
        let task = DispatchWorkItem { [weak self] in
            withAnimation {
                self?.isShowingControls = false
            }
        }
        
        controlAutoHideTask = task
        DispatchQueue.main.asyncAfter(
            deadline: .now() + controlAutoHideDelay,
            execute: task
        )
    }
    
    private func handleBackgroundTransition(to phase: ScenePhase) {
        switch phase {
        case .background:
            player.pause()
            viewModel.handleBackgroundTransition()
        case .inactive:
            player.pause()
        case .active:
            if viewModel.isPlaying {
                player.play()
            }
        @unknown default:
            break
        }
    }
}

// MARK: - Preview Provider

#if DEBUG
struct VideoPlayerView_Previews: PreviewProvider {
    static var previews: some View {
        VideoPlayerView(videoId: UUID())
            .previewLayout(.sizeThatFits)
    }
}
#endif