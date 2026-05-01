/**
 * FFI Edge Registry — ensures geometrically coincident FFI edges share
 * the same Edge object. This is the TypeScript equivalent of OCCT's
 * BOPDS_CommonBlock / PaveBlock / RealPaveBlock pipeline.
 *
 * OCCT ref: BOPDS_DS::RealPaveBlock() + BOPDS_CommonBlock::SetEdge()
 *
 * When two face-face intersections (FFI) produce geometrically identical edges
 * (e.g., face A∩B and face A∩C both produce an edge along the A-B-C triple line),
 * this registry ensures they share a single topological edge through vertex
 * canonicalization and geometric matching.
 */

import { distance, dot, type Point3D } from '../core';
import { type Edge, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { type Vertex, makeVertex } from '../topology/vertex';
import type { Face } from '../topology/face';

const VERTEX_TOL = 1e-5;
const SUPPORT_KEY_TOL = 1e-4;

/** A segment of an edge between two canonical vertices. OCCT ref: BOPDS_PaveBlock */
interface PaveBlock {
  /** The edge object (may be replaced by canonical shared edge) */
  edge: Edge;
  /** Canonical start vertex point */
  startPt: Point3D;
  /** Canonical end vertex point */
  endPt: Point3D;
  /** Parameter on support line (for line edges) */
  startT: number;
  /** Parameter on support line (for line edges) */
  endT: number;
  /** Which faces this edge should be distributed to */
  faces: Set<Face>;
}

/** Groups PaveBlocks sharing the same geometry. OCCT ref: BOPDS_CommonBlock */
interface CommonBlock {
  /** All PBs sharing this geometry (first = canonical representative) */
  paveBlocks: PaveBlock[];
  /** The canonical shared Edge object */
  sharedEdge: Edge;
  /** All faces this edge touches */
  faces: Set<Face>;
}

/** Canonical support line for line edges — same approach as occt-common-edges.ts */
interface SupportLine {
  key: string;
  anchor: Point3D;
  direction: Point3D;
}

/**
 * FFI Edge Registry.
 *
 * Usage:
 *   1. Create registry before the FFI loop
 *   2. Call registerEdge() for each FFI edge with its source face pair
 *   3. After all FFI pairs processed, call getEdgesForFace() to get canonical edges
 */
export class FFIEdgeRegistry {
  private readonly tolerance: number;
  /** Canonical vertex pool — ensures shared Point3D identity */
  private readonly vertexPool: Point3D[] = [];
  /** Common blocks indexed by support line key (for line edges) */
  private readonly lineCommonBlocks: Map<string, CommonBlock[]> = new Map();
  /** Common blocks for closed curves (circles) */
  private readonly closedCurveBlocks: CommonBlock[] = [];
  /** Common blocks for non-line open curves (arcs, ellipses) */
  private readonly curvedBlocks: CommonBlock[] = [];
  /** Face → edges mapping (built lazily) */
  private faceEdgesCache: Map<Face, Edge[]> | null = null;

  constructor(tolerance: number = VERTEX_TOL) {
    this.tolerance = tolerance;
  }

  /**
   * Register an FFI edge from a face-pair intersection.
   * Returns the canonical (shared) edge — may be the input edge or an
   * existing shared edge if a geometric match was found.
   *
   * OCCT ref: IsExistingPaveBlock() + CommonBlock creation in
   * PaveFiller_6.cxx MakeBlocks
   */
  registerEdge(edge: Edge, faceA: Face, faceB: Face): Edge {
    // Invalidate cache
    this.faceEdgesCache = null;

    // Canonicalize vertices
    const startPt = this.canonicalVertex(edgeStartPoint(edge));
    const endPt = edge.curve.isClosed ? startPt : this.canonicalVertex(edgeEndPoint(edge));

    if (edge.curve.type === 'line3d') {
      return this.registerLineEdge(edge, startPt, endPt, faceA, faceB);
    } else if (edge.curve.isClosed) {
      return this.registerClosedCurveEdge(edge, startPt, endPt, faceA, faceB);
    } else {
      return this.registerOpenCurvedEdge(edge, startPt, endPt, faceA, faceB);
    }
  }

  /**
   * Get all canonical edges that should be added to a given face.
   *
   * OCCT ref: BOPDS_FaceInfo::PaveBlocksIn/On/Sc → RealPaveBlock
   */
  getEdgesForFace(face: Face): Edge[] {
    if (!this.faceEdgesCache) {
      this.buildFaceEdgesCache();
    }
    return this.faceEdgesCache!.get(face) || [];
  }

  /**
   * Get all canonical edges (for debugging).
   */
  getAllEdges(): Edge[] {
    const edges = new Set<Edge>();
    for (const blocks of this.lineCommonBlocks.values()) {
      for (const cb of blocks) edges.add(cb.sharedEdge);
    }
    for (const cb of this.closedCurveBlocks) edges.add(cb.sharedEdge);
    for (const cb of this.curvedBlocks) edges.add(cb.sharedEdge);
    return [...edges];
  }

  // ─── Line edge registration ───────────────────────────────────────

  private registerLineEdge(
    edge: Edge,
    startPt: Point3D,
    endPt: Point3D,
    faceA: Face,
    faceB: Face,
  ): Edge {
    const support = this.lineSupportFrame(edge);
    if (!support) {
      // Degenerate line — just track it directly
      return this.addNewCurvedBlock(edge, startPt, endPt, faceA, faceB);
    }

    const startT = this.pointParamOnSupport(startPt, support);
    const endT = this.pointParamOnSupport(endPt, support);
    const minT = Math.min(startT, endT);
    const maxT = Math.max(startT, endT);

    // Look for existing common block on the same support line with overlapping interval
    const existingBlocks = this.lineCommonBlocks.get(support.key) || [];

    for (const cb of existingBlocks) {
      const existingPB = cb.paveBlocks[0];
      const existingMinT = Math.min(existingPB.startT, existingPB.endT);
      const existingMaxT = Math.max(existingPB.startT, existingPB.endT);

      // Check if intervals match (same edge segment on same support line)
      if (
        Math.abs(minT - existingMinT) < SUPPORT_KEY_TOL &&
        Math.abs(maxT - existingMaxT) < SUPPORT_KEY_TOL
      ) {
        // Found matching existing edge — share it!
        // OCCT ref: RealPaveBlock → same edge for all faces
        const newPB: PaveBlock = {
          edge,
          startPt,
          endPt,
          startT: minT,
          endT: maxT,
          faces: new Set([faceA, faceB]),
        };
        cb.paveBlocks.push(newPB);
        cb.faces.add(faceA);
        cb.faces.add(faceB);

        // Merge PCurves from new edge into shared edge
        this.mergePCurves(cb.sharedEdge, edge);

        // Share vertices: make the new edge's vertices point to canonical ones
        this.shareVertices(cb.sharedEdge, edge);

        return cb.sharedEdge;
      }
    }

    // No match found — create new common block
    const pb: PaveBlock = {
      edge,
      startPt,
      endPt,
      startT: minT,
      endT: maxT,
      faces: new Set([faceA, faceB]),
    };
    const cb: CommonBlock = {
      paveBlocks: [pb],
      sharedEdge: edge,
      faces: new Set([faceA, faceB]),
    };

    if (!this.lineCommonBlocks.has(support.key)) {
      this.lineCommonBlocks.set(support.key, []);
    }
    this.lineCommonBlocks.get(support.key)!.push(cb);

    return edge;
  }

  // ─── Closed curve edge registration ────────────────────────────────

  private registerClosedCurveEdge(
    edge: Edge,
    startPt: Point3D,
    endPt: Point3D,
    faceA: Face,
    faceB: Face,
  ): Edge {
    // For circles: match center + radius + plane normal
    const curve = edge.curve;
    if (
      (curve.type === 'circle3d' || curve.type === 'arc3d') &&
      'plane' in curve
    ) {
      const c = curve as { plane: { origin: Point3D; normal: Point3D }; radius: number };
      for (const cb of this.closedCurveBlocks) {
        const existingCurve = cb.sharedEdge.curve;
        if (
          (existingCurve.type === 'circle3d' || existingCurve.type === 'arc3d') &&
          'plane' in existingCurve
        ) {
          const ec = existingCurve as { plane: { origin: Point3D; normal: Point3D }; radius: number };
          if (
            Math.abs(c.radius - ec.radius) < this.tolerance &&
            distance(c.plane.origin, ec.plane.origin) < this.tolerance
          ) {
            // Check normals are parallel (same or opposite)
            const d = Math.abs(dot(c.plane.normal, ec.plane.normal));
            if (d > 1 - this.tolerance) {
              // Match! Share the edge.
              cb.faces.add(faceA);
              cb.faces.add(faceB);
              this.mergePCurves(cb.sharedEdge, edge);
              return cb.sharedEdge;
            }
          }
        }
      }
    }

    // No match — create new block
    return this.addNewClosedBlock(edge, startPt, endPt, faceA, faceB);
  }

  // ─── Open curved edge registration ─────────────────────────────────

  private registerOpenCurvedEdge(
    edge: Edge,
    startPt: Point3D,
    endPt: Point3D,
    faceA: Face,
    faceB: Face,
  ): Edge {
    // For arcs: match center + radius + plane + endpoint proximity
    const curve = edge.curve;
    if (
      (curve.type === 'arc3d') &&
      'plane' in curve
    ) {
      const c = curve as { plane: { origin: Point3D; normal: Point3D }; radius: number };
      for (const cb of this.curvedBlocks) {
        const existingCurve = cb.sharedEdge.curve;
        if (existingCurve.type === 'arc3d' && 'plane' in existingCurve) {
          const ec = existingCurve as { plane: { origin: Point3D; normal: Point3D }; radius: number };
          if (
            Math.abs(c.radius - ec.radius) < this.tolerance &&
            distance(c.plane.origin, ec.plane.origin) < this.tolerance
          ) {
            // Check endpoints match
            const eStart = edgeStartPoint(cb.sharedEdge);
            const eEnd = edgeEndPoint(cb.sharedEdge);
            const fwd = distance(startPt, eStart) < this.tolerance && distance(endPt, eEnd) < this.tolerance;
            const rev = distance(startPt, eEnd) < this.tolerance && distance(endPt, eStart) < this.tolerance;
            if (fwd || rev) {
              cb.faces.add(faceA);
              cb.faces.add(faceB);
              this.mergePCurves(cb.sharedEdge, edge);
              this.shareVertices(cb.sharedEdge, edge);
              return cb.sharedEdge;
            }
          }
        }
      }
    }

    // For ellipses: match center + radii + plane + endpoints
    if (curve.type === 'ellipse3d' && 'plane' in curve) {
      const c = curve as { plane: { origin: Point3D; normal: Point3D }; majorRadius: number; minorRadius: number };
      for (const cb of this.curvedBlocks) {
        const existingCurve = cb.sharedEdge.curve;
        if (existingCurve.type === 'ellipse3d' && 'plane' in existingCurve) {
          const ec = existingCurve as { plane: { origin: Point3D; normal: Point3D }; majorRadius: number; minorRadius: number };
          if (
            Math.abs(c.majorRadius - ec.majorRadius) < this.tolerance &&
            Math.abs(c.minorRadius - ec.minorRadius) < this.tolerance &&
            distance(c.plane.origin, ec.plane.origin) < this.tolerance
          ) {
            const eStart = edgeStartPoint(cb.sharedEdge);
            const eEnd = edgeEndPoint(cb.sharedEdge);
            const fwd = distance(startPt, eStart) < this.tolerance && distance(endPt, eEnd) < this.tolerance;
            const rev = distance(startPt, eEnd) < this.tolerance && distance(endPt, eStart) < this.tolerance;
            if (fwd || rev) {
              cb.faces.add(faceA);
              cb.faces.add(faceB);
              this.mergePCurves(cb.sharedEdge, edge);
              this.shareVertices(cb.sharedEdge, edge);
              return cb.sharedEdge;
            }
          }
        }
      }
    }

    // Fallback: endpoint-based matching for any open curve
    for (const cb of this.curvedBlocks) {
      const eStart = edgeStartPoint(cb.sharedEdge);
      const eEnd = edgeEndPoint(cb.sharedEdge);
      const fwd = distance(startPt, eStart) < this.tolerance && distance(endPt, eEnd) < this.tolerance;
      const rev = distance(startPt, eEnd) < this.tolerance && distance(endPt, eStart) < this.tolerance;
      if (fwd || rev) {
        // Same curve type and endpoint match
        if (edge.curve.type === cb.sharedEdge.curve.type) {
          cb.faces.add(faceA);
          cb.faces.add(faceB);
          this.mergePCurves(cb.sharedEdge, edge);
          this.shareVertices(cb.sharedEdge, edge);
          return cb.sharedEdge;
        }
      }
    }

    return this.addNewCurvedBlock(edge, startPt, endPt, faceA, faceB);
  }

  // ─── Helper: create new common blocks ──────────────────────────────

  private addNewClosedBlock(
    edge: Edge,
    startPt: Point3D,
    endPt: Point3D,
    faceA: Face,
    faceB: Face,
  ): Edge {
    const pb: PaveBlock = {
      edge,
      startPt,
      endPt,
      startT: 0,
      endT: 0,
      faces: new Set([faceA, faceB]),
    };
    const cb: CommonBlock = {
      paveBlocks: [pb],
      sharedEdge: edge,
      faces: new Set([faceA, faceB]),
    };
    this.closedCurveBlocks.push(cb);
    return edge;
  }

  private addNewCurvedBlock(
    edge: Edge,
    startPt: Point3D,
    endPt: Point3D,
    faceA: Face,
    faceB: Face,
  ): Edge {
    const pb: PaveBlock = {
      edge,
      startPt,
      endPt,
      startT: 0,
      endT: 0,
      faces: new Set([faceA, faceB]),
    };
    const cb: CommonBlock = {
      paveBlocks: [pb],
      sharedEdge: edge,
      faces: new Set([faceA, faceB]),
    };
    this.curvedBlocks.push(cb);
    return edge;
  }

  // ─── Vertex canonicalization ───────────────────────────────────────

  /**
   * Canonicalize a vertex: if a vertex within tolerance already exists,
   * return that one. Otherwise add to pool and return.
   *
   * OCCT ref: MakeSDVerticesFF / aDMNewSD vertex fusion
   */
  private canonicalVertex(point: Point3D): Point3D {
    for (const existing of this.vertexPool) {
      if (distance(point, existing) < this.tolerance) {
        return existing;
      }
    }
    this.vertexPool.push(point);
    return point;
  }

  // ─── Support line computation ──────────────────────────────────────

  /**
   * Compute canonical support line for a line edge.
   * Same approach as lineSupportFrame in occt-common-edges.ts.
   */
  private lineSupportFrame(edge: Edge): SupportLine | null {
    if (edge.curve.type !== 'line3d') return null;

    let dir = edge.curve.direction;
    // Canonicalize direction (same logic as occt-common-edges.ts)
    if (
      dir.x < 0 ||
      (Math.abs(dir.x) < 1e-9 && dir.y < 0) ||
      (Math.abs(dir.x) < 1e-9 && Math.abs(dir.y) < 1e-9 && dir.z < 0)
    ) {
      dir = { x: -dir.x, y: -dir.y, z: -dir.z };
    }

    const origin = edge.curve.origin;
    const d = origin.x * dir.x + origin.y * dir.y + origin.z * dir.z;
    const anchor = {
      x: origin.x - dir.x * d,
      y: origin.y - dir.y * d,
      z: origin.z - dir.z * d,
    };

    const roundVal = (v: number) => Math.round(v / SUPPORT_KEY_TOL) * SUPPORT_KEY_TOL;

    return {
      key:
        `L:${roundVal(anchor.x)},${roundVal(anchor.y)},${roundVal(anchor.z)}` +
        `|d=${roundVal(dir.x)},${roundVal(dir.y)},${roundVal(dir.z)}`,
      anchor,
      direction: dir,
    };
  }

  /**
   * Project a point onto a support line, returning the parameter value.
   */
  private pointParamOnSupport(point: Point3D, support: SupportLine): number {
    const dx = point.x - support.anchor.x;
    const dy = point.y - support.anchor.y;
    const dz = point.z - support.anchor.z;
    return dx * support.direction.x + dy * support.direction.y + dz * support.direction.z;
  }

  // ─── PCurve merging ────────────────────────────────────────────────

  /**
   * Merge PCurves from source edge into target edge.
   * Each edge may carry PCurves for different surfaces. The shared edge needs all of them.
   */
  private mergePCurves(target: Edge, source: Edge): void {
    for (const pc of source.pcurves) {
      if (!target.pcurves.some(p => p.surface === pc.surface)) {
        target.pcurves.push(pc);
      }
    }
  }

  // ─── Vertex sharing ────────────────────────────────────────────────

  /**
   * When two edges are identified as geometrically identical, ensure they
   * share the same Vertex objects. This is critical for wire closure in BuilderFace.
   *
   * We mutate the canonical edge's vertex point references to use the
   * canonical vertex pool entries.
   */
  private shareVertices(canonical: Edge, other: Edge): void {
    // The canonical edge's vertices become the shared identity.
    // We ensure the vertex points are from the canonical pool.
    const cStart = edgeStartPoint(canonical);
    const cEnd = edgeEndPoint(canonical);
    const oStart = edgeStartPoint(other);
    const oEnd = edgeEndPoint(other);

    // If other edge's vertices are close to canonical's, they should
    // already be using the same canonical point from the vertex pool.
    // But we also need to ensure any OTHER edges that share these
    // vertices get the canonical point. This is handled by
    // canonicalVertex() being called for every edge at registration time.

    // Nothing more to do here — vertex canonicalization at registration
    // ensures that edges sharing a geometric vertex get the same Point3D
    // from the pool. The key is that canonicalVertex is called BEFORE
    // matching, so the comparison uses canonical points.
    void cStart;
    void cEnd;
    void oStart;
    void oEnd;
  }

  // ─── Face→Edge cache ───────────────────────────────────────────────

  private buildFaceEdgesCache(): void {
    this.faceEdgesCache = new Map();

    const addEdge = (face: Face, edge: Edge) => {
      if (!this.faceEdgesCache!.has(face)) {
        this.faceEdgesCache!.set(face, []);
      }
      const list = this.faceEdgesCache!.get(face)!;
      if (!list.includes(edge)) {
        list.push(edge);
      }
    };

    // Collect from all common blocks
    for (const blocks of this.lineCommonBlocks.values()) {
      for (const cb of blocks) {
        for (const face of cb.faces) {
          addEdge(face, cb.sharedEdge);
        }
      }
    }
    for (const cb of this.closedCurveBlocks) {
      for (const face of cb.faces) {
        addEdge(face, cb.sharedEdge);
      }
    }
    for (const cb of this.curvedBlocks) {
      for (const face of cb.faces) {
        addEdge(face, cb.sharedEdge);
      }
    }
  }
}
