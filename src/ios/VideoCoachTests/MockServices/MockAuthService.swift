import Foundation
import Combine

@available(iOS 14.0, *)
@testable import VideoCoach

// MARK: - Mock Auth Error Types
enum MockAuthError: Error {
    case simulatedError
    case invalidCredentials
    case networkTimeout
}

// MARK: - Mock Auth Service
final class MockAuthService {
    // MARK: - Properties
    
    static let shared = MockAuthService()
    
    private var currentUser: User?
    private var isLoggedIn: Bool = false
    
    var shouldSimulateError: Bool = false
    var loginDelay: TimeInterval = 0.5
    
    private let queue = DispatchQueue(label: "com.videocoach.mockauth", qos: .userInitiated)
    
    // MARK: - Initialization
    
    private init() {}
    
    // MARK: - Authentication Methods
    
    func login(email: String, password: String) -> AnyPublisher<User, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown))
                return
            }
            
            self.queue.asyncAfter(deadline: .now() + self.loginDelay) {
                if self.shouldSimulateError {
                    promise(.failure(.invalidCredentials))
                    return
                }
                
                do {
                    let mockUser = try User(
                        id: UUID().uuidString,
                        email: email,
                        firstName: "Test",
                        lastName: "User",
                        bio: "Mock user for testing",
                        role: .athlete
                    )
                    
                    self.currentUser = mockUser
                    self.isLoggedIn = true
                    promise(.success(mockUser))
                } catch {
                    promise(.failure(.invalidCredentials))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    func socialLogin(provider: SocialProvider) -> AnyPublisher<User, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown))
                return
            }
            
            self.queue.asyncAfter(deadline: .now() + self.loginDelay) {
                if self.shouldSimulateError {
                    promise(.failure(.networkError))
                    return
                }
                
                do {
                    let mockUser = try User(
                        id: UUID().uuidString,
                        email: "social@test.com",
                        firstName: "Social",
                        lastName: "User",
                        bio: "Mock social user",
                        role: .athlete
                    )
                    
                    self.currentUser = mockUser
                    self.isLoggedIn = true
                    promise(.success(mockUser))
                } catch {
                    promise(.failure(.invalidCredentials))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    func logout() -> AnyPublisher<Void, Never> {
        return Future { [weak self] promise in
            self?.queue.async {
                self?.currentUser = nil
                self?.isLoggedIn = false
                promise(.success(()))
            }
        }
        .eraseToAnyPublisher()
    }
    
    func getCurrentUser() -> User? {
        return queue.sync { currentUser }
    }
    
    func isAuthenticated() -> Bool {
        return queue.sync { isLoggedIn }
    }
    
    // MARK: - Test Helper Methods
    
    func reset() {
        queue.async {
            self.currentUser = nil
            self.isLoggedIn = false
            self.shouldSimulateError = false
            self.loginDelay = 0.5
        }
    }
}