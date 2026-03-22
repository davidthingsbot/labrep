import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExampleRenderer } from './ExampleRenderer';
import type { ExampleProps } from '@/examples/types';

// Mock the examples registry
vi.mock('@/examples/registry', () => ({
  getExampleById: (id: string) => {
    if (id === 'test-example') {
      return {
        id: 'test-example',
        name: 'Test Example',
        description: 'A test example',
        component: ({ animationAngle }: ExampleProps) => (
          <div data-testid="test-example" data-angle={animationAngle}>
            Test Example Content
          </div>
        ),
      };
    }
    return undefined;
  },
}));

// Mock Three.js components
vi.mock('@react-three/fiber', () => ({
  useFrame: vi.fn(),
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
}));

describe('ExampleRenderer', () => {
  it('renders selected example', () => {
    render(<ExampleRenderer exampleId="test-example" animationAngle={0} />);
    
    expect(screen.getByTestId('test-example')).toBeInTheDocument();
    expect(screen.getByText('Test Example Content')).toBeInTheDocument();
  });

  it('passes animation angle to example', () => {
    const testAngle = Math.PI / 2;
    render(<ExampleRenderer exampleId="test-example" animationAngle={testAngle} />);
    
    const example = screen.getByTestId('test-example');
    expect(example.getAttribute('data-angle')).toBe(String(testAngle));
  });

  it('handles unknown id with fallback', () => {
    render(<ExampleRenderer exampleId="nonexistent" animationAngle={0} />);
    
    expect(screen.getByTestId('example-not-found')).toBeInTheDocument();
  });

  it('renders fallback for unknown id', () => {
    render(<ExampleRenderer exampleId="some-unknown-id" animationAngle={0} />);
    
    // Fallback renders a red box indicator
    expect(screen.getByTestId('example-not-found')).toBeInTheDocument();
  });
});
