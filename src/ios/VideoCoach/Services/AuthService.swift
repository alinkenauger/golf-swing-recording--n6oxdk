import Foundation
import Combine
import Auth0
import LocalAuthentication
import Security

// MARK: - Authentication Errors
public enum AuthError: LocalizedError {
    case invalidCredentials
    case networkError
    case tokenExpired
    case refreshFailed
    case unauthorized
    case biometricFailed
    case deviceCompromised
    case certificateError
    case unknown
    
    public var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid email or password"
        case .networkError:
            return "Network connection error"
        case .tokenExpired:
            return "Authentication session expired"
        case .refreshFailed:
            return "Failed to refresh authentication"
        case .unauthorized:
            return "Unauthorized access"
        case .biometricFailed:
            return "Biometric authentication failed"
        case .deviceCompromised:
            return "Device security compromised"
        case .certificateError:
            return "SSL certificate error"
        case .unknown:
            return "Unknown authentication error"
        }
    }
}

// MARK: - Authentication State
public enum AuthState {
    case authenticated
    case unauthenticated
    case refreshing
    case error(AuthError)
}

// MARK: - AuthService Implementation
@available(iOS 14.0, *)
public final class AuthService {
    // MARK: - Properties
    
    public static let shared = AuthService()
    
    private let keychain: KeychainHelper
    private let auth0: Auth0.Client
    private var currentUser: User?
    private var accessToken: String?
    private var refreshToken: String?
    
    private let authStateSubject = CurrentValueSubject<AuthState, Never>(.unauthenticated)
    private var refreshTimer: Timer?
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Constants
    
    private enum Constants {
        static let accessTokenKey = "com.videocoach.auth.accessToken"
        static let refreshTokenKey = "com.videocoach.auth.refreshToken"
        static let tokenRefreshThreshold: TimeInterval = 300 // 5 minutes
        static let maxRefreshAttempts = 3
        static let biometricReason = "Authenticate to access VideoCoach"
    }
    
    // MARK: - Initialization
    
    private init() {
        self.keychain = KeychainHelper.shared
        self.auth0 = Auth0.Client(clientId: Bundle.main.object(forInfoDictionaryKey: "Auth0ClientId") as! String,
                                domain: Bundle.main.object(forInfoDictionaryKey: "Auth0Domain") as! String)
        
        setupTokenRefreshMonitoring()
        restoreExistingSession()
    }
    
    // MARK: - Public Interface
    
    public var authStatePublisher: AnyPublisher<AuthState, Never> {
        return authStateSubject.eraseToAnyPublisher()
    }
    
