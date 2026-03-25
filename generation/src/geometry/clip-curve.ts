import { Point3D, Vector3D, Plane, dot, subtractPoints } from '../core';

/**
 * An angular interval on a circle, representing a surviving arc.
 * Angles in radians, [startAngle, endAngle) going CCW.
 * If startAngle > endAngle, the arc wraps around 2π.
 */
export interface ArcInterval {
  startAngle: number;
  endAngle: number;
}

/**
 * Description of a circle for clipping purposes.
 * The circle is parametrized as:
 *   P(t) = center + radius * (cos(t) * xAxis + sin(t) * yAxis)
 */
export interface ClipCircle {
  center: Point3D;
  radius: number;
  normal: Vector3D;
  xAxis: Vector3D;
  yAxis: Vector3D;
}

const TWO_PI = 2 * Math.PI;

/** Normalize angle to [0, 2π) */
function normalizeAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

/**
 * Clip a circle by a set of half-space constraints.
 *
 * Each half-space is defined by a Plane: points on the side OPPOSITE to the
 * plane normal are considered "inside" (i.e., dot(P - origin, normal) < 0).
 *
 * The algorithm solves A·cos(t) + B·sin(t) + C = 0 for each plane to find
 * where the circle crosses the plane boundary. The surviving arc is the
 * intersection of all angular intervals.
 *
 * @param circle - The circle to clip
 * @param planes - Half-space constraints (inside = opposite side of normal)
 * @returns The surviving arc interval, or null if fully clipped
 */
export function clipCircleByHalfSpaces(
  circle: ClipCircle,
  planes: readonly Plane[],
): ArcInterval | null {
  // Start with the full circle
  let arcStart = 0;
  let arcEnd = TWO_PI;
  let isFullCircle = true;

  for (const pl of planes) {
    // For point P(t) = center + r * (cos(t) * xAxis + sin(t) * yAxis),
    // the half-space test is: dot(P(t) - planeOrigin, planeNormal) < 0
    //
    // Expanding: dot(center - planeOrigin, normal) + r * cos(t) * dot(xAxis, normal) + r * sin(t) * dot(yAxis, normal) < 0
    //
    // Let C = dot(center - planeOrigin, normal)
    //     A = r * dot(xAxis, normal)
    //     B = r * dot(yAxis, normal)
    //
    // Equation on boundary: A*cos(t) + B*sin(t) + C = 0

    const rel = subtractPoints(circle.center, pl.origin);
    const C = dot(rel, pl.normal);
    const A = circle.radius * dot(circle.xAxis, pl.normal);
    const B = circle.radius * dot(circle.yAxis, pl.normal);

    const R = Math.sqrt(A * A + B * B);

    if (R < 1e-10) {
      // Circle is parallel to the plane (all points at same distance)
      if (C >= 0) {
        // All points on the outside → fully clipped
        return null;
      }
      // All points inside → no clipping by this plane
      continue;
    }

    const ratio = -C / R;

    if (ratio >= 1 - 1e-10) {
      // All points satisfy the constraint → no clipping
      continue;
    }

    if (ratio <= -1 + 1e-10) {
      // No points satisfy the constraint → fully clipped
      return null;
    }

    // Two crossings at t = phi ± acos(ratio)
    const phi = Math.atan2(B, A);
    const delta = Math.acos(Math.max(-1, Math.min(1, ratio)));

    const t1 = normalizeAngle(phi - delta);
    const t2 = normalizeAngle(phi + delta);

    // The "inside" arc is where A*cos(t) + B*sin(t) + C < 0.
    // Test the midpoint of [t1, t2] to determine which arc is inside.
    const tMid = normalizeAngle(phi + Math.PI); // Point opposite to phi (where cos is most negative)
    const testVal = A * Math.cos(tMid) + B * Math.sin(tMid) + C;

    let insideStart: number, insideEnd: number;
    if (testVal < 0) {
      // The arc from t1 going through tMid to t2 (the "far" arc) is inside
      insideStart = t2;
      insideEnd = t1;
    } else {
      // The arc from t1 to t2 (the "near" arc) is inside
      insideStart = t1;
      insideEnd = t2;
    }

    // Intersect this interval with the current surviving arc
    if (isFullCircle) {
      arcStart = insideStart;
      arcEnd = insideEnd;
      isFullCircle = false;
    } else {
      const result = intersectArcs(arcStart, arcEnd, insideStart, insideEnd);
      if (result === null) return null;
      arcStart = result.startAngle;
      arcEnd = result.endAngle;
    }
  }

  if (isFullCircle) {
    return { startAngle: 0, endAngle: TWO_PI };
  }

  // Check for degenerate (zero-length) arc
  let len = arcEnd - arcStart;
  if (len < 0) len += TWO_PI;
  if (len < 1e-8) return null;

  return { startAngle: arcStart, endAngle: arcEnd };
}

