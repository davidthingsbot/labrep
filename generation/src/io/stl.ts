import { Mesh, OperationResult, failure } from '../mesh/mesh';
import { stlAsciiToMesh } from './stl-ascii-reader';
import { stlBinaryToMesh } from './stl-binary-reader';

/**
 * Import an STL file (ASCII or binary) into a Mesh.
 *
 * Auto-detects the format:
 * - String input → ASCII parsing
 * - ArrayBuffer input → check if binary size matches, otherwise try ASCII
 *
 * @param data - STL file content (string for ASCII, ArrayBuffer for either)
 * @returns Mesh or failure
 */
export function stlToMesh(data: string | ArrayBuffer): OperationResult<Mesh> {
  if (typeof data === 'string') {
    return stlAsciiToMesh(data);
  }

  if (data.byteLength < 84) {
    // Too small for binary, try as ASCII
    const text = new TextDecoder().decode(data);
    return stlAsciiToMesh(text);
  }

  // Check if the size matches binary format: 84 + 50 * triCount
  const view = new DataView(data);
  const triCount = view.getUint32(80, true);
  const expectedBinarySize = 84 + 50 * triCount;

  if (data.byteLength === expectedBinarySize && triCount > 0) {
    return stlBinaryToMesh(data);
  }

  // Not valid binary — try as ASCII
  const text = new TextDecoder().decode(data);
  return stlAsciiToMesh(text);
}
