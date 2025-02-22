import SwiftUI
import Combine

/// A SwiftUI view that implements the explore/discovery screen of the Video Coaching Platform
@available(iOS 14.0, *)
@MainActor
struct ExploreView: View {
    // MARK: - View Model
    
    @StateObject private var viewModel = CoachViewModel(
        stateManager: StateRestorationManager.shared,
        tracker: AnalyticsTracker.shared
    )
    
    // MARK: - State
    
    @State private var searchText: String = ""
    @State private var selectedFilters: Set<FilterOption> = []
    @State private var selectedSpecialties: Set<String> = []
    @State private var priceRange: ClosedRange<Decimal> = 0...500
    @State private var isRefreshing: Bool = false
    
    // MARK: - Search Debouncing
    
    private let searchPublisher = CurrentValueSubject<String, Never>("")
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Constants
    
    private let gridColumns = [
        GridItem(.adaptive(minimum: 300, maximum: 400), spacing: UIConfig.spacing["medium"])
    ]
    private let filterSpacing: CGFloat = UIConfig.spacing["small"] ?? 8.0
    private let contentPadding: CGFloat = UIConfig.spacing["medium"] ?? 16.0
    
    // MARK: - Initialization
    
    init() {
        setupSearchDebounce()
    }
    
    // MARK: - Body
    
    var body: some View {
        NavigationView {
            VStack(spacing: contentPadding) {
                // Filter Section
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: filterSpacing) {
                        ForEach(FilterOption.allCases) { filter in
                            FilterChip(
                                title: filter.rawValue.capitalized,
                                isSelected: selectedFilters.contains(filter),
                                action: { toggleFilter(filter) }
                            )
                        }
                    }
                    .padding(.horizontal, contentPadding)
                }
                .accessibilityLabel("Filter options")
                
                // Specialty Filter
                if selectedFilters.contains(.specialties) {
                    SpecialtyPicker(
                        selectedSpecialties: $selectedSpecialties
                    )
                    .transition(.opacity)
                }
                
                // Price Range Filter
                if selectedFilters.contains(.priceRange) {
                    PriceRangeSlider(
                        range: $priceRange,
                        bounds: 0...1000
                    )
                    .transition(.opacity)
                }
                
                // Coach List
                ScrollView {
                    LazyVGrid(columns: gridColumns, spacing: contentPadding) {
                        ForEach(filterCoaches(viewModel.coaches), id: \.id) { coach in
                            CoachCard(coach: coach) {
                                navigateToCoachProfile(coach)
                            }
                            .accessibilityElement(children: .combine)
                            .accessibilityAddTraits(.isButton)
                        }
                    }
                    .padding(contentPadding)
                }
                .refreshable {
                    await refreshData()
                }
            }
            .navigationTitle("Explore")
            .searchable(
                text: $searchText,
                placement: .navigationBarDrawer,
                prompt: "Search coaches by name or specialty"
            )
            .overlay {
                if viewModel.state == .loading {
                    ProgressView()
                        .scaleEffect(1.5)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.opacity(0.1))
                }
            }
            .alert(
                "Error",
                isPresented: Binding(
                    get: { viewModel.state == .error },
                    set: { _ in }
                ),
                actions: {
                    Button("Retry") {
                        Task {
                            await viewModel.fetchCoaches()
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                },
                message: {
                    Text("Failed to load coaches. Please try again.")
                }
            )
        }
    }
    
    // MARK: - Helper Methods
    
    private func setupSearchDebounce() {
        searchPublisher
            .debounce(for: .seconds(SearchConstants.debounceInterval), scheduler: DispatchQueue.main)
            .removeDuplicates()
            .sink { [weak viewModel] query in
                guard let viewModel = viewModel else { return }
                Task {
                    await viewModel.searchCoaches(query: query)
                }
            }
            .store(in: &cancellables)
    }
    
    private func filterCoaches(_ coaches: [Coach]) -> [Coach] {
        var filtered = coaches
        
        // Apply search filter
        if !searchText.isEmpty {
            filtered = filtered.filter { coach in
                let searchQuery = searchText.lowercased()
                return coach.fullName.lowercased().contains(searchQuery) ||
                       coach.specialties.contains { $0.lowercased().contains(searchQuery) }
            }
        }
        
        // Apply specialty filter
        if !selectedSpecialties.isEmpty {
            filtered = filtered.filter { coach in
                !Set(coach.specialties).isDisjoint(with: selectedSpecialties)
            }
        }
        
        // Apply price range filter
        filtered = filtered.filter { coach in
            priceRange.contains(coach.hourlyRate)
        }
        
        // Apply verification filter
        if selectedFilters.contains(.verified) {
            filtered = filtered.filter { $0.verificationStatus == .verified }
        }
        
        // Sort by rating if selected
        if selectedFilters.contains(.rating) {
            filtered.sort { $0.rating > $1.rating }
        }
        
        return filtered
    }
    
    private func toggleFilter(_ filter: FilterOption) {
        withAnimation {
            if selectedFilters.contains(filter) {
                selectedFilters.remove(filter)
            } else {
                selectedFilters.insert(filter)
            }
        }
    }
    
    private func navigateToCoachProfile(_ coach: Coach) {
        // Navigation implementation would go here
    }
    
    private func refreshData() async {
        isRefreshing = true
        await viewModel.refreshData()
        isRefreshing = false
    }
}

// MARK: - Supporting Views

@available(iOS 14.0, *)
private struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(isSelected ? Color.blue : Color.gray.opacity(0.1))
                )
                .foregroundColor(isSelected ? .white : .primary)
        }
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
    }
}

// MARK: - Preview Provider

@available(iOS 14.0, *)
struct ExploreView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ExploreView()
                .previewDisplayName("Light Mode")
            
            ExploreView()
                .preferredColorScheme(.dark)
                .previewDisplayName("Dark Mode")
            
            ExploreView()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Large Dynamic Type")
        }
    }
}

// MARK: - Supporting Types

private enum FilterOption: String, CaseIterable, Identifiable {
    case verified = "Verified"
    case specialties = "Specialties"
    case priceRange = "Price"
    case rating = "Top Rated"
    
    var id: String { rawValue }
}

private struct SearchConstants {
    static let debounceInterval: TimeInterval = 0.3
}