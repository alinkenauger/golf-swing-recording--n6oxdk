//
// CustomButton.swift
// VideoCoach
//
// A reusable custom button component implementing the design system
// with full accessibility support and haptic feedback
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // v14.0+

/// A customizable button view that implements the app's design system
/// with comprehensive accessibility support
public struct CustomButton: View {
    // MARK: - Public Properties
    
    /// Available button style variants
    public enum ButtonStyle {
        case primary
        case secondary
        case outline
        case destructive
    }
    
    let title: String
    let style: ButtonStyle
    let isLoading: Bool
    let isDisabled: Bool
    let action: (() -> Void)?
    let accessibilityLabel: String?
    
    // MARK: - Private Properties
    
    @State private var isPressing: Bool = false
    private let feedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
    
    // MARK: - Initialization
    
    /// Creates a new CustomButton instance
    /// - Parameters:
    ///   - title: Button text
    ///   - style: Button visual style
    ///   - isLoading: Loading state flag
    ///   - isDisabled: Disabled state flag
    ///   - action: Button tap action closure
    ///   - accessibilityLabel: Optional custom accessibility label
    public init(
        title: String,
        style: ButtonStyle = .primary,
        isLoading: Bool = false,
        isDisabled: Bool = false,
        action: (() -> Void)? = nil,
        accessibilityLabel: String? = nil
    ) {
        self.title = title
        self.style = style
        self.isLoading = isLoading
        self.isDisabled = isDisabled
        self.action = action
        self.accessibilityLabel = accessibilityLabel
    }
    
    // MARK: - Body
    
    public var body: some View {
        Button(action: {
            if !isLoading && !isDisabled {
                triggerHapticFeedback()
                action?()
            }
        }) {
            HStack(spacing: UIConfig.spacing["small"]) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: foregroundColor))
                }
                
                Text(title)
                    .font(.system(size: UIConfig.fontSizes["body"] ?? 15.0, weight: .semibold))
                    .foregroundColor(foregroundColor)
            }
            .frame(maxWidth: .infinity)
            .standardPadding()
            .background(backgroundColor)
            .overlay(
                RoundedRectangle(cornerRadius: UIConfig.cornerRadius)
                    .stroke(style == .outline ? Color.primary : Color.clear, lineWidth: 1)
            )
            .roundedCorners()
            .opacity(isDisabled ? 0.5 : 1.0)
            .scaleEffect(isPressing ? 0.98 : 1.0)
        }
        .frame(minWidth: UIConfig.minimumTouchTarget, minHeight: UIConfig.minimumTouchTarget)
        .disabled(isDisabled || isLoading)
        .accessibilityLabel(accessibilityLabel ?? title)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(isDisabled ? "Button is disabled" : nil)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !isPressing && !isDisabled && !isLoading {
                        isPressing = true
                    }
                }
                .onEnded { _ in
                    isPressing = false
                }
        )
        .animation(.easeInOut(duration: UIConfig.animationDuration), value: isPressing)
        .animation(.easeInOut(duration: UIConfig.animationDuration), value: isLoading)
        .animation(.easeInOut(duration: UIConfig.animationDuration), value: isDisabled)
    }
    
    // MARK: - Private Methods
    
    private var backgroundColor: Color {
        switch style {
        case .primary:
            return Color.primary
        case .secondary:
            return Color.secondary
        case .outline:
            return .clear
        case .destructive:
            return Color.error
        }
    }
    
    private var foregroundColor: Color {
        switch style {
        case .primary, .destructive:
            return .white
        case .secondary:
            return .primary
        case .outline:
            return .primary
        }
    }
    
    private func triggerHapticFeedback() {
        feedbackGenerator.prepare()
        feedbackGenerator.impactOccurred()
    }
}

// MARK: - Preview Provider

#if DEBUG
struct CustomButton_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 20) {
            CustomButton(
                title: "Primary Button",
                style: .primary,
                action: {}
            )
            
            CustomButton(
                title: "Secondary Button",
                style: .secondary,
                action: {}
            )
            
            CustomButton(
                title: "Outline Button",
                style: .outline,
                action: {}
            )
            
            CustomButton(
                title: "Destructive Button",
                style: .destructive,
                action: {}
            )
            
            CustomButton(
                title: "Loading Button",
                style: .primary,
                isLoading: true,
                action: {}
            )
            
            CustomButton(
                title: "Disabled Button",
                style: .primary,
                isDisabled: true,
                action: {}
            )
        }
        .padding()
        .previewLayout(.sizeThatFits)
    }
}
#endif