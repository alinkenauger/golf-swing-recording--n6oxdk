import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit'; // v1.9.5
import { Payment, Subscription, PaymentMethod, SubscriptionStatus, SubscriptionInterval } from '../types/payment';
import { PaymentService } from '../services/payment.service';
import { ApiError, LoadingState, PaginatedResponse } from '../types/common';

// Initialize payment service
const paymentService = new PaymentService();

// State interface
interface PaymentState {
  payments: Payment[];
  subscriptions: Subscription[];
  revenueAnalytics: {
    totalRevenue: number;
    monthlyRecurring: number;
    averageTransactionValue: number;
    lastUpdated: string;
  };
  pagination: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    total: number;
  };
  loadingStates: {
    processPayment: LoadingState;
    fetchTransactions: LoadingState;
    fetchAnalytics: LoadingState;
    subscription: LoadingState;
  };
}

// Initial state
const initialState: PaymentState = {
  payments: [],
  subscriptions: [],
  revenueAnalytics: {
    totalRevenue: 0,
    monthlyRecurring: 0,
    averageTransactionValue: 0,
    lastUpdated: new Date().toISOString()
  },
  pagination: {
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    total: 0
  },
  loadingStates: {
    processPayment: { state: 'idle', error: null },
    fetchTransactions: { state: 'idle', error: null },
    fetchAnalytics: { state: 'idle', error: null },
    subscription: { state: 'idle', error: null }
  }
};

// Async thunks
export const processPayment = createAsyncThunk(
  'payment/processPayment',
  async (paymentData: Partial<Payment>, { rejectWithValue }) => {
    try {
      const result = await paymentService.processPayment(paymentData);
      if (!result.success) {
        return rejectWithValue(result.error);
      }
      return result;
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

export const getTransactionHistory = createAsyncThunk(
  'payment/getTransactionHistory',
  async (params: { page: number; pageSize: number }, { rejectWithValue }) => {
    try {
      const response = await paymentService.getTransactionHistory(params);
      return response;
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

export const getRevenueAnalytics = createAsyncThunk(
  'payment/getRevenueAnalytics',
  async (params: { startDate: string; endDate: string }, { rejectWithValue }) => {
    try {
      const analytics = await paymentService.getRevenueAnalytics(params);
      return analytics;
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

export const manageSubscription = createAsyncThunk(
  'payment/manageSubscription',
  async (
    { action, data }: { 
      action: 'create' | 'cancel' | 'update'; 
      data: Partial<Subscription> 
    }, 
    { rejectWithValue }
  ) => {
    try {
      switch (action) {
        case 'create':
          return await paymentService.createSubscription(data);
        case 'cancel':
          return await paymentService.cancelSubscription(data.stripeSubscriptionId!);
        case 'update':
          return await paymentService.updateSubscription(data);
        default:
          throw new Error('Invalid subscription action');
      }
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Create the slice
const paymentSlice = createSlice({
  name: 'payment',
  initialState,
  reducers: {
    resetPaymentState: (state) => {
      state.loadingStates.processPayment = { state: 'idle', error: null };
    },
    updatePagination: (state, action: PayloadAction<Partial<typeof initialState.pagination>>) => {
      state.pagination = { ...state.pagination, ...action.payload };
    }
  },
  extraReducers: (builder) => {
    // Process Payment
    builder
      .addCase(processPayment.pending, (state) => {
        state.loadingStates.processPayment = { state: 'loading', error: null };
      })
      .addCase(processPayment.fulfilled, (state, action) => {
        state.loadingStates.processPayment = { state: 'success', error: null };
        state.payments.unshift(action.payload as Payment);
      })
      .addCase(processPayment.rejected, (state, action) => {
        state.loadingStates.processPayment = {
          state: 'error',
          error: action.payload as ApiError
        };
      })

    // Transaction History
    builder
      .addCase(getTransactionHistory.pending, (state) => {
        state.loadingStates.fetchTransactions = { state: 'loading', error: null };
      })
      .addCase(getTransactionHistory.fulfilled, (state, action) => {
        const response = action.payload as PaginatedResponse<Payment>;
        state.payments = response.items;
        state.pagination = {
          currentPage: response.page,
          totalPages: response.totalPages,
          pageSize: response.pageSize,
          total: response.total
        };
        state.loadingStates.fetchTransactions = { state: 'success', error: null };
      })
      .addCase(getTransactionHistory.rejected, (state, action) => {
        state.loadingStates.fetchTransactions = {
          state: 'error',
          error: action.payload as ApiError
        };
      })

    // Revenue Analytics
    builder
      .addCase(getRevenueAnalytics.pending, (state) => {
        state.loadingStates.fetchAnalytics = { state: 'loading', error: null };
      })
      .addCase(getRevenueAnalytics.fulfilled, (state, action) => {
        state.revenueAnalytics = {
          ...action.payload,
          lastUpdated: new Date().toISOString()
        };
        state.loadingStates.fetchAnalytics = { state: 'success', error: null };
      })
      .addCase(getRevenueAnalytics.rejected, (state, action) => {
        state.loadingStates.fetchAnalytics = {
          state: 'error',
          error: action.payload as ApiError
        };
      })

    // Subscription Management
    builder
      .addCase(manageSubscription.pending, (state) => {
        state.loadingStates.subscription = { state: 'loading', error: null };
      })
      .addCase(manageSubscription.fulfilled, (state, action) => {
        state.loadingStates.subscription = { state: 'success', error: null };
        const subscription = action.payload as Subscription;
        const index = state.subscriptions.findIndex(s => s.stripeSubscriptionId === subscription.stripeSubscriptionId);
        if (index !== -1) {
          state.subscriptions[index] = subscription;
        } else {
          state.subscriptions.push(subscription);
        }
      })
      .addCase(manageSubscription.rejected, (state, action) => {
        state.loadingStates.subscription = {
          state: 'error',
          error: action.payload as ApiError
        };
      });
  }
});

// Selectors
export const selectTransactionHistory = createSelector(
  [(state: { payment: PaymentState }) => state.payment.payments],
  (payments) => payments
);

export const selectRevenueAnalytics = createSelector(
  [(state: { payment: PaymentState }) => state.payment.revenueAnalytics],
  (analytics) => analytics
);

export const selectPaymentsByDate = createSelector(
  [
    (state: { payment: PaymentState }) => state.payment.payments,
    (_: any, dateRange: { start: string; end: string }) => dateRange
  ],
  (payments, dateRange) => {
    return payments.filter(payment => {
      const paymentDate = new Date(payment.createdAt);
      return paymentDate >= new Date(dateRange.start) && 
             paymentDate <= new Date(dateRange.end);
    });
  }
);

export const selectLoadingStates = createSelector(
  [(state: { payment: PaymentState }) => state.payment.loadingStates],
  (loadingStates) => loadingStates
);

// Export actions and reducer
export const { resetPaymentState, updatePagination } = paymentSlice.actions;
export default paymentSlice.reducer;