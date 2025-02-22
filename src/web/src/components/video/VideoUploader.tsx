import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVideo } from '../../hooks/useVideo';
import type { VideoUploadRequest } from '../../types/video';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { CloudArrowUpIcon, XMarkIcon } from '@heroicons/react/24/solid'; // ^2.0.0
import { useUploadQueue } from '@uploadcare/upload-client'; // ^6.0.0

// Constants for video upload configuration
const SUPPORTED_FORMATS = ['mp4', 'mov', 'avi', 'webm', 'mkv'];
const SUPPORTED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
const MAX_FILE_SIZE = 1024 * 1024 * 500; // 500MB
const CHUNK_SIZE = 1024 * 1024 * 2; // 2MB chunks

interface VideoUploaderProps {
  onUploadComplete: (video: Video) => void;
  onError: (error: ApiError) => void;
  onProgress: (progress: number) => void;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onUploadComplete,
  onError,
  onProgress
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadVideo, uploadStatus, pauseUpload, resumeUpload } = useVideo();
  const uploadQueue = useUploadQueue();

  // Validate file before upload
  const validateFile = async (file: File): Promise<ValidationResult> => {
    if (!file) {
      return { isValid: false, error: 'No file selected' };
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_FORMATS.includes(extension)) {
      return { 
        isValid: false, 
        error: `Unsupported format. Allowed formats: ${SUPPORTED_FORMATS.join(', ')}` 
      };
    }

    if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
      return { isValid: false, error: 'Invalid file type' };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { 
        isValid: false, 
        error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` 
      };
    }

    // Check available storage quota
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const { quota, usage } = await navigator.storage.estimate();
      if (quota && usage && (quota - usage) < file.size) {
        return { isValid: false, error: 'Insufficient storage space' };
      }
    }

    return { isValid: true };
  };

  // Create upload chunks for large file handling
  const createChunks = (file: File, chunkSize: number): Blob[] => {
    const chunks: Blob[] = [];
    let start = 0;

    while (start < file.size) {
      const end = Math.min(start + chunkSize, file.size);
      chunks.push(file.slice(start, end));
      start = end;
    }

    return chunks;
  };

  // Handle file selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setValidationError(null);
    const validation = await validateFile(file);

    if (!validation.isValid) {
      setValidationError(validation.error);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onError({ code: 'VALIDATION_ERROR', message: validation.error || 'Invalid file' });
      return;
    }

    setSelectedFile(file);
  }, [onError]);

  // Handle form submission
  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedFile || !title.trim()) {
      setValidationError('Please provide a title and select a file');
      return;
    }

    try {
      setIsUploading(true);
      const chunks = createChunks(selectedFile, CHUNK_SIZE);
      
      // Initialize upload queue
      uploadQueue.init({
        chunks,
        chunkSize: CHUNK_SIZE,
        endpoint: '/api/v1/videos/upload',
        onProgress: (progress) => {
          onProgress(progress);
        }
      });

      const uploadRequest: VideoUploadRequest = {
        file: selectedFile,
        title: title.trim(),
        description: description.trim(),
        metadata: {
          duration: 0, // Will be calculated by server
          width: 0, // Will be calculated by server
          height: 0, // Will be calculated by server
          fps: 0, // Will be calculated by server
          codec: '', // Will be detected by server
          sizeBytes: selectedFile.size,
          format: selectedFile.name.split('.').pop()?.toLowerCase() || ''
        }
      };

      const video = await uploadVideo(uploadRequest);
      onUploadComplete(video);

      // Reset form
      setSelectedFile(null);
      setTitle('');
      setDescription('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      onError(error as ApiError);
      setValidationError((error as Error).message);
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, title, description, uploadVideo, onUploadComplete, onError, onProgress, uploadQueue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      uploadQueue.clear();
    };
  }, [uploadQueue]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="video-title"
        name="title"
        type="text"
        label="Video Title"
        value={title}
        onChange={setTitle}
        required
        disabled={isUploading}
        error={validationError}
        placeholder="Enter video title"
      />

      <Input
        id="video-description"
        name="description"
        type="text"
        label="Description"
        value={description}
        onChange={setDescription}
        disabled={isUploading}
        placeholder="Enter video description"
      />

      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_MIME_TYPES.join(',')}
          onChange={handleFileSelect}
          className="sr-only"
          aria-label="Choose video file"
          disabled={isUploading}
        />

        <Button
          type="button"
          variant="outline"
          fullWidth
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          startIcon={<CloudArrowUpIcon className="h-5 w-5" />}
        >
          {selectedFile ? selectedFile.name : 'Choose Video File'}
        </Button>

        {selectedFile && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            disabled={isUploading}
            aria-label="Remove selected file"
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {uploadStatus.state === 'uploading' && (
        <div className="flex items-center justify-between">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-primary-600 h-2.5 rounded-full transition-all"
              style={{ width: `${uploadStatus.progress}%` }}
            />
          </div>
          <div className="ml-4 flex space-x-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={uploadStatus.state === 'paused' ? resumeUpload : pauseUpload}
            >
              {uploadStatus.state === 'paused' ? 'Resume' : 'Pause'}
            </Button>
          </div>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        fullWidth
        loading={isUploading}
        disabled={!selectedFile || !title.trim() || isUploading}
      >
        {isUploading ? 'Uploading...' : 'Upload Video'}
      </Button>

      {validationError && (
        <div className="text-error-500 text-sm mt-2" role="alert">
          {validationError}
        </div>
      )}
    </form>
  );
};