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

  it('renders content when visible', () => {
    render(<LibraryBrowser visible={true} />);
    expect(screen.getByTestId('library-content')).toBeVisible();
  });

  it('hides when visible is false', () => {
    const { container } = render(<LibraryBrowser visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('switches active tab on click', async () => {
    render(<LibraryBrowser />);
    const apiTab = screen.getByRole('button', { name: /api reference/i });
    await userEvent.click(apiTab);
    expect(apiTab.className).toContain('bg-gray-700');
  });

  it('renders library content area', () => {
    render(<LibraryBrowser />);
    expect(screen.getByTestId('library-content')).toBeInTheDocument();
  });
});
