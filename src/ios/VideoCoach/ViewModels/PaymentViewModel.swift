import Foundation
import Combine
import SwiftUI // v14.0+

/// ViewModel responsible for managing payment-related business logic and state
@MainActor
@available(iOS 14.0, *)
public final class PaymentViewModel: ObservableObject {
    // MARK: - Published Properties
    
    @Published private(set) var isProcessing: Bool = false
    @Published private(set) var error: PaymentError?
    @Published private(set) var payments: [Payment] = []
    @Published private(set) var activeSubscription: Subscription?
    @Published private(set) var paymentAnalytics: [String: Any] = [:]
    
    // MARK: - Private Properties
    
    private let paymentService: PaymentService
    private let analyticsService: AnalyticsService
    private var cancellables = Set<AnyCancellable>()
    private var retryCount: Int = 0
    private let maxRetries: Int = 3
    private let processingQueue = DispatchQueue(label: "com.videocoach.payment", qos: .userInitiated)
    
    // MARK: - Initialization
    
    public init(paymentService: PaymentService, analyticsService: AnalyticsService) {
        self.paymentService = paymentService
        self.analyticsService = analyticsService
        setupSubscriptionObservers()
    }
    
    // MARK: - Public Methods
    
    /// Process a one-time payment with enhanced error handling and analytics
    public func processPayment(amount: Double, 
                             currency: String, 
                             paymentMethod: PaymentMethod) async throws -> Payment {
        isProcessing = true
        error = nil
        
        do {
            // Track payment initiation
            analyticsService.trackEvent(.paymentSuccess, metadata: [
                "amount": amount,
                "currency": currency,
                "payment_method": paymentMethod.rawValue
            ])
            
            // Process payment with retry mechanism
            let payment = try await withRetry {
                try await paymentService.processPayment(
                    amount: amount,
                    currency: currency,
                    paymentMethod: paymentMethod,
                    metadata: ["source": "ios_app"]
                )
            }
            
            // Update local state
            await MainActor.run {
                payments.append(payment)
                updateAnalytics(for: payment)
            }
            
            return payment
            
        } catch {
            await handlePaymentError(error)
            throw error
        } finally {
            isProcessing = false
        }
    }
    
    /// Create a new subscription with analytics tracking
    public func createSubscription(planId: String, 
                                 paymentMethod: PaymentMethod) async throws -> Subscription {
        isProcessing = true
        error = nil
        
        do {
            // Track subscription initiation
            analyticsService.trackEvent(.sessionStart, metadata: [
                "plan_id": planId,
                "payment_method": paymentMethod.rawValue
            ])
            
            // Create subscription with retry mechanism
            let subscription = try await withRetry {
                try await paymentService.createSubscription(
                    userId: UserDefaults.standard.string(forKey: "user_id") ?? "",
                    planId: planId,
                    paymentMethod: paymentMethod,
                    metadata: ["platform": "ios"]
                )
            }
            
            // Update local state
            await MainActor.run {
                activeSubscription = subscription
                updateAnalytics(for: subscription)
            }
            
            return subscription
            
        } catch {
            await handleSubscriptionError(error)
            throw error
        } finally {
            isProcessing = false
        }
    }
    
    /// Cancel active subscription with analytics tracking
    public func cancelSubscription() async throws {
        guard let subscription = activeSubscription else {
            throw SubscriptionError.validationFailed("No active subscription")
        }
        
        isProcessing = true
        error = nil
        
        do {
            // Track cancellation attempt
            analyticsService.trackEvent(.sessionEnd, metadata: [
                "subscription_id": subscription.id,
                "reason": "user_cancelled"
            ])
            
            try await paymentService.refundPayment(
                paymentId: subscription.id,
                reason: "user_cancelled"
            )
            
            await MainActor.run {
                activeSubscription = nil
                updateAnalytics(forCancellation: subscription)
            }
            
        } catch {
            await handleSubscriptionError(error)
            throw error
        } finally {
            isProcessing = false
        }
    }
    
    // MARK: - Private Methods
    
    private func setupSubscriptionObservers() {
        // Monitor subscription status changes
        activeSubscription?.statusPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                self?.handleSubscriptionStatusChange(status)
            }
            .store(in: &cancellables)
    }
    
    private func withRetry<T>(_ operation: () async throws -> T) async throws -> T {
        do {
            return try await operation()
        } catch {
            if retryCount < maxRetries {
                retryCount += 1
                try await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(retryCount)) * 1_000_000_000))
                return try await withRetry(operation)
            }
            throw error
        }
    }
    
    private func updateAnalytics(for payment: Payment) {
        var analytics = paymentAnalytics
        analytics["last_payment_amount"] = payment.amount
        analytics["last_payment_date"] = payment.createdAt
        analytics["total_payments"] = payments.count
        analytics["total_spent"] = payments.reduce(0.0) { $0 + $1.amount }
        paymentAnalytics = analytics
        
        analyticsService.recordMetric(.duration, value: Double(payments.count))
    }
    
    private func updateAnalytics(for subscription: Subscription) {
        var analytics = paymentAnalytics
        analytics["subscription_status"] = subscription.status.rawValue
        analytics["subscription_start"] = subscription.currentPeriodStart
        analytics["subscription_end"] = subscription.currentPeriodEnd
        paymentAnalytics = analytics
        
        analyticsService.recordMetric(.duration, value: subscription.currentPeriodEnd.timeIntervalSince(subscription.currentPeriodStart))
    }
    
    private func updateAnalytics(forCancellation subscription: Subscription) {
        var analytics = paymentAnalytics
        analytics["cancellation_date"] = Date()
        analytics["subscription_duration"] = subscription.currentPeriodEnd.timeIntervalSince(subscription.currentPeriodStart)
        paymentAnalytics = analytics
        
        analyticsService.recordMetric(.duration, value: -1.0)
    }
    
    private func handlePaymentError(_ error: Error) async {
        await MainActor.run {
            if let paymentError = error as? PaymentError {
                self.error = paymentError
            } else {
                self.error = .processingFailed
            }
        }
        
        analyticsService.trackEvent(.paymentFailure, metadata: [
            "error_type": String(describing: error),
            "retry_count": retryCount
        ])
    }
    
    private func handleSubscriptionError(_ error: Error) async {
        await MainActor.run {
            if let subscriptionError = error as? SubscriptionError {
                self.error = .processingFailed
            } else {
                self.error = .processingFailed
            }
        }
        
        analyticsService.trackEvent(.errorOccurred, metadata: [
            "error_type": String(describing: error),
            "context": "subscription"
        ])
    }
    
    private func handleSubscriptionStatusChange(_ status: SubscriptionStatus) {
        analyticsService.trackEvent(.sessionStart, metadata: [
            "subscription_status": status.rawValue,
            "timestamp": Date()
        ])
        
        if status == .expired || status == .canceled {
            activeSubscription = nil
        }
    }
}