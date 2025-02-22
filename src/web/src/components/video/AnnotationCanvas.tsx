import React, { useEffect, useRef, useState, useCallback } from 'react'; // ^18.0.0
import { fabric } from 'fabric'; // ^5.3.0
import { debounce } from 'lodash'; // ^4.17.21
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.11
import { VideoAnnotation } from '../../types/video';
import { useVideo } from '../../hooks/useVideo';

// Annotation tool types
type AnnotationTool = 'pen' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'text';

// Props interface
interface AnnotationCanvasProps {
  videoId: string;
  width: number;
  height: number;
  currentTime: number;
  selectedTool: AnnotationTool;
  selectedColor?: string;
  strokeWidth?: number;
  isVoiceOverActive?: boolean;
  onAnnotationComplete?: (annotation: VideoAnnotation) => void;
  onError?: (error: Error) => void;
}

// Canvas configuration
const CANVAS_CONFIG = {
  isDrawingMode: false,
  selection: true,
  renderOnAddRemove: true,
  enableRetinaScaling: true,
  preserveObjectStacking: true,
};

// Drawing configuration
const DRAWING_CONFIG = {
  strokeWidth: 2,
  strokeLineCap: 'round',
  strokeLineJoin: 'round',
  fill: 'transparent',
  selectable: true,
  erasable: true,
};

/**
 * AnnotationCanvas Component
 * Provides a canvas overlay for video annotations with advanced drawing tools
 */
