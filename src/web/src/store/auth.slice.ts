/**
 * Redux Toolkit slice for comprehensive authentication state management
 * Handles authentication flows, session management, and role-based access control
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // ^1.9.7
import { 
  AuthState, 
  EmailPasswordCredentials,
  SocialAuthCredentials,
  BiometricAuthData,
  MFAData,
  User,
  AuthMethod,
  SubscriptionStatus
} from '../types/auth';
import { AuthService } from '../services/auth.service';
import { RootState } from './store';

// Initial authentication state
const initialState: AuthState & {
  loading: boolean;
  error: string | null;
  mfaRequired: boolean;
  deviceId: string | null;
  sessionExpiry: number | null;
  retryAttempts: number;
} = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: false,
  error: null,
  mfaRequired: false,
  mfaStatus: 'inactive',
  authMethod: 'none',
  subscriptionStatus: 'none',
  deviceId: null,
  sessionExpiry: null,
  retryAttempts: 0
};

/**
 * Async thunk for handling email/password login
 */
export const loginAsync = createAsyncThunk(
  'auth/login',
  async (credentials: EmailPasswordCredentials, { rejectWithValue }) => {
    try {
      const deviceInfo = {
        type: 'web',
        os: navigator.platform,
        browser: navigator.userAgent
      };

      const response = await AuthService.login(credentials, deviceInfo);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.error?.message || 'Login failed');
    }
  }
);

/**
 * Async thunk for social login integration
 */
export const socialLoginAsync = createAsyncThunk(
  'auth/socialLogin',
  async (params: SocialAuthCredentials, { rejectWithValue }) => {
    try {
      const deviceInfo = {
        type: 'web',
        os: navigator.platform,
        browser: navigator.userAgent
      };

      const response = await AuthService.login(params, deviceInfo);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.error?.message || 'Social login failed');
    }
  }
);

/**
 * Async thunk for MFA verification
 */
export const verifyMFAAsync = createAsyncThunk(
  'auth/verifyMFA',
  async (mfaData: MFAData, { rejectWithValue }) => {
    try {
      const response = await AuthService.handleMFAChallenge(mfaData);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.error?.message || 'MFA verification failed');
    }
  }
);

/**
 * Async thunk for session validation
 */
export const validateSessionAsync = createAsyncThunk(
  'auth/validateSession',
  async (_, { rejectWithValue }) => {
    try {
      const isValid = await AuthService.validateSession();
      return isValid;
    } catch (error: any) {
      return rejectWithValue('Session validation failed');
    }
  }
);

/**
 * Async thunk for user logout
 */
export const logoutAsync = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await AuthService.logout();
      return true;
    } catch (error: any) {
      return rejectWithValue('Logout failed');
    }
  }
);

/**
 * Authentication slice with comprehensive state management
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthMethod: (state, action: PayloadAction<AuthMethod>) => {
      state.authMethod = action.payload;
    },
    setMFAStatus: (state, action: PayloadAction<'active' | 'inactive' | 'pending'>) => {
      state.mfaStatus = action.payload;
    },
    updateSubscriptionStatus: (state, action: PayloadAction<SubscriptionStatus>) => {
      state.subscriptionStatus = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    resetRetryAttempts: (state) => {
      state.retryAttempts = 0;
    }
  },
  extraReducers: (builder) => {
    // Login handling
    builder.addCase(loginAsync.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(loginAsync.fulfilled, (state, action) => {
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.deviceId = action.payload.deviceId;
      state.sessionExpiry = action.payload.expiresAt;
      state.mfaRequired = action.payload.user.mfaEnabled;
      state.subscriptionStatus = action.payload.user.subscriptionStatus;
      state.loading = false;
      state.error = null;
      state.retryAttempts = 0;
    });
    builder.addCase(loginAsync.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
      state.retryAttempts += 1;
    });

    // Social login handling
    builder.addCase(socialLoginAsync.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(socialLoginAsync.fulfilled, (state, action) => {
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.deviceId = action.payload.deviceId;
      state.sessionExpiry = action.payload.expiresAt;
      state.authMethod = action.payload.user.preferredAuthMethod;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(socialLoginAsync.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // MFA verification handling
    builder.addCase(verifyMFAAsync.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(verifyMFAAsync.fulfilled, (state, action) => {
      state.mfaStatus = 'active';
      state.mfaRequired = false;
      state.token = action.payload.token;
      state.sessionExpiry = action.payload.expiresAt;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(verifyMFAAsync.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
      state.mfaStatus = 'inactive';
    });

    // Session validation handling
    builder.addCase(validateSessionAsync.fulfilled, (state, action) => {
      if (!action.payload) {
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.sessionExpiry = null;
      }
    });
    builder.addCase(validateSessionAsync.rejected, (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.sessionExpiry = null;
    });

    // Logout handling
    builder.addCase(logoutAsync.fulfilled, (state) => {
      return { ...initialState };
    });
  }
});

// Export actions
export const {
  setAuthMethod,
  setMFAStatus,
  updateSubscriptionStatus,
  clearError,
  resetRetryAttempts
} = authSlice.actions;

// Export selectors
export const selectAuth = (state: RootState) => state.auth;
export const selectUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectMFAStatus = (state: RootState) => state.auth.mfaStatus;
export const selectAuthMethod = (state: RootState) => state.auth.authMethod;
export const selectSubscriptionStatus = (state: RootState) => state.auth.subscriptionStatus;
export const selectSessionValidity = (state: RootState) => ({
  isValid: state.auth.isAuthenticated && state.auth.sessionExpiry 
    ? state.auth.sessionExpiry > Date.now() 
    : false,
  expiresAt: state.auth.sessionExpiry
});

// Export reducer
export default authSlice.reducer;