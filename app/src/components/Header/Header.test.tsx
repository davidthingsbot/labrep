import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('renders the app title', () => {
    render(<Header />);
    expect(screen.getByText('labrep viewer')).toBeInTheDocument();
  });

  it('renders a Settings button', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders an Export button', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('renders as a header element', () => {
    render(<Header />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