export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  videoId,
  width,
  height,
  currentTime,
  selectedTool,
  selectedColor = '#FF0000',
  strokeWidth = 2,
  isVoiceOverActive = false,
  onAnnotationComplete,
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const { addAnnotation } = useVideo();

  // Initialize canvas with error handling
  const initCanvas = useCallback(() => {
    if (!canvasRef.current) return;

    try {
      fabricRef.current = new fabric.Canvas(canvasRef.current, {
        ...CANVAS_CONFIG,
        width,
        height,
      });

      // Set up event listeners
      fabricRef.current.on('mouse:down', handleDrawingStart);
      fabricRef.current.on('mouse:move', handleDrawingMove);
      fabricRef.current.on('mouse:up', handleDrawingEnd);
      fabricRef.current.on('object:modified', handleObjectModified);

      // Set up touch events
      fabricRef.current.on('touch:gesture', handleTouchGesture);
      fabricRef.current.on('touch:drag', handleTouchDrag);

      // Set up keyboard events for accessibility
      window.addEventListener('keydown', handleKeyDown);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [width, height]);

  // Handle drawing start
  const handleDrawingStart = useCallback((event: fabric.IEvent) => {
    if (!fabricRef.current) return;

    setIsDrawing(true);
    fabricRef.current.isDrawingMode = selectedTool === 'pen';

    if (selectedTool !== 'pen') {
      const pointer = fabricRef.current.getPointer(event.e);
      let shape: fabric.Object;

      switch (selectedTool) {
        case 'line':
          shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            ...DRAWING_CONFIG,
            stroke: selectedColor,
            strokeWidth,
          });
          break;
        case 'rectangle':
          shape = new fabric.Rect({
            ...DRAWING_CONFIG,
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            stroke: selectedColor,
            strokeWidth,
          });
          break;
        case 'circle':
          shape = new fabric.Circle({
            ...DRAWING_CONFIG,
            left: pointer.x,
            top: pointer.y,
            radius: 0,
            stroke: selectedColor,
            strokeWidth,
          });
          break;
        case 'text':
          shape = new fabric.IText('', {
            left: pointer.x,
            top: pointer.y,
            fontSize: 20,
            fill: selectedColor,
            selectable: true,
            editable: true,
          });
          break;
        default:
          return;
      }

      fabricRef.current.add(shape);
      fabricRef.current.setActiveObject(shape);
    }
  }, [selectedTool, selectedColor, strokeWidth]);

  // Handle drawing movement
  const handleDrawingMove = useCallback(
    debounce((event: fabric.IEvent) => {
      if (!fabricRef.current || !isDrawing) return;

      const pointer = fabricRef.current.getPointer(event.e);
      const activeObject = fabricRef.current.getActiveObject();

      if (activeObject && selectedTool !== 'pen') {
        switch (selectedTool) {
          case 'line':
            (activeObject as fabric.Line).set({ x2: pointer.x, y2: pointer.y });
            break;
          case 'rectangle':
            const rect = activeObject as fabric.Rect;
            rect.set({
              width: Math.abs(pointer.x - rect.left!),
              height: Math.abs(pointer.y - rect.top!),
            });
            break;
          case 'circle':
            const circle = activeObject as fabric.Circle;
            const radius = Math.sqrt(
              Math.pow(pointer.x - circle.left!, 2) + Math.pow(pointer.y - circle.top!, 2)
            );
            circle.set({ radius });
            break;
        }
        fabricRef.current.requestRenderAll();
      }
    }, 10),
    [isDrawing, selectedTool]
  );

  // Handle drawing end
  const handleDrawingEnd = useCallback(() => {
    if (!fabricRef.current) return;

    setIsDrawing(false);
    const objects = fabricRef.current.getObjects();
    if (objects.length > 0) {
      const annotation: VideoAnnotation = {
        id: `${Date.now()}`,
        userId: 'current-user',
        timestamp: currentTime,
        type: 'drawing',
        data: {
          objects: fabricRef.current.toJSON().objects,
          tool: selectedTool,
        },
        createdAt: new Date().toISOString(),
      };

      addAnnotation(videoId, annotation)
        .then(() => onAnnotationComplete?.(annotation))
        .catch((error) => onError?.(error));
    }
  }, [videoId, currentTime, selectedTool, addAnnotation, onAnnotationComplete, onError]);

  // Handle object modifications
  const handleObjectModified = useCallback((event: fabric.IEvent) => {
    if (!fabricRef.current) return;
    fabricRef.current.requestRenderAll();
  }, []);

  // Handle touch gestures
  const handleTouchGesture = useCallback((event: fabric.IEvent) => {
    if (!fabricRef.current) return;
    const gesture = event.e as TouchEvent;
    // Implement touch gesture handling
  }, []);

  // Handle touch drag
  const handleTouchDrag = useCallback((event: fabric.IEvent) => {
    if (!fabricRef.current) return;
    const touch = event.e as TouchEvent;
    // Implement touch drag handling
  }, []);

  // Handle keyboard events for accessibility
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!fabricRef.current) return;

    const activeObject = fabricRef.current.getActiveObject();
    if (!activeObject) return;

    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        fabricRef.current.remove(activeObject);
        break;
      case 'ArrowUp':
        activeObject.top! -= 1;
        break;
      case 'ArrowDown':
        activeObject.top! += 1;
        break;
      case 'ArrowLeft':
        activeObject.left! -= 1;
        break;
      case 'ArrowRight':
        activeObject.left! += 1;
        break;
    }
    fabricRef.current.requestRenderAll();
  }, []);

  // Initialize canvas on mount
  useEffect(() => {
    initCanvas();
    return () => {
      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [initCanvas]);

  // Update canvas dimensions on resize
  useEffect(() => {
    if (fabricRef.current) {
      fabricRef.current.setDimensions({ width, height });
    }
  }, [width, height]);

  return (
    <ErrorBoundary
      fallback={<div>Error loading annotation canvas</div>}
      onError={onError}
    >
      <div
        role="application"
        aria-label="Video annotation canvas"
        style={{ position: 'relative', width, height }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Drawing canvas"
          tabIndex={0}
          style={{ touchAction: 'none' }}
        />
        {isVoiceOverActive && (
          <div
            role="status"
            aria-live="polite"
            className="voice-over-indicator"
          >
            Voice-over recording active
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

// Export component and types
export type { AnnotationTool, AnnotationCanvasProps };
export default AnnotationCanvas;