import React from 'react';

export const Canvas = ({ children, ...props }: any) => (
  <div data-testid="three-canvas" {...props}>
    {children}
  </div>
);

export const useFrame = (callback: (state: { clock: { getElapsedTime: () => number } }) => void) => {
  // No-op in tests - animations don't run
};
