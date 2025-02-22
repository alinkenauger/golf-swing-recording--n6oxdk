//
// MessageBubble.swift
// VideoCoach
//
// SwiftUI view component for rendering accessible chat message bubbles
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // v14.0+
import AVKit // v14.0+

/// Constants for message bubble styling and layout
private struct BubbleConstants {
    static let cornerRadius: CGFloat = 16
    static let maxWidth = UIScreen.main.bounds.width * 0.75
    static let minTouchSize: CGFloat = 44
    static let statusIconSize: CGFloat = 12
    static let playButtonSize: CGFloat = 44
    static let thumbnailHeight: CGFloat = 180
}

/// Colors for message bubble states
private struct BubbleColors {
    static let sent = Color("SentBubble", bundle: .main)
    static let received = Color("ReceivedBubble", bundle: .main)
    static let error = Color.red.opacity(0.1)
    static let playButton = Color.white
    static let statusIcon = Color.gray
}

/// SwiftUI view that renders an accessible chat message bubble
@available(iOS 14.0, *)
struct MessageBubble: View {
    // MARK: - Properties
    let message: Message
    let isFromCurrentUser: Bool
    
    @State private var isPlaying: Bool = false
    @State private var loadingState: Bool = false
    @State private var retryCount: Int = 0
    
    // MARK: - Initialization
    init(message: Message, isFromCurrentUser: Bool) {
        self.message = message
        self.isFromCurrentUser = isFromCurrentUser
    }
    
    // MARK: - Body
    var body: some View {
        HStack {
            if isFromCurrentUser {
                Spacer(minLength: 40)
            }
            
            VStack(alignment: isFromCurrentUser ? .trailing : .leading, spacing: 4) {
                messageContent
                    .frame(maxWidth: BubbleConstants.maxWidth, alignment: isFromCurrentUser ? .trailing : .leading)
                
                if message.status != .deleted {
                    statusIndicator
                        .font(.caption2)
                        .foregroundColor(BubbleColors.statusIcon)
                }
            }
            .modifier(BubbleStyle(isFromCurrentUser: isFromCurrentUser, status: message.status))
            
            if !isFromCurrentUser {
                Spacer(minLength: 40)
            }
        }
        .padding(.horizontal, UIConfig.spacing["medium"] ?? 16)
        .padding(.vertical, UIConfig.spacing["small"] ?? 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityTraits(message.status == .failed ? [.button] : [])
        .accessibilityAction(named: "Retry", message.status == .failed ? handleRetry : nil)
    }
    
    // MARK: - Content Views
    @ViewBuilder
    private var messageContent: some View {
        switch message.type {
        case .text:
            Text(message.content)
                .font(.body)
                .foregroundColor(.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.playsSound)
        
        case .video:
            if let url = URL(string: message.content) {
                VideoThumbnailView(
                    video: Video(title: "Video Message",
                               description: nil,
                               userId: message.senderId,
                               coachId: nil,
                               originalUrl: url),
                    size: .medium,
                    showPlayIndicator: true,
                    showDuration: true
                )
                .accessibilityLabel("Video message")
                .accessibilityHint("Double tap to play video")
            }
            
        case .image:
            if let url = URL(string: message.content) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(maxHeight: BubbleConstants.thumbnailHeight)
                        .roundedCorners(BubbleConstants.cornerRadius)
                } placeholder: {
                    ProgressView()
                        .frame(height: BubbleConstants.thumbnailHeight)
                }
                .accessibilityLabel("Image message")
            }
            
        case .voice:
            HStack {
                Button(action: {
                    isPlaying.toggle()
                }) {
                    Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .resizable()
                        .frame(width: BubbleConstants.playButtonSize,
                               height: BubbleConstants.playButtonSize)
                        .foregroundColor(BubbleColors.playButton)
                        .shadow(radius: 2)
                }
                .accessibilityLabel(isPlaying ? "Pause voice message" : "Play voice message")
                
                if let url = URL(string: message.content) {
                    // Voice message waveform visualization would go here
                    Rectangle()
                        .fill(Color.gray.opacity(0.3))
                        .frame(height: 30)
                        .accessibilityHidden(true)
                }
            }
            
        case .file:
            HStack {
                Image(systemName: "doc.fill")
                    .foregroundColor(.primary)
                Text(message.content.components(separatedBy: "/").last ?? "File")
                    .font(.body)
                    .foregroundColor(.primary)
            }
            .accessibilityLabel("File message")
            
        case .location:
            // Location preview would go here
            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .frame(height: BubbleConstants.thumbnailHeight)
                .overlay(
                    Image(systemName: "map.fill")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 44)
                        .foregroundColor(.primary)
                )
                .accessibilityLabel("Location message")
        }
    }
    
    private var statusIndicator: some View {
        HStack(spacing: 4) {
            if loadingState {
                ProgressView()
                    .scaleEffect(0.7)
            } else {
                switch message.status {
                case .sending:
                    Image(systemName: "clock.fill")
                        .frame(width: BubbleConstants.statusIconSize)
                case .sent:
                    Image(systemName: "checkmark")
                        .frame(width: BubbleConstants.statusIconSize)
                case .delivered:
                    Image(systemName: "checkmark.circle.fill")
                        .frame(width: BubbleConstants.statusIconSize)
                case .read:
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.blue)
                        .frame(width: BubbleConstants.statusIconSize)
                case .failed:
                    Button(action: handleRetry) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.red)
                            .frame(width: BubbleConstants.statusIconSize)
                    }
                    .accessibilityLabel("Message failed to send. Tap to retry.")
                case .deleted:
                    Image(systemName: "trash.fill")
                        .frame(width: BubbleConstants.statusIconSize)
                }
            }
            
            if case .failed = message.status {
                Text("Failed")
                    .foregroundColor(.red)
            }
        }
    }
    
    // MARK: - Helper Methods
    private var accessibilityLabel: String {
        let sender = isFromCurrentUser ? "You" : "Other user"
        let type = switch message.type {
            case .text: "said"
            case .video: "sent a video"
            case .image: "sent an image"
            case .voice: "sent a voice message"
            case .file: "sent a file"
            case .location: "shared a location"
        }
        let status = switch message.status {
            case .sending: "Sending"
            case .sent: "Sent"
            case .delivered: "Delivered"
            case .read: "Read"
            case .failed: "Failed to send"
            case .deleted: "Deleted"
        }
        return "\(sender) \(type): \(message.content). Status: \(status)"
    }
    
    private func handleRetry() {
        guard message.status == .failed && retryCount < 3 else { return }
        
        loadingState = true
        retryCount += 1
        
        // Simulated retry delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            loadingState = false
            // Actual retry logic would go here
        }
    }
}

// MARK: - Supporting Views
private struct BubbleStyle: ViewModifier {
    let isFromCurrentUser: Bool
    let status: MessageStatus
    
    func body(content: Content) -> some View {
        content
            .padding(UIConfig.spacing["medium"] ?? 16)
            .background(backgroundColor)
            .roundedCorners(BubbleConstants.cornerRadius)
            .shadow(color: Color.black.opacity(0.1), radius: 1, x: 0, y: 1)
    }
    
    private var backgroundColor: Color {
        switch status {
        case .failed:
            return BubbleColors.error
        case .deleted:
            return Color.gray.opacity(0.1)
        default:
            return isFromCurrentUser ? BubbleColors.sent : BubbleColors.received
        }
    }
}