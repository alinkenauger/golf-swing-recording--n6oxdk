import SwiftUI

/// A view for managing subscription plans and subscription status with enhanced accessibility support
@available(iOS 14.0, *)
public struct SubscriptionView: View {
    // MARK: - View State
    @StateObject private var viewModel: PaymentViewModel
    @State private var viewState: SubscriptionViewState = .selectingPlan
    @State private var selectedPlan: SubscriptionPlan?
    @State private var showError: Bool = false
    @State private var showCancellationConfirmation: Bool = false
    
    // MARK: - Dependencies
    private let analytics: AnalyticsService
    
    // MARK: - Initialization
    public init(viewModel: PaymentViewModel, analytics: AnalyticsService) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.analytics = analytics
    }
    
    // MARK: - Body
    public var body: some View {
        NavigationView {
            ZStack {
                contentView
                    .navigationTitle("Subscription")
                    .navigationBarTitleDisplayMode(.large)
                    .alert(isPresented: $showError) {
                        Alert(
                            title: Text("Error"),
                            message: Text(viewModel.error?.localizedDescription ?? "An error occurred"),
                            dismissButton: .default(Text("OK"))
                        )
                    }
                    .alert(isPresented: $showCancellationConfirmation) {
                        Alert(
                            title: Text("Cancel Subscription"),
                            message: Text("Are you sure you want to cancel your subscription?"),
                            primaryButton: .destructive(Text("Cancel Subscription")) {
                                handleCancellation()
                            },
                            secondaryButton: .cancel()
                        )
                    }
                
                if viewModel.isLoading {
                    Color.black.opacity(0.4)
                        .ignoresSafeArea()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(1.5)
                        .accessibilityLabel("Loading")
                }
            }
        }
        .onAppear {
            analytics.trackEvent(.sessionStart, metadata: ["screen": "subscription_view"])
        }
        .onDisappear {
            analytics.trackEvent(.sessionEnd, metadata: ["screen": "subscription_view"])
        }
    }
    
    // MARK: - Content Views
    @ViewBuilder
    private var contentView: some View {
        switch viewState {
        case .selectingPlan:
            planSelectionView
        case .confirmingSubscription:
            confirmationView
        case .managingSubscription:
            subscriptionManagementView
        case .error:
            errorView
        }
    }
    
    private var planSelectionView: some View {
        ScrollView {
            VStack(spacing: UIConfig.spacing["medium"]) {
                ForEach(viewModel.availablePlans, id: \.id) { plan in
                    PlanCard(
                        plan: plan,
                        isSelected: selectedPlan?.id == plan.id,
                        action: {
                            handlePlanSelection(plan)
                        }
                    )
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Subscription plan: \(plan.name)")
                    .accessibilityValue(plan.formattedPrice())
                    .accessibilityHint("Double tap to select this plan")
                }
            }
            .padding()
        }
    }
    
    private var confirmationView: some View {
        VStack(spacing: UIConfig.spacing["large"]) {
            if let plan = selectedPlan {
                Text("Confirm Subscription")
                    .font(.title2)
                    .accessibilityAddTraits(.isHeader)
                
                VStack(alignment: .leading, spacing: UIConfig.spacing["small"]) {
                    Text("Selected Plan: \(plan.name)")
                    Text("Price: \(plan.formattedPrice())")
                    Text("Billing Interval: \(plan.interval.rawValue)")
                }
                .accessibilityElement(children: .combine)
                
                CustomButton(
                    title: "Subscribe Now",
                    style: .primary,
                    action: {
                        handleSubscription()
                    }
                )
                
                CustomButton(
                    title: "Change Plan",
                    style: .secondary,
                    action: {
                        viewState = .selectingPlan
                    }
                )
            }
        }
        .padding()
    }
    
    private var subscriptionManagementView: some View {
        VStack(spacing: UIConfig.spacing["large"]) {
            if let subscription = viewModel.currentSubscription {
                Text("Current Subscription")
                    .font(.title2)
                    .accessibilityAddTraits(.isHeader)
                
                VStack(alignment: .leading, spacing: UIConfig.spacing["small"]) {
                    Text("Status: \(subscription.status.rawValue)")
                    Text("Next billing date: \(formattedDate(subscription.currentPeriodEnd))")
                }
                .accessibilityElement(children: .combine)
                
                if subscription.status == .active {
                    CustomButton(
                        title: "Cancel Subscription",
                        style: .destructive,
                        action: {
                            showCancellationConfirmation = true
                        }
                    )
                }
            }
        }
        .padding()
    }
    
    private var errorView: some View {
        VStack(spacing: UIConfig.spacing["large"]) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 50))
                .foregroundColor(.error)
            
            Text("Something went wrong")
                .font(.title2)
            
            CustomButton(
                title: "Try Again",
                style: .primary,
                action: {
                    viewState = .selectingPlan
                }
            )
        }
        .padding()
    }
    
    // MARK: - Helper Views
    private struct PlanCard: View {
        let plan: SubscriptionPlan
        let isSelected: Bool
        let action: () -> Void
        
        var body: some View {
            Button(action: action) {
                VStack(alignment: .leading, spacing: UIConfig.spacing["small"]) {
                    Text(plan.name)
                        .font(.headline)
                    
                    Text(plan.description)
                        .font(.body)
                        .foregroundColor(.secondary)
                    
                    Text(plan.formattedPrice())
                        .font(.title3)
                        .bold()
                    
                    ForEach(plan.features, id: \.self) { feature in
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.primary)
                            Text(feature)
                        }
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(isSelected ? Color.primary.opacity(0.1) : Color.secondary.opacity(0.05))
                .cornerRadius(UIConfig.cornerRadius)
                .overlay(
                    RoundedRectangle(cornerRadius: UIConfig.cornerRadius)
                        .stroke(isSelected ? Color.primary : Color.clear, lineWidth: 2)
                )
            }
            .buttonStyle(PlainButtonStyle())
        }
    }
    
    // MARK: - Helper Methods
    private func handlePlanSelection(_ plan: SubscriptionPlan) {
        analytics.trackEvent(.sessionStart, metadata: [
            "action": "plan_selected",
            "plan_id": plan.id
        ])
        
        selectedPlan = plan
        viewState = .confirmingSubscription
    }
    
    private func handleSubscription() {
        guard let plan = selectedPlan else { return }
        
        analytics.trackEvent(.sessionStart, metadata: [
            "action": "subscription_initiated",
            "plan_id": plan.id
        ])
        
        Task {
            do {
                try await viewModel.subscribeToCoach(planId: plan.id)
                viewState = .managingSubscription
            } catch {
                showError = true
                viewState = .error
                analytics.trackEvent(.errorOccurred, metadata: [
                    "error": error.localizedDescription,
                    "context": "subscription"
                ])
            }
        }
    }
    
    private func handleCancellation() {
        analytics.trackEvent(.sessionStart, metadata: [
            "action": "subscription_cancellation_initiated"
        ])
        
        Task {
            do {
                try await viewModel.cancelSubscription()
                viewState = .selectingPlan
            } catch {
                showError = true
                analytics.trackEvent(.errorOccurred, metadata: [
                    "error": error.localizedDescription,
                    "context": "cancellation"
                ])
            }
        }
    }
    
    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }
}

// MARK: - View State
private enum SubscriptionViewState {
    case selectingPlan
    case confirmingSubscription
    case managingSubscription
    case error
}