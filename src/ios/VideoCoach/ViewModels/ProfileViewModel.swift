import Foundation  // iOS 14.0+
import Combine    // iOS 14.0+
import SwiftUI    // iOS 14.0+

/// Comprehensive error types for profile operations
public enum ProfileError: LocalizedError {
    case invalidInput(String)
    case unauthorized
    case networkError
    case sessionExpired
    case validationFailed(ProfileValidationError)
    case securityError
    case unknown
    
    public var errorDescription: String? {
        switch self {
        case .invalidInput(let field):
            return "Invalid input for \(field)"
        case .unauthorized:
            return "Unauthorized access"
        case .networkError:
            return "Network connection error"
        case .sessionExpired:
            return "Session has expired"
        case .validationFailed(let error):
            return error.localizedDescription
        case .securityError:
            return "Security verification failed"
        case .unknown:
            return "An unknown error occurred"
        }
    }
}

/// Thread-safe ViewModel that manages user profile state and business logic
@available(iOS 14.0, *)
@MainActor
public final class ProfileViewModel: ObservableObject {
    // MARK: - Published Properties
    
    @Published private(set) var user: User?
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var error: ProfileError?
    @Published private(set) var lastUpdateTimestamp: Date?
    
    // MARK: - Private Properties
    
    private let authService: AuthService
    private var cancellables: Set<AnyCancellable> = []
    private let retryLimit: Int = 3
    private var retryCount: Int = 0
    private let queue = DispatchQueue(label: "com.videocoach.profilevm", qos: .userInitiated)
    
    // MARK: - Initialization
    
    public init(authService: AuthService = AuthService.shared) {
        self.authService = authService
        
        setupAuthStateSubscription()
        loadProfile()
    }
    
    // MARK: - Public Methods
    
    /// Loads the current user's profile data with retry mechanism
    public func loadProfile() -> AnyPublisher<User, ProfileError> {
        guard !isLoading else {
            return Fail(error: ProfileError.unknown)
                .eraseToAnyPublisher()
        }
        
        isLoading = true
        error = nil
        
        return authService.authStatePublisher
            .first()
            .flatMap { [weak self] state -> AnyPublisher<User, ProfileError> in
                guard let self = self else {
                    return Fail(error: .unknown).eraseToAnyPublisher()
                }
                
                switch state {
                case .authenticated:
                    return self.fetchUserProfile()
                case .unauthenticated:
                    return Fail(error: .unauthorized).eraseToAnyPublisher()
                case .refreshing:
                    return self.waitForRefresh()
                case .error:
                    return Fail(error: .sessionExpired).eraseToAnyPublisher()
                }
            }
            .handleEvents(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.error = error
                    }
                },
                receiveOutput: { [weak self] user in
                    self?.user = user
                    self?.lastUpdateTimestamp = Date()
                    self?.retryCount = 0
                }
            )
            .eraseToAnyPublisher()
    }
    
    /// Updates user profile information with validation
    public func updateProfile(firstName: String?, lastName: String?, bio: String?, avatarUrl: String?) -> AnyPublisher<User, ProfileError> {
        guard let currentUser = user else {
            return Fail(error: .unauthorized).eraseToAnyPublisher()
        }
        
        return queue.sync {
            // Input validation
            if let firstName = firstName, firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return Fail(error: .invalidInput("firstName")).eraseToAnyPublisher()
            }
            
            if let lastName = lastName, lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return Fail(error: .invalidInput("lastName")).eraseToAnyPublisher()
            }
            
            if let bio = bio, bio.count > 500 {
                return Fail(error: .invalidInput("bio")).eraseToAnyPublisher()
            }
            
            // Security validation
            guard authService.authStatePublisher.value == .authenticated else {
                return Fail(error: .unauthorized).eraseToAnyPublisher()
            }
            
            let avatarURL = avatarUrl.flatMap { URL(string: $0) }
            
            return currentUser.updateProfile(
                firstName: firstName,
                lastName: lastName,
                bio: bio,
                avatarUrl: avatarURL
            )
            .map { result -> User in
                switch result {
                case .success:
                    return currentUser
                case .failure(let error):
                    throw ProfileError.validationFailed(.invalidProfile)
                }
            }
            .mapError { error -> ProfileError in
                if let userError = error as? UserError {
                    return .validationFailed(.invalidProfile)
                }
                return .unknown
            }
            .handleEvents(
                receiveOutput: { [weak self] updatedUser in
                    self?.user = updatedUser
                    self?.lastUpdateTimestamp = Date()
                }
            )
            .eraseToAnyPublisher()
        }
    }
    
    /// Securely logs out the current user
    public func logout() -> AnyPublisher<Void, Never> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.success(()))
                return
            }
            
            // Cancel any pending operations
            self.cancellables.forEach { $0.cancel() }
            self.cancellables.removeAll()
            
            // Clear sensitive data
            self.user = nil
            self.lastUpdateTimestamp = nil
            self.error = nil
            
            // Perform logout
            self.authService.logout()
            promise(.success(()))
        }
        .eraseToAnyPublisher()
    }
    
    /// Securely checks if current user is a coach
    public func isCoach() -> Bool {
        return queue.sync {
            guard let user = user else { return false }
            return user.isCoach
        }
    }
    
    // MARK: - Private Methods
    
    private func setupAuthStateSubscription() {
        authService.authStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                switch state {
                case .unauthenticated:
                    self?.user = nil
                    self?.error = .unauthorized
                case .error(let authError):
                    self?.error = .securityError
                    self?.user = nil
                default:
                    break
                }
            }
            .store(in: &cancellables)
    }
    
    private func fetchUserProfile() -> AnyPublisher<User, ProfileError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown))
                return
            }
            
            // Implement retry mechanism
            if self.retryCount >= self.retryLimit {
                promise(.failure(.networkError))
                return
            }
            
            self.retryCount += 1
            
            // Fetch current user profile
            DispatchQueue.global().asyncAfter(deadline: .now() + Double(self.retryCount) * 0.5) {
                if let currentUser = self.user {
                    promise(.success(currentUser))
                } else {
                    promise(.failure(.networkError))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    private func waitForRefresh() -> AnyPublisher<User, ProfileError> {
        return authService.authStatePublisher
            .filter { state in
                if case .refreshing = state { return false }
                return true
            }
            .first()
            .flatMap { [weak self] state -> AnyPublisher<User, ProfileError> in
                guard let self = self else {
                    return Fail(error: .unknown).eraseToAnyPublisher()
                }
                
                switch state {
                case .authenticated:
                    return self.fetchUserProfile()
                default:
                    return Fail(error: .sessionExpired).eraseToAnyPublisher()
                }
            }
            .eraseToAnyPublisher()
    }
}