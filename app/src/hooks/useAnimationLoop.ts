'use client';

import { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Provides a continuously updating animation angle.
 * 
 * @param durationMs - Duration of one complete cycle in milliseconds (default: 10000)
 * @param enabled - Whether animation is running (default: true)
 * @returns Angle in radians from 0 to 2π, looping every durationMs
 */
export function useAnimationLoop(durationMs: number = 10000, enabled: boolean = true): number {
  const [angle, setAngle] = useState(0);
  const pausedAtRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const durationSec = durationMs / 1000;

  useFrame(({ clock }) => {
    if (!enabled) {
      // Store pause time on first paused frame
      if (pausedAtRef.current === null) {
        pausedAtRef.current = clock.getElapsedTime();
      }
      return;
    }

    // If resuming from pause, calculate offset
    if (pausedAtRef.current !== null) {
      offsetRef.current += clock.getElapsedTime() - pausedAtRef.current;
      pausedAtRef.current = null;
    }

    const elapsed = clock.getElapsedTime() - offsetRef.current;
    const cyclePosition = (elapsed % durationSec) / durationSec;
    const newAngle = cyclePosition * 2 * Math.PI;
    setAngle(newAngle);
  });

  return angle;
}