/**
 * Intersect two angular intervals on a circle.
 * Each interval is [start, end) going CCW. If start > end, wraps around 2π.
 * Returns the intersection interval, or null if empty.
 */
function intersectArcs(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): ArcInterval | null {
  // Convert to a representation that's easier to intersect:
  // each arc as a set of angles in [0, 4π) to handle wraparound

  // Check if angle t is inside arc [start, end)
  const inArc = (t: number, start: number, end: number): boolean => {
    const s = normalizeAngle(start);
    const e = normalizeAngle(end);
    const tt = normalizeAngle(t);
    if (s <= e) {
      return tt >= s - 1e-10 && tt <= e + 1e-10;
    } else {
      // Wraps around: [s, 2π) ∪ [0, e)
      return tt >= s - 1e-10 || tt <= e + 1e-10;
    }
  };

  // Candidate intersection boundaries: the four endpoints
  const candidates = [aStart, aEnd, bStart, bEnd];
  const inBoth: number[] = [];

  // Also sample some intermediate points to detect the interior
  const aMid = normalizeAngle(aStart + arcLen(aStart, aEnd) / 2);
  const bMid = normalizeAngle(bStart + arcLen(bStart, bEnd) / 2);

  // Find points that are in both arcs
  for (const t of [aStart, aEnd, bStart, bEnd, aMid, bMid]) {
    if (inArc(t, aStart, aEnd) && inArc(t, bStart, bEnd)) {
      inBoth.push(normalizeAngle(t));
    }
  }

  if (inBoth.length === 0) return null;

  // The intersection is a contiguous arc. Find its start and end.
  // Start: the "later" of the two arc starts (in the CCW direction from the intersection)
  // This is the approach: try all 4 boundary candidates as potential start/end of intersection

  // Strategy: the intersection starts at max(aStart, bStart) in the arc sense,
  // and ends at min(aEnd, bEnd) in the arc sense.

  // Check which of a's boundaries are inside b, and vice versa
  const aStartInB = inArc(aStart, bStart, bEnd);
  const aEndInB = inArc(aEnd, bStart, bEnd);
  const bStartInA = inArc(bStart, aStart, aEnd);
  const bEndInA = inArc(bEnd, aStart, aEnd);

  let start: number, end: number;

  if (aStartInB && bStartInA) {
    // Both starts are in the other arc — pick the one that's "later" CCW
    // The intersection start is the one that comes later in the CCW direction
    if (inArc(aStart, bStart, bEnd) && arcLen(bStart, aStart) < arcLen(bStart, bEnd)) {
      start = aStart;
    } else {
      start = bStart;
    }
  } else if (aStartInB) {
    start = aStart;
  } else if (bStartInA) {
    start = bStart;
  } else {
    return null;
  }

  if (aEndInB && bEndInA) {
    if (inArc(aEnd, bStart, bEnd) && arcLen(bStart, aEnd) < arcLen(bStart, bEnd)) {
      end = aEnd;
    } else {
      end = bEnd;
    }
  } else if (aEndInB) {
    end = aEnd;
  } else if (bEndInA) {
    end = bEnd;
  } else {
    return null;
  }

  const len = arcLen(start, end);
  if (len < 1e-8) return null;

  return { startAngle: start, endAngle: end };
}

/** Arc length from start to end going CCW */
function arcLen(start: number, end: number): number {
  let len = end - start;
  if (len < 0) len += TWO_PI;
  return len;
}

/**
 * Clip a circle by a set of half-space constraints, returning ALL surviving
 * arc intervals (not just one).
 *
 * When a circle is clipped by multiple planes (e.g., the 4 sides of a box),
 * multiple disjoint arc segments can survive. This function returns all of them.
 *
 * Each half-space is defined by a Plane: points where dot(P - origin, normal) < 0
 * are considered "inside" (surviving).
 *
 * @param circle - The circle to clip
 * @param planes - Half-space constraints
 * @returns Array of surviving arc intervals, empty if fully clipped
 */
