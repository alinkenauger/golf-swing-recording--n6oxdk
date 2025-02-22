//
// CoachViewModel.swift
// VideoCoach
//
// Production-ready ViewModel for managing coach-related business logic and state
// Version: 1.0.0
// Requires: iOS 14.0+
//

import Foundation // iOS 14.0+
import Combine   // iOS 14.0+

/// Represents the possible states of the coach view
@frozen public enum CoachViewState: Equatable {
    case loading
    case loaded(Coach)
    case error(CoachViewModelError)
    case offline(Coach?)
}

/// Custom errors for coach view model operations
@frozen public enum CoachViewModelError: LocalizedError {
    case networkError(Error)
    case validationError(String)
    case unauthorized
    case serverError(Int)
    case persistenceError
    case stateError
    
    public var errorDescription: String? {
        switch self {
        case .networkError(let error): return "Network error: \(error.localizedDescription)"
        case .validationError(let message): return "Validation error: \(message)"
        case .unauthorized: return "Unauthorized access"
        case .serverError(let code): return "Server error: \(code)"
        case .persistenceError: return "Failed to persist data"
        case .stateError: return "Invalid state transition"
        }
    }
}

/// Thread-safe ViewModel managing coach profile data and business logic
@MainActor
@available(iOS 14.0, *)
public final class CoachViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published private(set) var state: CoachViewState = .loading
    @Published private(set) var programs: [Program] = []
    @Published private(set) var earnings: Decimal = 0.0
    @Published private(set) var networkStatus: ConnectionQuality = .unknown
    
    // MARK: - Private Properties
    
    private var cancellables = Set<AnyCancellable>()
    private let stateRestorationManager: StateRestorationManager
    private let analyticsTracker: AnalyticsTracker
    private let networkService: NetworkService
    private let queue = DispatchQueue(label: "com.videocoach.coachviewmodel", qos: .userInitiated)
    
    // Cache configuration
    private let cache = NSCache<NSString, CacheEntry>()
    private let cacheTimeout: TimeInterval = 300 // 5 minutes
    
    // MARK: - Initialization
    
    public init(
        stateManager: StateRestorationManager,
        tracker: AnalyticsTracker,
        networkService: NetworkService = .shared
    ) {
        self.stateRestorationManager = stateManager
        self.analyticsTracker = tracker
        self.networkService = networkService
        
        setupCache()
        setupNetworkMonitoring()
        restorePreviousState()
    }
    
    // MARK: - Public Methods
    
    /// Fetches coach profile with offline support and error handling
    public func fetchCoachProfile(id: String) async throws {
        analyticsTracker.track(event: "coach_profile_fetch_started", properties: ["coach_id": id])
        
        do {
            // Check cache first
            if let cachedProfile = getCachedProfile(for: id) {
                state = .loaded(cachedProfile)
                analyticsTracker.track(event: "coach_profile_loaded_from_cache")
                
                // Refresh in background if online
                if NetworkMonitor.shared.isConnected.value {
                    try await refreshProfile(id: id)
                }
                return
            }
            
            state = .loading
            
            // Make API request
            let profile: Coach = try await networkService.request(
                endpoint: "/api/v1/coaches/\(id)",
                method: .get
            ).value
            
            // Cache the result
            cacheProfile(profile)
            
            // Update state
            state = .loaded(profile)
            analyticsTracker.track(event: "coach_profile_fetch_succeeded")
            
        } catch let error as NetworkError {
            handleNetworkError(error)
            analyticsTracker.track(event: "coach_profile_fetch_failed", properties: ["error": error.localizedDescription])
            throw CoachViewModelError.networkError(error)
            
        } catch {
            state = .error(.networkError(error))
            analyticsTracker.track(event: "coach_profile_fetch_failed", properties: ["error": error.localizedDescription])
            throw CoachViewModelError.networkError(error)
        }
    }
    
    /// Updates coach profile with validation and error handling
    public func updateProfile(_ updatedProfile: Coach) async throws -> Coach {
        analyticsTracker.track(event: "coach_profile_update_started")
        
        do {
            // Validate profile data
            try validateProfile(updatedProfile)
            
            // Make API request
            let updated: Coach = try await networkService.request(
                endpoint: "/api/v1/coaches/\(updatedProfile.id)",
                method: .put,
                body: updatedProfile
            ).value
            
            // Update cache and state
            cacheProfile(updated)
            state = .loaded(updated)
            
            analyticsTracker.track(event: "coach_profile_update_succeeded")
            return updated
            
        } catch let error as NetworkError {
            handleNetworkError(error)
            analyticsTracker.track(event: "coach_profile_update_failed", properties: ["error": error.localizedDescription])
            throw CoachViewModelError.networkError(error)
            
        } catch {
            state = .error(.networkError(error))
            analyticsTracker.track(event: "coach_profile_update_failed", properties: ["error": error.localizedDescription])
            throw CoachViewModelError.networkError(error)
        }
    }
    
    /// Fetches coach earnings with date range filtering
    public func fetchEarnings(startDate: Date, endDate: Date) async throws -> Decimal {
        guard startDate < endDate else {
            throw CoachViewModelError.validationError("Invalid date range")
        }
        
        analyticsTracker.track(event: "coach_earnings_fetch_started")
        
        do {
            let earnings: EarningsResponse = try await networkService.request(
                endpoint: "/api/v1/coaches/earnings",
                method: .get,
                body: EarningsRequest(startDate: startDate, endDate: endDate)
            ).value
            
            self.earnings = earnings.total
            analyticsTracker.track(event: "coach_earnings_fetch_succeeded")
            return earnings.total
            
        } catch {
            analyticsTracker.track(event: "coach_earnings_fetch_failed", properties: ["error": error.localizedDescription])
            throw CoachViewModelError.networkError(error)
        }
    }
    
    // MARK: - Private Methods
    
    private func setupCache() {
        cache.countLimit = 100
        cache.totalCostLimit = 50_000_000 // 50MB
    }
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.connectionQuality
            .receive(on: DispatchQueue.main)
            .sink { [weak self] quality in
                self?.handleNetworkQualityChange(quality)
            }
            .store(in: &cancellables)
    }
    
    private func handleNetworkQualityChange(_ quality: ConnectionQuality) {
        networkStatus = quality
        
        if case .loaded(let coach) = state, quality == .poor {
            // Cache aggressively in poor network conditions
            cacheProfile(coach)
        }
    }
    
    private func restorePreviousState() {
        if let restored = stateRestorationManager.restoreState(forKey: "coachViewModel") as? Coach {
            state = .loaded(restored)
            analyticsTracker.track(event: "coach_state_restored")
        }
    }
    
    private func validateProfile(_ profile: Coach) throws {
        guard !profile.specialties.isEmpty else {
            throw CoachViewModelError.validationError("Specialties cannot be empty")
        }
        
        guard profile.hourlyRate > 0 else {
            throw CoachViewModelError.validationError("Invalid hourly rate")
        }
        
        guard !profile.availability.isEmpty else {
            throw CoachViewModelError.validationError("Availability schedule required")
        }
    }
    
    private func handleNetworkError(_ error: NetworkError) {
        switch error {
        case .unauthorized:
            state = .error(.unauthorized)
        case .serverError(let code, _):
            state = .error(.serverError(code))
        case .noInternet:
            if case .loaded(let coach) = state {
                state = .offline(coach)
            } else {
                state = .offline(nil)
            }
        default:
            state = .error(.networkError(error))
        }
    }
    
    private func refreshProfile(id: String) async throws {
        let profile: Coach = try await networkService.request(
            endpoint: "/api/v1/coaches/\(id)",
            method: .get
        ).value
        
        cacheProfile(profile)
        state = .loaded(profile)
    }
    
    private func cacheProfile(_ profile: Coach) {
        let entry = CacheEntry(profile: profile, timestamp: Date())
        cache.setObject(entry, forKey: profile.id as NSString)
        
        // Persist for offline access
        try? stateRestorationManager.saveState(profile, forKey: "coachViewModel")
    }
    
    private func getCachedProfile(for id: String) -> Coach? {
        guard let entry = cache.object(forKey: id as NSString),
              Date().timeIntervalSince(entry.timestamp) < cacheTimeout else {
            return nil
        }
        return entry.profile
    }
}

// MARK: - Supporting Types

private final class CacheEntry {
    let profile: Coach
    let timestamp: Date
    
    init(profile: Coach, timestamp: Date) {
        self.profile = profile
        self.timestamp = timestamp
    }
}

private struct EarningsRequest: Encodable {
    let startDate: Date
    let endDate: Date
}

private struct EarningsResponse: Decodable {
    let total: Decimal
    let breakdown: [String: Decimal]
}