import SwiftUI

/// Main tab bar view controller managing primary navigation for the Video Coaching Platform iOS app
@available(iOS 14.0, *)
@MainActor
struct MainTabView: View {
    // MARK: - State
    
    @State private var selectedTab: TabSelection = .home
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.sizeCategory) var sizeCategory
    @Environment(\.scenePhase) var scenePhase
    
    // MARK: - Body
    
    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(TabSelection.home)
                .accessibilityLabel("Home tab")
            
            ExploreView()
                .tabItem {
                    Label("Explore", systemImage: "magnifyingglass")
                }
                .tag(TabSelection.explore)
                .accessibilityLabel("Explore coaches tab")
            
            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.fill")
                }
                .tag(TabSelection.profile)
                .accessibilityLabel("Profile tab")
        }
        .onAppear {
            // Configure initial tab bar appearance
            let appearance = tabBarAppearance()
            UITabBar.appearance().standardAppearance = appearance
            if #available(iOS 15.0, *) {
                UITabBar.appearance().scrollEdgeAppearance = appearance
            }
            
            // Restore previous tab selection
            restoreState()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .inactive {
                storeState()
            }
        }
        .onChange(of: colorScheme) { _ in
            // Update tab bar appearance when color scheme changes
            UITabBar.appearance().standardAppearance = tabBarAppearance()
        }
        .onChange(of: sizeCategory) { _ in
            // Update tab bar appearance when dynamic type size changes
            UITabBar.appearance().standardAppearance = tabBarAppearance()
        }
        // Voice control commands
        .accessibilityAction(named: "Switch to Home") {
            selectedTab = .home
        }
        .accessibilityAction(named: "Switch to Explore") {
            selectedTab = .explore
        }
        .accessibilityAction(named: "Switch to Profile") {
            selectedTab = .profile
        }
    }
    
    // MARK: - Helper Methods
    
    /// Configures tab bar appearance based on current theme and accessibility settings
    private func tabBarAppearance() -> UITabBarAppearance {
        let appearance = UITabBarAppearance()
        
        // Configure background colors
        if colorScheme == .dark {
            appearance.backgroundColor = UIColor.systemBackground
        } else {
            appearance.backgroundColor = .systemBackground
        }
        
        // Configure selection indicators
        let selection = UITabBarItemAppearance()
        selection.selected.iconColor = .systemBlue
        selection.selected.titleTextAttributes = [
            .foregroundColor: UIColor.systemBlue,
            .font: UIFont.preferredFont(forTextStyle: .caption1)
        ]
        
        // Configure unselected state
        selection.normal.iconColor = .secondaryLabel
        selection.normal.titleTextAttributes = [
            .foregroundColor: UIColor.secondaryLabel,
            .font: UIFont.preferredFont(forTextStyle: .caption1)
        ]
        
        // Apply configurations
        appearance.stackedLayoutAppearance = selection
        appearance.inlineLayoutAppearance = selection
        appearance.compactInlineLayoutAppearance = selection
        
        return appearance
    }
    
    /// Stores current tab selection to UserDefaults
    private func storeState() {
        UserDefaults.standard.set(selectedTab.rawValue, forKey: "selectedTab")
    }
    
    /// Restores previous tab selection from UserDefaults
    private func restoreState() {
        if let storedValue = UserDefaults.standard.object(forKey: "selectedTab") as? Int,
           let restoredTab = TabSelection(rawValue: storedValue) {
            selectedTab = restoredTab
        }
    }
}

// MARK: - Tab Selection Enum

/// Represents the available tab selections
enum TabSelection: Int, CaseIterable {
    case home = 0
    case explore
    case profile
}

// MARK: - Preview Provider

@available(iOS 14.0, *)
struct MainTabView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Light mode preview
            MainTabView()
                .previewDisplayName("Light Mode")
            
            // Dark mode preview
            MainTabView()
                .preferredColorScheme(.dark)
                .previewDisplayName("Dark Mode")
            
            // Different tab selections
            MainTabView()
                .onAppear {
                    UserDefaults.standard.set(TabSelection.explore.rawValue, forKey: "selectedTab")
                }
                .previewDisplayName("Explore Tab Selected")
            
            // Dynamic type variations
            MainTabView()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Large Dynamic Type")
        }
    }
}