export function clipCircleByHalfSpacesMulti(
  circle: ClipCircle,
  planes: readonly Plane[],
): ArcInterval[] {
  // Represent the surviving region as a set of arc intervals.
  // Start with the full circle [0, 2π), then intersect with each half-space.
  let intervals: ArcInterval[] = [{ startAngle: 0, endAngle: TWO_PI }];

  for (const pl of planes) {
    const rel = subtractPoints(circle.center, pl.origin);
    const C = dot(rel, pl.normal);
    const A = circle.radius * dot(circle.xAxis, pl.normal);
    const B = circle.radius * dot(circle.yAxis, pl.normal);
    const R = Math.sqrt(A * A + B * B);

    if (R < 1e-10) {
      if (C >= 0) return []; // Fully clipped
      continue; // Fully inside
    }

    const ratio = -C / R;
    if (ratio >= 1 - 1e-10) continue; // All inside
    if (ratio <= -1 + 1e-10) return []; // All outside

    // Two crossings
    const phi = Math.atan2(B, A);
    const delta = Math.acos(Math.max(-1, Math.min(1, ratio)));
    const t1 = normalizeAngle(phi - delta);
    const t2 = normalizeAngle(phi + delta);

    // Determine which arc is "inside" (A*cos(t) + B*sin(t) + C < 0)
    const tMid = normalizeAngle(phi + Math.PI);
    const testVal = A * Math.cos(tMid) + B * Math.sin(tMid) + C;

    let insideStart: number, insideEnd: number;
    if (testVal < 0) {
      insideStart = t2;
      insideEnd = t1;
    } else {
      insideStart = t1;
      insideEnd = t2;
    }

    // Intersect each existing interval with [insideStart, insideEnd]
    const newIntervals: ArcInterval[] = [];
    for (const iv of intervals) {
      const clipped = intersectArcIntervals(iv.startAngle, iv.endAngle, insideStart, insideEnd);
      for (const c of clipped) {
        const len = arcLen(c.startAngle, c.endAngle);
        if (len > 1e-8) newIntervals.push(c);
      }
    }
    intervals = newIntervals;
    if (intervals.length === 0) return [];
  }

  return intervals;
}

/**
 * Intersect two arc intervals, returning 0, 1, or 2 result intervals.
 * Handles wraparound correctly.
 */
function intersectArcIntervals(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): ArcInterval[] {
  // Convert arcs to sorted angular ranges for intersection.
  // An arc [s, e) with s < e covers [s, e).
  // An arc [s, e) with s > e wraps around: [s, 2π) ∪ [0, e).
  //
  // Strategy: check if each endpoint is in the other arc. Build result from
  // the detected containment pattern.

  const inArc = (t: number, start: number, end: number): boolean => {
    const s = normalizeAngle(start);
    const e = normalizeAngle(end);
    const tt = normalizeAngle(t);
    if (Math.abs(arcLen(s, e) - TWO_PI) < 1e-8) return true; // Full circle
    if (s < e) {
      return tt >= s - 1e-10 && tt <= e + 1e-10;
    } else {
      return tt >= s - 1e-10 || tt <= e + 1e-10;
    }
  };

  // Check containment of all 4 endpoints
  const aStartInB = inArc(aStart, bStart, bEnd);
  const aEndInB = inArc(aEnd, bStart, bEnd);
  const bStartInA = inArc(bStart, aStart, aEnd);
  const bEndInA = inArc(bEnd, aStart, aEnd);

  const results: ArcInterval[] = [];

  if (!aStartInB && !aEndInB && !bStartInA && !bEndInA) {
    // No overlap
    return [];
  }

  if (aStartInB && aEndInB && !bStartInA && !bEndInA) {
    // A is entirely inside B
    return [{ startAngle: aStart, endAngle: aEnd }];
  }

  if (bStartInA && bEndInA && !aStartInB && !aEndInB) {
    // B is entirely inside A
    return [{ startAngle: bStart, endAngle: bEnd }];
  }

  // Partial overlaps: collect intervals
  // The intersection starts at whichever "start" is inside the other arc,
  // and ends at whichever "end" is inside the other arc.

  if (aStartInB && bEndInA) {
    // Overlap: [aStart, bEnd]
    results.push({ startAngle: aStart, endAngle: normalizeAngle(bEnd) });
  }
  if (bStartInA && aEndInB) {
    // Overlap: [bStart, aEnd]
    results.push({ startAngle: normalizeAngle(bStart), endAngle: aEnd });
  }

  // Deduplicate: if both overlaps produce the same interval, keep one
  if (results.length === 2) {
    const len0 = arcLen(results[0].startAngle, results[0].endAngle);
    const len1 = arcLen(results[1].startAngle, results[1].endAngle);
    if (len0 < 1e-8) results.splice(0, 1);
    else if (len1 < 1e-8) results.splice(1, 1);
  }

  return results;
}
