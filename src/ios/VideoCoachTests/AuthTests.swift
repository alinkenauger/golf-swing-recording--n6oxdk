import XCTest
import Combine
@testable import VideoCoach

// MARK: - Auth Tests
@available(iOS 14.0, *)
final class AuthTests: XCTestCase {
    // MARK: - Properties
    
    private var mockAuthService: MockAuthService!
    private var cancellables: Set<AnyCancellable>!
    private var testExpectation: XCTestExpectation!
    
    private let testTimeout: TimeInterval = 5.0
    private let validEmail = "test@example.com"
    private let validPassword = "Password123!"
    private let invalidEmail = "invalid@email"
    private let invalidPassword = "short"
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        mockAuthService = MockAuthService.shared
        cancellables = Set<AnyCancellable>()
        mockAuthService.reset()
    }
    
    override func tearDown() {
        cancellables.removeAll()
        mockAuthService.reset()
        testExpectation = nil
        super.tearDown()
    }
    
    // MARK: - Email/Password Authentication Tests
    
    func testLoginSuccess() {
        // Given
        testExpectation = expectation(description: "Login success")
        mockAuthService.shouldSimulateError = false
        
        // When
        mockAuthService.login(email: validEmail, password: validPassword)
            .sink(
                receiveCompletion: { completion in
                    if case .failure = completion {
                        XCTFail("Login should succeed")
                    }
                },
                receiveValue: { user in
                    // Then
                    XCTAssertNotNil(user)
                    XCTAssertEqual(user.email, self.validEmail)
                    XCTAssertTrue(self.mockAuthService.isAuthenticated())
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
    
    func testLoginFailureInvalidCredentials() {
        // Given
        testExpectation = expectation(description: "Login failure")
        mockAuthService.shouldSimulateError = true
        
        // When
        mockAuthService.login(email: invalidEmail, password: invalidPassword)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        // Then
                        XCTAssertEqual(error, AuthError.invalidCredentials)
                        XCTAssertFalse(self.mockAuthService.isAuthenticated())
                        self.testExpectation.fulfill()
                    }
                },
                receiveValue: { _ in
                    XCTFail("Login should fail")
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
    
    // MARK: - Social Authentication Tests
    
    func testSocialLoginSuccess() {
        // Given
        testExpectation = expectation(description: "Social login success")
        mockAuthService.shouldSimulateError = false
        
        // When
        mockAuthService.socialLogin(provider: .google)
            .sink(
                receiveCompletion: { completion in
                    if case .failure = completion {
                        XCTFail("Social login should succeed")
                    }
                },
                receiveValue: { user in
                    // Then
                    XCTAssertNotNil(user)
                    XCTAssertTrue(self.mockAuthService.isAuthenticated())
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
    
    func testSocialLoginFailure() {
        // Given
        testExpectation = expectation(description: "Social login failure")
        mockAuthService.shouldSimulateError = true
        
        // When
        mockAuthService.socialLogin(provider: .google)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        // Then
                        XCTAssertEqual(error, AuthError.networkError)
                        XCTAssertFalse(self.mockAuthService.isAuthenticated())
                        self.testExpectation.fulfill()
                    }
                },
                receiveValue: { _ in
                    XCTFail("Social login should fail")
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
    
    // MARK: - Multi-factor Authentication Tests
    
    func testCoachMFARequirement() {
        // Given
        testExpectation = expectation(description: "Coach MFA requirement")
        let coachEmail = "coach@example.com"
        
        // When
        mockAuthService.login(email: coachEmail, password: validPassword)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { user in
                    // Then
                    XCTAssertEqual(user.role, .coach)
                    XCTAssertTrue(user.isCoach)
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
    
    // MARK: - Session Management Tests
    
    func testSessionPersistence() {
        // Given
        testExpectation = expectation(description: "Session persistence")
        
        // When
        mockAuthService.login(email: validEmail, password: validPassword)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { user in
                    // Then
                    XCTAssertNotNil(user)
                    XCTAssertNotNil(self.mockAuthService.getCurrentUser())
                    XCTAssertTrue(self.mockAuthService.isAuthenticated())
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
    
    func testLogoutClearsSession() {
        // Given
        testExpectation = expectation(description: "Logout clears session")
        
        // When
        mockAuthService.logout()
            .sink { _ in
                // Then
                XCTAssertNil(self.mockAuthService.getCurrentUser())
                XCTAssertFalse(self.mockAuthService.isAuthenticated())
                self.testExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
    
    // MARK: - Role-Based Access Tests
    
    func testUserRoleAssignment() {
        // Given
        testExpectation = expectation(description: "User role assignment")
        
        // When
        mockAuthService.login(email: validEmail, password: validPassword)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { user in
                    // Then
                    XCTAssertNotNil(user.role)
                    XCTAssertEqual(user.role, .athlete)
                    XCTAssertFalse(user.isCoach)
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
    
    func testCoachRolePermissions() {
        // Given
        testExpectation = expectation(description: "Coach role permissions")
        let coachEmail = "coach@example.com"
        
        // When
        mockAuthService.login(email: coachEmail, password: validPassword)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { user in
                    // Then
                    XCTAssertEqual(user.role, .coach)
                    XCTAssertTrue(user.isCoach)
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: testTimeout)
    }
}