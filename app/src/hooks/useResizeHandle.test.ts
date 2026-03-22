import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizeHandle } from './useResizeHandle';

describe('useResizeHandle', () => {
  it('returns handleProps with pointer event handlers', () => {
    const { result } = renderHook(() =>
      useResizeHandle({ height: 200, onHeightChange: vi.fn(), minHeight: 80, maxHeight: 600 }),
    );

    expect(result.current.handleProps.onPointerDown).toBeDefined();
    expect(result.current.handleProps.onPointerMove).toBeDefined();
    expect(result.current.handleProps.onPointerUp).toBeDefined();
  });

  it('calls onHeightChange when dragging up', () => {
    const onHeightChange = vi.fn();
    const { result } = renderHook(() =>
      useResizeHandle({ height: 200, onHeightChange, minHeight: 80, maxHeight: 600 }),
    );

    const mockTarget = { setPointerCapture: vi.fn() };

    // Start drag at y=500
    act(() => {
      result.current.handleProps.onPointerDown({
        preventDefault: vi.fn(),
        clientY: 500,
        pointerId: 1,
        target: mockTarget,
      } as any);
    });

    // Move up to y=450 (drag up = increase height by 50)
    act(() => {
      result.current.handleProps.onPointerMove({ clientY: 450 } as any);
    });

    expect(onHeightChange).toHaveBeenCalledWith(250);
  });

  it('clamps to minHeight', () => {
    const onHeightChange = vi.fn();
    const { result } = renderHook(() =>
      useResizeHandle({ height: 100, onHeightChange, minHeight: 80, maxHeight: 600 }),
    );

    const mockTarget = { setPointerCapture: vi.fn() };

    act(() => {
      result.current.handleProps.onPointerDown({
        preventDefault: vi.fn(),
        clientY: 500,
        pointerId: 1,
        target: mockTarget,
      } as any);
    });

    // Drag down by 100 (height would be 0, but clamped to 80)
    act(() => {
      result.current.handleProps.onPointerMove({ clientY: 600 } as any);
    });

    expect(onHeightChange).toHaveBeenCalledWith(80);
  });

  it('clamps to maxHeight', () => {
    const onHeightChange = vi.fn();
    const { result } = renderHook(() =>
      useResizeHandle({ height: 500, onHeightChange, minHeight: 80, maxHeight: 600 }),
    );

    const mockTarget = { setPointerCapture: vi.fn() };

    act(() => {
      result.current.handleProps.onPointerDown({
        preventDefault: vi.fn(),
        clientY: 500,
        pointerId: 1,
        target: mockTarget,
      } as any);
    });

    // Drag up by 200 (height would be 700, but clamped to 600)
    act(() => {
      result.current.handleProps.onPointerMove({ clientY: 300 } as any);
    });

    expect(onHeightChange).toHaveBeenCalledWith(600);
  });

  it('does not call onHeightChange when not dragging', () => {
    const onHeightChange = vi.fn();
    const { result } = renderHook(() =>
      useResizeHandle({ height: 200, onHeightChange, minHeight: 80, maxHeight: 600 }),
    );

    act(() => {
      result.current.handleProps.onPointerMove({ clientY: 300 } as any);
    });

    expect(onHeightChange).not.toHaveBeenCalled();
  });
});
