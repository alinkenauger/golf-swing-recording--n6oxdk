import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit'; // ^2.0.0
import { Video, VideoStatus, VideoAnnotation, VideoUploadRequest } from '../types/video';
import { VideoService } from '../services/video.service';
import { ApiError } from '../types/common';

// Constants
const CHUNK_SIZE = 5242880; // 5MB chunks
const MAX_RETRIES = 3;
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// State interface
interface VideoState {
  videos: Record<string, Video>;
  currentVideo: string | null;
  loading: boolean;
  error: ApiError | null;
  uploadProgress: number;
  processingProgress: number;
  offlineQueue: Array<{
    type: 'upload' | 'annotation' | 'voiceover';
    data: any;
    timestamp: number;
  }>;
  retryCount: number;
  cacheTTL: number;
}

// Initial state
const initialState: VideoState = {
  videos: {},
  currentVideo: null,
  loading: false,
  error: null,
  uploadProgress: 0,
  processingProgress: 0,
  offlineQueue: [],
  retryCount: 0,
  cacheTTL: CACHE_TTL
};

// Async thunks
export const uploadVideoChunked = createAsyncThunk<Video, VideoUploadRequest>(
  'video/uploadChunked',
  async (request, { dispatch, rejectWithValue }) => {
    try {
      const videoService = new VideoService(null as any); // Service injection would be handled by DI
      let totalProgress = 0;

      const uploadProgressCallback = (progress: number) => {
        totalProgress = progress;
        dispatch(setUploadProgress(progress));
      };

      const video = await videoService.uploadVideo(request.file, request);

      // Monitor processing progress
      if (video.status === VideoStatus.PROCESSING) {
        const processingInterval = setInterval(async () => {
          const updatedVideo = await videoService.getVideo(video.id);
          dispatch(setProcessingProgress(updatedVideo.processingProgress || 0));

          if (updatedVideo.status === VideoStatus.READY) {
            clearInterval(processingInterval);
            dispatch(updateVideo(updatedVideo));
          }
        }, 2000);
      }

      return video;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

export const fetchVideoWithCache = createAsyncThunk<Video, string>(
  'video/fetchCached',
  async (videoId, { dispatch, getState, rejectWithValue }) => {
    try {
      const videoService = new VideoService(null as any);
      const video = await videoService.getVideo(videoId);
      return video;
    } catch (error) {
      if (!navigator.onLine) {
        // Handle offline scenario
        dispatch(addToOfflineQueue({
          type: 'fetch',
          data: { videoId },
          timestamp: Date.now()
        }));
      }
      return rejectWithValue(error as ApiError);
    }
  }
);

export const addAnnotationWithOffline = createAsyncThunk<VideoAnnotation, { videoId: string; annotation: VideoAnnotation }>(
  'video/addAnnotation',
  async ({ videoId, annotation }, { dispatch, rejectWithValue }) => {
    try {
      const videoService = new VideoService(null as any);
      const result = await videoService.addAnnotation(videoId, annotation);
      return result;
    } catch (error) {
      if (!navigator.onLine) {
        dispatch(addToOfflineQueue({
          type: 'annotation',
          data: { videoId, annotation },
          timestamp: Date.now()
        }));
      }
      return rejectWithValue(error as ApiError);
    }
  }
);

// Slice definition
const videoSlice = createSlice({
  name: 'video',
  initialState,
  reducers: {
    setCurrentVideo: (state, action: PayloadAction<string>) => {
      state.currentVideo = action.payload;
    },
    setUploadProgress: (state, action: PayloadAction<number>) => {
      state.uploadProgress = action.payload;
    },
    setProcessingProgress: (state, action: PayloadAction<number>) => {
      state.processingProgress = action.payload;
    },
    updateVideo: (state, action: PayloadAction<Video>) => {
      state.videos[action.payload.id] = action.payload;
    },
    addToOfflineQueue: (state, action: PayloadAction<{ type: string; data: any; timestamp: number }>) => {
      state.offlineQueue.push(action.payload);
    },
    clearError: (state) => {
      state.error = null;
    },
    resetProgress: (state) => {
      state.uploadProgress = 0;
      state.processingProgress = 0;
    }
  },
  extraReducers: (builder) => {
    builder
      // Upload video handling
      .addCase(uploadVideoChunked.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(uploadVideoChunked.fulfilled, (state, action) => {
        state.loading = false;
        state.videos[action.payload.id] = action.payload;
        state.currentVideo = action.payload.id;
        state.uploadProgress = 100;
      })
      .addCase(uploadVideoChunked.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as ApiError;
        state.retryCount += 1;
      })
      // Fetch video handling
      .addCase(fetchVideoWithCache.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchVideoWithCache.fulfilled, (state, action) => {
        state.loading = false;
        state.videos[action.payload.id] = action.payload;
      })
      .addCase(fetchVideoWithCache.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as ApiError;
      })
      // Add annotation handling
      .addCase(addAnnotationWithOffline.fulfilled, (state, action) => {
        const videoId = state.currentVideo;
        if (videoId && state.videos[videoId]) {
          state.videos[videoId].annotations.push(action.payload);
        }
      });
  }
});

// Selectors
export const selectVideoWithProcessing = createSelector(
  [(state: { video: VideoState }) => state.video],
  (videoState) => {
    const currentVideoId = videoState.currentVideo;
    if (!currentVideoId) return null;
    return {
      video: videoState.videos[currentVideoId],
      processingProgress: videoState.processingProgress,
      status: videoState.videos[currentVideoId]?.status
    };
  }
);

export const selectUploadWithProgress = createSelector(
  [(state: { video: VideoState }) => state.video],
  (videoState) => ({
    uploadProgress: videoState.uploadProgress,
    processingProgress: videoState.processingProgress,
    error: videoState.error
  })
);

export const selectOfflineQueue = createSelector(
  [(state: { video: VideoState }) => state.video.offlineQueue],
  (queue) => queue
);

// Export actions and reducer
export const {
  setCurrentVideo,
  setUploadProgress,
  setProcessingProgress,
  updateVideo,
  addToOfflineQueue,
  clearError,
  resetProgress
} = videoSlice.actions;

export default videoSlice.reducer;