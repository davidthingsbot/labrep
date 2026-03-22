import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, ...props }: any) => (
    <div data-testid="three-canvas" {...props}>{children}</div>
  ),
}));

vi.mock('@react-three/drei', () => ({
  Line: ({ points, ...props }: any) => <div data-testid="drei-line" {...props} />,
  Sphere: (props: any) => <div data-testid="drei-sphere" {...props} />,
  Cone: (props: any) => <div data-testid="drei-cone" {...props} />,
  Text: ({ children, ...props }: any) => <div data-testid="drei-text" {...props}>{children}</div>,
}));

import { PointViz, VectorViz, LineViz, MeshViz } from './SceneObjects';

describe('PointViz', () => {
  it('renders a sphere for a Point3D', () => {
    render(<PointViz point={{ x: 1, y: 2, z: 3 }} />);
    expect(screen.getByTestId('drei-sphere')).toBeInTheDocument();
  });

  it('renders a label when label prop is provided', () => {
    render(<PointViz point={{ x: 0, y: 0, z: 0 }} label="Origin" />);
    expect(screen.getByTestId('drei-text')).toBeInTheDocument();
    expect(screen.getByText('Origin')).toBeInTheDocument();
  });

  it('does not render a label when label prop is absent', () => {
    render(<PointViz point={{ x: 1, y: 2, z: 3 }} />);
    expect(screen.queryByTestId('drei-text')).not.toBeInTheDocument();
  });

  it('renders without crashing with valid data', () => {
    const { container } = render(
      <PointViz point={{ x: -5, y: 10, z: 0.5 }} color="green" size={0.1} />
    );
    expect(container).toBeTruthy();
  });
});

describe('VectorViz', () => {
  it('renders an arrow (line + cone) for a Vector3D at an origin', () => {
    render(
      <VectorViz origin={{ x: 0, y: 0, z: 0 }} vector={{ x: 1, y: 0, z: 0 }} />
    );
    expect(screen.getByTestId('drei-line')).toBeInTheDocument();
    expect(screen.getByTestId('drei-cone')).toBeInTheDocument();
  });

  it('renders without crashing with valid data', () => {
    const { container } = render(
      <VectorViz
        origin={{ x: 1, y: 2, z: 3 }}
        vector={{ x: 0, y: 1, z: 0 }}
        color="blue"
        label="Normal"
      />
    );
    expect(container).toBeTruthy();
  });
});

describe('LineViz', () => {
  it('renders a line between two Point3D positions', () => {
    render(
      <LineViz start={{ x: 0, y: 0, z: 0 }} end={{ x: 1, y: 1, z: 1 }} />
    );
    expect(screen.getByTestId('drei-line')).toBeInTheDocument();
  });

  it('renders without crashing with valid data', () => {
    const { container } = render(
      <LineViz
        start={{ x: -1, y: 0, z: 0 }}
        end={{ x: 1, y: 0, z: 0 }}
        color="magenta"
      />
    );
    expect(container).toBeTruthy();
  });
});

describe('MeshViz', () => {
  it('renders a mesh element', () => {
    const mesh = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const { container } = render(<MeshViz mesh={mesh} />);
    expect(container).toBeTruthy();
  });

  it('renders without crashing with wireframe enabled', () => {
    const mesh = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const { container } = render(<MeshViz mesh={mesh} wireframe color="red" />);
    expect(container).toBeTruthy();
  });
});
