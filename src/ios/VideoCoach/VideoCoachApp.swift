import SwiftUI

/// Main application entry point for the Video Coaching Platform iOS app
@main
@available(iOS 14.0, *)
struct VideoCoachApp: App {
    // MARK: - State Management
    
    @StateObject private var appStore = AppStore.shared
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    
    // MARK: - Initialization
    
    init() {
        configureAppearance()
        setupAnalytics()
        setupNetworkMonitoring()
    }
    
    // MARK: - Body
    
    var body: some Scene {
        WindowGroup {
            Group {
                switch appStore.state {
                case .authenticated:
                    MainTabView()
                        .environmentObject(appStore)
                        .transition(.opacity)
                        .animation(.easeInOut, value: appStore.state)
                
                case .loading:
                    ProgressView("Loading...")
                        .progressViewStyle(CircularProgressViewStyle())
                        .scaleEffect(1.5)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color(.systemBackground))
                        .transition(.opacity)
                        .animation(.easeInOut, value: appStore.state)
                
                case .unauthenticated:
                    LoginView()
                        .environmentObject(appStore)
                        .transition(.opacity)
                        .animation(.easeInOut, value: appStore.state)
                
                case .error(let message):
                    ErrorView(message: message) {
                        // Retry action
                        appStore.state = .loading
                        // Attempt to restore session or redirect to login
                    }
                    .transition(.opacity)
                    .animation(.easeInOut, value: appStore.state)
                }
            }
            .onChange(of: scenePhase) { newPhase in
                handleScenePhaseChange(newPhase)
            }
            .onChange(of: colorScheme) { _ in
                configureAppearance()
            }
        }
    }
    
    // MARK: - Configuration Methods
    
    private func configureAppearance() {
        // Configure Navigation Bar
        let navigationBarAppearance = UINavigationBarAppearance()
        navigationBarAppearance.configureWithOpaqueBackground()
        navigationBarAppearance.backgroundColor = .systemBackground
        navigationBarAppearance.titleTextAttributes = [
            .font: UIFont.systemFont(ofSize: 17, weight: .semibold)
        ]
        
        UINavigationBar.appearance().standardAppearance = navigationBarAppearance
        UINavigationBar.appearance().compactAppearance = navigationBarAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationBarAppearance
        
        // Configure Tab Bar
        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithOpaqueBackground()
        tabBarAppearance.backgroundColor = .systemBackground
        
        UITabBar.appearance().standardAppearance = tabBarAppearance
        if #available(iOS 15.0, *) {
            UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
        }
        
        // Configure global tint color
        UIView.appearance().tintColor = UIColor.systemBlue
        
        // Configure list appearance
        UITableView.appearance().backgroundColor = .systemBackground
        UITableViewCell.appearance().backgroundColor = .systemBackground
    }
    
    private func setupAnalytics() {
        AnalyticsService.shared.trackEvent(.sessionStart, metadata: [
            "launch_type": "cold_start",
            "os_version": UIDevice.current.systemVersion,
            "device_model": UIDevice.current.model
        ])
    }
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.startMonitoring()
    }
    
    // MARK: - Scene Phase Handling
    
    private func handleScenePhaseChange(_ newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            // App became active
            NetworkMonitor.shared.startMonitoring()
            AnalyticsService.shared.trackEvent(.sessionStart, metadata: [
                "launch_type": "foreground"
            ])
            
        case .inactive:
            // App became inactive
            AnalyticsService.shared.trackEvent(.sessionEnd, metadata: [
                "reason": "inactive"
            ])
            
        case .background:
            // App entered background
            NetworkMonitor.shared.stopMonitoring()
            AnalyticsService.shared.trackEvent(.sessionEnd, metadata: [
                "reason": "background"
            ])
            
        @unknown default:
            break
        }
    }
}