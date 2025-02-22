//
// EmptyStateView.swift
// VideoCoach
//
// A reusable empty state view component that follows WCAG 2.1 Level AA accessibility guidelines
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI

/// A view that displays a customizable empty state with image, title, message and optional action button
struct EmptyStateView: View {
    // MARK: - Properties
    
    private let title: String
    private let message: String
    private let imageName: String?
    private let action: (() -> Void)?
    private let actionTitle: String?
    
    // MARK: - UI Configuration
    
    private let spacing: CGFloat
    private let titleFont: Font
    private let messageFont: Font
    
    // MARK: - Initialization
    
    /// Creates a new empty state view with the specified content
    /// - Parameters:
    ///   - title: The main title text to display
    ///   - message: The descriptive message text
    ///   - imageName: Optional SF Symbol name for the image
    ///   - action: Optional closure to execute when action button is tapped
    ///   - actionTitle: Optional text to display in the action button
    init(
        title: String,
        message: String,
        imageName: String? = nil,
        action: (() -> Void)? = nil,
        actionTitle: String? = nil
    ) {
        self.title = title
        self.message = message
        self.imageName = imageName
        self.action = action
        self.actionTitle = actionTitle
        
        // Configure layout spacing
        self.spacing = UIConfig.spacing["medium"] ?? 16.0
        
        // Configure dynamic type-compatible fonts
        self.titleFont = .system(size: UIConfig.fontSizes["title2"] ?? 22.0, weight: .bold)
        self.messageFont = .system(size: UIConfig.fontSizes["body"] ?? 15.0, weight: .regular)
    }
    
    // MARK: - Body
    
    var body: some View {
        VStack(spacing: spacing) {
            // Optional image
            if let imageName = imageName {
                Image(systemName: imageName)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: UIConfig.spacing["xlarge"], height: UIConfig.spacing["xlarge"])
                    .foregroundColor(Color(.systemGray))
                    .accessibilityHidden(true) // Hide decorative image from VoiceOver
            }
            
            // Title
            Text(title)
                .font(titleFont)
                .foregroundColor(Color(.label))
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
                .accessibilityLabel(title)
            
            // Message
            Text(message)
                .font(messageFont)
                .foregroundColor(Color(.secondaryLabel))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .accessibilityLabel(message)
            
            // Optional action button
            if let action = action, let actionTitle = actionTitle {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.system(size: UIConfig.fontSizes["body"] ?? 15.0, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, UIConfig.spacing["large"])
                        .padding(.vertical, UIConfig.spacing["small"])
                        .background(Color.accentColor)
                        .cornerRadius(UIConfig.cornerRadius)
                }
                .accessibilityLabel(actionTitle)
                .accessibilityHint("Double tap to \(actionTitle.lowercased())")
            }
        }
        .padding(.horizontal, UIConfig.spacing["large"])
        .padding(.vertical, UIConfig.spacing["xlarge"])
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .animation(.easeInOut(duration: UIConfig.animationDuration))
        .environment(\.layoutDirection, .leftToRight) // Support RTL layouts
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(title) - \(message)")
    }
}

#if DEBUG
// MARK: - Preview Provider

struct EmptyStateView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Basic empty state
            EmptyStateView(
                title: "No Videos",
                message: "You haven't uploaded any videos yet.",
                imageName: "video.slash.fill"
            )
            
            // Empty state with action
            EmptyStateView(
                title: "No Connection",
                message: "Please check your internet connection and try again.",
                imageName: "wifi.slash",
                action: {},
                actionTitle: "Retry"
            )
            .preferredColorScheme(.dark)
            
            // Dynamic Type preview
            EmptyStateView(
                title: "No Messages",
                message: "Start a conversation with your coach.",
                imageName: "message.fill"
            )
            .environment(\.sizeCategory, .accessibilityLarge)
        }
    }
}
#endif