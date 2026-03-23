import { OperationResult, success, failure } from '../mesh/mesh';
import { Face } from './face';

/**
 * A connected set of faces.
 *
 * isClosed=true when the shell is watertight (no boundary edges).
 *
 * OCCT reference: TopoDS_Shell
 */
export interface Shell {
  /** The faces composing the shell */
  readonly faces: readonly Face[];

  /** True if the shell is watertight (closed) */
  readonly isClosed: boolean;
}

/**
 * Create a shell from faces.
 *
 * Note: This is a simplified implementation. A full implementation would
 * analyze edge connectivity to determine if the shell is truly closed.
 * For now, we use a heuristic based on face count.
 *
 * @param faces - The faces composing the shell
 * @returns Shell or failure
 */
export function makeShell(faces: Face[]): OperationResult<Shell> {
  if (faces.length === 0) {
    return failure('Cannot create shell from empty face list');
  }

  // Simple heuristic for closed detection:
  // - A single face is never closed
  // - 6 faces could be a closed box
  // - For now, use a very simple heuristic
  // TODO: Implement proper edge-sharing analysis
  const isClosed = faces.length >= 6;

  return success({
    faces: [...faces],
    isClosed,
  });
}

/**
 * Get the faces of a shell.
 */
export function shellFaces(shell: Shell): readonly Face[] {
  return shell.faces;
}

/**
 * Check if a shell is closed (watertight).
 */
export function shellIsClosed(shell: Shell): boolean {
  return shell.isClosed;
}
