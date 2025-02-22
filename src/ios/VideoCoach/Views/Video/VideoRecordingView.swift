import SwiftUI
import AVFoundation

/// A SwiftUI view that provides video recording functionality with camera preview,
/// recording controls, and upload capabilities
@available(iOS 14.0, *)
struct VideoRecordingView: View {
    // MARK: - Constants
    
    private let PREVIEW_ASPECT_RATIO: CGFloat = 16.0 / 9.0
    private let BUTTON_SIZE: CGFloat = 64.0
    private let MAX_RECORDING_DURATION: TimeInterval = 300.0 // 5 minutes
    private let MIN_FREE_SPACE_MB: Int64 = 500
    
    // MARK: - View Model
    
    @StateObject private var viewModel = VideoRecordingViewModel()
    
    // MARK: - State
    
    @State private var isShowingPermissionAlert = false
    @State private var isShowingUploadSheet = false
    @State private var isShowingMemoryWarning = false
    @State private var isProcessing = false
    
    // MARK: - Environment
    
    @Environment(\.presentationMode) var presentationMode
    @Environment(\.scenePhase) var scenePhase
    
    // MARK: - Body
    
    var body: some View {
        ZStack {
            // Camera preview layer
            cameraPreview()
                .aspectRatio(PREVIEW_ASPECT_RATIO, contentMode: .fit)
                .edgesIgnoringSafeArea(.all)
            
            // Recording controls overlay
            VStack {
                // Top bar with close button
                HStack {
                    CustomButton(
                        title: "Close",
                        style: .outline,
                        action: { presentationMode.wrappedValue.dismiss() }
                    )
                    .accessibilityLabel("Close camera")
                    
                    Spacer()
                }
                .padding()
                
                Spacer()
                
                // Recording duration timer
                if viewModel.isRecording {
                    durationTimer()
                }
                
                // Bottom controls
                recordingControls()
                    .padding(.bottom, 30)
            }
            
            // Loading overlay
            if isProcessing {
                LoadingView(
                    text: "Processing video...",
                    tintColor: .white
                )
            }
        }
        .alert(isPresented: $isShowingPermissionAlert) {
            Alert(
                title: Text("Permission Required"),
                message: Text("Camera and microphone access is required for recording videos."),
                primaryButton: .default(Text("Settings"), action: {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }),
                secondaryButton: .cancel()
            )
        }
        .alert(isPresented: $isShowingMemoryWarning) {
            Alert(
                title: Text("Low Storage"),
                message: Text("Please free up storage space to continue recording."),
                dismissButton: .default(Text("OK"))
            )
        }
        .sheet(isPresented: $isShowingUploadSheet) {
            // Upload progress view
            VStack {
                LoadingView(
                    text: "Uploading video... \(Int(viewModel.uploadProgress * 100))%",
                    tintColor: .primary
                )
                
                CustomButton(
                    title: "Cancel",
                    style: .destructive,
                    action: { isShowingUploadSheet = false }
                )
                .padding()
            }
            .interactiveDismissDisabled(true)
        }
        .onChange(of: scenePhase) { newPhase in
            switch newPhase {
            case .active:
                viewModel.startRecording()
            case .inactive:
                viewModel.handleBackgroundTask()
            case .background:
                viewModel.handleBackgroundTask()
            @unknown default:
                break
            }
        }
    }
    
    // MARK: - Camera Preview
    
    private func cameraPreview() -> some View {
        GeometryReader { geometry in
            Color.black
                .overlay(
                    Group {
                        if viewModel.hasPermissions {
                            CameraPreviewRepresentable(session: viewModel.captureSession)
                                .aspectRatio(PREVIEW_ASPECT_RATIO, contentMode: .fit)
                        } else {
                            Text("Camera access required")
                                .foregroundColor(.white)
                        }
                    }
                )
        }
    }
    
    // MARK: - Recording Controls
    
    private func recordingControls() -> some View {
        HStack(spacing: 30) {
            // Record/Stop button
            CustomButton(
                title: viewModel.isRecording ? "Stop" : "Record",
                style: .primary,
                isLoading: isProcessing,
                action: {
                    if viewModel.isRecording {
                        stopRecording()
                    } else {
                        startRecording()
                    }
                }
            )
            .frame(width: BUTTON_SIZE, height: BUTTON_SIZE)
            .background(viewModel.isRecording ? Color.error : Color.primary)
            .clipShape(Circle())
            .accessibilityLabel(viewModel.isRecording ? "Stop recording" : "Start recording")
            
            // Upload button (visible when recording is stopped)
            if !viewModel.isRecording && !isProcessing {
                CustomButton(
                    title: "Upload",
                    style: .secondary,
                    action: {
                        isShowingUploadSheet = true
                        // Trigger upload process
                    }
                )
                .accessibilityLabel("Upload recorded video")
            }
        }
    }
    
    // MARK: - Duration Timer
    
    private func durationTimer() -> some View {
        Text(formatDuration(viewModel.recordingDuration))
            .font(.system(.title3, design: .monospaced))
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.black.opacity(0.6))
            .cornerRadius(8)
            .accessibilityLabel("Recording duration")
            .accessibilityValue(formatDuration(viewModel.recordingDuration))
    }
    
    // MARK: - Helper Methods
    
    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
    
    private func startRecording() {
        guard !viewModel.isRecording else { return }
        
        // Check storage space
        let fileManager = FileManager.default
        if let freeSpace = try? fileManager.attributesOfFileSystem(forPath: NSHomeDirectory())[.systemFreeSize] as? Int64,
           freeSpace < (MIN_FREE_SPACE_MB * 1024 * 1024) {
            isShowingMemoryWarning = true
            return
        }
        
        viewModel.startRecording()
    }
    
    private func stopRecording() {
        guard viewModel.isRecording else { return }
        
        isProcessing = true
        viewModel.stopRecording()
            .sink(
                receiveCompletion: { completion in
                    isProcessing = false
                    if case .failure = completion {
                        // Handle error
                    }
                },
                receiveValue: { _ in
                    isShowingUploadSheet = true
                }
            )
    }
}

// MARK: - Camera Preview Representable

private struct CameraPreviewRepresentable: UIViewRepresentable {
    let session: AVCaptureSession
    
    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        if let previewLayer = uiView.layer.sublayers?.first as? AVCaptureVideoPreviewLayer {
            previewLayer.frame = uiView.bounds
        }
    }
}

#if DEBUG
struct VideoRecordingView_Previews: PreviewProvider {
    static var previews: some View {
        VideoRecordingView()
    }
}
#endif