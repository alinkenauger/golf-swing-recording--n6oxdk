import SwiftUI
import Combine

@available(iOS 14.0, *)
struct ProfileView: View {
    // MARK: - View Model
    @StateObject private var viewModel = ProfileViewModel()
    @Environment(\.presentationMode) var presentationMode
    
    // MARK: - State
    @State private var showingLogoutAlert = false
    @State private var showingErrorAlert = false
    @State private var isEditingProfile = false
    @State private var editedFirstName = ""
    @State private var editedLastName = ""
    @State private var editedBio = ""
    
    // MARK: - Constants
    private enum Constants {
        static let avatarSize: CGFloat = 120
        static let spacing: CGFloat = 16
        static let cornerRadius: CGFloat = 12
        static let maxBioLength = 500
    }
    
    // MARK: - Body
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: Constants.spacing) {
                    profileHeader
                    
                    if viewModel.isLoading {
                        loadingView
                    } else if let user = viewModel.user {
                        profileContent(user)
                    } else {
                        errorView
                    }
                }
                .padding()
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    logoutButton
                }
                
                if !isEditingProfile {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        editButton
                    }
                }
            }
        }
        .alert(isPresented: $showingLogoutAlert) {
            logoutAlert
        }
        .alert(isPresented: $showingErrorAlert) {
            errorAlert
        }
        .sheet(isPresented: $isEditingProfile) {
            editProfileView
        }
        .onAppear {
            loadProfile()
        }
    }
    
    // MARK: - Profile Header
    private var profileHeader: some View {
        VStack(spacing: Constants.spacing) {
            if let user = viewModel.user {
                UserAvatarView(user: user, size: Constants.avatarSize, showBorder: true)
                    .accessibilityLabel("Profile picture")
                
                VStack(spacing: 4) {
                    Text(user.fullName)
                        .font(.title2)
                        .fontWeight(.bold)
                        .accessibilityAddTraits(.isHeader)
                    
                    Text(user.role == .coach ? "Coach" : "Athlete")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(Color.secondary.opacity(0.1))
                        )
                        .accessibilityLabel("User role: \(user.role == .coach ? "Coach" : "Athlete")")
                }
            }
        }
        .padding(.vertical)
    }
    
    // MARK: - Profile Content
    private func profileContent(_ user: User) -> some View {
        VStack(spacing: Constants.spacing) {
            // Basic Information
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    infoRow(title: "Email", value: user.email)
                    
                    if let bio = user.bio {
                        infoRow(title: "Bio", value: bio)
                    }
                }
                .padding(.vertical, 8)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Basic Information")
            
            // Role-specific content
            if user.isCoach {
                coachContent(user)
            } else {
                athleteContent(user)
            }
        }
    }
    
    // MARK: - Role-Specific Content
    private func coachContent(_ user: User) -> some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Text("Coach Dashboard")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                
                // Coach-specific stats and actions would go here
                Text("Active Students: Coming Soon")
                Text("Total Reviews: Coming Soon")
            }
            .padding(.vertical, 8)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Coach Information")
    }
    
    private func athleteContent(_ user: User) -> some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Text("Training Progress")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                
                // Athlete-specific stats and actions would go here
                Text("Active Programs: Coming Soon")
                Text("Completed Reviews: Coming Soon")
            }
            .padding(.vertical, 8)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Training Information")
    }
    
    // MARK: - Helper Views
    private func infoRow(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            Text(value)
                .font(.body)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(value)")
    }
    
    private var loadingView: some View {
        VStack {
            ProgressView()
                .scaleEffect(1.5)
                .padding()
            Text("Loading profile...")
                .font(.callout)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Loading profile")
    }
    
    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 50))
                .foregroundColor(.red)
            
            Text("Failed to load profile")
                .font(.headline)
            
            Button("Retry") {
                loadProfile()
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error loading profile. Double tap to retry.")
    }
    
    // MARK: - Buttons and Actions
    private var logoutButton: some View {
        Button(action: {
            showingLogoutAlert = true
        }) {
            Text("Logout")
                .foregroundColor(.red)
        }
        .accessibilityLabel("Logout from account")
        .accessibilityHint("Double tap to show logout confirmation")
    }
    
    private var editButton: some View {
        Button(action: {
            prepareForEditing()
        }) {
            Text("Edit")
        }
        .disabled(viewModel.user == nil)
        .accessibilityLabel("Edit profile")
        .accessibilityHint("Double tap to edit your profile information")
    }
    
    // MARK: - Alerts
    private var logoutAlert: Alert {
        Alert(
            title: Text("Logout"),
            message: Text("Are you sure you want to logout?"),
            primaryButton: .destructive(Text("Logout")) {
                performLogout()
            },
            secondaryButton: .cancel()
        )
    }
    
    private var errorAlert: Alert {
        Alert(
            title: Text("Error"),
            message: Text(viewModel.error?.errorDescription ?? "An unknown error occurred"),
            dismissButton: .default(Text("OK"))
        )
    }
    
    // MARK: - Edit Profile View
    private var editProfileView: some View {
        NavigationView {
            Form {
                Section(header: Text("Personal Information")) {
                    TextField("First Name", text: $editedFirstName)
                        .textContentType(.givenName)
                        .accessibilityLabel("Edit first name")
                    
                    TextField("Last Name", text: $editedLastName)
                        .textContentType(.familyName)
                        .accessibilityLabel("Edit last name")
                    
                    TextEditor(text: $editedBio)
                        .frame(height: 100)
                        .accessibilityLabel("Edit bio")
                    
                    Text("\(editedBio.count)/\(Constants.maxBioLength)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        isEditingProfile = false
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveProfile()
                    }
                    .disabled(!isValidForm)
                }
            }
        }
    }
    
    // MARK: - Helper Methods
    private func loadProfile() {
        viewModel.loadProfile()
            .sink(
                receiveCompletion: { completion in
                    if case .failure = completion {
                        showingErrorAlert = true
                    }
                },
                receiveValue: { _ in }
            )
            .store(in: &viewModel.cancellables)
    }
    
    private func performLogout() {
        viewModel.logout()
            .sink { _ in
                presentationMode.wrappedValue.dismiss()
            }
            .store(in: &viewModel.cancellables)
    }
    
    private func prepareForEditing() {
        guard let user = viewModel.user else { return }
        editedFirstName = user.firstName
        editedLastName = user.lastName
        editedBio = user.bio ?? ""
        isEditingProfile = true
    }
    
    private func saveProfile() {
        viewModel.updateProfile(
            firstName: editedFirstName,
            lastName: editedLastName,
            bio: editedBio,
            avatarUrl: nil
        )
        .sink(
            receiveCompletion: { completion in
                if case .failure = completion {
                    showingErrorAlert = true
                }
                isEditingProfile = false
            },
            receiveValue: { _ in }
        )
        .store(in: &viewModel.cancellables)
    }
    
    private var isValidForm: Bool {
        !editedFirstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !editedLastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        editedBio.count <= Constants.maxBioLength
    }
}

// MARK: - Preview Provider
@available(iOS 14.0, *)
struct ProfileView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Coach Preview
            ProfileView()
                .previewDisplayName("Coach Profile")
                .onAppear {
                    let coachUser = try! User(
                        id: "1",
                        email: "coach@example.com",
                        firstName: "John",
                        lastName: "Doe",
                        bio: "Professional tennis coach with 10+ years of experience",
                        role: .coach
                    )
                    // Set up preview data
                }
            
            // Athlete Preview
            ProfileView()
                .previewDisplayName("Athlete Profile")
                .preferredColorScheme(.dark)
                .onAppear {
                    let athleteUser = try! User(
                        id: "2",
                        email: "athlete@example.com",
                        firstName: "Jane",
                        lastName: "Smith",
                        bio: "Aspiring tennis player",
                        role: .athlete
                    )
                    // Set up preview data
                }
        }
    }
}