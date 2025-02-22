import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { LoginForm } from '../../../src/components/auth/LoginForm';
import { useAuth } from '../../../src/hooks/useAuth';
import { AuthMethod } from '../../../src/types/auth';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock useAuth hook
jest.mock('../../../src/hooks/useAuth');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock jest-axe
jest.mock('jest-axe');

describe('LoginForm', () => {
  // Test data
  const validCredentials = {
    email: 'test@example.com',
    password: 'Password123!'
  };

  const invalidCredentials = {
    email: 'invalid-email',
    password: 'short'
  };

  // Setup before each test
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup useAuth mock implementation
    mockUseAuth.mockReturnValue({
      login: jest.fn(),
      loading: false,
      error: null,
      isAuthenticated: false,
      authMethod: AuthMethod.EMAIL_PASSWORD,
      user: null,
      token: null,
      mfaRequired: false,
      mfaStatus: 'inactive',
      deviceStatus: 'unknown',
      subscriptionStatus: 'none',
      logout: jest.fn(),
      verifyMFA: jest.fn(),
      validateSession: jest.fn(),
      socialLogin: jest.fn(),
      socialLogout: jest.fn(),
      isCoach: false,
      isAthlete: false,
      isAdmin: false,
      isPremium: false
    });
  });

  describe('Rendering', () => {
    it('should render the form with all required fields', () => {
      render(<LoginForm />);

      // Check form elements
      expect(screen.getByRole('form', { name: /login form/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should render input fields with correct attributes', () => {
      render(<LoginForm />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);

      // Check email input attributes
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('required');
      expect(emailInput).toHaveAttribute('autocomplete', 'email');

      // Check password input attributes
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('required');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });

    it('should disable form elements when loading', () => {
      mockUseAuth.mockReturnValue({
        ...mockUseAuth(),
        loading: true
      });

      render(<LoginForm />);

      expect(screen.getByLabelText(/email address/i)).toBeDisabled();
      expect(screen.getByLabelText(/password/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
  });

  describe('Form Validation', () => {
    it('should validate email format', async () => {
      render(<LoginForm />);
      const user = userEvent.setup();

      // Enter invalid email
      await user.type(screen.getByLabelText(/email address/i), invalidCredentials.email);
      fireEvent.blur(screen.getByLabelText(/email address/i));

      // Check error message
      expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
    });

    it('should validate password requirements', async () => {
      render(<LoginForm />);
      const user = userEvent.setup();

      // Enter invalid password
      await user.type(screen.getByLabelText(/password/i), invalidCredentials.password);
      fireEvent.blur(screen.getByLabelText(/password/i));

      // Check error message
      expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });

    it('should show required field errors on empty submission', async () => {
      render(<LoginForm />);

      // Submit empty form
      fireEvent.submit(screen.getByRole('form'));

      // Check error messages
      expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
      expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    });
  });

  describe('Authentication Flow', () => {
    it('should handle successful login', async () => {
      const mockLogin = jest.fn().mockResolvedValue(undefined);
      mockUseAuth.mockReturnValue({
        ...mockUseAuth(),
        login: mockLogin
      });

      render(<LoginForm />);
      const user = userEvent.setup();

      // Fill form with valid credentials
      await user.type(screen.getByLabelText(/email address/i), validCredentials.email);
      await user.type(screen.getByLabelText(/password/i), validCredentials.password);

      // Submit form
      fireEvent.submit(screen.getByRole('form'));

      // Verify login called with correct credentials
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: validCredentials.email,
          password: validCredentials.password
        });
      });
    });

    it('should handle login failure', async () => {
      const mockLogin = jest.fn().mockRejectedValue(new Error('Invalid credentials'));
      mockUseAuth.mockReturnValue({
        ...mockUseAuth(),
        login: mockLogin,
        error: 'Invalid credentials'
      });

      render(<LoginForm />);
      const user = userEvent.setup();

      // Fill and submit form
      await user.type(screen.getByLabelText(/email address/i), validCredentials.email);
      await user.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.submit(screen.getByRole('form'));

      // Check error message
      expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i);
    });

    it('should show loading state during authentication', async () => {
      mockUseAuth.mockReturnValue({
        ...mockUseAuth(),
        loading: true
      });

      render(<LoginForm />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Signing in...');
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard navigable', async () => {
      render(<LoginForm />);
      const user = userEvent.setup();

      // Tab through form elements
      await user.tab();
      expect(screen.getByLabelText(/email address/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/password/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button')).toHaveFocus();
    });

    it('should have proper ARIA attributes', () => {
      render(<LoginForm />);

      // Check form ARIA
      expect(screen.getByRole('form')).toHaveAttribute('aria-label', 'Login form');

      // Check input ARIA
      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput).toHaveAttribute('aria-invalid', 'false');
      
      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute('aria-invalid', 'false');
    });

    it('should announce errors to screen readers', async () => {
      render(<LoginForm />);
      const user = userEvent.setup();

      // Submit empty form
      fireEvent.submit(screen.getByRole('form'));

      // Check error announcements
      const alerts = await screen.findAllByRole('alert');
      expect(alerts).toHaveLength(2);
      expect(alerts[0]).toHaveTextContent(/email is required/i);
      expect(alerts[1]).toHaveTextContent(/password is required/i);
    });

    it('should pass accessibility audit', async () => {
      const { container } = render(<LoginForm />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});