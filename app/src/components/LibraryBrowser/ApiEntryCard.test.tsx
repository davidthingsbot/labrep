import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApiEntryCard } from './ApiEntryCard';
import type { ApiEntry } from '@/data/api-data';

const mockFunction: ApiEntry = {
  name: 'distance',
  kind: 'function',
  module: 'core',
  description: 'Compute the Euclidean distance between two 3D points.',
  signature: 'distance(a: Point3D, b: Point3D): number',
  params: [
    { name: 'a', type: 'Point3D', description: 'First point' },
    { name: 'b', type: 'Point3D', description: 'Second point' },
  ],
  returns: 'The straight-line distance between a and b',
};

const mockInterface: ApiEntry = {
  name: 'Point3D',
  kind: 'interface',
  module: 'core',
  description: 'An immutable point in 3D Cartesian space.',
  properties: [
    { name: 'x', type: 'number', description: 'X coordinate' },
    { name: 'y', type: 'number', description: 'Y coordinate' },
    { name: 'z', type: 'number', description: 'Z coordinate' },
  ],
};

const mockConstant: ApiEntry = {
  name: 'ORIGIN',
  kind: 'constant',
  module: 'core',
  description: 'The origin point (0, 0, 0).',
};

describe('ApiEntryCard', () => {
  it('renders entry name', () => {
    render(<ApiEntryCard entry={mockFunction} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText('distance')).toBeDefined();
  });

  it('renders kind indicator for function', () => {
    render(<ApiEntryCard entry={mockFunction} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText('fn')).toBeDefined();
  });

  it('renders kind indicator for interface', () => {
    render(<ApiEntryCard entry={mockInterface} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText('interface')).toBeDefined();
  });

  it('renders kind indicator for constant', () => {
    render(<ApiEntryCard entry={mockConstant} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText('const')).toBeDefined();
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<ApiEntryCard entry={mockFunction} expanded={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('distance'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows description when expanded', () => {
    render(<ApiEntryCard entry={mockFunction} expanded={true} onToggle={() => {}} />);
    expect(screen.getByText('Compute the Euclidean distance between two 3D points.')).toBeDefined();
  });

  it('does not show description when collapsed', () => {
    render(<ApiEntryCard entry={mockFunction} expanded={false} onToggle={() => {}} />);
    expect(screen.queryByText('Compute the Euclidean distance between two 3D points.')).toBeNull();
  });

  it('shows signature when expanded (function)', () => {
    render(<ApiEntryCard entry={mockFunction} expanded={true} onToggle={() => {}} />);
    expect(screen.getByText('distance(a: Point3D, b: Point3D): number')).toBeDefined();
  });

  it('shows params when expanded (function)', () => {
    render(<ApiEntryCard entry={mockFunction} expanded={true} onToggle={() => {}} />);
    expect(screen.getByText('First point')).toBeDefined();
    expect(screen.getByText('Second point')).toBeDefined();
  });

  it('shows returns when expanded (function)', () => {
    render(<ApiEntryCard entry={mockFunction} expanded={true} onToggle={() => {}} />);
    expect(screen.getByText('The straight-line distance between a and b')).toBeDefined();
  });

  it('shows properties when expanded (interface)', () => {
    render(<ApiEntryCard entry={mockInterface} expanded={true} onToggle={() => {}} />);
    expect(screen.getByText('X coordinate')).toBeDefined();
    expect(screen.getByText('Y coordinate')).toBeDefined();
    expect(screen.getByText('Z coordinate')).toBeDefined();
  });
});
