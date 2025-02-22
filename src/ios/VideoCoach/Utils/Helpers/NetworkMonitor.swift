//
// NetworkMonitor.swift
// VideoCoach
//
// A comprehensive network monitoring utility that provides real-time connectivity status
// updates, connection quality metrics, and interface type detection.
//
// External Dependencies:
// - Foundation: iOS 14.0+
// - Network: iOS 14.0+
// - Combine: iOS 14.0+

import Foundation
import Network
import Combine

/// Defines the types of network connections available
public enum ConnectionType {
    case wifi
    case cellular
    case ethernet
    case vpn
    case unknown
}

/// Defines the quality levels for network connections
public enum ConnectionQuality {
    case excellent
    case good
    case fair
    case poor
    case unknown
}

/// A thread-safe singleton class that provides comprehensive network connectivity monitoring
@available(iOS 14.0, *)
public final class NetworkMonitor {
    
    // MARK: - Singleton Instance
    
    /// Shared instance for network monitoring
    public static let shared = NetworkMonitor()
    
    // MARK: - Private Properties
    
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "NetworkMonitor", qos: .utility)
    private var cancellables = Set<AnyCancellable>()
    private var updateTimer: Timer?
    private var isBackgroundMode: Bool = false
    
    // MARK: - Public Properties
    
    /// Current connection status publisher
    public private(set) var isConnected = CurrentValueSubject<Bool, Never>(false)
    
    /// Current connection type publisher
    public private(set) var connectionType = CurrentValueSubject<ConnectionType, Never>(.unknown)
    
    /// Current connection quality publisher
    public private(set) var connectionQuality = CurrentValueSubject<ConnectionQuality, Never>(.unknown)
    
    // MARK: - Initialization
    
    private init() {
        monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.handlePathUpdate(path)
        }
        
        // Setup background mode notification handling
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                self?.handleBackgroundTransition(true)
            }
            .store(in: &cancellables)
        
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                self?.handleBackgroundTransition(false)
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Public Methods
    
    /// Starts network monitoring with intelligent update frequency
    public func startMonitoring() {
        monitor.start(queue: queue)
        setupUpdateTimer()
    }
    
    /// Safely stops network monitoring and cleans up resources
    public func stopMonitoring() {
        monitor.cancel()
        updateTimer?.invalidate()
        updateTimer = nil
        cancellables.removeAll()
        
        // Reset status
        isConnected.send(false)
        connectionType.send(.unknown)
        connectionQuality.send(.unknown)
    }
    
    // MARK: - Private Methods
    
    private func handlePathUpdate(_ path: NWPath) {
        queue.async { [weak self] in
            guard let self = self else { return }
            
            // Update connection status
            self.isConnected.send(path.status == .satisfied)
            
            // Update connection type
            self.connectionType.send(self.getConnectionType(path))
            
            // Update connection quality
            self.connectionQuality.send(self.assessConnectionQuality(path))
        }
    }
    
    private func getConnectionType(_ path: NWPath) -> ConnectionType {
        if path.usesInterfaceType(.vpn) {
            return .vpn
        }
        
        if path.usesInterfaceType(.wifi) {
            return .wifi
        }
        
        if path.usesInterfaceType(.cellular) {
            return .cellular
        }
        
        if path.usesInterfaceType(.wiredEthernet) {
            return .ethernet
        }
        
        return .unknown
    }
    
    private func assessConnectionQuality(_ path: NWPath) -> ConnectionQuality {
        // Base quality assessment on multiple factors
        var qualityScore = 0
        
        // Check interface type
        switch getConnectionType(path) {
        case .ethernet, .vpn:
            qualityScore += 4
        case .wifi:
            qualityScore += 3
        case .cellular:
            qualityScore += 2
        case .unknown:
            qualityScore += 0
        }
        
        // Check path status
        if path.status == .satisfied {
            qualityScore += 2
        }
        
        // Check for constrained path
        if path.isConstrained {
            qualityScore -= 1
        }
        
        // Check for expensive path
        if path.isExpensive {
            qualityScore -= 1
        }
        
        // Return quality based on score
        switch qualityScore {
        case 5...:
            return .excellent
        case 4:
            return .good
        case 3:
            return .fair
        case 1...2:
            return .poor
        default:
            return .unknown
        }
    }
    
    private func handleBackgroundTransition(_ isBackground: Bool) {
        queue.async { [weak self] in
            guard let self = self else { return }
            self.isBackgroundMode = isBackground
            self.setupUpdateTimer()
        }
    }
    
    private func setupUpdateTimer() {
        updateTimer?.invalidate()
        
        let interval = isBackgroundMode ? 30.0 : 5.0
        updateTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.handlePathUpdate(self.monitor.currentPath)
        }
    }
}