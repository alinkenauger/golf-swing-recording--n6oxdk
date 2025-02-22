/**
 * VideoControls Component
 * Provides comprehensive video playback controls with enhanced analysis features
 * including frame-accurate seeking, granular speed control, and accessibility support
 * @version 1.0.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import { IconButton, Slider, Stack, Typography } from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
  FastForward,
  FastRewind,
  SkipNext,
  SkipPrevious
} from '@mui/icons-material';
import { formatDuration } from '../../utils/video';
import { VideoMetadata } from '../../types/video';

// Constants for playback controls
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const FRAME_STEP_SECONDS = 0.04; // Assuming 25fps as base
const VOLUME_STEP = 0.05;
const SEEK_DEBOUNCE_MS = 50;

interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  frameRate: number;
  playbackSpeed: number;
  volume: number;
  onPlayPause: (playing: boolean) => void;
  onSeek: (time: number, frameRate: number) => void;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (volume: number) => void;
}

export const VideoControls: React.FC<VideoControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  frameRate,
  playbackSpeed,
  volume,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onVolumeChange
}) => {
  // Local state for UI interactions
  const [isDragging, setIsDragging] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(volume);

  // Memoized calculations
  const frameStepSize = useMemo(() => 1 / frameRate, [frameRate]);
  const formattedCurrentTime = useMemo(() => formatDuration(currentTime, true), [currentTime]);
  const formattedDuration = useMemo(() => formatDuration(duration, true), [duration]);

  /**
   * Handles play/pause toggle with accessibility announcements
   */
  const handlePlayPause = useCallback(() => {
    const newPlayState = !isPlaying;
    onPlayPause(newPlayState);
    
    // Announce state change to screen readers
    const announcement = newPlayState ? 'Video playing' : 'Video paused';
    const ariaLive = document.createElement('div');
    ariaLive.setAttribute('aria-live', 'polite');
    ariaLive.textContent = announcement;
    document.body.appendChild(ariaLive);
    setTimeout(() => ariaLive.remove(), 1000);
  }, [isPlaying, onPlayPause]);

  /**
   * Handles frame-accurate seeking with validation
   */
  const handleSeek = useCallback((newTime: number) => {
    const validatedTime = Math.max(0, Math.min(newTime, duration));
    const frameAdjustedTime = Math.round(validatedTime / frameStepSize) * frameStepSize;
    onSeek(frameAdjustedTime, frameRate);
  }, [duration, frameRate, frameStepSize, onSeek]);

  /**
   * Handles frame-by-frame navigation
   */
  const handleFrameStep = useCallback((direction: 'forward' | 'backward') => {
    const adjustment = direction === 'forward' ? frameStepSize : -frameStepSize;
    handleSeek(currentTime + adjustment);
  }, [currentTime, frameStepSize, handleSeek]);

  /**
   * Handles playback speed changes with validation
   */
  const handleSpeedChange = useCallback((newSpeed: number) => {
    const validSpeed = Math.max(0.25, Math.min(2, newSpeed));
    const normalizedSpeed = SPEED_OPTIONS.reduce((prev, curr) => 
      Math.abs(curr - validSpeed) < Math.abs(prev - validSpeed) ? curr : prev
    );
    onSpeedChange(normalizedSpeed);
  }, [onSpeedChange]);

  /**
   * Handles volume changes with mute toggle
   */
  const handleVolumeChange = useCallback((newVolume: number) => {
    const validVolume = Math.max(0, Math.min(1, newVolume));
    if (validVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
    onVolumeChange(validVolume);
  }, [isMuted, onVolumeChange]);

  /**
   * Handles mute toggle with volume memory
   */
  const handleMuteToggle = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      onVolumeChange(previousVolume);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
      onVolumeChange(0);
    }
  }, [isMuted, previousVolume, volume, onVolumeChange]);

  return (
    <Stack spacing={1} sx={{ width: '100%', px: 2, py: 1 }}>
      {/* Progress slider */}
      <Slider
        value={currentTime}
        max={duration}
        step={frameStepSize}
        onChange={(_, value) => handleSeek(value as number)}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        aria-label="Video progress"
        sx={{ color: 'primary.main' }}
      />

      {/* Time display */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography variant="caption" color="text.secondary">
          {formattedCurrentTime} / {formattedDuration}
        </Typography>

        {/* Playback controls */}
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton
            onClick={() => handleFrameStep('backward')}
            aria-label="Previous frame"
            size="small"
          >
            <SkipPrevious />
          </IconButton>

          <IconButton
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            size="medium"
          >
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>

          <IconButton
            onClick={() => handleFrameStep('forward')}
            aria-label="Next frame"
            size="small"
          >
            <SkipNext />
          </IconButton>
        </Stack>

        {/* Speed control */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Speed: {playbackSpeed}x
          </Typography>
          <IconButton
            onClick={() => handleSpeedChange(playbackSpeed - 0.25)}
            disabled={playbackSpeed <= 0.25}
            aria-label="Decrease speed"
            size="small"
          >
            <FastRewind />
          </IconButton>
          <IconButton
            onClick={() => handleSpeedChange(playbackSpeed + 0.25)}
            disabled={playbackSpeed >= 2}
            aria-label="Increase speed"
            size="small"
          >
            <FastForward />
          </IconButton>
        </Stack>

        {/* Volume control */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 150 }}>
          <IconButton
            onClick={handleMuteToggle}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            size="small"
          >
            {isMuted || volume === 0 ? <VolumeOff /> : <VolumeUp />}
          </IconButton>
          <Slider
            value={volume}
            max={1}
            step={VOLUME_STEP}
            onChange={(_, value) => handleVolumeChange(value as number)}
            aria-label="Volume"
            sx={{ width: 100 }}
          />
        </Stack>
      </Stack>
    </Stack>
  );
};

export default React.memo(VideoControls);