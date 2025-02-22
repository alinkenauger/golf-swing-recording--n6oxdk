//
// LoadingView.swift
// VideoCoach
//
// A reusable loading indicator view component with accessibility support
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI

/// A SwiftUI view that displays an animated loading indicator with optional text,
/// supporting accessibility and following design system guidelines
struct LoadingView: View {
    // MARK: - Properties
    
    /// Optional text to display below the loading indicator
    let text: String?
    
    /// Color used for the loading indicator and text
    let tintColor: Color
    
    /// Controls the animation state of the loading indicator
    @State private var isAnimating: Bool = true
    
    // MARK: - Initialization
    
    /// Creates a loading view with optional text and custom tint color
    /// - Parameters:
    ///   - text: Optional text to display below the loading indicator
    ///   - tintColor: Color for the loading indicator and text (defaults to accent color)
    init(text: String? = nil, tintColor: Color = .accentColor) {
        self.text = text
        self.tintColor = tintColor
    }
    
    // MARK: - Body
    
    var body: some View {
        VStack(spacing: UIConfig.spacing["medium"]) {
            // Loading indicator with rotation animation
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: tintColor))
                .scaleEffect(1.2)
                .rotationEffect(Angle(degrees: isAnimating ? 360 : 0))
                .animation(
                    Animation.linear(duration: UIConfig.animationDuration)
                        .repeatForever(autoreverses: false),
                    value: isAnimating
                )
            
            // Optional text label
            if let text = text {
                Text(text)
                    .font(.system(.body, design: .rounded))
                    .foregroundColor(tintColor)
                    .multilineTextAlignment(.center)
            }
        }
        .opacity(isAnimating ? 1 : 0.7)
        .animation(
            .easeInOut(duration: UIConfig.animationDuration),
            value: isAnimating
        )
        // Accessibility configuration
        .accessibilityElement(children: .combine)
        .accessibilityLabel(makeAccessibleLabel())
        .accessibilityTraits(.updatesFrequently)
        .accessibilityAddTraits(.isStatusElement)
        .accessibilityLiveRegion(.assertive)
        .onAppear {
            isAnimating = true
        }
        .onDisappear {
            isAnimating = false
        }
    }
    
    // MARK: - Private Methods
    
    /// Generates an appropriate accessibility label based on the view state
    /// - Returns: A localized string describing the loading state
    private func makeAccessibleLabel() -> String {
        if let text = text {
            return String(
                format: NSLocalizedString(
                    "Loading %@",
                    comment: "Loading indicator accessibility label with description"
                ),
                text
            )
        }
        return NSLocalizedString(
            "Loading",
            comment: "Loading indicator accessibility label"
        )
    }
}

// MARK: - Preview Provider

#if DEBUG
struct LoadingView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Default loading indicator
            LoadingView()
                .previewDisplayName("Default")
            
            // Loading indicator with text
            LoadingView(text: "Loading video...")
                .previewDisplayName("With Text")
            
            // Loading indicator with custom color
            LoadingView(
                text: "Processing...",
                tintColor: .blue
            )
            .previewDisplayName("Custom Color")
            
            // Dark mode preview
            LoadingView(text: "Uploading...")
                .preferredColorScheme(.dark)
                .previewDisplayName("Dark Mode")
        }
        .padding()
        .previewLayout(.sizeThatFits)
    }
}
#endif