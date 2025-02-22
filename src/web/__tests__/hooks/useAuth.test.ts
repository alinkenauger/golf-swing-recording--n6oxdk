import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useAuth } from '../../src/hooks/useAuth';
import { AuthMethod, UserRole, SubscriptionStatus } from '../../src/types/auth';
import authReducer from '../../src/store/auth.slice';

// Mock Auth0
jest.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    loginWithRedirect: jest.fn(),
    logout: jest.fn(),
    user: null
  })
}));

// Mock secure storage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key],
    setItem: (key: string, value: string) => { store[key] = value; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock device info
const mockDeviceInfo = {
  type: 'web',
  os: 'test-os',
  browser: 'test-browser'
};

// Test user data
const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: UserRole.COACH,
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  bio: null,
  isActive: true,
  lastLogin: new Date().toISOString(),
  subscriptionStatus: SubscriptionStatus.PREMIUM,
  mfaEnabled: true,
  preferredAuthMethod: AuthMethod.EMAIL_PASSWORD
};

// Configure test store
const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      auth: authReducer
    },
    preloadedState: {
      auth: {
        isAuthenticated: false,
        user: null,
        token: null,
        mfaRequired: false,
        mfaStatus: 'inactive',
        authMethod: 'none',
        subscriptionStatus: 'none',
        deviceId: null,
        sessionExpiry: null,
        ...initialState
      }
    }
  });
};

describe('useAuth hook', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Authentication Flows', () => {
    it('should handle email/password login successfully', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      const credentials = {
        email: 'test@example.com',
        password: 'Test123!',
        rememberMe: true
      };

      await act(async () => {
        await result.current.login(credentials);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(testUser);
      expect(result.current.authMethod).toBe(AuthMethod.EMAIL_PASSWORD);
    });

    it('should handle MFA verification correctly', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      const mfaCredentials = {
        type: 'totp',
        code: '123456',
        sessionToken: 'test-session-token'
      };

      await act(async () => {
        await result.current.verifyMFA(mfaCredentials);
      });

      expect(result.current.mfaStatus).toBe('active');
      expect(result.current.mfaRequired).toBe(false);
    });

    it('should handle social login integration', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      await act(async () => {
        await result.current.socialLogin({ returnTo: window.location.origin });
      });

      expect(result.current.authMethod).toBe(AuthMethod.GOOGLE);
    });

    it('should handle logout and cleanup correctly', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(mockLocalStorage.getItem('_secure_auth_token')).toBeUndefined();
    });
  });

  describe('Authorization Tests', () => {
    it('should handle role-based access control', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      expect(result.current.isCoach).toBe(false);
      expect(result.current.isAthlete).toBe(false);
      expect(result.current.isAdmin).toBe(false);

      act(() => {
        store.dispatch({
          type: 'auth/setUser',
          payload: { ...testUser, role: UserRole.COACH }
        });
      });

      expect(result.current.isCoach).toBe(true);
    });

    it('should handle subscription status changes', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      act(() => {
        store.dispatch({
          type: 'auth/updateSubscriptionStatus',
          payload: SubscriptionStatus.PREMIUM
        });
      });

      expect(result.current.isPremium).toBe(true);
    });
  });

  describe('Security Tests', () => {
    it('should validate session periodically', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      act(() => {
        store.dispatch({
          type: 'auth/login/fulfilled',
          payload: {
            user: testUser,
            token: 'test-token',
            sessionExpiry: Date.now() + 3600000
          }
        });
      });

      jest.advanceTimersByTime(300000); // 5 minutes

      expect(result.current.isAuthenticated).toBe(true);
      jest.useRealTimers();
    });

    it('should handle token refresh correctly', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      await act(async () => {
        await result.current.refreshToken();
      });

      expect(result.current.token).not.toBeNull();
    });

    it('should handle device binding securely', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      const deviceInfo = {
        type: 'web',
        os: navigator.platform,
        browser: navigator.userAgent
      };

      await act(async () => {
        await result.current.bindDevice(deviceInfo);
      });

      expect(result.current.deviceStatus).toBe('bound');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid credentials', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      const invalidCredentials = {
        email: 'invalid@example.com',
        password: 'wrong'
      };

      await act(async () => {
        try {
          await result.current.login(invalidCredentials);
        } catch (error) {
          expect(error.message).toBe('Authentication failed. Please try again.');
        }
      });

      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should handle MFA verification failures', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>
      });

      const invalidMFA = {
        type: 'totp',
        code: 'invalid',
        sessionToken: 'test-session-token'
      };

      await act(async () => {
        try {
          await result.current.verifyMFA(invalidMFA);
        } catch (error) {
          expect(error.message).toBe('MFA verification failed. Please try again.');
        }
      });

      expect(result.current.mfaStatus).toBe('inactive');
    });
  });
});