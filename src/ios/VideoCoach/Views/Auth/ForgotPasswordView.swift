//
// ForgotPasswordView.swift
// VideoCoach
//
// A secure and accessible forgot password view implementing Auth0 password reset
// Version: 1.0.0
// Requires: iOS 14.0+
//

import SwiftUI // v14.0+
import Combine // v14.0+

/// A SwiftUI view that implements secure password reset functionality
@available(iOS 14.0, *)
struct ForgotPasswordView: View {
    // MARK: - Properties
    
    @StateObject private var viewModel = AuthViewModel()
    @State private var email: String = ""
    @State private var showAlert: Bool = false
    @State private var isEmailValid: Bool = false
    @State private var isKeyboardVisible: Bool = false
    @State private var alertMessage: String = ""
    @State private var alertTitle: String = ""
    
    @Environment(\.presentationMode) var presentationMode
    @Environment(\.colorScheme) var colorScheme
    
    // MARK: - Constants
    
    private enum Constants {
        static let logoSize: CGFloat = 120
        static let maxEmailLength = 254 // RFC 5321
        static let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
    }
    
    // MARK: - Body
    
    var body: some View {
        ScrollView {
            VStack(spacing: UIConfig.spacing["large"]) {
                // Logo
                Image("app_logo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: Constants.logoSize, height: Constants.logoSize)
                    .accessibilityLabel("VideoCoach Logo")
                
                // Title
                Text("Reset Password")
                    .standardTextStyle(.title1)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, UIConfig.spacing["medium"])
                
                // Instructions
                Text("Enter your email address and we'll send you instructions to reset your password.")
                    .standardTextStyle(.body)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .padding(.bottom, UIConfig.spacing["large"])
                
                // Email Input
                VStack(alignment: .leading, spacing: UIConfig.spacing["xsmall"]) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .standardTextStyle(.body)
                        .onChange(of: email) { _ in
                            isEmailValid = validateEmail()
                        }
                        .accessibilityLabel("Email address input field")
                        .accessibilityHint("Enter your registered email address")
                    
                    if !email.isEmpty && !isEmailValid {
                        Text("Please enter a valid email address")
                            .standardTextStyle(.caption)
                            .foregroundColor(.error)
                            .accessibilityLabel("Email validation error")
                    }
                }
                .padding()
                .background(Color.secondary.opacity(0.1))
                .roundedCorners()
                
                // Reset Password Button
                CustomButton(
                    title: "Reset Password",
                    style: .primary,
                    isLoading: viewModel.authState == .authenticating,
                    isDisabled: !isEmailValid || email.isEmpty,
                    action: resetPassword,
                    accessibilityLabel: "Reset password button"
                )
                .padding(.top, UIConfig.spacing["medium"])
                
                // Back to Login Button
                CustomButton(
                    title: "Back to Login",
                    style: .outline,
                    action: { presentationMode.wrappedValue.dismiss() },
                    accessibilityLabel: "Return to login screen button"
                )
            }
            .standardPadding()
            .alert(isPresented: $showAlert) {
                Alert(
                    title: Text(alertTitle),
                    message: Text(alertMessage),
                    dismissButton: .default(Text("OK")) {
                        if alertTitle == "Success" {
                            presentationMode.wrappedValue.dismiss()
                        }
                    }
                )
            }
        }
        .background(colorScheme == .dark ? Color.secondaryDark : Color.white)
        .edgesIgnoringSafeArea(.bottom)
        .onTapGesture {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                         to: nil, from: nil, for: nil)
        }
    }
    
    // MARK: - Private Methods
    
    private func resetPassword() {
        guard isEmailValid else { return }
        
        // Sanitize email input
        let sanitizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        
        viewModel.resetPassword(email: sanitizedEmail)
            .receive(on: DispatchQueue.main)
            .sink { completion in
                switch completion {
                case .finished:
                    alertTitle = "Success"
                    alertMessage = "Password reset instructions have been sent to your email."
                    showAlert = true
                case .failure(let error):
                    alertTitle = "Error"
                    alertMessage = error.localizedDescription
                    showAlert = true
                }
            } receiveValue: { _ in }
            .store(in: &viewModel.cancellables)
    }
    
    private func validateEmail() -> Bool {
        guard !email.isEmpty else { return false }
        
        // Trim and validate length
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedEmail.count <= Constants.maxEmailLength else { return false }
        
        // Validate format using regex
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", Constants.emailRegex)
        return emailPredicate.evaluate(with: trimmedEmail)
    }
}

// MARK: - Preview Provider

#if DEBUG
struct ForgotPasswordView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ForgotPasswordView()
                .preferredColorScheme(.light)
            
            ForgotPasswordView()
                .preferredColorScheme(.dark)
        }
    }
}
#endif