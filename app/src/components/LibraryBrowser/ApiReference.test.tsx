import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApiReference } from './ApiReference';

describe('ApiReference', () => {
  it('renders module filter buttons', () => {
    render(<ApiReference />);
    expect(screen.getByText('all')).toBeDefined();
    expect(screen.getByText('core')).toBeDefined();
    expect(screen.getByText('geometry')).toBeDefined();
    expect(screen.getByText('mesh')).toBeDefined();
    expect(screen.getByText('primitives')).toBeDefined();
  });

  it('shows entries by default (all module)', () => {
    render(<ApiReference />);
    // Should show entries from multiple modules
    expect(screen.getByText('point3d')).toBeDefined();
    expect(screen.getByText('makeBox')).toBeDefined();
  });

  it('filters entries when clicking a module', () => {
    render(<ApiReference />);
    fireEvent.click(screen.getByText('primitives'));
    // Should show primitives
    expect(screen.getByText('makeBox')).toBeDefined();
    expect(screen.getByText('makeSphere')).toBeDefined();
    // Should NOT show core entries
    expect(screen.queryByText('point3d')).toBeNull();
  });

  it('clicking all shows everything again', () => {
    render(<ApiReference />);
    fireEvent.click(screen.getByText('primitives'));
    fireEvent.click(screen.getByText('all'));
    expect(screen.getByText('point3d')).toBeDefined();
    expect(screen.getByText('makeBox')).toBeDefined();
  });

  it('expands an entry when clicked', () => {
    render(<ApiReference />);
    fireEvent.click(screen.getByText('makeBox'));
    // Should show the description
    expect(screen.getByText('Create an axis-aligned box mesh centered at the origin.')).toBeDefined();
  });

  it('collapses entry when clicked again', () => {
    render(<ApiReference />);
    fireEvent.click(screen.getByText('makeBox'));
    fireEvent.click(screen.getByText('makeBox'));
    expect(screen.queryByText('Create an axis-aligned box mesh centered at the origin.')).toBeNull();
  });
});
