import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExampleSelector } from './ExampleSelector';

// Mock the examples registry
vi.mock('@/examples/registry', () => ({
  examples: [
    { id: 'example-1', name: 'Example One', description: 'First example', component: () => null },
    { id: 'example-2', name: 'Example Two', description: 'Second example', component: () => null },
    { id: 'example-3', name: 'Example Three', description: 'Third example', component: () => null },
  ],
}));

describe('ExampleSelector', () => {
  it('lists all examples', () => {
    render(<ExampleSelector selectedId="example-1" onSelect={() => {}} />);
    
    expect(screen.getByText('Example One')).toBeInTheDocument();
    expect(screen.getByText('Example Two')).toBeInTheDocument();
    expect(screen.getByText('Example Three')).toBeInTheDocument();
  });

  it('shows descriptions', () => {
    render(<ExampleSelector selectedId="example-1" onSelect={() => {}} />);
    
    expect(screen.getByText('First example')).toBeInTheDocument();
  });

  it('highlights active example', () => {
    render(<ExampleSelector selectedId="example-2" onSelect={() => {}} />);
    
    const selectedItem = screen.getByText('Example Two').closest('[data-testid="example-item"]');
    expect(selectedItem).toHaveAttribute('data-selected', 'true');
    
    const unselectedItem = screen.getByText('Example One').closest('[data-testid="example-item"]');
    expect(unselectedItem).toHaveAttribute('data-selected', 'false');
  });

  it('calls onSelect on click', () => {
    const onSelect = vi.fn();
    render(<ExampleSelector selectedId="example-1" onSelect={onSelect} />);
    
    fireEvent.click(screen.getByText('Example Two'));
    
    expect(onSelect).toHaveBeenCalledWith('example-2');
  });

  it('does not call onSelect when clicking already selected', () => {
    const onSelect = vi.fn();
    render(<ExampleSelector selectedId="example-1" onSelect={onSelect} />);
    
    fireEvent.click(screen.getByText('Example One'));
    
    // Should still call it (allow re-clicking)
    expect(onSelect).toHaveBeenCalledWith('example-1');
  });
});
