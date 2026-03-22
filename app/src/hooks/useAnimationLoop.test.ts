import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimationLoop } from './useAnimationLoop';

// Mock @react-three/fiber's useFrame
const frameCallbacks: Array<(state: { clock: { getElapsedTime: () => number } }) => void> = [];
let mockElapsedTime = 0;

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: { clock: { getElapsedTime: () => number } }) => void) => {
    frameCallbacks.push(callback);
  },
}));

function simulateFrame(elapsedTime: number) {
  mockElapsedTime = elapsedTime;
  frameCallbacks.forEach(cb => cb({ clock: { getElapsedTime: () => mockElapsedTime } }));
}

describe('useAnimationLoop', () => {
  beforeEach(() => {
    frameCallbacks.length = 0;
    mockElapsedTime = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero at start', () => {
    const { result } = renderHook(() => useAnimationLoop());
    expect(result.current).toBe(0);
  });

  it('returns angle proportional to elapsed time', () => {
    const { result, rerender } = renderHook(() => useAnimationLoop(10000));
    
    // Simulate 5 seconds (half cycle) - should be π
    act(() => {
      simulateFrame(5);
      rerender();
    });
    
    expect(result.current).toBeCloseTo(Math.PI, 5);
  });

  it('returns 2π at end of cycle', () => {
    const { result, rerender } = renderHook(() => useAnimationLoop(10000));
    
    // Simulate 9.999 seconds (almost complete cycle)
    act(() => {
      simulateFrame(9.999);
      rerender();
    });
    
    expect(result.current).toBeCloseTo(2 * Math.PI, 1);
  });

  it('loops back to zero after full cycle', () => {
    const { result, rerender } = renderHook(() => useAnimationLoop(10000));
    
    // Simulate 10 seconds (exactly one cycle)
    act(() => {
      simulateFrame(10);
      rerender();
    });
    
    expect(result.current).toBeCloseTo(0, 5);
  });

  it('respects custom duration', () => {
    const { result, rerender } = renderHook(() => useAnimationLoop(5000)); // 5 second cycle
    
    // Simulate 2.5 seconds (half of 5 second cycle) - should be π
    act(() => {
      simulateFrame(2.5);
      rerender();
    });
    
    expect(result.current).toBeCloseTo(Math.PI, 5);
  });

  it('handles multiple cycles correctly', () => {
    const { result, rerender } = renderHook(() => useAnimationLoop(10000));
    
    // Simulate 25 seconds (2.5 cycles) - should be π (half way through third cycle)
    act(() => {
      simulateFrame(25);
      rerender();
    });
    
    expect(result.current).toBeCloseTo(Math.PI, 5);
  });
});
