//
// ErrorView.swift
// VideoCoach
//
// A reusable SwiftUI view for displaying error states with accessibility support
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // v14.0+

/// A reusable view component for displaying error states with customizable appearance and retry functionality
public struct ErrorView: View {
    // MARK: - Properties
    
    private let message: String
    private let title: String?
    private let retryAction: (() -> Void)?
    
    private let backgroundColor: Color
    private let textColor: Color
    private let buttonColor: Color
    private let errorIcon: Image
    
    // MARK: - Animation Properties
    
    private let appearAnimation: Animation = .easeInOut(duration: UIConfig.animationDuration)
    
    // MARK: - Initialization
    
    /// Creates an error view with customizable content and appearance
    /// - Parameters:
    ///   - message: The error message to display
    ///   - title: Optional title text to display above the message
    ///   - retryAction: Optional closure to execute when retry is tapped
    public init(
        message: String,
        title: String? = nil,
        retryAction: (() -> Void)? = nil
    ) {
        self.message = message
        self.title = title
        self.retryAction = retryAction
        
        // Initialize semantic colors for light/dark mode support
        self.backgroundColor = Color(.systemBackground)
        self.textColor = Color(.label)
        self.buttonColor = Color.accentColor
        
        // Use SF Symbol for error icon with semantic meaning
        self.errorIcon = Image(systemName: "exclamationmark.triangle.fill")
    }
    
    // MARK: - Body
    
    public var body: some View {
        VStack(spacing: UIConfig.spacing["medium"]) {
            // Error Icon
            errorIcon
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 48, height: 48)
                .foregroundColor(.red)
                .accessibilityHidden(true)
            
            // Title (if provided)
            if let title = title {
                Text(title)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(textColor)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
            }
            
            // Error Message
            Text(message)
                .font(.body)
                .foregroundColor(textColor)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(message)
            
            // Retry Button (if action provided)
            if let retryAction = retryAction {
                Button(action: retryAction) {
                    Text("Try Again")
                        .font(.headline)
                        .foregroundColor(.white)
                        .padding(.horizontal, UIConfig.spacing["large"])
                        .padding(.vertical, UIConfig.spacing["medium"])
                        .background(buttonColor)
                        .roundedCorners(UIConfig.cornerRadius)
                }
                .accessibilityHint("Double tap to try the action again")
                .accessibleTouchTarget()
            }
        }
        .standardPadding()
        .frame(maxWidth: .infinity)
        .background(backgroundColor)
        .roundedCorners()
        .standardShadow()
        .transition(.opacity.combined(with: .scale))
        .animation(appearAnimation, value: message)
        
        // Accessibility Configuration
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(AccessibilityIdentifiers.errorView)
        .accessibilityLabel("Error Alert")
        .accessibilityAddTraits(.isAlert)
        
        // Right-to-left language support
        .environment(\.layoutDirection, .rightToLeft)
        
        // Dynamic Type support
        .dynamicTypeSize(...DynamicTypeSize.accessibility3)
    }
}

// MARK: - Preview Provider

#if DEBUG
struct ErrorView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Basic error view
            ErrorView(
                message: "Something went wrong. Please try again later."
            )
            
            // Error view with title and retry action
            ErrorView(
                message: "Unable to load video content.",
                title: "Connection Error",
                retryAction: { print("Retry tapped") }
            )
            .preferredColorScheme(.dark)
            
            // Error view with large dynamic type
            ErrorView(
                message: "Network connection lost.",
                title: "Connection Error",
                retryAction: { print("Retry tapped") }
            )
            .environment(\.sizeCategory, .accessibilityLarge)
        }
        .previewLayout(.sizeThatFits)
        .padding()
    }
}
#endif