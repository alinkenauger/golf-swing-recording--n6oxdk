import { LoginForm } from '../../src/components/auth/LoginForm';
import { SignupForm } from '../../src/components/auth/SignupForm';
import 'cypress-axe';
import 'cypress-real-events';

// Test user data
const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#',
  firstName: 'Test',
  lastName: 'User',
  role: 'ATHLETE',
  mfaEnabled: true,
  devices: ['desktop-chrome', 'mobile-safari']
};

const TEST_COACH = {
  email: 'coach@example.com',
  password: 'Coach123!@#',
  firstName: 'Test',
  lastName: 'Coach',
  role: 'COACH',
  mfaEnabled: true,
  verificationStatus: 'approved'
};

// Selectors for auth components
const AUTH_SELECTORS = {
  loginForm: '[data-testid=login-form]',
  signupForm: '[data-testid=signup-form]',
  mfaForm: '[data-testid=mfa-form]',
  deviceBindingForm: '[data-testid=device-binding-form]',
  emailInput: '[data-testid=email-input]',
  passwordInput: '[data-testid=password-input]',
  submitButton: '[data-testid=submit-button]',
  errorMessage: '[role=alert]',
  mfaInput: '[data-testid=mfa-input]',
  deviceName: '[data-testid=device-name-input]'
};

