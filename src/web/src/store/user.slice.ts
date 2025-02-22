/**
 * Redux slice for managing user state in the web application
 * Handles user profile, preferences, authentication status, and role-based access
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { User, UserProfile, UserPreferences } from '../types/user';
import { UserService } from '../services/user.service';
import { LoadingState, ApiError } from '../types/common';

// Initialize UserService instance
const userService = new UserService(null, {
  maxRetries: 3,
  requestTimeout: 30000,
  cacheExpiry: 300000
});

/**
 * Interface for the user state slice
 */
interface UserState {
  currentUser: User | null;
  loading: LoadingState;
  lastUpdated: string | null;
  error: ApiError | null;
  isAuthenticated: boolean;
}

/**
 * Initial state for the user slice
 */
const initialState: UserState = {
  currentUser: null,
  loading: {
    state: 'idle',
    error: null,
    progress: 0
  },
  lastUpdated: null,
  error: null,
  isAuthenticated: false
};

/**
 * Async thunk for fetching current user data
 */
export const fetchCurrentUser = createAsyncThunk<User, void, { rejectValue: ApiError }>(
  'user/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const user = await userService.getCurrentUser();
      return user;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

/**
 * Async thunk for updating user profile
 */
export const updateUserProfile = createAsyncThunk<User, Partial<UserProfile>, { rejectValue: ApiError }>(
  'user/updateProfile',
  async (profile, { rejectWithValue }) => {
    try {
      const updatedUser = await userService.updateProfile(profile);
      return updatedUser;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

/**
 * Async thunk for updating user preferences
 */
export const updateUserPreferences = createAsyncThunk<User, Partial<UserPreferences>, { rejectValue: ApiError }>(
  'user/updatePreferences',
  async (preferences, { rejectWithValue }) => {
    try {
      const updatedUser = await userService.updatePreferences(preferences);
      return updatedUser;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

/**
 * User slice definition with reducers and actions
 */
const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setLoadingProgress: (state, action: PayloadAction<number>) => {
      state.loading.progress = action.payload;
    },
    clearError: (state) => {
      state.error = null;
      state.loading.error = null;
    },
    logout: (state) => {
      state.currentUser = null;
      state.isAuthenticated = false;
      state.lastUpdated = null;
      state.loading = initialState.loading;
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    // Handle fetchCurrentUser
    builder
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading.state = 'loading';
        state.loading.error = null;
        state.loading.progress = 0;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.currentUser = action.payload;
        state.isAuthenticated = true;
        state.lastUpdated = new Date().toISOString();
        state.loading.state = 'success';
        state.loading.progress = 100;
        state.error = null;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.loading.state = 'error';
        state.loading.error = action.payload || null;
        state.error = action.payload || null;
        state.isAuthenticated = false;
      });

    // Handle updateUserProfile
    builder
      .addCase(updateUserProfile.pending, (state) => {
        state.loading.state = 'loading';
        state.loading.error = null;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.currentUser = action.payload;
        state.lastUpdated = new Date().toISOString();
        state.loading.state = 'success';
        state.error = null;
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.loading.state = 'error';
        state.loading.error = action.payload || null;
        state.error = action.payload || null;
      });

    // Handle updateUserPreferences
    builder
      .addCase(updateUserPreferences.pending, (state) => {
        state.loading.state = 'loading';
        state.loading.error = null;
      })
      .addCase(updateUserPreferences.fulfilled, (state, action) => {
        state.currentUser = action.payload;
        state.lastUpdated = new Date().toISOString();
        state.loading.state = 'success';
        state.error = null;
      })
      .addCase(updateUserPreferences.rejected, (state, action) => {
        state.loading.state = 'error';
        state.loading.error = action.payload || null;
        state.error = action.payload || null;
      });
  }
});

// Export actions
export const { setLoadingProgress, clearError, logout } = userSlice.actions;

// Export selectors
export const selectUser = (state: { user: UserState }) => state.user.currentUser;
export const selectUserRole = (state: { user: UserState }) => state.user.currentUser?.role;
export const selectUserSubscription = (state: { user: UserState }) => state.user.currentUser?.subscription;
export const selectLoadingState = (state: { user: UserState }) => state.user.loading;
export const selectIsAuthenticated = (state: { user: UserState }) => state.user.isAuthenticated;
export const selectUserError = (state: { user: UserState }) => state.user.error;

// Memoized selectors for derived data
export const selectUserFullName = createSelector(
  selectUser,
  (user) => user ? `${user.profile.firstName} ${user.profile.lastName}` : ''
);

export const selectUserPermissions = createSelector(
  selectUser,
  (user) => ({
    canUploadVideos: user?.role === 'COACH' || user?.role === 'ATHLETE',
    canCreatePrograms: user?.role === 'COACH',
    canAccessAnalytics: user?.role === 'COACH' || user?.role === 'ADMIN',
    isVerified: user?.verificationStatus === 'verified'
  })
);

// Export reducer
export default userSlice.reducer;