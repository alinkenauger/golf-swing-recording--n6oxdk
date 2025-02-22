import Foundation // v14.0+

// MARK: - Payment Status Enum
@frozen
public enum PaymentStatus: String, Codable {
    case pending = "PENDING"
    case processing = "PROCESSING"
    case completed = "COMPLETED"
    case failed = "FAILED"
    case refunded = "REFUNDED"
    case disputed = "DISPUTED"
}

// MARK: - Payment Method Enum
@frozen
public enum PaymentMethod: String, Codable {
    case creditCard = "CREDIT_CARD"
    case applePay = "APPLE_PAY"
    case bankTransfer = "BANK_TRANSFER"
    case wallet = "WALLET"
}

// MARK: - Payment Type Enum
@frozen
public enum PaymentType: String, Codable {
    case oneTime = "ONE_TIME"
    case subscription = "SUBSCRIPTION"
    case refund = "REFUND"
    case trial = "TRIAL"
}

// MARK: - Payment Error Enum
public enum PaymentError: Error {
    case invalidAmount
    case invalidCurrency
    case processingFailed
    case invalidStatus
    case refundFailed
}

// MARK: - Payment Model
@available(iOS 14.0, *)
@frozen
public struct Payment: Codable {
    // MARK: - Properties
    public let id: String
    public let userId: String
    public let coachId: String?
    public let amount: Double
    public let currency: String
    public private(set) var status: PaymentStatus
    public let paymentMethod: PaymentMethod
    public let type: PaymentType
    public let subscriptionId: String?
    public let stripePaymentIntentId: String
    public let description: String?
    public let metadata: [String: Any]
    public let createdAt: Date
    public private(set) var updatedAt: Date
    public private(set) var refundedAt: Date?
    public let isTest: Bool
    public private(set) var errorDetails: [String: String]
    
    private enum CodingKeys: String, CodingKey {
        case id, userId, coachId, amount, currency, status, paymentMethod, type
        case subscriptionId, stripePaymentIntentId, description, metadata
        case createdAt, updatedAt, refundedAt, isTest, errorDetails
    }
    
    // MARK: - Initialization
    public init(id: String,
                userId: String,
                coachId: String? = nil,
                amount: Double,
                currency: String,
                status: PaymentStatus,
                paymentMethod: PaymentMethod,
                type: PaymentType,
                subscriptionId: String? = nil,
                stripePaymentIntentId: String,
                description: String? = nil,
                metadata: [String: Any],
                isTest: Bool = false) throws {
        
        // Validate amount
        guard amount > 0 else {
            throw PaymentError.invalidAmount
        }
        
        // Validate currency code format (ISO 4217)
        guard currency.count == 3 && currency.uppercased() == currency else {
            throw PaymentError.invalidCurrency
        }
        
        self.id = id
        self.userId = userId
        self.coachId = coachId
        self.amount = amount
        self.currency = currency
        self.status = status
        self.paymentMethod = paymentMethod
        self.type = type
        self.subscriptionId = subscriptionId
        self.stripePaymentIntentId = stripePaymentIntentId
        self.description = description
        self.metadata = metadata
        self.isTest = isTest
        
        self.createdAt = Date()
        self.updatedAt = self.createdAt
        self.refundedAt = nil
        self.errorDetails = [:]
        
        // Validate payment method compatibility
        if type == .subscription && paymentMethod == .bankTransfer {
            throw PaymentError.invalidStatus
        }
    }
    
    // MARK: - Public Methods
    
    /// Returns formatted payment amount with currency symbol
    public func formattedAmount(locale: Locale? = nil) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale ?? Locale.current
        formatter.currencyCode = currency
        formatter.usesGroupingSeparator = true
        
        guard let formattedString = formatter.string(from: NSNumber(value: amount)) else {
            return "\(currency) \(amount)"
        }
        return formattedString
    }
    
    /// Checks if payment can be refunded
    public var isRefundable: Bool {
        guard status == .completed else { return false }
        guard type != .refund else { return false }
        
        // Check if within 30-day refund window
        let thirtyDaysAgo = Calendar.current.date(byAdding: .day, value: -30, to: Date())
        guard let refundWindow = thirtyDaysAgo,
              createdAt > refundWindow else {
            return false
        }
        
        return amount > 0 && !isTest
    }
    
    /// Updates payment status with validation
    public mutating func updateStatus(_ newStatus: PaymentStatus, errors: [String: String]? = nil) -> Result<PaymentStatus, PaymentError> {
        // Validate status transitions
        switch (status, newStatus) {
        case (.pending, .processing),
             (.processing, .completed),
             (.processing, .failed),
             (.completed, .refunded),
             (.completed, .disputed):
            status = newStatus
            updatedAt = Date()
            
            if newStatus == .refunded {
                refundedAt = Date()
            }
            
            if let errors = errors {
                errorDetails = errors
            }
            
            return .success(status)
            
        default:
            return .failure(.invalidStatus)
        }
    }
    
    // MARK: - Codable Implementation
    
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        coachId = try container.decodeIfPresent(String.self, forKey: .coachId)
        amount = try container.decode(Double.self, forKey: .amount)
        currency = try container.decode(String.self, forKey: .currency)
        status = try container.decode(PaymentStatus.self, forKey: .status)
        paymentMethod = try container.decode(PaymentMethod.self, forKey: .paymentMethod)
        type = try container.decode(PaymentType.self, forKey: .type)
        subscriptionId = try container.decodeIfPresent(String.self, forKey: .subscriptionId)
        stripePaymentIntentId = try container.decode(String.self, forKey: .stripePaymentIntentId)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        metadata = try container.decode([String: Any].self, forKey: .metadata)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        refundedAt = try container.decodeIfPresent(Date.self, forKey: .refundedAt)
        isTest = try container.decode(Bool.self, forKey: .isTest)
        errorDetails = try container.decode([String: String].self, forKey: .errorDetails)
    }
    
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        try container.encode(id, forKey: .id)
        try container.encode(userId, forKey: .userId)
        try container.encodeIfPresent(coachId, forKey: .coachId)
        try container.encode(amount, forKey: .amount)
        try container.encode(currency, forKey: .currency)
        try container.encode(status, forKey: .status)
        try container.encode(paymentMethod, forKey: .paymentMethod)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(subscriptionId, forKey: .subscriptionId)
        try container.encode(stripePaymentIntentId, forKey: .stripePaymentIntentId)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(metadata, forKey: .metadata)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encodeIfPresent(refundedAt, forKey: .refundedAt)
        try container.encode(isTest, forKey: .isTest)
        try container.encode(errorDetails, forKey: .errorDetails)
    }
}