    public func login(email: String, password: String) -> AnyPublisher<User, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown))
                return
            }
            
            self.auth0
                .authentication()
                .login(email: email, password: password)
                .start { result in
                    switch result {
                    case .success(let credentials):
                        self.handleAuthenticationSuccess(credentials: credentials)
                            .sink(
                                receiveCompletion: { completion in
                                    if case .failure(let error) = completion {
                                        promise(.failure(error))
                                    }
                                },
                                receiveValue: { user in
                                    promise(.success(user))
                                }
                            )
                            .store(in: &self.cancellables)
                        
                    case .failure(let error):
                        promise(.failure(self.mapAuth0Error(error)))
                    }
                }
        }
        .eraseToAnyPublisher()
    }
    
    public func authenticateWithBiometrics() -> AnyPublisher<Bool, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown))
                return
            }
            
            let context = LAContext()
            var error: NSError?
            
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                promise(.failure(.biometricFailed))
                return
            }
            
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                                 localizedReason: Constants.biometricReason) { success, error in
                if success {
                    // Attempt to refresh tokens after successful biometric auth
                    self.refreshTokens()
                        .sink(
                            receiveCompletion: { completion in
                                if case .failure = completion {
                                    promise(.failure(.unauthorized))
                                }
                            },
                            receiveValue: { _ in
                                promise(.success(true))
                            }
                        )
                        .store(in: &self.cancellables)
                } else {
                    promise(.failure(.biometricFailed))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    public func logout() {
        cancelTokenRefresh()
        clearStoredCredentials()
        currentUser = nil
        accessToken = nil
        refreshToken = nil
        authStateSubject.send(.unauthenticated)
    }
    
    // MARK: - Private Methods
    
    private func handleAuthenticationSuccess(credentials: Credentials) -> AnyPublisher<User, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown))
                return
            }
            
            // Store tokens securely
            self.storeCredentials(accessToken: credentials.accessToken,
                                refreshToken: credentials.refreshToken)
            
            // Fetch user profile
            self.fetchUserProfile(accessToken: credentials.accessToken)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            promise(.failure(error))
                        }
                    },
                    receiveValue: { user in
                        self.currentUser = user
                        self.accessToken = credentials.accessToken
                        self.refreshToken = credentials.refreshToken
                        self.setupTokenRefreshTimer()
                        self.authStateSubject.send(.authenticated)
                        promise(.success(user))
                    }
                )
                .store(in: &self.cancellables)
        }
        .eraseToAnyPublisher()
    }
    
    private func fetchUserProfile(accessToken: String) -> AnyPublisher<User, AuthError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown))
                return
            }
            
            self.auth0
                .authentication()
                .userInfo(withAccessToken: accessToken)
                .start { result in
                    switch result {
                    case .success(let profile):
                        do {
                            let user = try User(
                                id: profile.sub,
                                email: profile.email ?? "",
                                firstName: profile.givenName ?? "",
                                lastName: profile.familyName ?? "",
                                role: .athlete // Default role, should be updated from backend
                            )
                            promise(.success(user))
                        } catch {
                            promise(.failure(.invalidCredentials))
                        }
                    case .failure:
                        promise(.failure(.networkError))
                    }
                }
        }
        .eraseToAnyPublisher()
    }
    
    private func refreshTokens() -> AnyPublisher<String, AuthError> {
        return Future { [weak self] promise in
            guard let self = self,
                  let refreshToken = self.refreshToken else {
                promise(.failure(.refreshFailed))
                return
            }
            
            self.authStateSubject.send(.refreshing)
            
            self.auth0
                .authentication()
                .renew(withRefreshToken: refreshToken)
                .start { result in
                    switch result {
                    case .success(let credentials):
                        self.storeCredentials(accessToken: credentials.accessToken,
                                           refreshToken: credentials.refreshToken)
                        self.accessToken = credentials.accessToken
                        self.refreshToken = credentials.refreshToken
                        self.setupTokenRefreshTimer()
                        self.authStateSubject.send(.authenticated)
                        promise(.success(credentials.accessToken))
                        
                    case .failure:
                        self.authStateSubject.send(.error(.refreshFailed))
                        promise(.failure(.refreshFailed))
                    }
                }
        }
        .eraseToAnyPublisher()
    }
    
    private func storeCredentials(accessToken: String, refreshToken: String) {
        let _ = keychain.save(data: accessToken.data(using: .utf8)!,
                            service: Constants.accessTokenKey,
                            account: "videocoach",
                            accessibility: .afterFirstUnlock,
                            requiresBiometric: true)
        
        let _ = keychain.save(data: refreshToken.data(using: .utf8)!,
                            service: Constants.refreshTokenKey,
                            account: "videocoach",
                            accessibility: .afterFirstUnlock,
                            requiresBiometric: true)
    }
    
    private func clearStoredCredentials() {
        let _ = keychain.delete(service: Constants.accessTokenKey, account: "videocoach")
        let _ = keychain.delete(service: Constants.refreshTokenKey, account: "videocoach")
    }
    
    private func setupTokenRefreshMonitoring() {
        // Monitor auth state changes
        authStateSubject
            .sink { [weak self] state in
                if case .error(let error) = state,
                   error == .tokenExpired {
                    self?.refreshTokens()
                        .sink(
                            receiveCompletion: { _ in },
                            receiveValue: { _ in }
                        )
                        .store(in: &self!.cancellables)
                }
            }
            .store(in: &cancellables)
    }
    
    private func setupTokenRefreshTimer() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: Constants.tokenRefreshThreshold,
                                          repeats: false) { [weak self] _ in
            self?.refreshTokens()
                .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { _ in }
                )
                .store(in: &self!.cancellables)
        }
    }
    
    private func cancelTokenRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = nil
    }
    
    private func restoreExistingSession() {
        if case .success(let accessTokenData) = keychain.retrieve(service: Constants.accessTokenKey,
                                                                account: "videocoach",
                                                                requiresBiometric: true),
           case .success(let refreshTokenData) = keychain.retrieve(service: Constants.refreshTokenKey,
                                                                 account: "videocoach",
                                                                 requiresBiometric: true),
           let accessToken = String(data: accessTokenData, encoding: .utf8),
           let refreshToken = String(data: refreshTokenData, encoding: .utf8) {
            
            self.accessToken = accessToken
            self.refreshToken = refreshToken
            
            refreshTokens()
                .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { _ in }
                )
                .store(in: &cancellables)
        }
    }
    
    private func mapAuth0Error(_ error: Auth0.AuthenticationError) -> AuthError {
        switch error {
        case .invalidCredentials:
            return .invalidCredentials
        case .networkError:
            return .networkError
        default:
            return .unknown
        }
    }
}