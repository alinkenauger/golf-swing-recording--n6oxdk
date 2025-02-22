import Foundation

// MARK: - Coach Status Enums
@frozen public enum VerificationStatus: String, Codable {
    case pending
    case inReview
    case verified
    case rejected
    case suspended
}

@frozen public enum CoachStatus: String, Codable {
    case active
    case inactive
    case suspended
    case onLeave
}

// MARK: - Coach Errors
@frozen public enum CoachError: Error {
    case invalidRate
    case invalidCertification
    case invalidAvailability
    case invalidDateRange
}

// MARK: - Certification Model
@frozen public struct Certification: Codable, Equatable {
    public let name: String
    public let issuer: String
    public let issueDate: Date
    public let expiryDate: Date?
    public let verificationUrl: String?
    public private(set) var isValid: Bool
    
    public init(name: String, issuer: String, issueDate: Date, expiryDate: Date? = nil, verificationUrl: String? = nil) throws {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !issuer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw CoachError.invalidCertification
        }
        
        if let expiryDate = expiryDate {
            guard expiryDate > issueDate else {
                throw CoachError.invalidDateRange
            }
        }
        
        if let url = verificationUrl {
            guard URL(string: url) != nil else {
                throw CoachError.invalidCertification
            }
        }
        
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.issuer = issuer.trimmingCharacters(in: .whitespacesAndNewlines)
        self.issueDate = issueDate
        self.expiryDate = expiryDate
        self.verificationUrl = verificationUrl
        self.isValid = expiryDate.map { $0 > Date() } ?? true
    }
}

// MARK: - Coach Model
@frozen public final class Coach: User {
    // MARK: - Thread Safety
    private let accessQueue: DispatchQueue
    private let metricsCache: NSCache<NSString, NSNumber>
    
    // MARK: - Properties
    public private(set) var specialties: [String]
    public private(set) var certifications: [Certification]
    public private(set) var experience: Int
    public private(set) var hourlyRate: Decimal
    public private(set) var rating: Double
    public private(set) var reviewCount: Int
    public private(set) var studentCount: Int
    public private(set) var programCount: Int
    public private(set) var totalEarnings: Decimal
    public private(set) var availability: [String: [DateInterval]] // Day of week to time slots
    public private(set) var status: CoachStatus
    public private(set) var verificationStatus: VerificationStatus
    
    // MARK: - Initialization
    public init(id: String,
                email: String,
                firstName: String,
                lastName: String,
                specialties: [String],
                certifications: [Certification],
                experience: Int,
                hourlyRate: Decimal,
                availability: [String: [DateInterval]]) throws {
        
        // Validate coach-specific parameters
        guard !specialties.isEmpty,
              specialties.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
            throw CoachError.invalidCertification
        }
        
        guard hourlyRate > 0 else {
            throw CoachError.invalidRate
        }
        
        guard !availability.isEmpty,
              availability.values.allSatisfy({ !$0.isEmpty }) else {
            throw CoachError.invalidAvailability
        }
        
        // Initialize thread safety components
        self.accessQueue = DispatchQueue(label: "com.videocoach.coach.\(id)", qos: .userInitiated)
        self.metricsCache = NSCache<NSString, NSNumber>()
        
        // Initialize metrics with default values
        self.rating = 5.0
        self.reviewCount = 0
        self.studentCount = 0
        self.programCount = 0
        self.totalEarnings = 0
        
        // Initialize coach-specific properties
        self.specialties = specialties
        self.certifications = certifications
        self.experience = experience
        self.hourlyRate = hourlyRate
        self.availability = availability
        self.status = .active
        self.verificationStatus = .pending
        
        // Initialize base user
        try super.init(id: id,
                      email: email,
                      firstName: firstName,
                      lastName: lastName,
                      role: .coach)
        
