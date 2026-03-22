import type { ComponentType } from 'react';

/** Props passed to every example component */
export interface ExampleProps {
  /** Animation angle in radians, 0 to 2π, loops every 10 seconds */
  animationAngle: number;
}

/** Metadata and component for a registered example */
export interface Example {
  /** Unique identifier, e.g., "primitives-box" */
  id: string;
  /** Display name, e.g., "Box Primitive" */
  name: string;
  /** Brief description of what the example shows */
  description: string;
  /** React component that renders the example */
  component: ComponentType<ExampleProps>;
  /** Code snippet shown in the editor for this example */
  code: string;
}
