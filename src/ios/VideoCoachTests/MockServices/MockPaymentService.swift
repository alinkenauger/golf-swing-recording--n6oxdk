import Foundation
import XCTest

// MARK: - Mock Payment Service Errors
enum MockPaymentServiceError: Error {
    case invalidAmount
    case invalidCurrency
    case invalidPaymentMethod
    case invalidSubscription
    case invalidPayment
    case processingError
    case simulatedError
}

@available(iOS 14.0, *)
public class MockPaymentService {
    // MARK: - Thread Safety
    private let mockQueue = DispatchQueue(label: "com.videocoach.mockpayment", qos: .userInitiated)
    
    // MARK: - Mock Storage
    private var mockPayments: [String: Payment] = [:]
    private var mockSubscriptions: [String: Subscription] = [:]
    private var operationAttempts: [String: Int] = [:]
    private var analyticsData: [String: [String: Any]] = [:]
    
    // MARK: - Test Control
    private var shouldFailNextOperation = false
    private var mockError: Error?
    private var mockProcessingDelay: TimeInterval = 0.1
    
    // MARK: - Initialization
    public init() {}
    
    // MARK: - Payment Processing
    public func processPayment(amount: Double, 
                             currency: String, 
                             paymentMethod: PaymentMethod) -> Result<Payment, Error> {
        return mockQueue.sync {
            // Simulate processing delay
            Thread.sleep(forTimeInterval: mockProcessingDelay)
            
            // Check for simulated failure
            if shouldFailNextOperation {
                shouldFailNextOperation = false
                return .failure(mockError ?? MockPaymentServiceError.simulatedError)
            }
            
            // Validate inputs
            guard amount > 0 else {
                return .failure(MockPaymentServiceError.invalidAmount)
            }
            
            guard currency.count == 3 && currency == currency.uppercased() else {
                return .failure(MockPaymentServiceError.invalidCurrency)
            }
            
            do {
                // Create mock payment
                let paymentId = UUID().uuidString
                let payment = try Payment(
                    id: paymentId,
                    userId: UUID().uuidString,
                    amount: amount,
                    currency: currency,
                    status: .completed,
                    paymentMethod: paymentMethod,
                    type: .oneTime,
                    stripePaymentIntentId: "mock_pi_\(paymentId)",
                    metadata: ["mock": true]
                )
                
                // Store payment
                mockPayments[paymentId] = payment
                
                // Update analytics
                analyticsData[paymentId] = [
                    "amount": amount,
                    "currency": currency,
                    "method": paymentMethod.rawValue,
                    "timestamp": Date()
                ]
                
                return .success(payment)
            } catch {
                return .failure(error)
            }
        }
    }
    
    // MARK: - Subscription Management
    public func createSubscription(userId: String, 
                                 planId: String, 
                                 paymentMethod: PaymentMethod) -> Result<Subscription, Error> {
        return mockQueue.sync {
            // Simulate processing delay
            Thread.sleep(forTimeInterval: mockProcessingDelay)
            
            // Check for simulated failure
            if shouldFailNextOperation {
                shouldFailNextOperation = false
                return .failure(mockError ?? MockPaymentServiceError.simulatedError)
            }
            
            // Create mock subscription
            let subscriptionId = UUID().uuidString
            let subscription = Subscription(
                id: subscriptionId,
                userId: userId,
                coachId: UUID().uuidString,
                planId: planId,
                status: .active,
                currentPeriodStart: Date(),
                currentPeriodEnd: Calendar.current.date(byAdding: .month, value: 1, to: Date())!,
                stripeSubscriptionId: "mock_sub_\(subscriptionId)",
                stripeCustomerId: "mock_cus_\(userId)",
                lastPaymentStatus: "succeeded",
                paymentMethodId: "mock_pm_\(UUID().uuidString)"
            )
            
            // Store subscription
            mockSubscriptions[subscriptionId] = subscription
            
            // Update analytics
            analyticsData[subscriptionId] = [
                "userId": userId,
                "planId": planId,
                "status": subscription.status.rawValue,
                "created": Date()
            ]
            
            return .success(subscription)
        }
    }
    
    public func cancelSubscription(subscriptionId: String) -> Result<Subscription, Error> {
        return mockQueue.sync {
            // Simulate processing delay
            Thread.sleep(forTimeInterval: mockProcessingDelay)
            
            // Check for simulated failure
            if shouldFailNextOperation {
                shouldFailNextOperation = false
                return .failure(mockError ?? MockPaymentServiceError.simulatedError)
            }
            
            // Validate subscription exists
            guard var subscription = mockSubscriptions[subscriptionId] else {
                return .failure(MockPaymentServiceError.invalidSubscription)
            }
            
            // Attempt status transition
            let result = subscription.validateTransition(to: .canceled)
            switch result {
            case .success:
                mockSubscriptions[subscriptionId] = subscription
                
                // Update analytics
                analyticsData[subscriptionId]?["canceledAt"] = Date()
                analyticsData[subscriptionId]?["status"] = "canceled"
                
                return .success(subscription)
            case .failure(let error):
                return .failure(error)
            }
        }
    }
    
    public func refundPayment(paymentId: String, amount: Double? = nil) -> Result<Payment, Error> {
        return mockQueue.sync {
            // Simulate processing delay
            Thread.sleep(forTimeInterval: mockProcessingDelay)
            
            // Check for simulated failure
            if shouldFailNextOperation {
                shouldFailNextOperation = false
                return .failure(mockError ?? MockPaymentServiceError.simulatedError)
            }
            
            // Validate payment exists
            guard var payment = mockPayments[paymentId] else {
                return .failure(MockPaymentServiceError.invalidPayment)
            }
            
            // Validate payment is refundable
            guard payment.isRefundable else {
                return .failure(MockPaymentServiceError.invalidPayment)
            }
            
            // Validate refund amount if provided
            if let refundAmount = amount {
                guard refundAmount <= payment.amount else {
                    return .failure(MockPaymentServiceError.invalidAmount)
                }
            }
            
            // Process refund
            let result = payment.updateStatus(.refunded)
            switch result {
            case .success:
                mockPayments[paymentId] = payment
                
                // Update analytics
                analyticsData[paymentId]?["refundedAt"] = Date()
                analyticsData[paymentId]?["refundAmount"] = amount ?? payment.amount
                
                return .success(payment)
            case .failure(let error):
                return .failure(error)
            }
        }
    }
    
    public func setupApplePay(merchantIdentifier: String) -> Bool {
        return mockQueue.sync {
            // Simulate processing delay
            Thread.sleep(forTimeInterval: mockProcessingDelay)
            
            // Return opposite of shouldFailNextOperation
            return !shouldFailNextOperation
        }
    }
    
    // MARK: - Test Helpers
    public func setMockError(_ error: Error) {
        mockQueue.sync {
            mockError = error
        }
    }
    
    public func setShouldFail(_ shouldFail: Bool) {
        mockQueue.sync {
            shouldFailNextOperation = shouldFail
        }
    }
    
    public func getAnalytics() -> [String: [String: Any]] {
        return mockQueue.sync {
            return analyticsData
        }
    }
}