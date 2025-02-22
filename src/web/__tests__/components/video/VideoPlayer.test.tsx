import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import { VideoPlayer } from '../../../src/components/video/VideoPlayer';
import { Video, VideoQuality, VideoStatus } from '../../../src/types/video';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock HTMLMediaElement methods
window.HTMLMediaElement.prototype.play = jest.fn();
window.HTMLMediaElement.prototype.pause = jest.fn();
window.HTMLMediaElement.prototype.load = jest.fn();

describe('VideoPlayer Component', () => {
  // Mock video data
  const mockVideo: Video = {
    id: 'test-video-id',
    userId: 'test-user-id',
    title: 'Test Video',
    description: 'Test video description',
    status: VideoStatus.READY,
    metadata: {
      duration: 120,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      sizeBytes: 1024 * 1024,
      format: 'mp4'
    },
    variants: [
      {
        quality: VideoQuality.HD,
        url: 'https://test-cdn.com/video-hd.mp4',
        metadata: {
          duration: 120,
          width: 1920,
          height: 1080,
          fps: 30,
          codec: 'h264',
          sizeBytes: 1024 * 1024,
          format: 'mp4'
        }
      }
    ],
    annotations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1
  };

  // Mock callbacks
  const mockCallbacks = {
    onPlayStateChange: jest.fn(),
    onTimeUpdate: jest.fn(),
    onSpeedChange: jest.fn(),
    onError: jest.fn(),
    onQualityChange: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup screen reader mock
    document.body.setAttribute('role', 'application');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders video player with accessible controls', async () => {
    render(
      <VideoPlayer
        video={mockVideo}
        accessibilityLabel="Test video player"
        {...mockCallbacks}
      />
    );

    // Verify video element
    const videoElement = screen.getByLabelText('Test video player');
    expect(videoElement).toBeInTheDocument();
    expect(videoElement.tagName).toBe('VIDEO');

    // Verify source elements
    const sources = screen.getAllByRole('none');
    expect(sources).toHaveLength(mockVideo.variants.length);
    expect(sources[0]).toHaveAttribute('src', mockVideo.variants[0].url);

    // Verify controls
    const controls = screen.getByRole('group', { name: /video controls/i });
    expect(controls).toBeInTheDocument();
  });

  it('handles play/pause state changes with accessibility announcements', async () => {
    const { container } = render(
      <VideoPlayer
        video={mockVideo}
        accessibilityLabel="Test video player"
        {...mockCallbacks}
      />
    );

    const playButton = screen.getByRole('button', { name: /play/i });
    await userEvent.click(playButton);

    // Verify play state
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(mockCallbacks.onPlayStateChange).toHaveBeenCalledWith(true);

    // Verify accessibility announcement
    await waitFor(() => {
      const announcement = container.querySelector('[aria-live="polite"]');
      expect(announcement).toHaveTextContent(/video playing/i);
    });

    // Test pause
    await userEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(mockCallbacks.onPlayStateChange).toHaveBeenCalledWith(false);
  });

  it('handles keyboard navigation and controls', async () => {
    render(
      <VideoPlayer
        video={mockVideo}
        accessibilityLabel="Test video player"
        {...mockCallbacks}
      />
    );

    // Tab to play button
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /play/i })).toHaveFocus();

    // Space to play
    await userEvent.keyboard(' ');
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();

    // Arrow keys for seeking
    const videoElement = screen.getByLabelText('Test video player');
    fireEvent.keyDown(videoElement, { key: 'ArrowRight' });
    expect(mockCallbacks.onTimeUpdate).toHaveBeenCalled();
  });

  it('handles video errors with retry mechanism', async () => {
    render(
      <VideoPlayer
        video={mockVideo}
        accessibilityLabel="Test video player"
        errorRetryCount={2}
        {...mockCallbacks}
      />
    );

    const videoElement = screen.getByLabelText('Test video player');
    const error = new Error('Video playback error');
    
    fireEvent.error(videoElement, { error });

    // Verify error handling
    expect(mockCallbacks.onError).toHaveBeenCalledWith(error);
    
    // Verify retry attempt
    await waitFor(() => {
      expect(window.HTMLMediaElement.prototype.load).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('adapts video quality based on network conditions', async () => {
    // Mock navigator.connection
    Object.defineProperty(navigator, 'connection', {
      value: {
        downlink: 2,
        effectiveType: '3g'
      },
      configurable: true
    });

    render(
      <VideoPlayer
        video={mockVideo}
        accessibilityLabel="Test video player"
        {...mockCallbacks}
      />
    );

    // Wait for quality adaptation check
    await waitFor(() => {
      expect(mockCallbacks.onQualityChange).toHaveBeenCalledWith(VideoQuality.SD);
    }, { timeout: 11000 });
  });

  it('maintains aspect ratio on container resize', async () => {
    const { container } = render(
      <VideoPlayer
        video={mockVideo}
        accessibilityLabel="Test video player"
        {...mockCallbacks}
      />
    );

    const videoContainer = container.querySelector('.video-player-container');
    expect(videoContainer).toBeInTheDocument();

    // Trigger resize
    const resizeObserver = new ResizeObserver();
    resizeObserver.observe(videoContainer!);

    // Verify aspect ratio maintenance
    const videoElement = screen.getByLabelText('Test video player');
    expect(videoElement).toHaveStyle({
      width: expect.any(String),
      height: expect.any(String)
    });
  });

  it('supports screen reader announcements for video events', async () => {
    const { container } = render(
      <VideoPlayer
        video={mockVideo}
        accessibilityLabel="Test video player"
        {...mockCallbacks}
      />
    );

    const videoElement = screen.getByLabelText('Test video player');

    // Test loading announcement
    fireEvent.loadedmetadata(videoElement);
    await waitFor(() => {
      const announcement = container.querySelector('[aria-live="polite"]');
      expect(announcement).toHaveTextContent(/video loaded/i);
    });

    // Test error announcement
    fireEvent.error(videoElement, { error: new Error('Test error') });
    await waitFor(() => {
      const announcement = container.querySelector('[aria-live="assertive"]');
      expect(announcement).toHaveTextContent(/error playing video/i);
    });
  });
});