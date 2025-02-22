//
// Color+Extensions.swift
// VideoCoach
//
// SwiftUI Color extension implementing the app's design system color palette
// with support for accessibility and dark mode adaptation.
//

import SwiftUI

// MARK: - Color Extension
extension Color {
    
    // MARK: - Theme Colors - Light Mode
    
    /// Primary brand color (#2D5BFF)
    public static var primary: Color {
        Color(hex: "#2D5BFF")!
    }
    
    /// Secondary brand color (#1A1F36)
    public static var secondary: Color {
        Color(hex: "#1A1F36")!
    }
    
    /// Success state color (#00B67A)
    public static var success: Color {
        Color(hex: "#00B67A")!
    }
    
    /// Error state color (#FF4D4D)
    public static var error: Color {
        Color(hex: "#FF4D4D")!
    }
    
    // MARK: - Theme Colors - Dark Mode
    
    /// Dark mode variant of primary color (#1A3ECC)
    public static var primaryDark: Color {
        Color(hex: "#1A3ECC")!
    }
    
    /// Dark mode variant of secondary color (#0D1019)
    public static var secondaryDark: Color {
        Color(hex: "#0D1019")!
    }
    
    /// Dark mode variant of success color (#008F61)
    public static var successDark: Color {
        Color(hex: "#008F61")!
    }
    
    /// Dark mode variant of error color (#CC3D3D)
    public static var errorDark: Color {
        Color(hex: "#CC3D3D")!
    }
    
    // MARK: - Color Conversion Cache
    
    private static var hexCache: [Color: String] = [:]
    
    // MARK: - Initialization
    
    /// Initialize a Color from a hex string
    /// - Parameter hex: The hex color string (e.g. "#FF0000" or "FF0000")
    /// - Returns: Optional Color instance, nil if invalid hex string
    public static func hex(_ hex: String) -> Color? {
        // Remove '#' if present
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")
        
        // Validate hex string length
        guard hexSanitized.count == 6 else {
            return nil
        }
        
        // Parse hex string
        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else {
            return nil
        }
        
        // Extract components
        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >> 8) / 255.0
        let b = Double(rgb & 0x0000FF) / 255.0
        
        return Color(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
    
    // MARK: - Color Utilities
    
    /// Convert Color to hex string representation
    /// - Returns: Hex color string with # prefix
    public func toHex() -> String {
        // Check cache first
        if let cached = Color.hexCache[self] {
            return cached
        }
        
        // Convert to CGColor
        guard let components = UIColor(self).cgColor.components else {
            return "#000000"
        }
        
        // Extract RGB components
        let r = Int(components[0] * 255.0)
        let g = Int(components[1] * 255.0)
        let b = Int(components[2] * 255.0)
        
        // Create hex string
        let hex = String(format: "#%02X%02X%02X", r, g, b)
        
        // Cache result
        Color.hexCache[self] = hex
        
        return hex
    }
    
    /// Calculate contrast ratio with another color (WCAG 2.1)
    /// - Parameter compareColor: Color to compare against
    /// - Returns: Contrast ratio value (1-21)
    public func contrastRatio(with compareColor: Color) -> Double {
        // Convert colors to relative luminance
        let l1 = relativeLuminance()
        let l2 = compareColor.relativeLuminance()
        
        // Calculate contrast ratio
        let lighter = max(l1, l2)
        let darker = min(l1, l2)
        
        return (lighter + 0.05) / (darker + 0.05)
    }
    
    // MARK: - Private Helpers
    
    /// Calculate relative luminance for WCAG contrast calculations
    private func relativeLuminance() -> Double {
        guard let components = UIColor(self).cgColor.components else {
            return 0
        }
        
        let r = components[0]
        let g = components[1]
        let b = components[2]
        
        // Convert to sRGB
        let rsRGB = r <= 0.03928 ? r/12.92 : pow((r + 0.055)/1.055, 2.4)
        let gsRGB = g <= 0.03928 ? g/12.92 : pow((g + 0.055)/1.055, 2.4)
        let bsRGB = b <= 0.03928 ? b/12.92 : pow((b + 0.055)/1.055, 2.4)
        
        // Calculate luminance
        return 0.2126 * rsRGB + 0.7152 * gsRGB + 0.0722 * bsRGB
    }
}