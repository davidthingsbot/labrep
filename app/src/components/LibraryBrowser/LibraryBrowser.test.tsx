import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { LibraryBrowser } from './LibraryBrowser';

describe('LibraryBrowser', () => {
  it('renders tab buttons', () => {
    render(<LibraryBrowser />);
    expect(screen.getByRole('button', { name: /examples/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /api reference/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /occt reference/i })).toBeInTheDocument();
  });

  it('renders a collapse toggle button', () => {
    render(<LibraryBrowser />);
    expect(screen.getByRole('button', { name: /toggle/i })).toBeInTheDocument();
  });

  it('collapses when toggle is clicked', async () => {
    render(<LibraryBrowser />);
    const toggle = screen.getByRole('button', { name: /toggle/i });
    const content = screen.getByTestId('library-content');
    expect(content).toBeVisible();

    await userEvent.click(toggle);
    expect(screen.getByTestId('library-content')).not.toBeVisible();
  });

  it('expands again when toggle is clicked twice', async () => {
    render(<LibraryBrowser />);
    const toggle = screen.getByRole('button', { name: /toggle/i });

    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(screen.getByTestId('library-content')).toBeVisible();
  });

  it('switches active tab on click', async () => {
    render(<LibraryBrowser />);
    const apiTab = screen.getByRole('button', { name: /api reference/i });
    await userEvent.click(apiTab);
    expect(apiTab.className).toContain('bg-gray-700');
  });
});
