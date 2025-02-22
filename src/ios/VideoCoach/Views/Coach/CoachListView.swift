import SwiftUI
import Combine

@available(iOS 14.0, *)
struct CoachListView: View {
    // MARK: - View Model
    @StateObject private var viewModel = CoachViewModel(
        stateManager: StateRestorationManager.shared,
        tracker: AnalyticsTracker.shared
    )
    
    // MARK: - State Properties
    @State private var searchText: String = ""
    @State private var selectedSort: SortOption = .relevance
    @State private var selectedFilters: Set<FilterOption> = []
    @State private var showFilters: Bool = false
    @State private var isRefreshing: Bool = false
    @State private var scrollOffset: CGFloat = 0
    
    // MARK: - Environment Properties
    @Environment(\.sizeCategory) private var sizeCategory
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    
    // MARK: - Constants
    private let gridColumns = [
        GridItem(.adaptive(minimum: 300, maximum: 400), spacing: UIConfig.spacing["medium"])
    ]
    
    // MARK: - Body
    var body: some View {
        NavigationView {
            ZStack {
                // Background
                Color(colorScheme == .dark ? .systemBackground : .secondarySystemBackground)
                    .ignoresSafeArea()
                
                // Main Content
                VStack(spacing: 0) {
                    // Search Bar
                    searchBar
                        .padding(.horizontal, UIConfig.spacing["medium"])
                        .padding(.vertical, UIConfig.spacing["small"])
                    
                    // Filters Bar
                    filterBar
                        .padding(.horizontal, UIConfig.spacing["medium"])
                    
                    // Coach List
                    ScrollView {
                        LazyVGrid(columns: gridColumns, spacing: UIConfig.spacing["medium"]) {
                            ForEach(filteredCoaches) { coach in
                                CoachCard(coach: coach) {
                                    handleCoachSelection(coach)
                                }
                                .accessibilityElement(children: .combine)
                                .accessibilityLabel(getAccessibilityLabel(for: coach))
                                .accessibilityHint("Double tap to view coach profile")
                            }
                        }
                        .padding(UIConfig.spacing["medium"])
                    }
                    .refreshable {
                        await handleRefresh()
                    }
                }
                
                // Loading & Error States
                if case .loading = viewModel.state {
                    ProgressView()
                        .scaleEffect(1.5)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.opacity(0.1))
                }
                
                if case .error(let error) = viewModel.state {
                    ErrorView(error: error) {
                        Task {
                            await viewModel.fetchCoaches()
                        }
                    }
                }
                
                // Offline Banner
                if viewModel.networkStatus == .poor {
                    OfflineBanner()
                        .transition(.move(edge: .top))
                }
            }
            .navigationTitle("Find a Coach")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    filterButton
                }
            }
        }
        .sheet(isPresented: $showFilters) {
            FilterSheet(
                selectedFilters: $selectedFilters,
                availableSpecialties: getAvailableSpecialties()
            )
            .accessibilityIdentifier("coachFiltersSheet")
        }
        .task {
            await viewModel.fetchCoaches()
        }
    }
    
    // MARK: - Computed Properties
    private var filteredCoaches: [Coach] {
        var coaches = viewModel.coaches
        
        // Apply search filter
        if !searchText.isEmpty {
            coaches = coaches.filter { coach in
                coach.fullName.localizedCaseInsensitiveContains(searchText) ||
                coach.specialties.contains { $0.localizedCaseInsensitiveContains(searchText) }
            }
        }
        
        // Apply selected filters
        for filter in selectedFilters {
            switch filter {
            case .specialty(let specialties):
                coaches = coaches.filter { coach in
                    !Set(coach.specialties).isDisjoint(with: Set(specialties))
                }
            case .priceRange(let range):
                coaches = coaches.filter { coach in
                    range.contains(coach.hourlyRate)
                }
            case .availability(let status):
                coaches = coaches.filter { $0.availability == status }
            case .rating(let minimum):
                coaches = coaches.filter { $0.rating >= minimum }
            }
        }
        
        // Apply sorting
        switch selectedSort {
        case .rating:
            coaches.sort { $0.rating > $1.rating }
        case .price:
            coaches.sort { $0.hourlyRate < $1.hourlyRate }
        case .experience:
            coaches.sort { $0.experience > $1.experience }
        case .availability:
            coaches.sort { $0.availability.count > $1.availability.count }
        case .relevance:
            // Complex relevance sorting algorithm
            coaches.sort { coach1, coach2 in
                let score1 = calculateRelevanceScore(coach1)
                let score2 = calculateRelevanceScore(coach2)
                return score1 > score2
            }
        }
        
        return coaches
    }
    
    // MARK: - Subviews
    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            
            TextField("Search by name or specialty", text: $searchText)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .autocapitalization(.none)
                .disableAutocorrection(true)
                .accessibilityLabel("Search coaches")
            
            if !searchText.isEmpty {
                Button(action: { searchText = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .accessibilityLabel("Clear search")
            }
        }
    }
    
    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: UIConfig.spacing["small"]) {
                Menu {
                    ForEach(SortOption.allCases, id: \.self) { option in
                        Button {
                            selectedSort = option
                        } label: {
                            Label(option.description, systemImage: option.iconName)
                        }
                    }
                } label: {
                    Label("Sort: \(selectedSort.description)", systemImage: "arrow.up.arrow.down")
                        .padding(.horizontal, UIConfig.spacing["small"])
                        .padding(.vertical, UIConfig.spacing["xsmall"])
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(UIConfig.cornerRadius)
                }
                
                ForEach(Array(selectedFilters), id: \.self) { filter in
                    FilterChip(filter: filter) {
                        selectedFilters.remove(filter)
                    }
                }
            }
            .padding(.vertical, UIConfig.spacing["small"])
        }
    }
    
    private var filterButton: some View {
        Button {
            showFilters = true
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .accessibilityLabel("Filter coaches")
        }
    }
    
    // MARK: - Helper Methods
    private func handleRefresh() async {
        isRefreshing = true
        await viewModel.refreshCoaches()
        isRefreshing = false
    }
    
    private func handleCoachSelection(_ coach: Coach) {
        // Analytics tracking
        viewModel.analyticsTracker.track(
            event: "coach_selected",
            properties: ["coach_id": coach.id]
        )
        
        // Navigation handling will be implemented by parent view
    }
    
    private func calculateRelevanceScore(_ coach: Coach) -> Double {
        var score: Double = 0
        
        // Base score from rating
        score += coach.rating * 2
        
        // Experience bonus
        score += Double(min(coach.experience, 10)) / 2
        
        // Availability bonus
        score += Double(coach.availability.count) / 10
        
        // Search relevance
        if !searchText.isEmpty {
            if coach.fullName.localizedCaseInsensitiveContains(searchText) {
                score += 5
            }
            if coach.specialties.contains(where: { $0.localizedCaseInsensitiveContains(searchText) }) {
                score += 3
            }
        }
        
        return score
    }
    
    private func getAvailableSpecialties() -> [String] {
        // Get unique specialties from all coaches
        return Array(Set(viewModel.coaches.flatMap { $0.specialties })).sorted()
    }
    
    private func getAccessibilityLabel(for coach: Coach) -> String {
        return """
        \(coach.fullName), \
        \(coach.specialties.joined(separator: ", ")), \
        \(String(format: "%.1f stars", coach.rating)), \
        \(coach.experience) years experience, \
        \(formatPrice(coach.hourlyRate)) per hour
        """
    }
    
    private func formatPrice(_ price: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale.current
        return formatter.string(from: price as NSNumber) ?? "$\(price)"
    }
}

// MARK: - Supporting Types
private enum SortOption: CaseIterable {
    case rating, price, experience, availability, relevance
    
    var description: String {
        switch self {
        case .rating: return "Rating"
        case .price: return "Price"
        case .experience: return "Experience"
        case .availability: return "Availability"
        case .relevance: return "Relevance"
        }
    }
    
    var iconName: String {
        switch self {
        case .rating: return "star.fill"
        case .price: return "dollarsign.circle"
        case .experience: return "clock"
        case .availability: return "calendar"
        case .relevance: return "sparkles"
        }
    }
}

private enum FilterOption: Hashable {
    case specialty([String])
    case priceRange(ClosedRange<Decimal>)
    case availability(AvailabilityStatus)
    case rating(Double)
}

// MARK: - Preview Provider
@available(iOS 14.0, *)
struct CoachListView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Light mode preview
            CoachListView()
                .previewDisplayName("Light Mode")
            
            // Dark mode preview
            CoachListView()
                .preferredColorScheme(.dark)
                .previewDisplayName("Dark Mode")
            
            // Large Dynamic Type preview
            CoachListView()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Large Dynamic Type")
        }
    }
}