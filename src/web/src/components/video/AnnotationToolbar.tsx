import React, { useCallback, useState, useRef, useEffect } from 'react';
import classNames from 'classnames'; // v2.3.2
import { Tooltip } from '@mui/material'; // v5.0.0
import { Button } from '../common/Button';
import { VideoAnnotation } from '../../types/video';

// Tool types and configuration
type TOOL_TYPES = 'pen' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'voiceover';

const TOOL_TYPES: TOOL_TYPES[] = ['pen', 'line', 'arrow', 'rectangle', 'circle', 'text', 'voiceover'];

const COLOR_PALETTE = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  '#FF00FF', '#00FFFF', '#FFFFFF', '#000000'
];

const STROKE_WIDTHS = [1, 2, 4, 6, 8, 10];

const TOOL_LABELS: Record<TOOL_TYPES, string> = {
  pen: 'Free Draw',
  line: 'Straight Line',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  circle: 'Circle',
  text: 'Text',
  voiceover: 'Voice Over'
};

interface AnnotationToolbarProps {
  onToolSelect: (tool: TOOL_TYPES) => void;
  onColorSelect: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onVoiceOverStart: () => Promise<void>;
  onVoiceOverStop: () => Promise<void>;
  isRecording?: boolean;
  selectedTool?: TOOL_TYPES;
  selectedColor?: string;
  strokeWidth?: number;
  isLoading?: boolean;
  error?: Error | null;
}

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = React.memo(({
  onToolSelect,
  onColorSelect,
  onStrokeWidthChange,
  onVoiceOverStart,
  onVoiceOverStop,
  isRecording = false,
  selectedTool,
  selectedColor = '#FF0000',
  strokeWidth = 2,
  isLoading = false,
  error = null
}) => {
  const [localError, setLocalError] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Handle tool selection with error handling
  const handleToolClick = useCallback(async (tool: TOOL_TYPES) => {
    try {
      setLocalError(null);
      if (tool === 'voiceover') {
        if (isRecording) {
          await onVoiceOverStop();
        } else {
          await onVoiceOverStart();
        }
      } else {
        onToolSelect(tool);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to select tool');
    }
  }, [onToolSelect, onVoiceOverStart, onVoiceOverStop, isRecording]);

  // Handle color selection with validation
  const handleColorClick = useCallback((color: string) => {
    try {
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        throw new Error('Invalid color format');
      }
      onColorSelect(color);
      setLocalError(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to select color');
    }
  }, [onColorSelect]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onToolSelect('pen'); // Reset to default tool
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onToolSelect]);

  return (
    <div
      ref={toolbarRef}
      className="flex flex-col gap-4 p-4 bg-gray-800 rounded-lg shadow-lg"
      role="toolbar"
      aria-label="Video annotation tools"
    >
      {/* Tool Selection */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Drawing tools">
        {TOOL_TYPES.map((tool) => (
          <Tooltip
            key={tool}
            title={TOOL_LABELS[tool]}
            placement="top"
            arrow
          >
            <div>
              <Button
                variant={selectedTool === tool ? 'primary' : 'secondary'}
                size="lg"
                onClick={() => handleToolClick(tool)}
                aria-label={TOOL_LABELS[tool]}
                aria-pressed={selectedTool === tool}
                disabled={isLoading}
                className="min-w-[44px] min-h-[44px]"
              >
                {tool === 'voiceover' && isRecording ? 'Stop' : TOOL_LABELS[tool].charAt(0)}
              </Button>
            </div>
          </Tooltip>
        ))}
      </div>

      {/* Color Selection */}
      <div
        className="grid grid-cols-4 gap-2"
        role="radiogroup"
        aria-label="Color selection"
      >
        {COLOR_PALETTE.map((color) => (
          <Tooltip key={color} title={color} placement="top" arrow>
            <button
              type="button"
              onClick={() => handleColorClick(color)}
              aria-label={`Select color ${color}`}
              aria-pressed={selectedColor === color}
              className={classNames(
                'w-11 h-11 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-offset-2',
                selectedColor === color ? 'border-white' : 'border-transparent'
              )}
              style={{ backgroundColor: color }}
            />
          </Tooltip>
        ))}
      </div>

      {/* Stroke Width Selection */}
      <div
        className="flex items-center gap-2"
        role="group"
        aria-label="Stroke width selection"
      >
        {STROKE_WIDTHS.map((width) => (
          <Tooltip key={width} title={`${width}px`} placement="top" arrow>
            <button
              type="button"
              onClick={() => onStrokeWidthChange(width)}
              aria-label={`Set stroke width to ${width} pixels`}
              aria-pressed={strokeWidth === width}
              className={classNames(
                'w-11 h-11 rounded flex items-center justify-center focus:outline-none focus:ring-2',
                strokeWidth === width ? 'bg-primary-600' : 'bg-gray-700'
              )}
            >
              <div
                className="rounded-full bg-white"
                style={{
                  width: `${width * 2}px`,
                  height: `${width * 2}px`
                }}
              />
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Error Display */}
      {(error || localError) && (
        <div
          role="alert"
          className="text-red-500 text-sm mt-2"
          aria-live="polite"
        >
          {error?.message || localError}
        </div>
      )}
    </div>
  );
});

AnnotationToolbar.displayName = 'AnnotationToolbar';

export type { AnnotationToolbarProps, TOOL_TYPES };