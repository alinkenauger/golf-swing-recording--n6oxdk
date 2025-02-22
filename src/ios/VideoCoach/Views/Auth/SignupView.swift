import SwiftUI
import AuthenticationServices

@available(iOS 14.0, *)
struct SignupView: View {
    // MARK: - View Model
    
    @StateObject private var viewModel = AuthViewModel()
    
    // MARK: - Form State
    
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var selectedRole: UserRole = .athlete
    @State private var isSecureEntry = true
    @State private var formErrors: [String: String] = [:]
    @State private var isFormValid = false
    
    // MARK: - Environment
    
    @Environment(\.presentationMode) var presentationMode
    @Environment(\.dynamicTypeSize) var dynamicTypeSize
    
    // MARK: - Constants
    
    private enum ValidationError {
        static let required = "This field is required"
        static let invalidEmail = "Please enter a valid email address"
        static let passwordTooShort = "Password must be at least 8 characters"
        static let passwordMismatch = "Passwords do not match"
        static let invalidName = "Please enter a valid name"
    }
    
    // MARK: - Body
    
    var body: some View {
        ScrollView {
            VStack(spacing: UIConfig.spacing["large"]) {
                // Logo and Header
                Image("AppLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 120, height: 120)
                    .accessibilityLabel("VideoCoach Logo")
                
                // Form Fields
                VStack(spacing: UIConfig.spacing["medium"]) {
                    // Name Fields
                    HStack(spacing: UIConfig.spacing["medium"]) {
                        nameField(
                            title: "First Name",
                            text: $firstName,
                            error: formErrors["firstName"]
                        )
                        
                        nameField(
                            title: "Last Name",
                            text: $lastName,
                            error: formErrors["lastName"]
                        )
                    }
                    
                    // Email Field
                    emailField
                    
                    // Password Fields
                    passwordField
                    confirmPasswordField
                    
                    // Role Selection
                    roleSelectionView
                }
                .padding(.horizontal, UIConfig.spacing["medium"])
                
                // Signup Button
                CustomButton(
                    title: "Sign Up",
                    style: .primary,
                    isLoading: viewModel.authState == .authenticating,
                    isDisabled: !isFormValid,
                    action: handleSignup,
                    accessibilityLabel: "Create account"
                )
                .padding(.horizontal, UIConfig.spacing["medium"])
                
                // Social Sign Up Options
                socialSignupButtons
                
                // Login Link
                loginLink
            }
            .padding(.vertical, UIConfig.spacing["large"])
        }
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: [email, password, confirmPassword, firstName, lastName]) { _ in
            validateForm()
        }
    }
    
    // MARK: - Components
    
    private func nameField(title: String, text: Binding<String>, error: String?) -> some View {
        VStack(alignment: .leading, spacing: UIConfig.spacing["xsmall"]) {
            TextField(title, text: text)
                .textContentType(.name)
                .autocapitalization(.words)
                .standardTextStyle()
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .accessibilityLabel(title)
            
            if let error = error {
                Text(error)
                    .foregroundColor(.error)
                    .standardTextStyle(.caption)
                    .accessibilityLabel("\(title) error: \(error)")
            }
        }
    }
    
    private var emailField: some View {
        VStack(alignment: .leading, spacing: UIConfig.spacing["xsmall"]) {
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .standardTextStyle()
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .accessibilityLabel("Email address")
            
            if let error = formErrors["email"] {
                Text(error)
                    .foregroundColor(.error)
                    .standardTextStyle(.caption)
                    .accessibilityLabel("Email error: \(error)")
            }
        }
    }
    
    private var passwordField: some View {
        VStack(alignment: .leading, spacing: UIConfig.spacing["xsmall"]) {
            HStack {
                if isSecureEntry {
                    SecureField("Password", text: $password)
                } else {
                    TextField("Password", text: $password)
                }
                
                Button(action: { isSecureEntry.toggle() }) {
                    Image(systemName: isSecureEntry ? "eye.slash" : "eye")
                        .foregroundColor(.secondary)
                }
                .accessibilityLabel(isSecureEntry ? "Show password" : "Hide password")
            }
            .textContentType(.newPassword)
            .standardTextStyle()
            .textFieldStyle(RoundedBorderTextFieldStyle())
            
            if let error = formErrors["password"] {
                Text(error)
                    .foregroundColor(.error)
                    .standardTextStyle(.caption)
                    .accessibilityLabel("Password error: \(error)")
            }
        }
    }
    
