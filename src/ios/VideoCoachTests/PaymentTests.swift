import XCTest
@testable import VideoCoach

@available(iOS 14.0, *)
final class PaymentTests: XCTestCase {
    // MARK: - Properties
    private var paymentService: MockPaymentService!
    private let concurrentQueue = DispatchQueue(label: "com.videocoach.payment.tests",
                                              qos: .userInitiated,
                                              attributes: .concurrent)
    
    // MARK: - Setup & Teardown
    override func setUp() {
        super.setUp()
        paymentService = MockPaymentService()
    }
    
    override func tearDown() {
        paymentService = nil
        super.tearDown()
    }
    
    // MARK: - Payment Processing Tests
    func testProcessPayment() throws {
        // Test successful payment processing
        let result = paymentService.processPayment(
            amount: 99.99,
            currency: "USD",
            paymentMethod: .creditCard
        )
        
        switch result {
        case .success(let payment):
            XCTAssertEqual(payment.amount, 99.99)
            XCTAssertEqual(payment.currency, "USD")
            XCTAssertEqual(payment.status, .completed)
            XCTAssertEqual(payment.paymentMethod, .creditCard)
            XCTAssertNotNil(payment.stripePaymentIntentId)
            
            // Verify analytics data
            let analytics = paymentService.getAnalytics()[payment.id]
            XCTAssertNotNil(analytics)
            XCTAssertEqual(analytics?["amount"] as? Double, 99.99)
            XCTAssertEqual(analytics?["currency"] as? String, "USD")
            
        case .failure(let error):
            XCTFail("Payment processing failed: \(error)")
        }
    }
    
    func testInvalidPaymentAmount() {
        let result = paymentService.processPayment(
            amount: -50.0,
            currency: "USD",
            paymentMethod: .creditCard
        )
        
        switch result {
        case .success:
            XCTFail("Payment should fail with negative amount")
        case .failure(let error):
            XCTAssertTrue(error is MockPaymentServiceError)
            XCTAssertEqual(error as? MockPaymentServiceError, .invalidAmount)
        }
    }
    
    // MARK: - Subscription Tests
    func testSubscriptionLifecycle() throws {
        // Create subscription
        let createResult = paymentService.createSubscription(
            userId: "test_user",
            planId: "premium_monthly",
            paymentMethod: .creditCard
        )
        
        guard case .success(let subscription) = createResult else {
            XCTFail("Subscription creation failed")
            return
        }
        
        XCTAssertEqual(subscription.status, .active)
        XCTAssertNotNil(subscription.stripeSubscriptionId)
        XCTAssertEqual(subscription.lastPaymentStatus, "succeeded")
        
        // Cancel subscription
        let cancelResult = paymentService.cancelSubscription(subscriptionId: subscription.id)
        
        guard case .success(let canceledSubscription) = cancelResult else {
            XCTFail("Subscription cancellation failed")
            return
        }
        
        XCTAssertEqual(canceledSubscription.status, .canceled)
        XCTAssertNotNil(canceledSubscription.canceledAt)
        
        // Verify analytics
        let analytics = paymentService.getAnalytics()[subscription.id]
        XCTAssertNotNil(analytics)
        XCTAssertEqual(analytics?["status"] as? String, "canceled")
        XCTAssertNotNil(analytics?["canceledAt"])
    }
    
    // MARK: - Concurrent Payment Tests
    func testConcurrentPayments() {
        let expectation = XCTestExpectation(description: "Concurrent payments")
        expectation.expectedFulfillmentCount = 10
        
        let amounts = [99.99, 149.99, 199.99, 49.99, 299.99]
        let paymentMethods: [PaymentMethod] = [.creditCard, .applePay, .bankTransfer]
        
        for i in 0..<10 {
            concurrentQueue.async {
                let amount = amounts[i % amounts.count]
                let paymentMethod = paymentMethods[i % paymentMethods.count]
                
                let result = self.paymentService.processPayment(
                    amount: amount,
                    currency: "USD",
                    paymentMethod: paymentMethod
                )
                
                switch result {
                case .success(let payment):
                    XCTAssertEqual(payment.amount, amount)
                    XCTAssertEqual(payment.paymentMethod, paymentMethod)
                    XCTAssertEqual(payment.status, .completed)
                case .failure(let error):
                    XCTFail("Concurrent payment failed: \(error)")
                }
                
                expectation.fulfill()
            }
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    // MARK: - Refund Tests
    func testPaymentRefund() throws {
        // Process initial payment
        let paymentResult = paymentService.processPayment(
            amount: 199.99,
            currency: "USD",
            paymentMethod: .creditCard
        )
        
        guard case .success(let payment) = paymentResult else {
            XCTFail("Initial payment failed")
            return
        }
        
        // Process refund
        let refundResult = paymentService.refundPayment(paymentId: payment.id)
        
        switch refundResult {
        case .success(let refundedPayment):
            XCTAssertEqual(refundedPayment.status, .refunded)
            XCTAssertNotNil(refundedPayment.refundedAt)
            
            // Verify analytics
            let analytics = paymentService.getAnalytics()[payment.id]
            XCTAssertNotNil(analytics)
            XCTAssertNotNil(analytics?["refundedAt"])
            XCTAssertEqual(analytics?["refundAmount"] as? Double, payment.amount)
            
        case .failure(let error):
            XCTFail("Refund failed: \(error)")
        }
    }
    
    // MARK: - Apple Pay Tests
    func testApplePaySetup() {
        let isSetup = paymentService.setupApplePay(merchantIdentifier: "merchant.com.videocoach")
        XCTAssertTrue(isSetup, "Apple Pay setup should succeed")
        
        paymentService.setShouldFail(true)
        let failedSetup = paymentService.setupApplePay(merchantIdentifier: "merchant.com.videocoach")
        XCTAssertFalse(failedSetup, "Apple Pay setup should fail when error is simulated")
    }
    
    // MARK: - Error Handling Tests
    func testPaymentErrorHandling() {
        paymentService.setShouldFail(true)
        paymentService.setMockError(MockPaymentServiceError.processingError)
        
        let result = paymentService.processPayment(
            amount: 99.99,
            currency: "USD",
            paymentMethod: .creditCard
        )
        
        switch result {
        case .success:
            XCTFail("Payment should fail when error is simulated")
        case .failure(let error):
            XCTAssertTrue(error is MockPaymentServiceError)
            XCTAssertEqual(error as? MockPaymentServiceError, .processingError)
        }
    }
}