/**
 * Root Redux store configuration for the Video Coaching Platform
 * Implements centralized state management with real-time features and performance optimizations
 * @version 1.0.0
 */

import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit'; // ^1.9.7
import { persistStore, persistReducer } from 'redux-persist'; // ^6.0.0
import storage from 'redux-persist/lib/storage';
import { createSelector } from 'reselect'; // ^4.1.8
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

// Import reducers
import authReducer from './auth.slice';
import videoReducer from './video.slice';
import chatReducer from './chat.slice';

// Create listener middleware for side effects
const listenerMiddleware = createListenerMiddleware();

// Configure persistence
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth', 'video'], // Only persist auth and video states
  blacklist: ['chat'], // Don't persist real-time chat data
  version: 1,
  timeout: 2000,
  serialize: true,
  debug: process.env.NODE_ENV === 'development'
};

// Configure middleware with type safety and error handling
const configureMiddleware = () => {
  const middleware = [
    listenerMiddleware.middleware,
  ];

  // Add development tools in non-production
  if (process.env.NODE_ENV === 'development') {
    middleware.push(require('redux-logger').default);
  }

  return middleware;
};

// Configure root reducer with persistence
const rootReducer = {
  auth: persistReducer(persistConfig, authReducer),
  video: persistReducer(persistConfig, videoReducer),
  chat: chatReducer // Chat state not persisted for real-time sync
};

// Configure store with middleware and persistence
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        ignoredPaths: ['chat.socket']
      },
      thunk: true,
      immutableCheck: true
    }).concat(configureMiddleware()),
  devTools: process.env.NODE_ENV !== 'production'
});

// Configure real-time listeners
const setupListeners = () => {
  // Video upload progress tracking
  listenerMiddleware.startListening({
    actionCreator: videoReducer.actions.setUploadProgress,
    effect: async (action, listenerApi) => {
      const progress = action.payload;
      if (progress === 100) {
        listenerApi.dispatch(videoReducer.actions.resetProgress());
      }
    }
  });

  // Chat message synchronization
  listenerMiddleware.startListening({
    actionCreator: chatReducer.actions.setActiveThread,
    effect: async (action, listenerApi) => {
      if (action.payload) {
        listenerApi.dispatch(chatReducer.actions.markThreadAsRead(action.payload.id));
      }
    }
  });

  // Authentication state monitoring
  listenerMiddleware.startListening({
    actionCreator: authReducer.actions.setAuthMethod,
    effect: async (action, listenerApi) => {
      const state = listenerApi.getState() as RootState;
      if (!state.auth.isAuthenticated) {
        listenerApi.dispatch(authReducer.actions.clearError());
      }
    }
  });
};

// Initialize listeners
setupListeners();

// Configure persistor
export const persistor = persistStore(store);

// Export types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Export typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Export memoized selectors
export const selectAuthState = createSelector(
  (state: RootState) => state.auth,
  (auth) => auth
);

export const selectVideoState = createSelector(
  (state: RootState) => state.video,
  (video) => video
);

export const selectChatState = createSelector(
  (state: RootState) => state.chat,
  (chat) => chat
);

// Export combined selectors
export const selectUserWithVideos = createSelector(
  selectAuthState,
  selectVideoState,
  (auth, video) => ({
    user: auth.user,
    videos: Object.values(video.videos).filter(v => v.userId === auth.user?.id)
  })
);

export const selectActiveThreadWithMessages = createSelector(
  selectChatState,
  (chat) => ({
    thread: chat.activeThread,
    messages: chat.activeThread ? chat.messages[chat.activeThread.id] : []
  })
);