        // Set up KVO observers for metrics
        setupMetricsObservers()
    }
    
    // MARK: - Metrics Management
    public func updateMetrics(type: MetricType, value: Any) -> Result<Void, Error> {
        return accessQueue.sync {
            do {
                switch type {
                case .rating:
                    guard let newRating = value as? Double,
                          (0...5).contains(newRating) else {
                        throw CoachError.invalidRate
                    }
                    let oldRating = self.rating
                    self.rating = ((oldRating * Double(reviewCount)) + newRating) / Double(reviewCount + 1)
                    self.reviewCount += 1
                    
                case .students:
                    guard let count = value as? Int, count >= 0 else {
                        throw CoachError.invalidRate
                    }
                    self.studentCount = count
                    
                case .programs:
                    guard let count = value as? Int, count >= 0 else {
                        throw CoachError.invalidRate
                    }
                    self.programCount = count
                    
                case .earnings:
                    guard let amount = value as? Decimal, amount >= 0 else {
                        throw CoachError.invalidRate
                    }
                    self.totalEarnings += amount
                }
                
                // Cache the updated metric
                cacheMetric(type: type)
                return .success(())
            } catch {
                return .failure(error)
            }
        }
    }
    
    public func calculateEarnings(for period: DateInterval) -> Result<Decimal, Error> {
        return accessQueue.sync {
            // Validate date range
            guard period.start < period.end else {
                return .failure(CoachError.invalidDateRange)
            }
            
            // Check cache
            let cacheKey = "earnings_\(period.start.timeIntervalSince1970)_\(period.end.timeIntervalSince1970)" as NSString
            if let cachedValue = metricsCache.object(forKey: cacheKey) {
                return .success(Decimal(cachedValue.doubleValue))
            }
            
            // Calculate earnings for period
            // Implementation would include actual earnings calculation logic
            let calculatedEarnings: Decimal = 0 // Placeholder
            
            // Cache the result
            metricsCache.setObject(NSNumber(value: Double(truncating: calculatedEarnings as NSNumber)),
                                 forKey: cacheKey)
            
            return .success(calculatedEarnings)
        }
    }
    
    // MARK: - Private Helpers
    private func setupMetricsObservers() {
        // Set up KVO observers for metrics updates
        // Implementation would include actual KVO setup
    }
    
    private func cacheMetric(type: MetricType) {
        let value: NSNumber
        switch type {
        case .rating:
            value = NSNumber(value: rating)
        case .students:
            value = NSNumber(value: studentCount)
        case .programs:
            value = NSNumber(value: programCount)
        case .earnings:
            value = NSNumber(value: Double(truncating: totalEarnings as NSNumber))
        }
        metricsCache.setObject(value, forKey: type.rawValue as NSString)
    }
}

// MARK: - Supporting Types
extension Coach {
    public enum MetricType: String {
        case rating
        case students
        case programs
        case earnings
    }
}

// MARK: - Codable Conformance
extension Coach: Codable {
    private enum CodingKeys: String, CodingKey {
        case specialties, certifications, experience, hourlyRate
        case rating, reviewCount, studentCount, programCount, totalEarnings
        case availability, status, verificationStatus
    }
    
    public override func encode(to encoder: Encoder) throws {
        try super.encode(to: encoder)
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        try accessQueue.sync {
            try container.encode(specialties, forKey: .specialties)
            try container.encode(certifications, forKey: .certifications)
            try container.encode(experience, forKey: .experience)
            try container.encode(hourlyRate, forKey: .hourlyRate)
            try container.encode(rating, forKey: .rating)
            try container.encode(reviewCount, forKey: .reviewCount)
            try container.encode(studentCount, forKey: .studentCount)
            try container.encode(programCount, forKey: .programCount)
            try container.encode(totalEarnings, forKey: .totalEarnings)
            try container.encode(availability, forKey: .availability)
            try container.encode(status, forKey: .status)
            try container.encode(verificationStatus, forKey: .verificationStatus)
        }
    }
}