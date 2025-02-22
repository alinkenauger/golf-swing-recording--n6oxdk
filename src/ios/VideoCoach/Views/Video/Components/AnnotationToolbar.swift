//
// AnnotationToolbar.swift
// VideoCoach
//
// SwiftUI view component for video annotation toolbar with design system integration
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // v14.0+

// MARK: - Constants
private enum Constants {
    static let toolbarHeight: CGFloat = 44.0
    static let minStrokeWidth: CGFloat = 1.0
    static let maxStrokeWidth: CGFloat = 10.0
    static let toolButtonSize: CGFloat = 32.0
    static let colorSwatchSize: CGFloat = 24.0
    static let toolbarOpacity: Double = 0.95
    static let expandAnimationDuration: Double = 0.3
}

// MARK: - Annotation Tool Enum
public enum AnnotationTool: String, CaseIterable, Identifiable {
    case pen
    case line
    case arrow
    case rectangle
    case circle
    case eraser
    
    public var id: String { rawValue }
    
    var icon: String {
        switch self {
        case .pen: return "pencil"
        case .line: return "line.diagonal"
        case .arrow: return "arrow.right"
        case .rectangle: return "rectangle"
        case .circle: return "circle"
        case .eraser: return "eraser"
        }
    }
    
    var accessibilityLabel: String {
        switch self {
        case .pen: return "Freehand Drawing Tool"
        case .line: return "Straight Line Tool"
        case .arrow: return "Arrow Tool"
        case .rectangle: return "Rectangle Tool"
        case .circle: return "Circle Tool"
        case .eraser: return "Eraser Tool"
        }
    }
}

// MARK: - Annotation Toolbar View
@available(iOS 14.0, *)
public struct AnnotationToolbar: View {
    // MARK: - Properties
    @Binding private var selectedTool: AnnotationTool
    @Binding private var selectedColor: Color
    @Binding private var strokeWidth: CGFloat
    
    @Environment(\.colorScheme) private var colorScheme
    @State private var isExpanded: Bool = false
    
    private let colors: [Color] = [
        .red, .blue, .green, .yellow, .orange, .purple,
        .white, .gray, .black
    ]
    
    // MARK: - Initialization
    public init(
        selectedTool: Binding<AnnotationTool>,
        selectedColor: Binding<Color>,
        strokeWidth: Binding<CGFloat>
    ) {
        self._selectedTool = selectedTool
        self._selectedColor = selectedColor
        self._strokeWidth = strokeWidth
    }
    
    // MARK: - Body
    public var body: some View {
        HStack(spacing: UIConfig.spacing["small"]) {
            // Tools Section
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: UIConfig.spacing["small"]) {
                    ForEach(AnnotationTool.allCases) { tool in
                        toolButton(tool)
                    }
                }
                .padding(.horizontal, UIConfig.spacing["small"])
            }
            
            Divider()
                .frame(height: Constants.toolbarHeight * 0.7)
            
            // Color Picker Section
            colorPicker
            
            Divider()
                .frame(height: Constants.toolbarHeight * 0.7)
            
            // Stroke Width Slider
            strokeWidthControl
        }
        .frame(height: Constants.toolbarHeight)
        .background(
            colorScheme == .dark
                ? Color.black.opacity(Constants.toolbarOpacity)
                : Color.white.opacity(Constants.toolbarOpacity)
        )
        .roundedCorners()
        .standardShadow()
        .standardPadding()
    }
    
    // MARK: - Tool Button
    private func toolButton(_ tool: AnnotationTool) -> some View {
        Button(action: {
            withAnimation(.easeInOut(duration: UIConfig.animationDuration)) {
                selectedTool = tool
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }
        }) {
            Image(systemName: tool.icon)
                .font(.system(size: Constants.toolButtonSize * 0.5))
                .frame(width: Constants.toolButtonSize, height: Constants.toolButtonSize)
                .foregroundColor(selectedTool == tool ? .white : .primary)
                .background(selectedTool == tool ? Color.accentColor : Color.clear)
                .roundedCorners(Constants.toolButtonSize * 0.25)
                .standardAnimation()
        }
        .accessibilityLabel(tool.accessibilityLabel)
        .accessibilityAddTraits(selectedTool == tool ? .isSelected : [])
        .accessibilityHint("Double tap to select this tool")
        .accessibleTouchTarget()
    }
    
    // MARK: - Color Picker
    private var colorPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: UIConfig.spacing["xsmall"]) {
                ForEach(colors, id: \.self) { color in
                    colorSwatch(color)
                }
            }
            .padding(.horizontal, UIConfig.spacing["small"])
        }
        .frame(maxWidth: isExpanded ? .infinity : Constants.toolbarHeight * 3)
    }
    
    private func colorSwatch(_ color: Color) -> some View {
        Button(action: {
            withAnimation(.easeInOut(duration: UIConfig.animationDuration)) {
                selectedColor = color
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }) {
            Circle()
                .fill(color)
                .frame(width: Constants.colorSwatchSize, height: Constants.colorSwatchSize)
                .overlay(
                    Circle()
                        .stroke(colorScheme == .dark ? Color.white : Color.black, lineWidth: 1)
                )
                .overlay(
                    selectedColor == color ?
                        Image(systemName: "checkmark")
                            .foregroundColor(color.isBright ? .black : .white)
                            .font(.system(size: Constants.colorSwatchSize * 0.6))
                        : nil
                )
        }
        .accessibilityLabel("\(color.description) color")
        .accessibilityAddTraits(selectedColor == color ? .isSelected : [])
        .accessibilityHint("Double tap to select this color")
        .accessibleTouchTarget()
    }
    
    // MARK: - Stroke Width Control
    private var strokeWidthControl: some View {
        HStack(spacing: UIConfig.spacing["xsmall"]) {
            Image(systemName: "line.horizontal.3.decrease")
                .foregroundColor(.secondary)
            
            Slider(
                value: $strokeWidth,
                in: Constants.minStrokeWidth...Constants.maxStrokeWidth,
                step: 0.5
            ) {
                Text("Stroke Width")
            } minimumValueLabel: {
                Text("Thin")
            } maximumValueLabel: {
                Text("Thick")
            }
            .frame(width: Constants.toolbarHeight * 2)
            
            Image(systemName: "line.horizontal.3.increase")
                .foregroundColor(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Stroke Width Control")
        .accessibilityValue("\(Int(strokeWidth)) points")
        .accessibilityHint("Adjust to change the thickness of drawn lines")
    }
}

// MARK: - Color Extensions
private extension Color {
    var isBright: Bool {
        // Simple brightness check for determining text color
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: nil)
        return (red * 299 + green * 587 + blue * 114) / 1000 > 0.5
    }
}

// MARK: - Preview Provider
struct AnnotationToolbar_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            AnnotationToolbar(
                selectedTool: .constant(.pen),
                selectedColor: .constant(.red),
                strokeWidth: .constant(2.0)
            )
            .previewLayout(.sizeThatFits)
            .padding()
            
            AnnotationToolbar(
                selectedTool: .constant(.pen),
                selectedColor: .constant(.red),
                strokeWidth: .constant(2.0)
            )
            .previewLayout(.sizeThatFits)
            .padding()
            .preferredColorScheme(.dark)
        }
    }
}