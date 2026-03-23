import { OperationResult, success, failure } from '../mesh/mesh';
import { Shell, shellIsClosed, shellFaces } from './shell';
import { faceOuterWire } from './face';
import { edgeStartPoint } from './edge';

/**
 * A closed 3D volume defined by its boundary shell(s).
 *
 * outerShell is the external boundary.
 * innerShells define internal voids/cavities.
 *
 * OCCT reference: TopoDS_Solid
 */
export interface Solid {
  /** The external boundary shell (must be closed) */
  readonly outerShell: Shell;

  /** Internal void shells */
  readonly innerShells: readonly Shell[];
}

/**
 * Create a solid from a shell.
 *
 * @param outerShell - The external boundary (must be closed)
 * @param innerShells - Optional internal voids
 * @returns Solid or failure if outer shell is not closed
 */
export function makeSolid(
  outerShell: Shell,
  innerShells: Shell[] = [],
): OperationResult<Solid> {
  if (!shellIsClosed(outerShell)) {
    return failure('Outer shell must be closed');
  }

  return success({
    outerShell,
    innerShells: [...innerShells],
  });
}

/**
 * Get the outer shell of a solid.
 */
export function solidOuterShell(solid: Solid): Shell {
  return solid.outerShell;
}

/**
 * Get the inner shells (voids) of a solid.
 */
export function solidInnerShells(solid: Solid): readonly Shell[] {
  return solid.innerShells;
}

/**
 * Compute the volume of a solid.
 *
 * This is a simplified implementation that works for axis-aligned boxes.
 * A full implementation would use the divergence theorem (surface integrals).
 *
 * @param solid - The solid
 * @returns Volume (approximate for non-box shapes)
 */
export function solidVolume(solid: Solid): number {
  // Compute bounding box from all vertices in the shell
  const outerVolume = computeShellVolume(solid.outerShell);

  // Subtract inner shell volumes
  let innerVolume = 0;
  for (const inner of solid.innerShells) {
    innerVolume += computeShellVolume(inner);
  }

  return outerVolume - innerVolume;
}

/**
 * Compute volume of a shell using bounding box (works for axis-aligned boxes).
 */
function computeShellVolume(shell: Shell): number {
  // Collect all vertex points
  const points: { x: number; y: number; z: number }[] = [];

  for (const face of shellFaces(shell)) {
    const wire = faceOuterWire(face);
    for (const oe of wire.edges) {
      const pt = edgeStartPoint(oe.edge);
      points.push(pt);
    }
  }

  if (points.length === 0) return 0;

  // Compute bounding box
  let minX = points[0].x, maxX = points[0].x;
  let minY = points[0].y, maxY = points[0].y;
  let minZ = points[0].z, maxZ = points[0].z;

  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
    minZ = Math.min(minZ, pt.z);
    maxZ = Math.max(maxZ, pt.z);
  }

  return (maxX - minX) * (maxY - minY) * (maxZ - minZ);
}
