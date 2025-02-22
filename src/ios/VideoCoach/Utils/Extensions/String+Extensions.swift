//
// String+Extensions.swift
// VideoCoach
//
// String extension utilities for the Video Coaching Platform iOS app
// Version: 1.0.0
// Requires: iOS 14.0+
//

import Foundation

// MARK: - String Extension
extension String {
    
    // MARK: - Constants
    private static let emailRegexPattern = "^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}$"
    private static let passwordMinLength = 8
    private static let passwordPatterns = [
        "[A-Z]+", // uppercase
        "[a-z]+", // lowercase
        "[0-9]+", // numbers
        "[^A-Za-z0-9]+" // special characters
    ]
    private static let commonPasswordPatterns = [
        "^12345",
        "password",
        "qwerty",
        "admin"
    ]
    
    // MARK: - Email Validation
    /// Validates if the string is a properly formatted email address
    /// - Returns: Boolean indicating if the string is a valid email
    var isValidEmail: Bool {
        guard !self.isEmpty else { return false }
        
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", String.emailRegexPattern)
        return emailPredicate.evaluate(with: self)
    }
    
    // MARK: - Password Validation
    /// Validates if the string meets enhanced password security requirements
    /// - Returns: Boolean indicating if the string is a valid password
    var isValidPassword: Bool {
        // Check minimum length
        guard self.count >= String.passwordMinLength else { return false }
        
        // Check for common password patterns
        for pattern in String.commonPasswordPatterns {
            if self.lowercased().contains(pattern) {
                return false
            }
        }
        
        // Validate against required patterns
        for pattern in String.passwordPatterns {
            let predicate = NSPredicate(format: "SELF MATCHES %@", ".*\(pattern).*")
            guard predicate.evaluate(with: self) else {
                return false
            }
        }
        
        return true
    }
    
    // MARK: - URL Handling
    /// Converts string to a fully qualified video URL with validation
    /// - Returns: Optional URL object if string represents a valid video URL
    func toVideoURL() -> URL? {
        // Check if already a valid URL
        if let url = URL(string: self), url.scheme != nil {
            return validateVideoURL(url)
        }
        
        // Handle relative paths by combining with base URL
        let baseURLString = API.baseURL.hasSuffix("/") ? API.baseURL : API.baseURL + "/"
        let fullPath = baseURLString + self.trimmingCharacters(in: .whitespacesAndNewlines)
        
        guard let url = URL(string: fullPath) else { return nil }
        return validateVideoURL(url)
    }
    
    /// Validates if the URL is a supported video format
    private func validateVideoURL(_ url: URL) -> URL? {
        let supportedExtensions = VideoConfig.supportedCodecs.map { ".\($0)" }
        let pathExtension = url.pathExtension.lowercased()
        
        return supportedExtensions.contains(pathExtension) ? url : nil
    }
    
    // MARK: - Text Formatting
    /// Truncates string to specified length with ellipsis
    /// - Parameters:
    ///   - maxLength: Maximum allowed length for the string
    ///   - ellipsis: Custom ellipsis string (defaults to "...")
    /// - Returns: Truncated string with ellipsis if needed
    func truncate(maxLength: Int, ellipsis: String = "...") -> String {
        guard maxLength > 0 else { return self }
        
        if self.count <= maxLength {
            return self
        }
        
        // Account for ellipsis in the max length
        let truncateLength = maxLength - ellipsis.count
        guard truncateLength > 0 else { return ellipsis }
        
        // Find the last word boundary before truncation point
        let nsString = self as NSString
        let range = NSRange(location: 0, length: truncateLength)
        let wordRange = nsString.rangeOfCharacter(from: .whitespacesAndNewlines, options: .backwards, range: range)
        
        let length = wordRange.location != NSNotFound ? wordRange.location : truncateLength
        return nsString.substring(to: length) + ellipsis
    }
}