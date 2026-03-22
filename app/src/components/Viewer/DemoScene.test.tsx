import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, ...props }: any) => (
    <div data-testid="three-canvas" {...props}>{children}</div>
  ),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Line: (props: any) => <div data-testid="drei-line" {...props} />,
  Sphere: (props: any) => <div data-testid="drei-sphere" {...props} />,
  Cone: (props: any) => <div data-testid="drei-cone" {...props} />,
  Text: ({ children, ...props }: any) => <div data-testid="drei-text" {...props}>{children}</div>,
}));

vi.mock('@/components/Viewer/SceneObjects', () => ({
  PointViz: ({ label, ...props }: any) => (
    <div data-testid="point-viz" data-label={label} {...props} />
  ),
  VectorViz: ({ label, ...props }: any) => (
    <div data-testid="vector-viz" data-label={label} {...props} />
  ),
  LineViz: ({ label, ...props }: any) => (
    <div data-testid="line-viz" data-label={label} {...props} />
  ),
  MeshViz: ({ label, ...props }: any) => (
    <div data-testid="mesh-viz" data-label={label} {...props} />
  ),
}));

import { DemoScene } from './DemoScene';

describe('DemoScene', () => {
  it('renders without crashing', () => {
    render(<DemoScene />);
  });

  it('renders group title labels', () => {
    render(<DemoScene />);
    const textElements = screen.getAllByTestId('drei-text');
    expect(textElements.length).toBeGreaterThanOrEqual(4);
  });

  it('includes labeled points', () => {
    render(<DemoScene />);
    const points = screen.getAllByTestId('point-viz');
    expect(points.length).toBeGreaterThanOrEqual(2);
    const labels = points.map((p) => p.getAttribute('data-label'));
    expect(labels).toContain('Origin');
    expect(labels).toContain('P1');
  });

  it('includes axis vectors', () => {
    render(<DemoScene />);
    const vectors = screen.getAllByTestId('vector-viz');
    const labels = vectors.map((v) => v.getAttribute('data-label'));
    expect(labels).toContain('X');
    expect(labels).toContain('Y');
    expect(labels).toContain('Z');
  });

  it('includes primitives (box, sphere, cylinder)', () => {
    render(<DemoScene />);
    const meshes = screen.getAllByTestId('mesh-viz');
    const labels = meshes.map((m) => m.getAttribute('data-label'));
    expect(labels).toContain('Box');
    expect(labels).toContain('Sphere');
    expect(labels).toContain('Cylinder');
  });

  it('includes line segments', () => {
    render(<DemoScene />);
    const lines = screen.getAllByTestId('line-viz');
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('includes group title labels', () => {
    render(<DemoScene />);
    const textElements = screen.getAllByTestId('drei-text');
    const texts = textElements.map((t) => t.textContent);
    expect(texts).toContain('Points');
    expect(texts).toContain('Vectors');
    expect(texts).toContain('Lines');
    expect(texts).toContain('Primitives');
  });
});
