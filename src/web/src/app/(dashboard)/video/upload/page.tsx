'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VideoUploader } from '../../../components/video/VideoUploader';
import { useVideo } from '../../../hooks/useVideo';
import { Toast } from '../../../components/common/Toast';
import { NotificationType } from '../../../hooks/useNotification';
import type { Video, VideoStatus } from '../../../types/video';
import type { ApiError } from '../../../types/common';

/**
 * Video upload page component with comprehensive error handling and progress tracking
 * @version 1.0.0
 */
const VideoUploadPage = () => {
  const router = useRouter();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<NotificationType>(NotificationType.INFO);

  const {
    uploadVideo,
    uploadStatus,
    pauseUpload,
    resumeUpload,
    error: uploadError
  } = useVideo();

  // Track analytics for upload events
  useEffect(() => {
    if (window.analytics) {
      window.analytics.page('Video Upload');
    }
    
    // Cleanup any incomplete uploads on unmount
    return () => {
      if (uploadStatus.state === 'uploading') {
        pauseUpload();
      }
    };
  }, []);

  /**
   * Handle successful video upload completion
   */
  const handleUploadComplete = useCallback(async (uploadedVideo: Video) => {
    setToastMessage('Video uploaded successfully!');
    setToastType(NotificationType.SUCCESS);
    setShowToast(true);

    // Track successful upload
    if (window.analytics) {
      window.analytics.track('Video Upload Complete', {
        videoId: uploadedVideo.id,
        duration: uploadedVideo.metadata.duration,
        size: uploadedVideo.metadata.sizeBytes,
        format: uploadedVideo.metadata.format
      });
    }

    // Navigate to video details page after short delay
    setTimeout(() => {
      router.push(`/video/${uploadedVideo.id}`);
    }, 1500);
  }, [router]);

  /**
   * Handle video upload errors with specific error messages
   */
  const handleUploadError = useCallback((error: ApiError) => {
    let errorMessage = 'Failed to upload video. Please try again.';

    // Map specific error codes to user-friendly messages
    switch (error.code) {
      case 'VALIDATION_ERROR':
        errorMessage = error.message || 'Invalid video format or size';
        break;
      case 'QUOTA_EXCEEDED':
        errorMessage = 'Storage quota exceeded. Please free up space.';
        break;
      case 'NETWORK_ERROR':
        errorMessage = 'Network error. Please check your connection.';
        break;
      case 'PROCESSING_ERROR':
        errorMessage = 'Error processing video. Please try again.';
        break;
    }

    setToastMessage(errorMessage);
    setToastType(NotificationType.ERROR);
    setShowToast(true);

    // Track upload error
    if (window.analytics) {
      window.analytics.track('Video Upload Error', {
        errorCode: error.code,
        errorMessage: error.message
      });
    }
  }, []);

  /**
   * Handle upload progress updates
   */
  const handleUploadProgress = useCallback((progress: number) => {
    // Track upload milestones
    if (window.analytics && progress % 25 === 0) {
      window.analytics.track('Video Upload Progress', {
        progress: progress
      });
    }
  }, []);

  /**
   * Handle upload cancellation
   */
  const handleUploadCancel = useCallback(() => {
    pauseUpload();
    setToastMessage('Upload cancelled');
    setToastType(NotificationType.INFO);
    setShowToast(true);

    // Track cancellation
    if (window.analytics) {
      window.analytics.track('Video Upload Cancelled');
    }
  }, [pauseUpload]);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Upload Video
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload your training video for analysis. Supported formats: MP4, MOV, AVI, WEBM
          </p>
        </div>

        <VideoUploader
          onUploadComplete={handleUploadComplete}
          onError={handleUploadError}
          onProgress={handleUploadProgress}
          onCancel={handleUploadCancel}
        />

        {uploadStatus.state === 'uploading' && (
          <div className="bg-blue-50 rounded-md p-4">
            <div className="flex items-center">
              <div className="flex-1">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700">
                    Uploading...
                  </span>
                  <span className="text-sm text-blue-700">
                    {Math.round(uploadStatus.progress)}%
                  </span>
                </div>
                <div className="bg-blue-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadStatus.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {showToast && (
          <Toast
            id="upload-toast"
            type={toastType}
            message={toastMessage}
            onClose={() => setShowToast(false)}
            duration={5000}
          />
        )}
      </div>
    </div>
  );
};

export default VideoUploadPage;