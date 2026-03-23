import { Plane } from '../core/plane';
import { Curve2D } from '../geometry/wire2d';

let nextElementId = 1;

/**
 * An element in a sketch — a piece of geometry with an ID.
 * Construction elements are visual guides that don't form part of profiles.
 */
export interface SketchElement {
  /** Unique identifier within the sketch. */
  readonly id: string;
  /** The underlying 2D curve. */
  readonly geometry: Curve2D;
  /** Construction geometry doesn't contribute to profiles. */
  readonly construction: boolean;
}

/**
 * A 2D sketch on a plane.
 * Contains elements (lines, arcs, circles) and can be analyzed for closed profiles.
 */
export interface Sketch {
  /** The 3D plane this sketch lives on. */
  readonly plane: Plane;
  /** All sketch elements. */
  readonly elements: readonly SketchElement[];
}

/**
 * Create an empty sketch on a plane.
 *
 * @param plane - The 3D plane the sketch lives on
 * @returns An empty Sketch
 */
export function createSketch(plane: Plane): Sketch {
  return { plane, elements: [] };
}

/**
 * Add a geometry element to a sketch.
 * Returns a new sketch (immutable).
 *
 * @param sketch - The existing sketch
 * @param geometry - The 2D curve to add
 * @param construction - Whether this is construction geometry (default: false)
 * @returns A new Sketch with the element added
 */
export function addElement(
  sketch: Sketch,
  geometry: Curve2D,
  construction: boolean = false,
): Sketch {
  const element: SketchElement = {
    id: `elem_${nextElementId++}`,
    geometry,
    construction,
  };
  return {
    plane: sketch.plane,
    elements: [...sketch.elements, element],
  };
}

/**
 * Remove an element by ID.
 * Returns a new sketch. If the ID is not found, returns the sketch unchanged.
 *
 * @param sketch - The existing sketch
 * @param id - Element ID to remove
 * @returns A new Sketch without the element
 */
export function removeElement(sketch: Sketch, id: string): Sketch {
  const filtered = sketch.elements.filter(e => e.id !== id);
  if (filtered.length === sketch.elements.length) return sketch;
  return {
    plane: sketch.plane,
    elements: filtered,
  };
}

/**
 * Get an element by ID.
 *
 * @param sketch - The sketch to search
 * @param id - Element ID
 * @returns The element, or undefined if not found
 */
export function getElement(sketch: Sketch, id: string): SketchElement | undefined {
  return sketch.elements.find(e => e.id === id);
}
