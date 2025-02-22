import Foundation
import Combine
import SwiftUI
import LocalAuthentication

/// Enhanced ViewModel class managing authentication state and operations with biometric and MFA support
@available(iOS 14.0, *)
@MainActor
final class AuthViewModel: ObservableObject {
    // MARK: - Published Properties
    
    @Published private(set) var authState: AuthState = .idle
    @Published var email: String = ""
    @Published var password: String = ""
    @Published var mfaToken: String = ""
    @Published private(set) var isPerformingMFA: Bool = false
    @Published private(set) var lastAuthError: AuthError?
    
    // MARK: - Private Properties
    
    private let authService: AuthService
    private let userStore: UserStore
    private var cancellables: Set<AnyCancellable> = []
    private let context = LAContext()
    
    // MARK: - Constants
    
    private enum Constants {
        static let biometricReason = "Authenticate to access VideoCoach"
        static let mfaTokenLength = 6
    }
    
    // MARK: - Initialization
    
    init(authService: AuthService = .shared, userStore: UserStore = .shared) {
        self.authService = authService
        self.userStore = userStore
        
        setupStateObservation()
        restoreAuthenticationState()
    }
    
    // MARK: - Public Methods
    
    /// Attempts to log in user with email and password
    func login() -> AnyPublisher<Void, Never> {
        guard !email.isEmpty, !password.isEmpty else {
            lastAuthError = .invalidCredentials
            return Just(()).eraseToAnyPublisher()
        }
        
        authState = .authenticating
        lastAuthError = nil
        
        return authService.login(email: email, password: password)
            .handleEvents(receiveSubscription: { [weak self] _ in
                self?.authState = .authenticating
            })
            .flatMap { [weak self] user -> AnyPublisher<Void, AuthError> in
                guard let self = self else {
                    return Fail(error: .unknown).eraseToAnyPublisher()
                }
                
                if user.role == .coach {
                    self.authState = .mfaRequired
                    self.isPerformingMFA = true
                    return Empty().eraseToAnyPublisher()
                } else {
                    return self.userStore.refreshUserState()
                        .mapError { _ in AuthError.unknown }
                        .eraseToAnyPublisher()
                }
            }
            .catch { [weak self] error -> AnyPublisher<Void, Never> in
                self?.handleAuthError(error)
                return Empty().eraseToAnyPublisher()
            }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    /// Handles biometric authentication
    func biometricLogin() -> AnyPublisher<Void, Never> {
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else {
            lastAuthError = .biometricError
            return Just(()).eraseToAnyPublisher()
        }
        
        authState = .biometricAuthenticating
        lastAuthError = nil
        
        return authService.authenticateWithBiometrics()
            .flatMap { [weak self] success -> AnyPublisher<Void, AuthError> in
                guard let self = self, success else {
                    return Fail(error: .biometricError).eraseToAnyPublisher()
                }
                return self.userStore.refreshUserState()
                    .mapError { _ in AuthError.unknown }
                    .eraseToAnyPublisher()
            }
            .catch { [weak self] error -> AnyPublisher<Void, Never> in
                self?.handleAuthError(error)
                return Empty().eraseToAnyPublisher()
            }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    /// Validates MFA token for required users
    func validateMFAToken(_ token: String) -> AnyPublisher<Void, Never> {
        guard token.count == Constants.mfaTokenLength,
              isPerformingMFA else {
            lastAuthError = .mfaFailed
            return Just(()).eraseToAnyPublisher()
        }
        
        return authService.validateMFAToken(token)
            .flatMap { [weak self] success -> AnyPublisher<Void, AuthError> in
                guard let self = self, success else {
                    return Fail(error: .mfaFailed).eraseToAnyPublisher()
                }
                self.isPerformingMFA = false
                return self.userStore.refreshUserState()
                    .mapError { _ in AuthError.unknown }
                    .eraseToAnyPublisher()
            }
            .catch { [weak self] error -> AnyPublisher<Void, Never> in
                self?.handleAuthError(error)
                return Empty().eraseToAnyPublisher()
            }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    /// Handles social provider authentication
    func socialLogin(provider: SocialProvider) -> AnyPublisher<Void, Never> {
        authState = .authenticating
        lastAuthError = nil
        
        return authService.socialLogin(provider: provider)
            .flatMap { [weak self] user -> AnyPublisher<Void, AuthError> in
                guard let self = self else {
                    return Fail(error: .unknown).eraseToAnyPublisher()
                }
                return self.userStore.refreshUserState()
                    .mapError { _ in AuthError.unknown }
                    .eraseToAnyPublisher()
            }
            .catch { [weak self] error -> AnyPublisher<Void, Never> in
                self?.handleAuthError(error)
                return Empty().eraseToAnyPublisher()
            }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    /// Logs out current user and cleans up state
    func logout() -> AnyPublisher<Void, Never> {
        authService.logout()
            .handleEvents(receiveCompletion: { [weak self] _ in
                self?.resetState()
            })
            .catch { _ in Just(()) }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupStateObservation() {
        authService.authStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                switch state {
                case .authenticated:
                    self?.authState = .authenticated
                case .unauthenticated:
                    self?.resetState()
                case .error(let error):
                    self?.handleAuthError(error)
                default:
                    break
                }
            }
            .store(in: &cancellables)
    }
    
    private func restoreAuthenticationState() {
        authService.restoreExistingSession()
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.handleAuthError(error)
                    }
                },
                receiveValue: { [weak self] in
                    self?.authState = .authenticated
                }
            )
            .store(in: &cancellables)
    }
    
    private func handleAuthError(_ error: Error) {
        authState = .error(error as? AuthError ?? .unknown)
        lastAuthError = error as? AuthError ?? .unknown
        isPerformingMFA = false
    }
    
    private func resetState() {
        authState = .idle
        email = ""
        password = ""
        mfaToken = ""
        isPerformingMFA = false
        lastAuthError = nil
    }
}

// MARK: - Supporting Types

/// Authentication state enumeration
enum AuthState {
    case idle
    case authenticating
    case biometricAuthenticating
    case mfaRequired
    case authenticated
    case error(Error)
}

/// Authentication error types
enum AuthError: Error, LocalizedError {
    case invalidCredentials
    case networkError
    case biometricError
    case mfaRequired
    case mfaFailed
    case tokenExpired
    case unauthorized
    case unknown
    
    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid email or password"
        case .networkError:
            return "Network connection error"
        case .biometricError:
            return "Biometric authentication failed"
        case .mfaRequired:
            return "Multi-factor authentication required"
        case .mfaFailed:
            return "Invalid MFA token"
        case .tokenExpired:
            return "Authentication session expired"
        case .unauthorized:
            return "Unauthorized access"
        case .unknown:
            return "An unknown error occurred"
        }
    }
}

/// Social authentication providers
enum SocialProvider {
    case apple
    case google
    case facebook
}