describe('Authentication Flows', () => {
  beforeEach(() => {
    // Reset auth state and initialize accessibility testing
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.visit('/login');
    cy.injectAxe();
    
    // Verify security headers
    cy.request('/login').then((response) => {
      expect(response.headers).to.include({
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'x-xss-protection': '1; mode=block'
      });
    });
  });

  describe('Login Flow', () => {
    it('should enforce password complexity requirements', () => {
      cy.get(AUTH_SELECTORS.emailInput).type('test@example.com');
      cy.get(AUTH_SELECTORS.passwordInput).type('weak');
      cy.get(AUTH_SELECTORS.submitButton).click();
      
      cy.get(AUTH_SELECTORS.errorMessage)
        .should('be.visible')
        .and('contain', 'Password must be at least 8 characters');
      
      // Check accessibility
      cy.checkA11y();
    });

    it('should handle rate limiting for failed attempts', () => {
      for (let i = 0; i < 6; i++) {
        cy.get(AUTH_SELECTORS.emailInput).clear().type('test@example.com');
        cy.get(AUTH_SELECTORS.passwordInput).clear().type('WrongPass123!');
        cy.get(AUTH_SELECTORS.submitButton).click();
      }

      cy.get(AUTH_SELECTORS.errorMessage)
        .should('contain', 'Too many login attempts');
      
      // Verify rate limit headers
      cy.request({
        url: '/api/auth/login',
        failOnStatusCode: false
      }).then((response) => {
        expect(response.headers).to.include({
          'x-ratelimit-limit': '5',
          'x-ratelimit-remaining': '0'
        });
      });
    });

    it('should complete MFA verification flow', () => {
      // Login with valid credentials
      cy.get(AUTH_SELECTORS.emailInput).type(TEST_USER.email);
      cy.get(AUTH_SELECTORS.passwordInput).type(TEST_USER.password);
      cy.get(AUTH_SELECTORS.submitButton).click();

      // Verify MFA form is displayed
      cy.get(AUTH_SELECTORS.mfaForm).should('be.visible');
      
      // Enter valid MFA code
      cy.get(AUTH_SELECTORS.mfaInput).type('123456');
      cy.get(AUTH_SELECTORS.submitButton).click();

      // Verify successful login
      cy.url().should('include', '/dashboard');
      cy.getCookie('auth_token').should('exist');
    });

    it('should handle device binding for new devices', () => {
      // Login with valid credentials
      cy.get(AUTH_SELECTORS.emailInput).type(TEST_USER.email);
      cy.get(AUTH_SELECTORS.passwordInput).type(TEST_USER.password);
      cy.get(AUTH_SELECTORS.submitButton).click();

      // Complete MFA verification
      cy.get(AUTH_SELECTORS.mfaInput).type('123456');
      cy.get(AUTH_SELECTORS.submitButton).click();

      // Verify device binding form
      cy.get(AUTH_SELECTORS.deviceBindingForm).should('be.visible');
      cy.get(AUTH_SELECTORS.deviceName).type('My Test Device');
      cy.get(AUTH_SELECTORS.submitButton).click();

      // Verify device is bound
      cy.window().then((win) => {
        expect(win.localStorage.getItem('device_id')).to.exist;
      });
    });
  });

  describe('Signup Flow', () => {
    beforeEach(() => {
      cy.visit('/signup');
    });

    it('should validate email format and availability', () => {
      // Test invalid email format
      cy.get(AUTH_SELECTORS.emailInput).type('invalid-email');
      cy.get(AUTH_SELECTORS.submitButton).click();
      cy.get(AUTH_SELECTORS.errorMessage)
        .should('contain', 'Please enter a valid email address');

      // Test existing email
      cy.get(AUTH_SELECTORS.emailInput).clear().type(TEST_USER.email);
      cy.get(AUTH_SELECTORS.submitButton).click();
      cy.get(AUTH_SELECTORS.errorMessage)
        .should('contain', 'Email already registered');
    });

    it('should enforce strong password requirements', () => {
      const weakPasswords = ['password123', 'abc123', '12345678'];
      
      weakPasswords.forEach(password => {
        cy.get(AUTH_SELECTORS.passwordInput).clear().type(password);
        cy.get(AUTH_SELECTORS.submitButton).click();
        cy.get(AUTH_SELECTORS.errorMessage)
          .should('be.visible')
          .and('contain', 'Password must include');
      });
    });

    it('should handle coach verification process', () => {
      // Fill signup form for coach
      cy.get('[data-testid=role-select]').select('COACH');
      cy.get(AUTH_SELECTORS.emailInput).type('newcoach@example.com');
      cy.get(AUTH_SELECTORS.passwordInput).type('Coach123!@#');
      cy.get('[data-testid=first-name]').type('New');
      cy.get('[data-testid=last-name]').type('Coach');
      cy.get(AUTH_SELECTORS.submitButton).click();

      // Verify pending verification status
      cy.url().should('include', '/verification-pending');
      cy.get('[data-testid=verification-status]')
        .should('contain', 'Verification pending');
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      // Login before each test
      cy.login(TEST_USER);
    });

    it('should handle token refresh', () => {
      // Simulate token expiration
      cy.clock().tick(3600000); // Advance 1 hour
      
      // Make authenticated request
      cy.request('/api/user/profile').then((response) => {
        expect(response.status).to.eq(200);
        // Verify new token was issued
        cy.getCookie('auth_token').should('exist');
      });
    });

    it('should maintain session across page reloads', () => {
      cy.visit('/dashboard');
      cy.reload();
      cy.url().should('include', '/dashboard');
      cy.get('[data-testid=user-menu]').should('be.visible');
    });

    it('should handle concurrent sessions properly', () => {
      // Open another tab/window
      cy.window().then((win) => {
        const newWin = win.open('/dashboard');
        
        // Verify both sessions are active
        cy.wrap(newWin).its('localStorage')
          .invoke('getItem', 'auth_token')
          .should('exist');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper focus management', () => {
      // Test keyboard navigation
      cy.get(AUTH_SELECTORS.emailInput).focus()
        .type('{tab}')
        .focused()
        .should('have.attr', 'id', 'password');

      // Test error announcements
      cy.get(AUTH_SELECTORS.submitButton).click();
      cy.get('[role=alert]').should('have.attr', 'aria-live', 'polite');
    });

    it('should meet WCAG 2.1 Level AA requirements', () => {
      // Test login form
      cy.visit('/login');
      cy.checkA11y();

      // Test signup form
      cy.visit('/signup');
      cy.checkA11y();

      // Test MFA form
      cy.visit('/mfa');
      cy.checkA11y();
    });
  });
});