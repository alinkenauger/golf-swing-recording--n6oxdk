import Foundation
import Combine

// MARK: - Subscription Error Types
public enum SubscriptionError: Error {
    case invalidStatus
    case invalidPeriod
    case paymentFailed
    case stripeError(String)
    case validationFailed(String)
}

// MARK: - Subscription Status
@frozen public enum SubscriptionStatus: String, Codable {
    case active
    case canceled
    case expired
    case pastDue
    case trialing
    case incomplete
}

// MARK: - Subscription Interval
@frozen public enum SubscriptionInterval: String, Codable {
    case month
    case year
    case quarter
}

// MARK: - Subscription Plan
@available(iOS 14.0, *)
@frozen public struct SubscriptionPlan: Codable {
    public let id: String
    public let name: String
    public let description: String
    public let amount: Decimal
    public let currency: String
    public let interval: SubscriptionInterval
    public let intervalCount: Int
    public let features: [String]
    public let trialPeriodDays: Int?
    public let metadata: [String: Any]
    public let isActive: Bool
    public let createdAt: Date
    public let updatedAt: Date
    
    public func formattedPrice(locale: Locale? = .current) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale
        formatter.currencyCode = currency
        
        guard let formattedAmount = formatter.string(from: amount as NSDecimalNumber) else {
            return "\(amount) \(currency)"
        }
        
        let intervalText: String = {
            switch interval {
            case .month: return intervalCount > 1 ? "\(intervalCount) months" : "month"
            case .year: return intervalCount > 1 ? "\(intervalCount) years" : "year"
            case .quarter: return intervalCount > 1 ? "\(intervalCount) quarters" : "quarter"
            }
        }()
        
        return "\(formattedAmount)/\(intervalText)"
    }
    
    public func validate() -> Result<Void, SubscriptionError> {
        guard amount > 0 else {
            return .failure(.validationFailed("Amount must be positive"))
        }
        
        guard intervalCount > 0 && intervalCount <= 12 else {
            return .failure(.validationFailed("Invalid interval count"))
        }
        
        guard currency.count == 3 else {
            return .failure(.validationFailed("Invalid currency code"))
        }
        
        guard !name.isEmpty && !description.isEmpty else {
            return .failure(.validationFailed("Name and description are required"))
        }
        
        return .success(())
    }
}

// MARK: - Subscription Implementation
@available(iOS 14.0, *)
public struct Subscription: Codable, Identifiable {
    // MARK: - Properties
    public let id: String
    public let userId: String
    public let coachId: String
    public let planId: String
    public private(set) var status: SubscriptionStatus
    public let currentPeriodStart: Date
    public let currentPeriodEnd: Date
    public private(set) var cancelAtPeriodEnd: Bool
    public private(set) var canceledAt: Date?
    public let stripeSubscriptionId: String
    public let stripeCustomerId: String
    public private(set) var lastPaymentStatus: String
    public private(set) var paymentMethodId: String?
    public var metadata: [String: Any]
    
    // MARK: - Thread Safety
    private let lock = NSLock()
    
    // MARK: - Publishers
    private let statusSubject = CurrentValueSubject<SubscriptionStatus, Never>(.incomplete)
    public var statusPublisher: AnyPublisher<SubscriptionStatus, Never> {
        statusSubject.eraseToAnyPublisher()
    }
    
    // MARK: - Initialization
    public init(id: String,
                userId: String,
                coachId: String,
                planId: String,
                status: SubscriptionStatus,
                currentPeriodStart: Date,
                currentPeriodEnd: Date,
                cancelAtPeriodEnd: Bool = false,
                canceledAt: Date? = nil,
                stripeSubscriptionId: String,
                stripeCustomerId: String,
                lastPaymentStatus: String,
                paymentMethodId: String? = nil,
                metadata: [String: Any] = [:]) {
        self.id = id
        self.userId = userId
        self.coachId = coachId
        self.planId = planId
        self.status = status
        self.currentPeriodStart = currentPeriodStart
        self.currentPeriodEnd = currentPeriodEnd
        self.cancelAtPeriodEnd = cancelAtPeriodEnd
        self.canceledAt = canceledAt
        self.stripeSubscriptionId = stripeSubscriptionId
        self.stripeCustomerId = stripeCustomerId
        self.lastPaymentStatus = lastPaymentStatus
        self.paymentMethodId = paymentMethodId
        self.metadata = metadata
        
        statusSubject.send(status)
    }
    
    // MARK: - Status Management
    public func isActive() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        
        let now = Date()
        return (status == .active || status == .trialing) &&
               now >= currentPeriodStart &&
               now <= currentPeriodEnd &&
               lastPaymentStatus == "succeeded"
    }
    
    public func willRenew() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        
        return isActive() &&
               !cancelAtPeriodEnd &&
               paymentMethodId != nil
    }
    
    public mutating func validateTransition(to newStatus: SubscriptionStatus) -> Result<Void, SubscriptionError> {
        lock.lock()
        defer { lock.unlock() }
        
        // Define valid transitions
        let validTransitions: [SubscriptionStatus: Set<SubscriptionStatus>] = [
            .incomplete: [.active, .expired],
            .trialing: [.active, .canceled, .expired],
            .active: [.canceled, .pastDue, .expired],
            .pastDue: [.active, .canceled, .expired],
            .canceled: [.expired],
            .expired: []
        ]
        
        guard let allowedTransitions = validTransitions[status],
              allowedTransitions.contains(newStatus) else {
            return .failure(.invalidStatus)
        }
        
        // Additional validation logic
        switch newStatus {
        case .active:
            guard lastPaymentStatus == "succeeded" else {
                return .failure(.paymentFailed)
            }
        case .canceled:
            self.canceledAt = Date()
            self.cancelAtPeriodEnd = true
        case .expired:
            guard Date() > currentPeriodEnd else {
                return .failure(.invalidPeriod)
            }
        default:
            break
        }
        
        // Update status and notify observers
        status = newStatus
        statusSubject.send(newStatus)
        
        return .success(())
    }
}

// MARK: - Codable Implementation
extension Subscription {
    private enum CodingKeys: String, CodingKey {
        case id, userId, coachId, planId, status, currentPeriodStart, currentPeriodEnd
        case cancelAtPeriodEnd, canceledAt, stripeSubscriptionId, stripeCustomerId
        case lastPaymentStatus, paymentMethodId, metadata
    }
    
    public func encode(to encoder: Encoder) throws {
        lock.lock()
        defer { lock.unlock() }
        
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(userId, forKey: .userId)
        try container.encode(coachId, forKey: .coachId)
        try container.encode(planId, forKey: .planId)
        try container.encode(status, forKey: .status)
        try container.encode(currentPeriodStart, forKey: .currentPeriodStart)
        try container.encode(currentPeriodEnd, forKey: .currentPeriodEnd)
        try container.encode(cancelAtPeriodEnd, forKey: .cancelAtPeriodEnd)
        try container.encodeIfPresent(canceledAt, forKey: .canceledAt)
        try container.encode(stripeSubscriptionId, forKey: .stripeSubscriptionId)
        try container.encode(stripeCustomerId, forKey: .stripeCustomerId)
        try container.encode(lastPaymentStatus, forKey: .lastPaymentStatus)
        try container.encodeIfPresent(paymentMethodId, forKey: .paymentMethodId)
        try container.encode(metadata as? [String: String] ?? [:], forKey: .metadata)
    }
}

// MARK: - Equatable Conformance
extension Subscription: Equatable {
    public static func == (lhs: Subscription, rhs: Subscription) -> Bool {
        return lhs.id == rhs.id
    }
}