import SwiftUI // iOS 14.0+
import Combine // iOS 14.0+

/// A comprehensive SwiftUI view for video annotation with enhanced accessibility and performance optimization
@available(iOS 14.0, *)
@MainActor
public struct VideoAnnotationView: View {
    // MARK: - Private Properties
    
    @StateObject private var viewModel: VideoAnnotationViewModel
    @State private var selectedTool: AnnotationTool = .pen
    @State private var selectedColor: Color = .red
    @State private var strokeWidth: CGFloat = 2.0
    @State private var isRecording: Bool = false
    @State private var errorMessage: String? = nil
    @State private var isAutosaving: Bool = false
    @GestureState private var dragState = DragState.inactive
    
    private let video: Video
    private let voiceOverRecorder: VoiceOverRecorder
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Constants
    
    private enum Constants {
        static let canvasPadding: CGFloat = 20.0
        static let toolbarHeight: CGFloat = 44.0
        static let minPressure: CGFloat = 0.1
        static let maxUndoSteps: Int = 50
        static let autoSaveInterval: TimeInterval = 30.0
    }
    
    // MARK: - Initialization
    
    public init(video: Video) {
        self.video = video
        self._viewModel = StateObject(wrappedValue: VideoAnnotationViewModel(video: video))
        self.voiceOverRecorder = VoiceOverRecorder()
        
        // Setup memory warning observer
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { _ in
            viewModel.handleError(.memoryWarning)
        }
    }
    
    // MARK: - Body
    
    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Video Player Layer
                videoPlayerLayer
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Video Player")
                
                // Annotation Canvas Layer
                annotationCanvas(size: geometry.size)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Drawing Canvas")
                
                // Toolbar Overlay
                VStack {
                    Spacer()
                    
                    AnnotationToolbar(
                        selectedTool: $selectedTool,
                        selectedColor: $selectedColor,
                        strokeWidth: $strokeWidth
                    )
                    .padding(.bottom, UIConfig.spacing["medium"])
                }
                
                // Voice-over Recording Controls
                if isRecording {
                    voiceOverControls
                }
                
                // Error Message Overlay
                if let error = errorMessage {
                    errorOverlay(message: error)
                }
                
                // Auto-save Indicator
                if isAutosaving {
                    autoSaveIndicator
                }
            }
        }
        .onAppear {
            setupSubscriptions()
        }
        .onDisappear {
            cancellables.removeAll()
        }
    }
    
    // MARK: - Private Views
    
    private var videoPlayerLayer: some View {
        Color.black // Placeholder for actual video player
            .overlay(
                Group {
                    if viewModel.viewState == .processing {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    }
                }
            )
    }
    
    private func annotationCanvas(size: CGSize) -> some View {
        Canvas { context, size in
            // Draw existing annotations
            for annotation in viewModel.currentAnnotation?.points ?? [] {
                let path = Path { path in
                    path.move(to: CGPoint(x: annotation.x, y: annotation.y))
                    path.addLine(to: CGPoint(x: annotation.x, y: annotation.y))
                }
                
                context.stroke(
                    path,
                    with: .color(selectedColor),
                    lineWidth: strokeWidth * annotation.pressure
                )
            }
        }
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .updating($dragState) { value, state, _ in
                    handleDragGesture(value, pressure: value.force ?? Constants.minPressure)
                }
        )
        .onChange(of: dragState) { newValue in
            if case .inactive = newValue {
                finishDrawing()
            }
        }
    }
    
    private var voiceOverControls: some View {
        VStack {
            HStack {
                Circle()
                    .fill(Color.red)
                    .frame(width: 12, height: 12)
                Text("Recording...")
                    .foregroundColor(.white)
            }
            .padding()
            .background(Color.black.opacity(0.7))
            .cornerRadius(20)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Voice-over Recording in Progress")
        .accessibilityAddTraits(.updatesFrequently)
    }
    
    private func errorOverlay(message: String) -> some View {
        VStack {
            Text(message)
                .foregroundColor(.white)
                .padding()
                .background(Color.red.opacity(0.8))
                .cornerRadius(10)
        }
        .transition(.move(edge: .top))
        .animation(.easeInOut)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error Message")
        .accessibilityAddTraits(.isAlert)
    }
    
    private var autoSaveIndicator: some View {
        HStack {
            Image(systemName: "arrow.clockwise")
            Text("Auto-saving...")
        }
        .padding()
        .background(Color.black.opacity(0.7))
        .cornerRadius(20)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Auto-saving in Progress")
    }
    
    // MARK: - Private Methods
    
    private func setupSubscriptions() {
        // Monitor view model errors
        viewModel.$error
            .compactMap { $0 }
            .receive(on: DispatchQueue.main)
            .sink { error in
                errorMessage = error.localizedDescription
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    errorMessage = nil
                }
            }
            .store(in: &cancellables)
        
        // Setup auto-save timer
        Timer.publish(every: Constants.autoSaveInterval, on: .main, in: .common)
            .autoconnect()
            .sink { _ in
                performAutoSave()
            }
            .store(in: &cancellables)
    }
    
    private func handleDragGesture(_ value: DragGesture.Value, pressure: CGFloat) {
        let location = value.location
        let adjustedPressure = max(pressure, Constants.minPressure)
        
        if case .inactive = dragState {
            viewModel.startDrawing(at: location)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            errorMessage = error.localizedDescription
                        }
                    },
                    receiveValue: { _ in }
                )
                .store(in: &cancellables)
        } else {
            viewModel.updateDrawing(at: location, pressure: adjustedPressure)
        }
    }
    
    private func finishDrawing() {
        viewModel.finishDrawing()
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        errorMessage = error.localizedDescription
                    }
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }
    
    private func performAutoSave() {
        isAutosaving = true
        // Implement auto-save logic here
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isAutosaving = false
        }
    }
}

// MARK: - Supporting Types

private enum DragState {
    case inactive
    case active(location: CGPoint)
}

// MARK: - Preview Provider

struct VideoAnnotationView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            VideoAnnotationView(video: try! Video(
                title: "Sample Video",
                description: nil,
                userId: "user123",
                coachId: nil,
                originalUrl: URL(string: "https://example.com/video.mp4")!
            ))
            .previewLayout(.device)
            .previewDisplayName("Light Mode")
            
            VideoAnnotationView(video: try! Video(
                title: "Sample Video",
                description: nil,
                userId: "user123",
                coachId: nil,
                originalUrl: URL(string: "https://example.com/video.mp4")!
            ))
            .previewLayout(.device)
            .preferredColorScheme(.dark)
            .previewDisplayName("Dark Mode")
        }
    }
}