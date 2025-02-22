//
// View+Extensions.swift
// VideoCoach
//
// SwiftUI View extensions for consistent UI implementation
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // v14.0+

// MARK: - View Extensions
extension View {
    /// Applies standard padding based on design system specifications
    /// with device size adaptability
    public func standardPadding() -> some View {
        let horizontalPadding = UIConfig.spacing["medium"] ?? 16.0
        let verticalPadding = UIConfig.spacing["medium"] ?? 16.0
        
        return self
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
    }
    
    /// Applies standard corner radius to view with optional custom radius
    /// - Parameter radius: Optional custom corner radius value
    public func roundedCorners(_ radius: CGFloat? = nil) -> some View {
        let cornerRadius = radius ?? UIConfig.cornerRadius
        return self
            .cornerRadius(cornerRadius)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
    
    /// Applies standard shadow effect based on design system
    public func standardShadow() -> some View {
        self.shadow(
            color: Color.black.opacity(0.1),
            radius: 10,
            x: 0,
            y: 2
        )
    }
    
    /// Shows loading overlay with accessibility support
    /// - Parameters:
    ///   - isLoading: Boolean flag to control loading state
    ///   - text: Optional loading text to display
    public func loading(
        _ isLoading: Bool,
        text: String? = nil
    ) -> some View {
        self.modifier(LoadingViewModifier(isLoading: isLoading, text: text))
    }
    
    /// Applies standard animation duration and curve
    public func standardAnimation() -> some View {
        self.animation(
            .easeInOut(duration: UIConfig.animationDuration)
        )
    }
    
    /// Applies minimum touch target size for accessibility
    public func accessibleTouchTarget() -> some View {
        self.frame(minWidth: 44, minHeight: 44)
    }
    
    /// Applies standard spacing between elements
    /// - Parameter spacing: Optional custom spacing value
    public func standardSpacing(_ spacing: CGFloat? = nil) -> some View {
        let standardSpace = spacing ?? (UIConfig.spacing["medium"] ?? 16.0)
        return self.padding(standardSpace)
    }
    
    /// Applies standard text style with proper contrast
    public func standardTextStyle(_ style: TextStyle = .body) -> some View {
        self.modifier(StandardTextModifier(style: style))
    }
}

// MARK: - Supporting Modifiers
private struct LoadingViewModifier: ViewModifier {
    let isLoading: Bool
    let text: String?
    
    func body(content: Content) -> some View {
        ZStack {
            content
                .allowsHitTesting(!isLoading)
            
            if isLoading {
                Color.black
                    .opacity(0.4)
                    .ignoresSafeArea()
                
                VStack(spacing: UIConfig.spacing["small"]) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    
                    if let text = text {
                        Text(text)
                            .foregroundColor(.white)
                            .standardTextStyle(.caption)
                    }
                }
                .accessibilityLabel(text ?? "Loading")
                .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .standardAnimation()
    }
}

private struct StandardTextModifier: ViewModifier {
    let style: TextStyle
    
    func body(content: Content) -> some View {
        content
            .font(.system(size: fontSize, weight: fontWeight))
            .foregroundColor(textColor)
            .lineSpacing(lineHeight)
            .accessibilityTextContentType(accessibilityContentType)
    }
    
    private var fontSize: CGFloat {
        UIConfig.fontSizes[style.rawValue] ?? 15.0
    }
    
    private var fontWeight: Font.Weight {
        switch style {
        case .title1, .title2: return .bold
        case .headline: return .semibold
        default: return .regular
        }
    }
    
    private var lineHeight: CGFloat {
        switch style {
        case .title1, .title2: return 1.2
        default: return 1.5
        }
    }
    
    private var textColor: Color {
        switch style {
        case .title1, .title2, .headline: return .primary
        case .caption: return .secondary
        default: return .primary
        }
    }
    
    private var accessibilityContentType: AccessibilityTextContentType {
        switch style {
        case .title1, .title2: return .header
        case .headline: return .headline
        default: return .plain
        }
    }
}

// MARK: - Supporting Types
public enum TextStyle: String {
    case title1
    case title2
    case headline
    case body
    case caption
}