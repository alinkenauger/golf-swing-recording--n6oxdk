import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Coach, Program } from '../types/coach';
import { CoachService, coachService } from '../services/coach.service';
import { ApiResponse, LoadingState } from '../types/common';

// State interface with comprehensive coach data
interface CoachState {
  profile: Coach | null;
  programs: Program[];
  analytics: {
    profileViews: number;
    totalStudents: number;
    activeStudents: number;
    completionRate: number;
    averageRating: number;
    revenue: {
      totalEarnings: number;
      monthlyEarnings: { month: string; amount: number; }[];
      programRevenue: { programId: string; revenue: number; enrollments: number; }[];
    };
  } | null;
  earnings: {
    totalEarnings: number;
    monthlyEarnings: { month: string; amount: number; }[];
  } | null;
  subscriptionStatus: string | null;
  loading: LoadingState;
  cache: Map<string, { data: any; timestamp: number; }>;
}

// Initial state with type safety
const initialState: CoachState = {
  profile: null,
  programs: [],
  analytics: null,
  earnings: null,
  subscriptionStatus: null,
  loading: {
    state: 'idle',
    error: null,
    progress: 0
  },
  cache: new Map()
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Async thunks for API operations
export const fetchCoachProfile = createAsyncThunk(
  'coach/fetchProfile',
  async (coachId: string, { rejectWithValue }) => {
    try {
      const response = await coachService.getCoachProfile(coachId);
      const analyticsResponse = await coachService.getAnalytics(coachId);
      const revenueResponse = await coachService.getRevenueAnalytics(coachId);

      return {
        profile: response.data,
        analytics: analyticsResponse.data,
        revenue: revenueResponse.data
      };
    } catch (error: any) {
      return rejectWithValue(error.error);
    }
  }
);

export const updateCoachProfile = createAsyncThunk(
  'coach/updateProfile',
  async ({ coachId, profileData }: { coachId: string; profileData: Partial<Coach> }, { rejectWithValue }) => {
    try {
      const response = await coachService.updateProfile(coachId, profileData);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.error);
    }
  }
);

export const fetchCoachPrograms = createAsyncThunk(
  'coach/fetchPrograms',
  async ({ coachId, page = 1, pageSize = 10 }: { coachId: string; page?: number; pageSize?: number }, { rejectWithValue }) => {
    try {
      const response = await coachService.getPrograms(coachId, page, pageSize);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.error);
    }
  }
);

// Create the coach slice
const coachSlice = createSlice({
  name: 'coach',
  initialState,
  reducers: {
    clearCoachState: (state) => {
      return initialState;
    },
    setSubscriptionStatus: (state, action: PayloadAction<string>) => {
      state.subscriptionStatus = action.payload;
    },
    clearCache: (state) => {
      state.cache.clear();
    },
    updateAnalytics: (state, action: PayloadAction<Partial<typeof state.analytics>>) => {
      if (state.analytics) {
        state.analytics = { ...state.analytics, ...action.payload };
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchCoachProfile
      .addCase(fetchCoachProfile.pending, (state) => {
        state.loading = { state: 'loading', error: null, progress: 0 };
      })
      .addCase(fetchCoachProfile.fulfilled, (state, action) => {
        state.profile = action.payload.profile;
        state.analytics = action.payload.analytics;
        state.earnings = action.payload.revenue;
        state.loading = { state: 'success', error: null, progress: 100 };
        
        // Update cache
        state.cache.set('profile', {
          data: action.payload,
          timestamp: Date.now()
        });
      })
      .addCase(fetchCoachProfile.rejected, (state, action) => {
        state.loading = {
          state: 'error',
          error: action.payload as any,
          progress: 0
        };
      })

      // Handle updateCoachProfile
      .addCase(updateCoachProfile.pending, (state) => {
        state.loading = { state: 'loading', error: null, progress: 0 };
      })
      .addCase(updateCoachProfile.fulfilled, (state, action) => {
        state.profile = action.payload;
        state.loading = { state: 'success', error: null, progress: 100 };
        state.cache.delete('profile'); // Invalidate cache
      })
      .addCase(updateCoachProfile.rejected, (state, action) => {
        state.loading = {
          state: 'error',
          error: action.payload as any,
          progress: 0
        };
      })

      // Handle fetchCoachPrograms
      .addCase(fetchCoachPrograms.pending, (state) => {
        state.loading = { state: 'loading', error: null, progress: 0 };
      })
      .addCase(fetchCoachPrograms.fulfilled, (state, action) => {
        state.programs = action.payload.items;
        state.loading = { state: 'success', error: null, progress: 100 };
      })
      .addCase(fetchCoachPrograms.rejected, (state, action) => {
        state.loading = {
          state: 'error',
          error: action.payload as any,
          progress: 0
        };
      });
  }
});

// Export actions and reducer
export const {
  clearCoachState,
  setSubscriptionStatus,
  clearCache,
  updateAnalytics
} = coachSlice.actions;

export default coachSlice.reducer;

// Selectors
export const selectCoachProfile = (state: { coach: CoachState }) => state.coach.profile;
export const selectCoachPrograms = (state: { coach: CoachState }) => state.coach.programs;
export const selectCoachAnalytics = (state: { coach: CoachState }) => state.coach.analytics;
export const selectCoachEarnings = (state: { coach: CoachState }) => state.coach.earnings;
export const selectCoachLoading = (state: { coach: CoachState }) => state.coach.loading;
export const selectSubscriptionStatus = (state: { coach: CoachState }) => state.coach.subscriptionStatus;