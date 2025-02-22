//
// CoachProfileView.swift
// VideoCoach
//
// A comprehensive SwiftUI view for displaying and managing coach profiles
// with enhanced accessibility, offline support, and progressive loading.
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI      // iOS 14.0+
import Combine      // iOS 14.0+
import Network      // iOS 14.0+

@available(iOS 14.0, *)
public struct CoachProfileView: View {
    // MARK: - View Model
    
    @StateObject private var viewModel: CoachViewModel
    
    // MARK: - State Properties
    
    private let coachId: String
    @State private var isEditMode: Bool = false
    @State private var showSubscriptionSheet: Bool = false
    @State private var isRefreshing: Bool = false
    @State private var errorMessage: String?
    @Environment(\.colorScheme) private var colorScheme
    
    // MARK: - Constants
    
    private let spacing = UIConfig.spacing
    private let cornerRadius = UIConfig.cornerRadius
    private let animation = Animation.easeInOut(duration: UIConfig.animationDuration)
    
    // MARK: - Initialization
    
    public init(coachId: String) {
        self.coachId = coachId
        _viewModel = StateObject(wrappedValue: CoachViewModel(
            stateManager: StateRestorationManager.shared,
            tracker: AnalyticsTracker.shared
        ))
    }
    
    // MARK: - Body
    
