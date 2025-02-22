import Foundation
import Combine
import SwiftUI

/// A thread-safe store class managing user state and profile operations with comprehensive error handling and state restoration
@available(iOS 14.0, *)
@MainActor
final class UserStore: ObservableObject {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    static let shared = UserStore()
    
    /// Authentication service instance
    private let authService: AuthService
    
    /// Current user state
    @Published private(set) var currentUser: User?
    
    /// Profile completion status
    @Published private(set) var isProfileComplete: Bool = false
    
    /// Current error state
    @Published private(set) var error: Error?
    
    /// Set of cancellables for managing subscriptions
    private var cancellables: Set<AnyCancellable> = []
    
    /// Queue for state restoration operations
    private let stateRestorationQueue = DispatchQueue(label: "com.videocoach.userstore.restoration", qos: .userInitiated)
    
    // MARK: - Initialization
    
    private init() {
        self.authService = AuthService.shared
        
        // Set up auth state observation
        authService.authStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                switch state {
                case .authenticated:
                    self?.refreshUserState()
                        .sink(
                            receiveCompletion: { completion in
                                if case .failure(let error) = completion {
                                    self?.error = error
                                }
                            },
                            receiveValue: { _ in }
                        )
                        .store(in: &self!.cancellables)
                case .unauthenticated:
                    self?.currentUser = nil
                    self?.isProfileComplete = false
                case .error(let error):
                    self?.error = error
                default:
                    break
                }
            }
            .store(in: &cancellables)
        
        // Register for app lifecycle notifications
        NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
            .sink { [weak self] _ in
                self?.saveState()
            }
            .store(in: &cancellables)
        
        // Initial state restoration
        restoreState()
    }
    
    // MARK: - Public Methods
    
    /// Updates user profile information with comprehensive error handling
    /// - Parameters:
    ///   - firstName: Optional new first name
    ///   - lastName: Optional new last name
    ///   - bio: Optional new bio
    ///   - avatarUrl: Optional new avatar URL
    /// - Returns: Publisher emitting updated user or error
    func updateProfile(
        firstName: String? = nil,
        lastName: String? = nil,
        bio: String? = nil,
        avatarUrl: String? = nil
    ) -> AnyPublisher<User, Error> {
        guard let currentUser = currentUser else {
            return Fail(error: AuthError.unauthorized).eraseToAnyPublisher()
        }
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(AuthError.unknown))
                return
            }
            
            let avatarURL = avatarUrl.flatMap { URL(string: $0) }
            
            switch currentUser.updateProfile(
                firstName: firstName,
                lastName: lastName,
                bio: bio,
                avatarUrl: avatarURL
            ) {
            case .success:
                self.checkProfileCompletion()
                promise(.success(currentUser))
            case .failure(let error):
                promise(.failure(error))
            }
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    /// Refreshes the current user state from auth service
    /// - Returns: Publisher indicating success or failure of refresh
    func refreshUserState() -> AnyPublisher<Void, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(AuthError.unknown))
                return
            }
            
            self.authService.getCurrentUser()
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            self.error = error
                            promise(.failure(error))
                        }
                    },
                    receiveValue: { user in
                        self.currentUser = user
                        self.checkProfileCompletion()
                        self.saveState()
                        promise(.success(()))
                    }
                )
                .store(in: &self.cancellables)
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func checkProfileCompletion() {
        guard let user = currentUser else {
            isProfileComplete = false
            return
        }
        
        isProfileComplete = !user.firstName.isEmpty &&
                          !user.lastName.isEmpty &&
                          user.bio != nil &&
                          user.avatarUrl != nil
    }
    
    private func saveState() {
        guard let user = currentUser else { return }
        
        stateRestorationQueue.async {
            do {
                let userData = try JSONEncoder().encode(user)
                let _ = KeychainHelper.shared.save(
                    data: userData,
                    service: "com.videocoach.userstore",
                    account: "currentUser",
                    accessibility: .afterFirstUnlock,
                    requiresBiometric: true
                )
            } catch {
                self.error = error
            }
        }
    }
    
    private func restoreState() {
        stateRestorationQueue.async { [weak self] in
            guard let self = self else { return }
            
            let result = KeychainHelper.shared.retrieve(
                service: "com.videocoach.userstore",
                account: "currentUser",
                requiresBiometric: true
            )
            
            switch result {
            case .success(let userData):
                do {
                    let user = try JSONDecoder().decode(User.self, from: userData)
                    DispatchQueue.main.async {
                        self.currentUser = user
                        self.checkProfileCompletion()
                    }
                } catch {
                    DispatchQueue.main.async {
                        self.error = error
                    }
                }
            case .failure(let error):
                DispatchQueue.main.async {
                    self.error = error
                }
            }
        }
    }
}