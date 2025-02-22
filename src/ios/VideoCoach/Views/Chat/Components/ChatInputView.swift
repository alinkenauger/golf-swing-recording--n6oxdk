import SwiftUI // v14.0+
import Combine // v14.0+
import AVFoundation // v14.0+
import Photos // v14.0+

/// A SwiftUI view component that provides a chat input interface with text input,
/// attachment options, and voice recording capabilities
struct ChatInputView: View {
    // MARK: - Constants
    private let TYPING_DEBOUNCE_INTERVAL: TimeInterval = 0.5
    private let MAX_MESSAGE_LENGTH: Int = 1000
    private let VOICE_RECORDING_MAX_DURATION: TimeInterval = 300.0
    private let ATTACHMENT_SIZE_LIMIT: Int = 100 * 1024 * 1024 // 100MB
    
    // MARK: - Properties
    let threadId: String
    
    @State private var messageText: String = ""
    @State private var isRecording: Bool = false
    @State private var showAttachmentOptions: Bool = false
    @State private var isTyping: Bool = false
    @State private var recordingDuration: TimeInterval = 0
    @State private var isLoading: Bool = false
    @State private var errorMessage: String?
    @State private var selectedAttachments: [AttachmentItem] = []
    
    private let typingSubject = PassthroughSubject<Void, Never>()
    private var audioRecorder: AVAudioRecorder?
    private var recordingTimer: Timer?
    private var subscriptions = Set<AnyCancellable>()
    
    // MARK: - Initialization
    init(threadId: String) {
        self.threadId = threadId
        setupTypingPublisher()
        setupAudioSession()
    }
    
    // MARK: - Body
    var body: some View {
        VStack(spacing: UIConfig.spacing["small"]) {
            // Error message display
            if let error = errorMessage {
                Text(error)
                    .foregroundColor(.error)
                    .font(.caption)
                    .padding(.horizontal)
                    .transition(.opacity)
                    .accessibilityLabel("Error: \(error)")
            }
            
            // Attachment preview
            if !selectedAttachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: UIConfig.spacing["small"]) {
                        ForEach(selectedAttachments) { attachment in
                            AttachmentPreviewView(attachment: attachment) {
                                removeAttachment(attachment)
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                .frame(height: 60)
                .transition(.move(edge: .bottom))
            }
            
            // Input controls
            HStack(spacing: UIConfig.spacing["small"]) {
                // Attachment button
                CustomButton(
                    title: "",
                    style: .secondary,
                    action: { showAttachmentOptions = true }
                ) {
                    Image(systemName: "paperclip")
                        .foregroundColor(.primary)
                }
                .frame(width: 44)
                .accessibilityLabel("Add attachment")
                
                // Text input field
                TextField("Type a message...", text: $messageText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .frame(maxHeight: 100)
                    .disabled(isRecording)
                    .onChange(of: messageText) { _ in
                        typingSubject.send()
                    }
                
                // Send/Record button
                if messageText.isEmpty && !isRecording {
                    // Voice recording button
                    CustomButton(
                        title: "",
                        style: .primary,
                        isLoading: isRecording
                    ) {
                        Image(systemName: isRecording ? "stop.circle.fill" : "mic.circle")
                    }
                    .frame(width: 44)
                    .simultaneousGesture(
                        LongPressGesture(minimumDuration: 0.5)
                            .onEnded { _ in
                                startRecording()
                            }
                    )
                    .accessibilityLabel(isRecording ? "Stop recording" : "Start voice recording")
                } else {
                    // Send button
                    CustomButton(
                        title: "",
                        style: .primary,
                        isLoading: isLoading,
                        action: sendMessage
                    ) {
                        Image(systemName: "arrow.up.circle.fill")
                    }
                    .frame(width: 44)
                    .disabled(messageText.isEmpty && selectedAttachments.isEmpty)
                    .accessibilityLabel("Send message")
                }
            }
            .padding(.horizontal)
            .padding(.vertical, UIConfig.spacing["small"])
            .background(Color.secondary.opacity(0.1))
        }
        .sheet(isPresented: $showAttachmentOptions) {
            AttachmentPickerView(selectedAttachments: $selectedAttachments)
        }
    }
    
    // MARK: - Private Methods
    private func setupTypingPublisher() {
        typingSubject
            .debounce(for: .seconds(TYPING_DEBOUNCE_INTERVAL), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                guard let self = self else { return }
                ChatService.shared.sendTypingStatus(threadId: self.threadId, isTyping: true)
            }
            .store(in: &subscriptions)
    }
    
    private func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default)
            try session.setActive(true)
        } catch {
            errorMessage = "Failed to set up audio session"
        }
    }
    
    private func startRecording() {
        guard !isRecording else { return }
        
        let audioFilename = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("m4a")
        
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        do {
            audioRecorder = try AVAudioRecorder(url: audioFilename, settings: settings)
            audioRecorder?.record()
            isRecording = true
            
            startRecordingTimer()
        } catch {
            errorMessage = "Failed to start recording"
        }
    }
    
    private func stopRecording() {
        guard isRecording else { return }
        
        audioRecorder?.stop()
        recordingTimer?.invalidate()
        
        if let recordingURL = audioRecorder?.url {
            let attachment = AttachmentItem(
                id: UUID().uuidString,
                type: .voice,
                url: recordingURL,
                thumbnail: nil
            )
            selectedAttachments.append(attachment)
        }
        
        isRecording = false
        recordingDuration = 0
    }
    
    private func startRecordingTimer() {
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            
            self.recordingDuration += 1
            if self.recordingDuration >= self.VOICE_RECORDING_MAX_DURATION {
                self.stopRecording()
            }
        }
    }
    
    private func sendMessage() {
        guard !isLoading else { return }
        guard !messageText.isEmpty || !selectedAttachments.isEmpty else { return }
        
        isLoading = true
        errorMessage = nil
        
        let message = Message(
            id: UUID().uuidString,
            threadId: threadId,
            senderId: UserDefaults.standard.string(forKey: "userId") ?? "",
            type: selectedAttachments.first?.type.toMessageType() ?? .text,
            content: messageText,
            metadata: ["attachments": selectedAttachments.map { $0.toMetadata() }]
        )
        
        ChatService.shared.sendMessage(message)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.errorMessage = error.localizedDescription
                    }
                },
                receiveValue: { [weak self] _ in
                    self?.messageText = ""
                    self?.selectedAttachments.removeAll()
                }
            )
            .store(in: &subscriptions)
    }
    
    private func removeAttachment(_ attachment: AttachmentItem) {
        selectedAttachments.removeAll { $0.id == attachment.id }
    }
}

// MARK: - Supporting Types
struct AttachmentItem: Identifiable {
    let id: String
    let type: AttachmentType
    let url: URL
    let thumbnail: UIImage?
    
    enum AttachmentType {
        case image
        case video
        case voice
        case file
        
        func toMessageType() -> MessageType {
            switch self {
            case .image: return .image
            case .video: return .video
            case .voice: return .voice
            case .file: return .file
            }
        }
    }
    
    func toMetadata() -> [String: Any] {
        [
            "id": id,
            "type": type,
            "url": url.absoluteString
        ]
    }
}

// MARK: - Preview Provider
#if DEBUG
struct ChatInputView_Previews: PreviewProvider {
    static var previews: some View {
        ChatInputView(threadId: "preview-thread")
            .previewLayout(.sizeThatFits)
            .padding()
    }
}
#endif