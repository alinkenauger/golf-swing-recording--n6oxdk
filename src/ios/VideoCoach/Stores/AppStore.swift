//
// AppStore.swift
// VideoCoach
//
// Central state management store for the Video Coaching Platform iOS app
// Version: 1.0.0
// Requires: iOS 14.0+
//

import Foundation
import Combine
import SwiftUI
import OSLog

/// Global application state enumeration
public enum AppState: Equatable {
    case loading
    case authenticated
    case unauthenticated
    case error(String)
}

/// Application error types
private enum AppError: LocalizedError {
    case initialization
    case stateRestoration
    case authentication
    case networkFailure
    case persistence
    
    var errorDescription: String? {
        switch self {
        case .initialization:
            return "Failed to initialize application state"
        case .stateRestoration:
            return "Failed to restore application state"
        case .authentication:
            return "Authentication error occurred"
        case .networkFailure:
            return "Network connection error"
        case .persistence:
            return "Failed to persist application state"
        }
    }
}

/// Main application state store implementing ObservableObject for SwiftUI state management
@available(iOS 14.0, *)
@MainActor
public final class AppStore: ObservableObject {
    
    // MARK: - Singleton
    
    public static let shared = AppStore()
    
    // MARK: - Published Properties
    
    @Published private(set) var state: AppState = .loading
    @Published private(set) var currentUser: User?
    @Published private(set) var networkQuality: NetworkQuality = .high
    @Published private(set) var lastError: Error?
    @Published private(set) var isInitialized: Bool = false
    
    // MARK: - Private Properties
    
    private let authService: AuthService
    private let networkService: NetworkService
    private let logger: Logger
    private let stateQueue: DispatchQueue
    private var cancellables = Set<AnyCancellable>()
    private let stateRestorationInterval: TimeInterval = 300 // 5 minutes
    
    // MARK: - Initialization
    
    private init() {
        self.authService = AuthService.shared
        self.networkService = NetworkService.shared
        self.logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.videocoach",
                           category: "AppStore")
        self.stateQueue = DispatchQueue(label: "com.videocoach.appstore",
                                      qos: .userInitiated)
        
        setupObservers()
        setupStateRestoration()
        monitorNetworkQuality()
    }
    
    // MARK: - Public Methods
    
    /// Handles user login with enhanced error handling and state management
    /// - Parameters:
    ///   - email: User's email address
    ///   - password: User's password
    /// - Returns: Publisher indicating login success or failure
    public func login(email: String, password: String) -> AnyPublisher<Void, Error> {
        state = .loading
        
        return authService.login(email: email, password: password)
            .handleEvents(
                receiveSubscription: { [weak self] _ in
                    self?.logger.info("Login attempt initiated for email: \(email)")
                },
                receiveOutput: { [weak self] user in
                    self?.handleSuccessfulLogin(user)
                },
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.handleLoginError(error)
                    }
                }
            )
            .map { _ in () }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    /// Handles user logout with comprehensive cleanup
    /// - Returns: Publisher indicating logout completion
    public func logout() -> AnyPublisher<Void, Never> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.success(()))
                return
            }
            
            self.logger.info("Initiating user logout")
            
            // Perform cleanup operations
            self.stateQueue.async {
                // Clear user data
                self.currentUser = nil
                
                // Reset network monitoring
                self.networkQuality = .high
                
                // Clear auth state
                self.authService.logout()
                
                // Update app state
                DispatchQueue.main.async {
                    self.state = .unauthenticated
                    self.logger.info("Logout completed successfully")
                    promise(.success(()))
                }
            }
        }
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupObservers() {
        // Monitor authentication state
        authService.authStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] authState in
                self?.handleAuthStateChange(authState)
            }
            .store(in: &cancellables)
        
        // Monitor network quality
        NetworkMonitor.shared.connectionQuality
            .receive(on: DispatchQueue.main)
            .sink { [weak self] quality in
                self?.handleNetworkQualityChange(quality)
            }
            .store(in: &cancellables)
    }
    
    private func setupStateRestoration() {
        // Periodically save state for recovery
        Timer.publish(every: stateRestorationInterval, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.persistCurrentState()
            }
            .store(in: &cancellables)
    }
    
    private func monitorNetworkQuality() {
        NetworkMonitor.shared.startMonitoring()
    }
    
    private func handleSuccessfulLogin(_ user: User) {
        stateQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.currentUser = user
            
            DispatchQueue.main.async {
                self.state = .authenticated
                self.isInitialized = true
                self.logger.info("User successfully logged in: \(user.id)")
            }
        }
    }
    
    private func handleLoginError(_ error: Error) {
        logger.error("Login failed: \(error.localizedDescription)")
        lastError = error
        state = .error(error.localizedDescription)
    }
    
    private func handleAuthStateChange(_ authState: AuthState) {
        switch authState {
        case .authenticated:
            state = .authenticated
        case .unauthenticated:
            state = .unauthenticated
        case .refreshing:
            state = .loading
        case .error(let error):
            state = .error(error.localizedDescription)
            lastError = error
        }
    }
    
    private func handleNetworkQualityChange(_ quality: ConnectionQuality) {
        switch quality {
        case .excellent, .good:
            networkQuality = .high
        case .fair:
            networkQuality = .medium
        case .poor:
            networkQuality = .low
        case .unknown:
            networkQuality = .unavailable
        }
    }
    
    private func persistCurrentState() {
        stateQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                // Persist relevant state data
                if let user = self.currentUser {
                    let userData = try JSONEncoder().encode(user)
                    UserDefaults.standard.set(userData, forKey: "currentUser")
                }
                
                self.logger.debug("Application state persisted successfully")
            } catch {
                self.logger.error("Failed to persist application state: \(error.localizedDescription)")
                self.lastError = AppError.persistence
            }
        }
    }
}

// MARK: - Error Handling Extension

@available(iOS 14.0, *)
private extension AppStore {
    func handleError(_ error: Error) {
        logger.error("AppStore error: \(error.localizedDescription)")
        
        lastError = error
        
        if let authError = error as? AuthError {
            switch authError {
            case .tokenExpired, .refreshFailed:
                state = .unauthenticated
            default:
                state = .error(authError.localizedDescription)
            }
        } else {
            state = .error(error.localizedDescription)
        }
    }
}