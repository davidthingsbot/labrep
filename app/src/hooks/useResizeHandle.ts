import { useCallback, useRef, useEffect } from 'react';

interface UseResizeHandleOptions {
  /** Current height in pixels */
  height: number;
  /** Callback when height changes */
  onHeightChange: (height: number) => void;
  /** Minimum height in pixels */
  minHeight: number;
  /** Maximum height in pixels */
  maxHeight: number;
}

/**
 * Hook for a vertical resize drag handle.
 * Dragging up increases height, dragging down decreases it.
 *
 * @returns Props to spread on the drag handle element, plus an `isDragging` flag.
 */
export function useResizeHandle({ height, onHeightChange, minHeight, maxHeight }: UseResizeHandleOptions) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const isDraggingState = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      isDraggingState.current = true;
      startY.current = e.clientY;
      startHeight.current = height;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      // Dragging up (negative deltaY) should increase height
      const deltaY = startY.current - e.clientY;
      const newHeight = Math.round(
        Math.min(maxHeight, Math.max(minHeight, startHeight.current + deltaY)),
      );
      onHeightChange(newHeight);
    },
    [onHeightChange, minHeight, maxHeight],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    isDraggingState.current = false;
  }, []);

  return {
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  };
}
