import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('renders the app title', () => {
    render(<Header />);
    expect(screen.getByText('labrep')).toBeInTheDocument();
  });

  it('renders toggle buttons when callbacks provided', () => {
    render(
      <Header 
        onToggleAnimation={() => {}}
        onToggleEditor={() => {}}
        onToggleLibrary={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /animation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /editor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /examples/i })).toBeInTheDocument();
  });

  it('renders as a header element', () => {
    render(<Header />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('shows play/pause based on animation state', () => {
    const { rerender } = render(
      <Header animationEnabled={true} onToggleAnimation={() => {}} />
    );
    expect(screen.getByText('pause')).toBeInTheDocument();

    rerender(
      <Header animationEnabled={false} onToggleAnimation={() => {}} />
    );
    expect(screen.getByText('play')).toBeInTheDocument();
  });
});
