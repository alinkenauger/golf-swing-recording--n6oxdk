import SwiftUI
import AuthenticationServices
import LocalAuthentication

/// A SwiftUI view implementing a secure, accessible login screen with multiple authentication options
@available(iOS 14.0, *)
struct LoginView: View {
    // MARK: - View Model
    
    @StateObject private var viewModel = AuthViewModel()
    
    // MARK: - State Properties
    
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var isSecure: Bool = true
    @State private var showingAlert: Bool = false
    @State private var alertMessage: String = ""
    @State private var isKeyboardVisible: Bool = false
    
    // MARK: - Environment Properties
    
    @Environment(\.presentationMode) var presentationMode
    @Environment(\.colorScheme) var colorScheme
    
    // MARK: - Constants
    
    private enum Constants {
        static let logoSize: CGFloat = 120
        static let biometricReason = "Log in to VideoCoach"
        static let minimumPasswordLength = 8
    }
    
    // MARK: - Body
    
    var body: some View {
        ScrollView {
            VStack(spacing: UIConfig.spacing["large"]) {
                // Logo
                Image("AppLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: Constants.logoSize, height: Constants.logoSize)
                    .accessibilityLabel("VideoCoach Logo")
                
                // Login Form
                VStack(spacing: UIConfig.spacing["medium"]) {
                    // Email Field
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .standardTextStyle()
                        .accessibilityLabel("Email address")
                    
                    // Password Field
                    HStack {
                        if isSecure {
                            SecureField("Password", text: $password)
                                .textContentType(.password)
                        } else {
                            TextField("Password", text: $password)
                                .textContentType(.password)
                        }
                        
                        Button(action: { isSecure.toggle() }) {
                            Image(systemName: isSecure ? "eye.slash" : "eye")
                                .foregroundColor(.secondary)
                        }
                        .accessibilityLabel(isSecure ? "Show password" : "Hide password")
                    }
                    .standardTextStyle()
                    
                    // Login Button
                    CustomButton(
                        title: "Log In",
                        style: .primary,
                        isLoading: viewModel.authState == .authenticating,
                        isDisabled: !isValidInput,
                        action: handleLogin
                    )
                    
                    // Biometric Login
                    if LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) {
                        CustomButton(
                            title: "Use Face ID",
                            style: .secondary,
                            action: handleBiometricLogin
                        )
                    }
                    
                    // Social Login Options
                    VStack(spacing: UIConfig.spacing["small"]) {
                        CustomButton(
                            title: "Continue with Apple",
                            style: .outline,
                            action: { handleSocialLogin(.apple) }
                        )
                        
                        CustomButton(
                            title: "Continue with Google",
                            style: .outline,
                            action: { handleSocialLogin(.google) }
                        )
                    }
                }
                .standardPadding()
                
                // Additional Links
                VStack(spacing: UIConfig.spacing["small"]) {
                    Button("Forgot Password?") {
                        // Handle forgot password
                    }
                    .foregroundColor(.primary)
                    .accessibilityHint("Tap to reset your password")
                    
                    HStack {
                        Text("Don't have an account?")
                        Button("Sign Up") {
                            // Handle sign up navigation
                        }
                        .foregroundColor(.primary)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .standardPadding()
        }
        .background(Color(.systemBackground))
        .alert(isPresented: $showingAlert) {
            Alert(
                title: Text("Error"),
                message: Text(alertMessage),
                dismissButton: .default(Text("OK"))
            )
        }
        .onChange(of: viewModel.authState) { state in
            handleAuthStateChange(state)
        }
    }
    
    // MARK: - Private Methods
    
    private var isValidInput: Bool {
        !email.isEmpty && password.count >= Constants.minimumPasswordLength
    }
    
    private func handleLogin() {
        viewModel.email = email
        viewModel.password = password
        
        viewModel.login()
            .sink { _ in
                // Handle completion
            }
            .store(in: &viewModel.cancellables)
    }
    
    private func handleBiometricLogin() {
        viewModel.biometricLogin()
            .sink { _ in
                // Handle completion
            }
            .store(in: &viewModel.cancellables)
    }
    
    private func handleSocialLogin(_ provider: SocialProvider) {
        viewModel.socialLogin(provider: provider)
            .sink { _ in
                // Handle completion
            }
            .store(in: &viewModel.cancellables)
    }
    
    private func handleAuthStateChange(_ state: AuthState) {
        switch state {
        case .authenticated:
            presentationMode.wrappedValue.dismiss()
        case .error(let error):
            showingAlert = true
            alertMessage = error.localizedDescription
        default:
            break
        }
    }
}

// MARK: - Preview Provider

#if DEBUG
struct LoginView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            LoginView()
                .preferredColorScheme(.light)
            
            LoginView()
                .preferredColorScheme(.dark)
        }
    }
}
#endif