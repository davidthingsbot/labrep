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
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
}));

import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('renders the Header', () => {
    render(<AppLayout />);
    expect(screen.getByText('labrep viewer')).toBeInTheDocument();
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
    expect(root.className).toContain('h-screen');
  });
});
