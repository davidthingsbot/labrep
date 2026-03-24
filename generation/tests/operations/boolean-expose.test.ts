/**
 * Tests that expose real issues in boolean operations.
 *
 * These go beyond the "two axis-aligned boxes sharing Z=0 base" case
 * that the existing tests cover. Each test is designed to probe a
 * specific weakness in the current implementation.
 */
import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
} from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { shellIsClosed, shellFaces } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { extrude } from '../../src/operations/extrude';
import { booleanUnion, booleanSubtract, booleanIntersect } from '../../src/operations/boolean';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Make a box solid with bottom-left corner at (x,y,z) and dimensions (w,h,d) */
function makeBox(cx: number, cy: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, z), point3d(cx + hw, cy - hh, z),
    point3d(cx + hw, cy + hh, z), point3d(cx - hw, cy + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d).result!;
}

// ═══════════════════════════════════════════════════════
// CATEGORY 1: Topology validation on the EXISTING test case
// (Does the "passing" test actually produce valid geometry?)
// ═══════════════════════════════════════════════════════

describe('topology validation on existing box-box case', () => {
  const boxA = makeBox(0, 0, 0, 4, 4, 4);
  const boxB = makeBox(1, 1, 0, 4, 4, 4);

  it('intersect result shell should be closed', () => {
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('subtract result shell should be closed', () => {
    const result = booleanSubtract(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('union result shell should be closed', () => {
    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('union volume should be exactly 92', () => {
    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(92, 1);
  });

  it('intersect should have exactly 6 faces (box)', () => {
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    expect(faces.length).toBe(6);
  });
});

// ═══════════════════════════════════════════════════════
// CATEGORY 2: Different Z bases (no coplanar top/bottom)
// This forces the transverse splitting code to do real work.
// ═══════════════════════════════════════════════════════

describe('boxes with different Z bases (non-coplanar top/bottom)', () => {
  // A: z=0..4, B: z=1..5 → overlap region z=1..4 (height 3)
  // XY overlap: same as before, 3×3
  // Intersection volume: 3×3×3 = 27
  const boxA = makeBox(0, 0, 0, 4, 4, 4);
  const boxB = makeBox(1, 1, 1, 4, 4, 4);

  it('intersect volume should be 27', () => {
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(27, 1);
  });

  it('intersect result should be a closed shell', () => {
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('subtract volume should be 64 - 27 = 37', () => {
    const result = booleanSubtract(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(37, 1);
  });

  it('union volume should be 64 + 64 - 27 = 101', () => {
    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(101, 1);
  });
});

// ═══════════════════════════════════════════════════════
// CATEGORY 3: B completely inside A
// No shared faces — every face of B is inside A.
// ═══════════════════════════════════════════════════════

describe('B completely inside A', () => {
  // A: 10×10×10 at origin, B: 2×2×2 at center
  const bigBox = makeBox(0, 0, 0, 10, 10, 10);
  const smallBox = makeBox(0, 0, 3, 2, 2, 2);

  it('intersect should equal B (volume 8)', () => {
    const result = booleanIntersect(bigBox.solid, smallBox.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(8, 1);
  });

  it('subtract should be A minus B (volume 1000 - 8 = 992)', () => {
    const result = booleanSubtract(bigBox.solid, smallBox.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(992, 1);
  });

  it('union should equal A (volume 1000)', () => {
    const result = booleanUnion(bigBox.solid, smallBox.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(1000, 1);
  });

  it('intersect result should be closed', () => {
    const result = booleanIntersect(bigBox.solid, smallBox.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// CATEGORY 4: One face flush (shared face, partial overlap)
// A sits on top of B, sharing exactly one face.
// ═══════════════════════════════════════════════════════

describe('stacked boxes sharing one face', () => {
  // A: z=0..4, B: z=4..8, same XY footprint
  // They share the z=4 plane but A's top normal is +Z, B's bottom is -Z
  const boxA = makeBox(0, 0, 0, 4, 4, 4);
  const boxB = makeBox(0, 0, 4, 4, 4, 4);

  it('intersect should fail or have zero volume (touching, no volume overlap)', () => {
    const result = booleanIntersect(boxA.solid, boxB.solid);
    // Either fails or produces degenerate result
    if (result.success) {
      const vol = solidVolume(result.result!.solid);
      expect(vol).toBeLessThan(0.01);
    }
  });

  it('union volume should be 128 (two 4×4×4 boxes)', () => {
    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(128, 1);
  });
});

// ═══════════════════════════════════════════════════════
// CATEGORY 5: Identical solids
// ═══════════════════════════════════════════════════════

describe('identical solids', () => {
  const boxA = makeBox(0, 0, 0, 4, 4, 4);
  const boxB = makeBox(0, 0, 0, 4, 4, 4);

  it('intersect of identical boxes should equal either (volume 64)', () => {
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(64, 1);
  });

  it('subtract of identical boxes should be empty/zero', () => {
    const result = booleanSubtract(boxA.solid, boxB.solid);
    // Should either fail or produce zero volume
    if (result.success) {
      const vol = solidVolume(result.result!.solid);
      expect(vol).toBeLessThan(0.01);
    }
  });

  it('union of identical boxes should equal either (volume 64)', () => {
    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(64, 1);
  });
});

// ═══════════════════════════════════════════════════════
// CATEGORY 6: XY-offset only (side-by-side, partial overlap)
// All overlap is through side faces, no coplanar pairs.
// ═══════════════════════════════════════════════════════

describe('XY partial overlap, same Z range', () => {
  // A: (-2,-2,0)→(2,2,4), B: (1,-2,0)→(5,2,4)
  // Overlap: (1,-2,0)→(2,2,4) = 1×4×4 = 16
  const boxA = makeBox(0, 0, 0, 4, 4, 4);
  const boxB = makeBox(3, 0, 0, 4, 4, 4);

  it('intersect volume should be 16', () => {
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(16, 1);
  });

  it('subtract volume should be 64 - 16 = 48', () => {
    const result = booleanSubtract(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(48, 1);
  });

  it('union volume should be 64 + 64 - 16 = 112', () => {
    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(112, 1);
  });
});

// ═══════════════════════════════════════════════════════
// CATEGORY 7: Consistency checks
// Volume(A) + Volume(B) = Volume(union) + Volume(intersect)
// Volume(subtract A-B) = Volume(A) - Volume(intersect)
// ═══════════════════════════════════════════════════════

describe('volume consistency (inclusion-exclusion)', () => {
  it('V(A) + V(B) = V(union) + V(intersect) for offset boxes', () => {
    const boxA = makeBox(0, 0, 0, 4, 4, 4);
    const boxB = makeBox(1, 1, 1, 4, 4, 4);

    const vA = solidVolume(boxA.solid); // 64
    const vB = solidVolume(boxB.solid); // 64

    const unionResult = booleanUnion(boxA.solid, boxB.solid);
    const intersectResult = booleanIntersect(boxA.solid, boxB.solid);
    expect(unionResult.success).toBe(true);
    expect(intersectResult.success).toBe(true);

    const vUnion = solidVolume(unionResult.result!.solid);
    const vIntersect = solidVolume(intersectResult.result!.solid);

    // Inclusion-exclusion: V(A) + V(B) = V(A∪B) + V(A∩B)
    expect(vA + vB).toBeCloseTo(vUnion + vIntersect, 1);
  });

  it('V(subtract A-B) = V(A) - V(intersect) for offset boxes', () => {
    const boxA = makeBox(0, 0, 0, 4, 4, 4);
    const boxB = makeBox(1, 1, 1, 4, 4, 4);

    const vA = solidVolume(boxA.solid);

    const subtractResult = booleanSubtract(boxA.solid, boxB.solid);
    const intersectResult = booleanIntersect(boxA.solid, boxB.solid);
    expect(subtractResult.success).toBe(true);
    expect(intersectResult.success).toBe(true);

    const vSubtract = solidVolume(subtractResult.result!.solid);
    const vIntersect = solidVolume(intersectResult.result!.solid);

    expect(vSubtract).toBeCloseTo(vA - vIntersect, 1);
  });
});
