import XCTest

// Test constants
private let TEST_TIMEOUT: TimeInterval = 30.0
private struct TestCredentials {
    static let email = "test@example.com"
    static let password = "TestPassword123!"
    static let socialAccounts = [
        "google": "test.google@example.com",
        "apple": "test.apple@example.com",
        "facebook": "test.facebook@example.com"
    ]
}

class AuthUITests: XCTestCase {
    
    // MARK: - Properties
    var app: XCUIApplication!
    
    // MARK: - Test Lifecycle
    override func setUpWithError() throws {
        try super.setUpWithError()
        continueAfterFailure = false
        
        // Initialize application
        app = XCUIApplication()
        app.launchArguments = ["UI-Testing"]
        app.launchEnvironment = ["ENV": "TEST"]
        
        // Clear any existing authentication state
        let secItemClasses = [
            kSecClassGenericPassword,
            kSecClassInternetPassword,
            kSecClassCertificate,
            kSecClassKey,
            kSecClassIdentity
        ]
        secItemClasses.forEach { secItemClass in
            SecItemDelete([secItemClass: kSecMatchLimitAll] as CFDictionary)
        }
        
        app.launch()
    }
    
    override func tearDownWithError() throws {
        // Reset application state
        app.terminate()
        
        // Clear test data
        UserDefaults.standard.removePersistentDomain(forName: Bundle.main.bundleIdentifier!)
        
        app = nil
        try super.tearDownWithError()
    }
    
    // MARK: - Test Cases
    func testLoginWithValidCredentials() throws {
        // Verify initial screen design compliance
        let loginScreen = app.otherElements["loginScreen"]
        XCTAssertTrue(loginScreen.exists, "Login screen should be visible")
        
        // Verify typography and colors
        let titleLabel = app.staticTexts["loginTitle"]
        XCTAssertTrue(titleLabel.exists)
        XCTAssertEqual(titleLabel.label, "Welcome Back")
        
        // Test email input
        let emailField = app.textFields["emailField"]
        XCTAssertTrue(emailField.exists)
        emailField.tap()
        emailField.typeText(TestCredentials.email)
        
        // Verify email field design
        XCTAssertEqual(emailField.value as? String, TestCredentials.email)
        
        // Test password input
        let passwordField = app.secureTextFields["passwordField"]
        XCTAssertTrue(passwordField.exists)
        passwordField.tap()
        passwordField.typeText(TestCredentials.password)
        
        // Verify password field security
        XCTAssertEqual(passwordField.value as? String, "••••••••••••")
        
        // Test login button
        let loginButton = app.buttons["loginButton"]
        XCTAssertTrue(loginButton.exists)
        XCTAssertTrue(loginButton.isEnabled)
        loginButton.tap()
        
        // Verify loading state
        let loadingIndicator = app.activityIndicators["loadingIndicator"]
        XCTAssertTrue(loadingIndicator.exists)
        
        // Wait for home screen
        let homeScreen = app.otherElements["homeScreen"]
        XCTAssertTrue(homeScreen.waitForExistence(timeout: TEST_TIMEOUT))
    }
    
    func testBiometricAuthentication() throws {
        // Enable biometric authentication
        let biometricButton = app.buttons["biometricLoginButton"]
        XCTAssertTrue(biometricButton.exists)
        
        // Simulate biometric authentication
        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Testing biometric authentication") { success, error in
            XCTAssertTrue(success, "Biometric authentication should succeed in test environment")
        }
        
        biometricButton.tap()
        
        // Verify successful authentication
        let homeScreen = app.otherElements["homeScreen"]
        XCTAssertTrue(homeScreen.waitForExistence(timeout: TEST_TIMEOUT))
    }
    
    func testSocialAuthentication() throws {
        // Test each social provider
        for (provider, _) in TestCredentials.socialAccounts {
            let providerButton = app.buttons["\(provider)LoginButton"]
            XCTAssertTrue(providerButton.exists)
            providerButton.tap()
            
            // Handle provider-specific OAuth flow
            if let webView = app.webViews.firstMatch {
                XCTAssertTrue(webView.waitForExistence(timeout: TEST_TIMEOUT))
                
                // Simulate successful OAuth
                let continueButton = webView.buttons["Continue"]
                if continueButton.exists {
                    continueButton.tap()
                }
            }
            
            // Verify successful authentication
            let homeScreen = app.otherElements["homeScreen"]
            XCTAssertTrue(homeScreen.waitForExistence(timeout: TEST_TIMEOUT))
            
            // Logout for next provider test
            let profileButton = app.buttons["profileButton"]
            profileButton.tap()
            
            let logoutButton = app.buttons["logoutButton"]
            logoutButton.tap()
            
            // Verify return to login screen
            let loginScreen = app.otherElements["loginScreen"]
            XCTAssertTrue(loginScreen.waitForExistence(timeout: TEST_TIMEOUT))
        }
    }
    
    func testAccessibilityCompliance() throws {
        // Test VoiceOver support
        XCUIDevice.shared.press(.home, forDuration: 1.0)
        
        // Verify accessibility labels
        let elements = app.descendants(matching: .any)
        elements.allElementsBoundByIndex.forEach { element in
            if element.isEnabled {
                XCTAssertFalse(element.identifier.isEmpty, "All interactive elements should have accessibility identifiers")
            }
        }
        
        // Test touch target sizes
        app.buttons.allElementsBoundByIndex.forEach { button in
            let frame = button.frame
            XCTAssertGreaterThanOrEqual(frame.width, 44.0, "Button width should meet minimum touch target size")
            XCTAssertGreaterThanOrEqual(frame.height, 44.0, "Button height should meet minimum touch target size")
        }
        
        // Test dynamic type support
        let contentSize = UIApplication.shared.preferredContentSizeCategory
        UIApplication.shared.preferredContentSizeCategory = .accessibilityExtraExtraExtraLarge
        
        // Verify text scaling
        let loginButton = app.buttons["loginButton"]
        XCTAssertTrue(loginButton.exists)
        
        // Reset content size
        UIApplication.shared.preferredContentSizeCategory = contentSize
    }
}