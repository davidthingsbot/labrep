'use client';

import { getExampleById } from '@/examples/registry';

interface ExampleRendererProps {
  /** ID of the example to render */
  exampleId: string;
  /** Current animation angle in radians (0 to 2π) */
  animationAngle: number;
}

/** Renders the selected example with animation angle, or a fallback for unknown IDs. */
export function ExampleRenderer({ exampleId, animationAngle }: ExampleRendererProps) {
  const example = getExampleById(exampleId);

  if (!example) {
    return (
      <group data-testid="example-not-found">
        <mesh>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="red" />
        </mesh>
        {/* Note: Text would require drei, using mesh as fallback indicator */}
      </group>
    );
  }

  const ExampleComponent = example.component;
  return <ExampleComponent animationAngle={animationAngle} />;
}