    private var confirmPasswordField: some View {
        VStack(alignment: .leading, spacing: UIConfig.spacing["xsmall"]) {
            SecureField("Confirm Password", text: $confirmPassword)
                .textContentType(.newPassword)
                .standardTextStyle()
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .accessibilityLabel("Confirm password")
            
            if let error = formErrors["confirmPassword"] {
                Text(error)
                    .foregroundColor(.error)
                    .standardTextStyle(.caption)
                    .accessibilityLabel("Confirm password error: \(error)")
            }
        }
    }
    
    private var roleSelectionView: some View {
        VStack(alignment: .leading, spacing: UIConfig.spacing["small"]) {
            Text("I am a:")
                .standardTextStyle(.headline)
                .accessibilityAddTraits(.isHeader)
            
            ForEach(UserRole.allCases, id: \.self) { role in
                Button(action: { selectedRole = role }) {
                    HStack {
                        Image(systemName: selectedRole == role ? "checkmark.circle.fill" : "circle")
                            .foregroundColor(selectedRole == role ? .primary : .secondary)
                        
                        VStack(alignment: .leading) {
                            Text(role.rawValue.capitalized)
                                .standardTextStyle(.body)
                            
                            Text(roleDescription(for: role))
                                .standardTextStyle(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()
                    .background(Color.secondary.opacity(0.1))
                    .roundedCorners()
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(role.rawValue) role")
                .accessibilityValue(selectedRole == role ? "Selected" : "Not selected")
                .accessibilityHint(roleDescription(for: role))
            }
        }
    }
    
    private var socialSignupButtons: some View {
        VStack(spacing: UIConfig.spacing["medium"]) {
            Text("Or sign up with")
                .standardTextStyle(.caption)
                .foregroundColor(.secondary)
            
            HStack(spacing: UIConfig.spacing["medium"]) {
                CustomButton(
                    title: "Apple",
                    style: .outline,
                    action: { handleSocialSignup(.apple) },
                    accessibilityLabel: "Sign up with Apple"
                )
                
                CustomButton(
                    title: "Google",
                    style: .outline,
                    action: { handleSocialSignup(.google) },
                    accessibilityLabel: "Sign up with Google"
                )
            }
        }
    }
    
    private var loginLink: some View {
        Button(action: { presentationMode.wrappedValue.dismiss() }) {
            Text("Already have an account? Log in")
                .standardTextStyle(.body)
                .foregroundColor(.primary)
                .underline()
        }
        .accessibilityLabel("Go to login")
        .accessibilityHint("Tap to go to the login screen")
    }
    
    // MARK: - Helper Methods
    
    private func roleDescription(for role: UserRole) -> String {
        switch role {
        case .coach:
            return "I want to provide coaching services and create content"
        case .athlete:
            return "I want to receive coaching and access training content"
        }
    }
    
    private func validateForm() {
        formErrors.removeAll()
        
        // Validate first name
        if firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            formErrors["firstName"] = ValidationError.required
        }
        
        // Validate last name
        if lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            formErrors["lastName"] = ValidationError.required
        }
        
        // Validate email
        if email.isEmpty {
            formErrors["email"] = ValidationError.required
        } else if !isValidEmail(email) {
            formErrors["email"] = ValidationError.invalidEmail
        }
        
        // Validate password
        if password.isEmpty {
            formErrors["password"] = ValidationError.required
        } else if password.count < 8 {
            formErrors["password"] = ValidationError.passwordTooShort
        }
        
        // Validate confirm password
        if confirmPassword != password {
            formErrors["confirmPassword"] = ValidationError.passwordMismatch
        }
        
        isFormValid = formErrors.isEmpty && !email.isEmpty && !password.isEmpty
            && !firstName.isEmpty && !lastName.isEmpty
    }
    
    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: email)
    }
    
    private func handleSignup() {
        validateForm()
        guard isFormValid else { return }
        
        let signupData = [
            "email": email,
            "password": password,
            "firstName": firstName,
            "lastName": lastName,
            "role": selectedRole.rawValue
        ]
        
        // Call viewModel signup method
        // Implementation would be handled by AuthViewModel
    }
    
    private func handleSocialSignup(_ provider: SocialProvider) {
        viewModel.socialLogin(provider: provider)
            .sink { _ in
                // Handle completion
            }
            .store(in: &viewModel.cancellables)
    }
}

// MARK: - Preview Provider

#if DEBUG
struct SignupView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            SignupView()
        }
        .preferredColorScheme(.light)
        
        NavigationView {
            SignupView()
        }
        .preferredColorScheme(.dark)
    }
}
#endif