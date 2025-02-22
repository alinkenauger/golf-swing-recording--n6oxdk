//
// Date+Extensions.swift
// VideoCoach
//
// Extension providing additional date functionality for video coaching features
// Version: 1.0.0
// Requires: iOS 14.0+
//

import Foundation

// MARK: - Date Extension
extension Date {
    
    // MARK: - Date Formatting
    
    /// Returns a formatted date string based on the specified style
    /// - Parameter style: The DateFormatter style to use for formatting
    /// - Returns: A formatted string representation of the date
    func formattedString(style: DateFormatter.Style = .medium) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = style
        formatter.timeStyle = .short
        formatter.doesRelativeDateFormatting = true
        return formatter.string(from: self)
    }
    
    /// Returns a human-readable string representing time elapsed since this date
    /// - Returns: A relative time string (e.g. "2 hours ago")
    func timeAgo() -> String {
        let calendar = Calendar.current
        let now = Date()
        let components = calendar.dateComponents([.minute, .hour, .day, .week, .month], from: self, to: now)
        
        if let month = components.month, month > 0 {
            return month == 1 ? "1 month ago" : "\(month) months ago"
        } else if let week = components.week, week > 0 {
            return week == 1 ? "1 week ago" : "\(week) weeks ago"
        } else if let day = components.day, day > 0 {
            return day == 1 ? "1 day ago" : "\(day) days ago"
        } else if let hour = components.hour, hour > 0 {
            return hour == 1 ? "1 hour ago" : "\(hour) hours ago"
        } else if let minute = components.minute, minute > 0 {
            return minute == 1 ? "1 minute ago" : "\(minute) minutes ago"
        } else {
            return "Just now"
        }
    }
    
    /// Checks if the date is within a specified timeframe from current time
    /// - Parameter timeframe: The time interval to check against
    /// - Returns: Boolean indicating if date is within the timeframe
    func isWithinTimeframe(_ timeframe: TimeInterval = API.timeout) -> Bool {
        let now = Date()
        let interval = now.timeIntervalSince(self)
        return interval <= timeframe
    }
    
    // MARK: - Video Duration Formatting
    
    /// Formats a time interval into a video duration string (HH:MM:SS)
    /// - Returns: A formatted duration string
    func videoDurationString() -> String {
        let interval = abs(self.timeIntervalSinceNow)
        
        let hours = Int(interval) / 3600
        let minutes = Int(interval) / 60 % 60
        let seconds = Int(interval) % 60
        
        if hours > 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%02d:%02d", minutes, seconds)
        }
    }
    
    // MARK: - Training Program Dates
    
    /// Returns a formatted date string suitable for training program schedules
    /// - Returns: A formatted date string for training programs
    func trainingProgramDateString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d, yyyy"
        return formatter.string(from: self)
    }
    
    /// Returns a short formatted date string for content creation timestamps
    /// - Returns: A short formatted date string
    func contentCreationDateString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM/dd/yy HH:mm"
        return formatter.string(from: self)
    }
    
    // MARK: - Analytics Timestamps
    
    /// Returns an ISO8601 formatted string for analytics events
    /// - Returns: ISO8601 formatted date string
    func analyticsTimestamp() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: self)
    }
    
    /// Returns a Unix timestamp for analytics tracking
    /// - Returns: Unix timestamp as TimeInterval
    func unixTimestamp() -> TimeInterval {
        return self.timeIntervalSince1970
    }
}