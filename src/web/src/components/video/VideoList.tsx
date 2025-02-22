import React, { useCallback, useMemo, useRef } from 'react';
import classNames from 'classnames'; // ^2.3.2
import { useIntersectionObserver } from 'react-intersection-observer'; // ^9.0.0

import VideoCard from './VideoCard';
import { Loading } from '../common/Loading';
import { EmptyState } from '../common/EmptyState';
import ErrorBoundary from '../common/ErrorBoundary';

import type { Video, VideoStatus } from '../../types/video';

interface GridLayout {
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: number;
  padding?: number;
}

interface VirtualScrollingOptions {
  enabled: boolean;
  itemHeight: number;
  overscan?: number;
}

interface VideoListProps {
  videos: Video[];
  isLoading?: boolean;
  onVideoClick?: (video: Video) => void;
  className?: string;
  gridLayout?: GridLayout;
  virtualScrolling?: VirtualScrollingOptions;
  onError?: (error: Error) => void;
}

const DEFAULT_GRID_LAYOUT: GridLayout = {
  columns: {
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4
  },
  gap: 4,
  padding: 4
};

const useVideoListSetup = (props: VideoListProps) => {
  const {
    videos,
    gridLayout = DEFAULT_GRID_LAYOUT,
    virtualScrolling,
    onError
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Setup intersection observer for progressive loading
  const { ref: observerTarget } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '100px',
    skip: !videos.length || virtualScrolling?.enabled
  });

  // Memoize grid classes based on layout configuration
  const gridClasses = useMemo(() => {
    const { columns = {}, gap = 4 } = gridLayout;
    return classNames(
      'grid',
      `gap-${gap}`,
      `grid-cols-${columns.sm || 1}`,
      `md:grid-cols-${columns.md || 2}`,
      `lg:grid-cols-${columns.lg || 3}`,
      `xl:grid-cols-${columns.xl || 4}`
    );
  }, [gridLayout]);

  // Handle video click with error boundary
  const handleVideoClick = useCallback((video: Video) => {
    try {
      props.onVideoClick?.(video);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [props.onVideoClick, onError]);

  return {
    containerRef,
    observerRef,
    observerTarget,
    gridClasses,
    handleVideoClick
  };
};

const VideoList: React.FC<VideoListProps> = (props) => {
  const {
    videos,
    isLoading,
    className,
    onError
  } = props;

  const {
    containerRef,
    gridClasses,
    handleVideoClick
  } = useVideoListSetup(props);

  // Render appropriate content based on component state
  const renderContent = () => {
    if (isLoading) {
      return (
        <Loading
          size="large"
          message="Loading videos..."
          className="min-h-[200px]"
        />
      );
    }

    if (!videos.length) {
      return (
        <EmptyState
          title="No Videos Available"
          message="Upload your first video to get started with coaching"
          icon={
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          }
        />
      );
    }

    return (
      <div
        className={gridClasses}
        role="grid"
        aria-label="Video grid"
      >
        {videos.map((video) => (
          <div
            key={video.id}
            role="gridcell"
            className="focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-500"
          >
            <VideoCard
              video={video}
              onClick={handleVideoClick}
              showControls={video.status === VideoStatus.READY}
              className="h-full"
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <ErrorBoundary
      onError={onError}
      fallback={
        <div className="p-4 bg-red-50 rounded-lg text-red-600">
          Failed to load video list
        </div>
      }
    >
      <div
        ref={containerRef}
        className={classNames(
          'w-full relative',
          { 'min-h-[200px]': isLoading },
          className
        )}
        data-testid="video-list"
      >
        {renderContent()}
      </div>
    </ErrorBoundary>
  );
};

export default VideoList;