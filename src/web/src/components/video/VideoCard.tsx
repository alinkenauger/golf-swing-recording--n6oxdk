import React, { useCallback, useMemo } from 'react';
import classNames from 'classnames'; // ^2.3.2
import { useIntersectionObserver } from 'react-intersection-observer'; // ^9.0.0
import Card from '../common/Card';
import ErrorBoundary from '../common/ErrorBoundary';
import type { Video, VideoStatus, VideoVariant } from '../../types/video';

interface VideoCardProps {
  video: Video;
  className?: string;
  onClick?: (video: Video) => void;
  showControls?: boolean;
  onRetry?: (video: Video) => void;
  onQualityChange?: (variant: VideoVariant) => void;
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  const pad = (num: number): string => num.toString().padStart(2, '0');

  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`
    : `${pad(minutes)}:${pad(remainingSeconds)}`;
};

const getStatusColor = (status: VideoStatus): string => {
  const statusColors = {
    PENDING: 'bg-gray-500',
    PROCESSING: 'bg-blue-500',
    READY: 'bg-green-500',
    FAILED: 'bg-red-500'
  };
  return statusColors[status] || 'bg-gray-500';
};

const VideoCard: React.FC<VideoCardProps> = ({
  video,
  className,
  onClick,
  showControls = false,
  onRetry,
  onQualityChange
}) => {
  const { ref, inView } = useIntersectionObserver({
    threshold: 0.1,
    triggerOnce: true
  });

  const handleThumbnailError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.src = '/assets/images/thumbnail-fallback.jpg';
    target.classList.add('opacity-50');
  }, []);

  const handleRetryClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry?.(video);
  }, [video, onRetry]);

  const handleQualitySelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVariant = video.variants.find(v => v.quality === e.target.value);
    if (selectedVariant && onQualityChange) {
      onQualityChange(selectedVariant);
    }
  }, [video.variants, onQualityChange]);

  const thumbnailUrl = useMemo(() => {
    const hdVariant = video.variants.find(v => v.quality === 'HD');
    return hdVariant?.url || video.variants[0]?.url;
  }, [video.variants]);

  return (
    <ErrorBoundary
      fallback={
        <Card className="bg-red-50">
          <div className="p-4 text-red-600">Failed to load video card</div>
        </Card>
      }
    >
      <Card
        className={classNames(
          'group transition-transform duration-200 hover:scale-[1.02]',
          className
        )}
        onClick={() => onClick?.(video)}
        role="article"
        aria-label={`Video: ${video.title}`}
      >
        <div ref={ref} className="relative aspect-video bg-gray-100">
          {inView && (
            <img
              src={thumbnailUrl}
              alt={video.title}
              className={classNames(
                'w-full h-full object-cover transition-opacity duration-300',
                video.status === VideoStatus.READY ? 'opacity-100' : 'opacity-75'
              )}
              onError={handleThumbnailError}
              loading="lazy"
            />
          )}

          <div
            className={classNames(
              'absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium text-white',
              getStatusColor(video.status)
            )}
          >
            {video.status}
          </div>

          {video.metadata.duration && (
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-sm rounded">
              {formatDuration(video.metadata.duration)}
            </div>
          )}

          {video.status === VideoStatus.PROCESSING && (
            <div
              className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300"
              style={{ width: `${video.processingProgress || 0}%` }}
              role="progressbar"
              aria-valuenow={video.processingProgress || 0}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          )}

          {video.status === VideoStatus.FAILED && onRetry && (
            <button
              className="absolute inset-0 flex items-center justify-center bg-black/50 text-white"
              onClick={handleRetryClick}
              aria-label="Retry processing video"
            >
              <span className="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700">
                Retry
              </span>
            </button>
          )}
        </div>

        <div className="p-4">
          <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
            {video.title}
          </h3>

          <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
            <span>{video.metadata.width}x{video.metadata.height}</span>
            <span>•</span>
            <span>{(video.metadata.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
          </div>

          {showControls && video.status === VideoStatus.READY && (
            <div className="mt-3 flex items-center justify-between">
              <select
                className="form-select text-sm border-gray-300 rounded-md"
                onChange={handleQualitySelect}
                aria-label="Select video quality"
              >
                {video.variants.map(variant => (
                  <option key={variant.quality} value={variant.quality}>
                    {variant.quality} ({variant.metadata.height}p)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Card>
    </ErrorBoundary>
  );
};

export default VideoCard;