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
 * Compute the volume of a solid using the divergence theorem.
 *
 * Uses the signed tetrahedra method: for each face, triangulate it and sum
 * the signed volumes of tetrahedra formed with the origin.
 *
 * Volume = (1/6) * Σ (v0 · (v1 × v2)) for each triangle (v0, v1, v2)
 *
 * @param solid - The solid
 * @returns Volume (always positive via absolute value)
 */
export function solidVolume(solid: Solid): number {
  // Compute outer shell volume
  const outerVolume = Math.abs(computeShellSignedVolume(solid.outerShell));

  // Subtract inner shell volumes (voids)
  let innerVolume = 0;
  for (const inner of solid.innerShells) {
    innerVolume += Math.abs(computeShellSignedVolume(inner));
  }

  return outerVolume - innerVolume;
}

/**
 * Compute signed volume of a shell using the divergence theorem.
 *
 * For each face, we triangulate it by fanning from the first vertex,
 * then compute the signed volume of each tetrahedron with the origin.
 *
 * @param shell - The shell
 * @returns Signed volume (positive if normals point outward)
 */
function computeShellSignedVolume(shell: Shell): number {
  let totalVolume = 0;

  for (const face of shellFaces(shell)) {
    // Get all vertices from the outer wire
    const wire = faceOuterWire(face);
    const vertices: { x: number; y: number; z: number }[] = [];

    for (const oe of wire.edges) {
      // Use the effective start point based on orientation
      const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      vertices.push(pt);
    }

    if (vertices.length < 3) continue;

    // Triangulate by fanning from first vertex
    const v0 = vertices[0];
    for (let i = 1; i < vertices.length - 1; i++) {
      const v1 = vertices[i];
      const v2 = vertices[i + 1];

      // Signed volume of tetrahedron with origin = (v0 · (v1 × v2)) / 6
      // Cross product v1 × v2:
      const crossX = v1.y * v2.z - v1.z * v2.y;
      const crossY = v1.z * v2.x - v1.x * v2.z;
      const crossZ = v1.x * v2.y - v1.y * v2.x;

      // Dot product v0 · (v1 × v2):
      const dotProduct = v0.x * crossX + v0.y * crossY + v0.z * crossZ;

      totalVolume += dotProduct / 6.0;
    }

    // Note: We ignore inner wires (holes) for volume - they don't contribute
    // to the solid volume as they represent boundaries on the same face plane
  }

  return totalVolume;
}

/**
 * Helper to get edge end point.
 */
function edgeEndPoint(edge: { endVertex: { point: { x: number; y: number; z: number } } }): { x: number; y: number; z: number } {
  return edge.endVertex.point;
}
