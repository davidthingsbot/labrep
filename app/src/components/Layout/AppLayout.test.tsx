import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, ...props }: any) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e: any) => onChange?.(e.target.value)}
      {...props}
    />
  ),
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, ...props }: any) => (
    <div data-testid="three-canvas" {...props}>{children}</div>
  ),
  useFrame: () => {},
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Line: (props: any) => <div data-testid="drei-line" {...props} />,
  Sphere: (props: any) => <div data-testid="drei-sphere" {...props} />,
  Cone: (props: any) => <div data-testid="drei-cone" {...props} />,
  Text: ({ children, ...props }: any) => <div data-testid="drei-text" {...props}>{children}</div>,
  Billboard: ({ children, ...props }: any) => <div data-testid="drei-billboard" {...props}>{children}</div>,
}));

vi.mock('@/examples/registry', () => ({
  examples: [],
  getExampleById: () => undefined,
}));

import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('renders the Header', () => {
    render(<AppLayout />);
    expect(screen.getByText('labrep')).toBeInTheDocument();
  });

  it('renders the Editor', () => {
    render(<AppLayout />);
    expect(screen.getByTestId('editor-container')).toBeInTheDocument();
  });

  it('renders the Viewer', () => {
    render(<AppLayout />);
    expect(screen.getByTestId('viewer-container')).toBeInTheDocument();
  });

  it('renders the LibraryBrowser', () => {
    render(<AppLayout />);
    expect(screen.getByTestId('library-content')).toBeInTheDocument();
  });

  it('has the correct layout structure', () => {
    const { container } = render(<AppLayout />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('flex');
    expect(root.className).toContain('flex-col');
    expect(root.style.height).toBe('100dvh');
  });
});
