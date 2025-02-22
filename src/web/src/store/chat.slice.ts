import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ChatState, ChatThread, Message, MessageStatus } from '../types/chat';
import { ChatService } from '../services/chat.service';

// Initialize chat service singleton
const chatService = new ChatService();

// Initial state with comprehensive chat management
const initialState: ChatState = {
  threads: [],
  activeThread: null,
  messages: {},
  typingUsers: {},
  userPresence: {},
  offlineQueue: [],
  deliveryStatus: {},
  loading: false,
  error: null
};

// Async thunk for fetching chat threads with pagination
export const fetchThreads = createAsyncThunk(
  'chat/fetchThreads',
  async ({ page, limit }: { page: number; limit: number }, { rejectWithValue }) => {
    try {
      const threads = await chatService.getThreads(page, limit);
      return threads;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk for fetching thread messages with pagination
export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async ({ threadId, page, limit }: { threadId: string; page: number; limit: number }, { rejectWithValue }) => {
    try {
      const messages = await chatService.getThreadMessages(threadId, page);
      return { threadId, messages };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk for sending messages with offline support
export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ threadId, content, type }: { threadId: string; content: string; type?: string }, { rejectWithValue }) => {
    try {
      await chatService.sendMessage(threadId, content, type);
      return { threadId, content, type };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// Create the chat slice with comprehensive state management
const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // Set active chat thread
    setActiveThread: (state, action: PayloadAction<ChatThread | null>) => {
      state.activeThread = action.payload;
      if (action.payload) {
        state.activeThread.unreadCount = 0;
      }
    },

    // Update typing status for users
    setTypingStatus: (state, action: PayloadAction<{ threadId: string; userId: string; isTyping: boolean }>) => {
      const { threadId, userId, isTyping } = action.payload;
      if (!state.typingUsers[threadId]) {
        state.typingUsers[threadId] = [];
      }
      
      if (isTyping) {
        if (!state.typingUsers[threadId].includes(userId)) {
          state.typingUsers[threadId].push(userId);
        }
      } else {
        state.typingUsers[threadId] = state.typingUsers[threadId].filter(id => id !== userId);
      }
    },

    // Update user presence status
    updateUserPresence: (state, action: PayloadAction<{ userId: string; isOnline: boolean }>) => {
      const { userId, isOnline } = action.payload;
      state.userPresence[userId] = isOnline;
    },

    // Update message delivery status
    updateMessageStatus: (state, action: PayloadAction<{ messageId: string; status: MessageStatus }>) => {
      const { messageId, status } = action.payload;
      state.deliveryStatus[messageId] = status;
    },

    // Add message to offline queue
    addToOfflineQueue: (state, action: PayloadAction<Message>) => {
      state.offlineQueue.push(action.payload);
    },

    // Remove message from offline queue
    removeFromOfflineQueue: (state, action: PayloadAction<string>) => {
      state.offlineQueue = state.offlineQueue.filter(msg => msg.id !== action.payload);
    },

    // Mark thread messages as read
    markThreadAsRead: (state, action: PayloadAction<string>) => {
      const thread = state.threads.find(t => t.id === action.payload);
      if (thread) {
        thread.unreadCount = 0;
      }
    },

    // Clear chat error state
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    // Handle fetchThreads states
    builder
      .addCase(fetchThreads.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchThreads.fulfilled, (state, action) => {
        state.threads = action.payload;
        state.loading = false;
      })
      .addCase(fetchThreads.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

    // Handle fetchMessages states
    builder
      .addCase(fetchMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { threadId, messages } = action.payload;
        state.messages[threadId] = messages;
        state.loading = false;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

    // Handle sendMessage states
    builder
      .addCase(sendMessage.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const { threadId } = action.payload;
        state.loading = false;
        // Remove sent message from offline queue if exists
        state.offlineQueue = state.offlineQueue.filter(msg => msg.threadId !== threadId);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  }
});

// Export actions
export const {
  setActiveThread,
  setTypingStatus,
  updateUserPresence,
  updateMessageStatus,
  addToOfflineQueue,
  removeFromOfflineQueue,
  markThreadAsRead,
  clearError
} = chatSlice.actions;

// Export reducer
export default chatSlice.reducer;