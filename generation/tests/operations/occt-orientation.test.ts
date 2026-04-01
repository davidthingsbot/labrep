/**
 * OCCT-aligned orientation helper tests.
 *
 * These lock down the low-level behavior of
 * BOPTools_AlgoTools::IsSplitToReverse before the boolean pipeline uses it.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { makeFace } from '../../src/topology/face';
import { makePlaneSurface } from '../../src/surfaces';
import { isSplitFaceReversed } from '../../src/operations/occt-orientation';

function makeSquareFace(surfaceFactory = () => makePlaneSurface(
  plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)),
)) {
  const corners = [
    point3d(-1, -1, 0),
    point3d(1, -1, 0),
    point3d(1, 1, 0),
    point3d(-1, 1, 0),
  ];
  const edges = corners.map((corner, index) =>
    makeEdgeFromCurve(makeLine3D(corner, corners[(index + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return makeFace(surfaceFactory(), wire).result!;
}

describe('IsSplitToReverse: same-surface branch', () => {
  it('keeps a split face with the same orientation as its parent', () => {
    const parent = makeSquareFace();
    const split = makeFace(parent.surface, parent.outerWire, [], true).result!;
    expect(isSplitFaceReversed(split, parent)).toBe(false);
  });

  it('reverses a split face with opposite orientation on the same surface object', () => {
    const parent = makeSquareFace();
    const split = makeFace(parent.surface, parent.outerWire, [], false).result!;
    expect(isSplitFaceReversed(split, parent)).toBe(true);
  });
});

describe('IsSplitToReverse: normal-comparison branch', () => {
  it('keeps a split face when copied onto an equivalent surface with the same effective normal', () => {
    const parent = makeSquareFace();
    const split = makeSquareFace(() => makePlaneSurface(
      plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)),
    ));
    expect(split.surface).not.toBe(parent.surface);
    expect(isSplitFaceReversed(split, parent)).toBe(false);
  });

  it('reverses a split face when copied onto an equivalent surface with opposite effective normal', () => {
    const parent = makeSquareFace();
    const split = makeSquareFace(() => makePlaneSurface(
      plane(point3d(0, 0, 0), vec3d(0, 0, -1), vec3d(1, 0, 0)),
    ));
    expect(split.surface).not.toBe(parent.surface);
    expect(isSplitFaceReversed(split, parent)).toBe(true);
  });
});
