import React from 'react';

export const Canvas = ({ children, ...props }: any) => (
  <div data-testid="three-canvas" {...props}>
    {children}
  </div>
);
