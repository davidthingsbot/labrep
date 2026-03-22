import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, ...props }: any) => (
    <div data-testid="three-canvas" {...props}>{children}</div>
  ),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
}));

import { Viewer } from './Viewer';

describe('Viewer', () => {
  it('renders the three-canvas container', () => {
    render(<Viewer />);
    expect(screen.getByTestId('three-canvas')).toBeInTheDocument();
  });

  it('renders inside a viewer container', () => {
    render(<Viewer />);
    expect(screen.getByTestId('viewer-container')).toBeInTheDocument();
  });

  it('viewer container fills its parent', () => {
    render(<Viewer />);
    const container = screen.getByTestId('viewer-container');
    expect(container.className).toContain('w-full');
    expect(container.className).toContain('h-full');
  });
});