    public var body: some View {
        ScrollView {
            LazyVStack(spacing: spacing["medium"]) {
                // Profile Header
                profileHeader
                    .accessibility(label: Text("Coach Profile Header"))
                
                // Network Status Banner
                if case .offline = viewModel.state {
                    offlineBanner
                }
                
                // Main Content
                Group {
                    switch viewModel.state {
                    case .loading:
                        loadingView
                    case .loaded(let coach):
                        mainContent(coach)
                    case .error(let error):
                        errorView(error)
                    case .offline(let coach):
                        mainContent(coach)
                            .opacity(0.8)
                    }
                }
                .animation(animation, value: viewModel.state)
            }
            .padding(spacing["medium"])
        }
        .refreshable {
            await refreshContent()
        }
        .navigationTitle("Coach Profile")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            toolbarItems
        }
        .sheet(isPresented: $showSubscriptionSheet) {
            subscriptionSheet
        }
        .task {
            await loadProfile()
        }
        .onChange(of: NetworkMonitor.shared.isConnected.value) { isConnected in
            if isConnected {
                Task {
                    await loadProfile()
                }
            }
        }
    }
    
    // MARK: - Content Views
    
    private var profileHeader: some View {
        VStack(spacing: spacing["small"]) {
            if let coach = viewModel.coach {
                AsyncImage(url: coach.avatarUrl) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Image(systemName: "person.circle.fill")
                        .resizable()
                }
                .frame(width: 120, height: 120)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.primary.opacity(0.2), lineWidth: 2))
                .accessibility(label: Text("Coach Profile Picture"))
                
                Text(coach.fullName)
                    .font(.title2)
                    .fontWeight(.bold)
                    .accessibility(label: Text("Coach Name"))
                
                if let bio = coach.bio {
                    Text(bio)
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .foregroundColor(.secondary)
                        .padding(.horizontal)
                        .accessibility(label: Text("Coach Biography"))
                }
            }
        }
    }
    
    private func mainContent(_ coach: Coach?) -> some View {
        VStack(spacing: spacing["large"]) {
            // Specialties Section
            specialtiesSection(coach?.specialties ?? [])
            
            // Certifications Section
            certificationsSection(coach?.certifications ?? [])
            
            // Experience & Rates Section
            experienceSection(coach)
            
            // Availability Section
            availabilitySection(coach?.availability ?? [:])
            
            // Stats Section
            statsSection(coach)
        }
    }
    
    private func specialtiesSection(_ specialties: [String]) -> some View {
        VStack(alignment: .leading, spacing: spacing["small"]) {
            sectionHeader("Specialties")
            
            FlowLayout(spacing: spacing["xsmall"]) {
                ForEach(specialties, id: \.self) { specialty in
                    Text(specialty)
                        .font(.subheadline)
                        .padding(.horizontal, spacing["small"])
                        .padding(.vertical, spacing["xsmall"])
                        .background(Color.accentColor.opacity(0.1))
                        .cornerRadius(cornerRadius)
                        .accessibility(label: Text("Specialty: \(specialty)"))
                }
            }
        }
        .cardStyle()
    }
    
    private func certificationsSection(_ certifications: [Certification]) -> some View {
        VStack(alignment: .leading, spacing: spacing["small"]) {
            sectionHeader("Certifications")
            
            ForEach(certifications, id: \.name) { cert in
                HStack {
                    VStack(alignment: .leading) {
                        Text(cert.name)
                            .font(.headline)
                        Text(cert.issuer)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                    
                    if cert.isValid {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundColor(.green)
                            .accessibility(label: Text("Valid Certification"))
                    }
                }
                .padding()
                .background(Color.secondary.opacity(0.1))
                .cornerRadius(cornerRadius)
            }
        }
        .cardStyle()
    }
    
    private func experienceSection(_ coach: Coach?) -> some View {
        VStack(alignment: .leading, spacing: spacing["small"]) {
            sectionHeader("Experience & Rates")
            
            HStack(spacing: spacing["large"]) {
                VStack {
                    Text("\(coach?.experience ?? 0)")
                        .font(.title)
                        .fontWeight(.bold)
                    Text("Years")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Divider()
                
                VStack {
                    Text("$\(coach?.hourlyRate ?? 0, specifier: "%.2f")")
                        .font(.title)
                        .fontWeight(.bold)
                    Text("per hour")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(cornerRadius)
        }
        .cardStyle()
    }
    
    private func availabilitySection(_ availability: [String: [DateInterval]]) -> some View {
        VStack(alignment: .leading, spacing: spacing["small"]) {
            sectionHeader("Availability")
            
            ForEach(Array(availability.keys.sorted()), id: \.self) { day in
                if let intervals = availability[day] {
                    VStack(alignment: .leading) {
                        Text(day)
                            .font(.headline)
                        
                        ForEach(intervals, id: \.start) { interval in
                            Text("\(formatTime(interval.start)) - \(formatTime(interval.end))")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.secondary.opacity(0.1))
                    .cornerRadius(cornerRadius)
                }
            }
        }
        .cardStyle()
    }
    
    private func statsSection(_ coach: Coach?) -> some View {
        VStack(alignment: .leading, spacing: spacing["small"]) {
            sectionHeader("Statistics")
            
            HStack(spacing: spacing["large"]) {
                StatView(title: "Rating", value: String(format: "%.1f", coach?.rating ?? 0))
                StatView(title: "Students", value: "\(coach?.studentCount ?? 0)")
                StatView(title: "Programs", value: "\(coach?.programCount ?? 0)")
            }
        }
        .cardStyle()
    }
    
    // MARK: - Supporting Views
    
    private var loadingView: some View {
        VStack(spacing: spacing["large"]) {
            ForEach(0..<3) { _ in
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(Color.secondary.opacity(0.2))
                    .frame(height: 100)
                    .shimmer()
            }
        }
        .accessibility(label: Text("Loading Coach Profile"))
    }
    
    private func errorView(_ error: CoachViewModelError) -> some View {
        VStack(spacing: spacing["medium"]) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(.red)
            
            Text(error.localizedDescription)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            
            Button("Try Again") {
                Task {
                    await loadProfile()
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .accessibility(label: Text("Error Loading Profile"))
    }
    
    private var offlineBanner: some View {
        HStack {
            Image(systemName: "wifi.slash")
            Text("Offline Mode")
            Spacer()
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(cornerRadius)
    }
    
    private var subscriptionSheet: some View {
        NavigationView {
            SubscriptionView(coachId: coachId)
                .navigationTitle("Subscription Plans")
                .navigationBarItems(trailing: Button("Done") {
                    showSubscriptionSheet = false
                })
        }
    }
    
    // MARK: - Helper Views
    
    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.title3)
            .fontWeight(.bold)
            .accessibility(label: Text("\(title) Section"))
    }
    
    private var toolbarItems: some ToolbarContent {
        Group {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showSubscriptionSheet = true
                } label: {
                    Text("Subscribe")
                }
                .disabled(viewModel.state == .loading)
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func loadProfile() async {
        do {
            try await viewModel.fetchCoachProfile(id: coachId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    
    private func refreshContent() async {
        isRefreshing = true
        await loadProfile()
        isRefreshing = false
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Supporting Views

private struct StatView: View {
    let title: String
    let value: String
    
    var body: some View {
        VStack {
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(UIConfig.cornerRadius)
        .accessibility(label: Text("\(title): \(value)"))
    }
}

// MARK: - View Modifiers

private extension View {
    func cardStyle() -> some View {
        self
            .padding()
            .background(Color.secondary.opacity(0.05))
            .cornerRadius(UIConfig.cornerRadius)
    }
    
    func shimmer() -> some View {
        self.modifier(ShimmerModifier())
    }
}

// MARK: - Shimmer Modifier

private struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0
    
    func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geometry in
                    LinearGradient(
                        gradient: Gradient(colors: [
                            .clear,
                            Color.white.opacity(0.5),
                            .clear
                        ]),
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geometry.size.width * 2)
                    .offset(x: -geometry.size.width + (geometry.size.width * 2 * phase))
                    .animation(
                        Animation.linear(duration: 1.5)
                            .repeatForever(autoreverses: false),
                        value: phase
                    )
                }
            )
            .onAppear {
                phase = 1
            }
    }
}