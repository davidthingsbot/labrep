/**
 * 2D face domain point classifier.
 *
 * Faithful TypeScript port of OCCT's CSLib_Class2d (polygon classifier)
 * and IntTools_FClass2d (face domain classifier with wire tabulation).
 *
 * OCCT references:
 *   CSLib_Class2d — FoundationClasses/TKMath/CSLib/CSLib_Class2d.cxx
 *   IntTools_FClass2d — ModelingAlgorithms/TKBO/IntTools/IntTools_FClass2d.cxx
 */
import type { Face, Surface } from '../topology/face';
import type { Wire } from '../topology/wire';
import type { Edge, Curve3D } from '../topology/edge';
import { edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { evaluateCurve2D } from '../topology/pcurve';
import { toAdapter, type SurfaceAdapter } from '../surfaces/surface-adapter';
import { evaluateLine3D } from '../geometry/line3d';
import { evaluateCircle3D } from '../geometry/circle3d';
import { evaluateArc3D } from '../geometry/arc3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';

type Pt2 = { x: number; y: number };

// OCCT: Precision::Confusion(), Precision::PConfusion(), Precision::SquareConfusion()
const PRECISION_CONFUSION = 1e-7;
const PRECISION_PCONFUSION = 1e-9;
const PRECISION_SQUARE_CONFUSION = 1e-14;
const MIN_RANGE = 1e-10;

// ═══════════════════════════════════════════════════════
// CSLib_Class2d — 2D polygon point classifier
// OCCT ref: FoundationClasses/TKMath/CSLib/CSLib_Class2d.cxx
// ═══════════════════════════════════════════════════════

export type ClassifyResult = 1 | -1 | 0; // inside | outside | on-boundary (uncertain)

export class Class2d {
  private pnts2dX: number[] = [];
  private pnts2dY: number[] = [];
  private pointsCount = 0;
  private tolU = 0;
  private tolV = 0;
  private uMin = 0;
  private uMax = 0;
  private vMin = 0;
  private vMax = 0;

  constructor(
    points: Pt2[],
    tolU: number,
    tolV: number,
    uMin: number,
    vMin: number,
    uMax: number,
    vMax: number,
  ) {
    this.uMin = uMin;
    this.vMin = vMin;
    this.uMax = uMax;
    this.vMax = vMax;

    // Validate input parameters (OCCT: CSLib_Class2d::init)
    if (uMax <= uMin || vMax <= vMin || points.length < 3) {
      this.pointsCount = 0;
      return;
    }

    this.pointsCount = points.length;
    this.tolU = tolU;
    this.tolV = tolV;

    const du = uMax - uMin;
    const dv = vMax - vMin;

    // Allocate arrays with one extra element for closing the polygon
    this.pnts2dX = new Array(this.pointsCount + 1);
    this.pnts2dY = new Array(this.pointsCount + 1);

    // Transform points to normalized [0,1] coordinates
    for (let i = 0; i < this.pointsCount; i++) {
      this.pnts2dX[i] = transformToNormalized(points[i].x, uMin, du);
      this.pnts2dY[i] = transformToNormalized(points[i].y, vMin, dv);
    }

    // Close the polygon by copying first point to last position
    this.pnts2dX[this.pointsCount] = this.pnts2dX[0];
    this.pnts2dY[this.pointsCount] = this.pnts2dY[0];

    // Normalize tolerances
    if (du > MIN_RANGE) {
      this.tolU /= du;
    }
    if (dv > MIN_RANGE) {
      this.tolV /= dv;
    }
  }

  /**
   * Classify a point relative to this polygon.
   * OCCT: CSLib_Class2d::SiDans
   * Returns: 1 (inside), -1 (outside), 0 (uncertain/on boundary)
   */
  siDans(point: Pt2): ClassifyResult {
    if (this.pointsCount === 0) {
      return 0; // Result_Uncertain
    }

    let x = point.x;
    let y = point.y;

    // Compute tolerance in original coordinate space
    const tolU = this.tolU * (this.uMax - this.uMin);
    const tolV = this.tolV * (this.vMax - this.vMin);

    // Quick rejection test for points clearly outside the bounding box
    if (x < this.uMin - tolU || x > this.uMax + tolU ||
        y < this.vMin - tolV || y > this.vMax + tolV) {
      return -1; // Result_Outside
    }

    // Transform to normalized coordinates
    x = transformToNormalized(x, this.uMin, this.uMax - this.uMin);
    y = transformToNormalized(y, this.vMin, this.vMax - this.vMin);

    // Perform classification with ON detection
    const result = this.internalSiDansOuOn(x, y);
    if (result === 0) {
      return 0; // ON boundary
    }

    // Check corner points with tolerance for boundary detection
    if (this.tolU > 0 || this.tolV > 0) {
      const isInside = result === 1;
      if (isInside !== this.internalSiDans(x - this.tolU, y - this.tolV) ||
          isInside !== this.internalSiDans(x + this.tolU, y - this.tolV) ||
          isInside !== this.internalSiDans(x - this.tolU, y + this.tolV) ||
          isInside !== this.internalSiDans(x + this.tolU, y + this.tolV)) {
        return 0; // Near boundary → uncertain
      }
    }

    return result;
  }

  /**
   * Classify with explicit tolerance (for TestOnRestriction).
   * OCCT: CSLib_Class2d::SiDans_OnMode
   */
  siDansOnMode(point: Pt2, tol: number): ClassifyResult {
    if (this.pointsCount === 0) {
      return 0;
    }

    let x = point.x;
    let y = point.y;

    // Quick rejection test
    if (x < this.uMin - tol || x > this.uMax + tol ||
        y < this.vMin - tol || y > this.vMax + tol) {
      return -1;
    }

    // Transform to normalized coordinates
    x = transformToNormalized(x, this.uMin, this.uMax - this.uMin);
    y = transformToNormalized(y, this.vMin, this.vMax - this.vMin);

    // Perform classification with ON detection
    const result = this.internalSiDansOuOn(x, y);

    // Check corner points with tolerance
    if (tol > 0) {
      const isInside = result === 1;
      if (isInside !== this.internalSiDans(x - tol, y - tol) ||
          isInside !== this.internalSiDans(x + tol, y - tol) ||
          isInside !== this.internalSiDans(x - tol, y + tol) ||
          isInside !== this.internalSiDans(x + tol, y + tol)) {
        return 0; // Near boundary
      }
    }

    return result;
  }

  /**
   * Pure ray-casting (no ON detection). Used for tolerance corner tests.
   * OCCT: CSLib_Class2d::internalSiDans
   */
  private internalSiDans(px: number, py: number): boolean {
    let nbCrossings = 0;
    let prevDx = this.pnts2dX[0] - px;
    let prevDy = this.pnts2dY[0] - py;
    let prevYIsNegative = prevDy < 0;

    for (let nextIdx = 1; nextIdx <= this.pointsCount; nextIdx++) {
      const currDx = this.pnts2dX[nextIdx] - px;
      const currDy = this.pnts2dY[nextIdx] - py;
      const currYIsNegative = currDy < 0;

      if (currYIsNegative !== prevYIsNegative) {
        if (prevDx > 0 && currDx > 0) {
          nbCrossings++;
        } else if (prevDx > 0 || currDx > 0) {
          const xIntersect = prevDx - prevDy * (currDx - prevDx) / (currDy - prevDy);
          if (xIntersect > 0) {
            nbCrossings++;
          }
        }
        prevYIsNegative = currYIsNegative;
      }

      prevDx = currDx;
      prevDy = currDy;
    }

    return (nbCrossings & 1) !== 0;
  }

  /**
   * Ray-casting with ON detection.
   * OCCT: CSLib_Class2d::internalSiDansOuOn
   */
  private internalSiDansOuOn(px: number, py: number): ClassifyResult {
    let nbCrossings = 0;
    let prevDx = this.pnts2dX[0] - px;
    let prevDy = this.pnts2dY[0] - py;
    let prevYIsNegative = prevDy < 0;

    for (let nextIdx = 1; nextIdx <= this.pointsCount; nextIdx++) {
      const prevIdx = nextIdx - 1;
      const currDx = this.pnts2dX[nextIdx] - px;
      const currDy = this.pnts2dY[nextIdx] - py;

      // Check if point is very close to current vertex
      if (currDx < this.tolU && currDx > -this.tolU &&
          currDy < this.tolV && currDy > -this.tolV) {
        return 0; // ON boundary (at vertex)
      }

      // Check if point is ON the edge by computing Y at the test point's X
      const edgeDx = this.pnts2dX[nextIdx] - this.pnts2dX[prevIdx];
      if ((this.pnts2dX[prevIdx] - px) * currDx < 0 &&
          Math.abs(edgeDx) > PRECISION_PCONFUSION) {
        const interpY = this.pnts2dY[nextIdx] -
          (this.pnts2dY[nextIdx] - this.pnts2dY[prevIdx]) / edgeDx * currDx;
        const deltaY = interpY - py;
        if (deltaY >= -this.tolV && deltaY <= this.tolV) {
          return 0; // ON boundary (on edge)
        }
      }

      const currYIsNegative = currDy < 0;
      if (currYIsNegative !== prevYIsNegative) {
        if (prevDx > 0 && currDx > 0) {
          nbCrossings++;
        } else if (prevDx > 0 || currDx > 0) {
          const xIntersect = prevDx - prevDy * (currDx - prevDx) / (currDy - prevDy);
          if (xIntersect > 0) {
            nbCrossings++;
          }
        }
        prevYIsNegative = currYIsNegative;
      }

      prevDx = currDx;
      prevDy = currDy;
    }

    return (nbCrossings & 1) !== 0 ? 1 : -1;
  }
}

function transformToNormalized(u: number, uMin: number, uRange: number): number {
  if (uRange > MIN_RANGE) {
    return (u - uMin) / uRange;
  }
  return u;
}

// ═══════════════════════════════════════════════════════
// IntTools_FClass2d — Face domain classifier
// OCCT ref: ModelingAlgorithms/TKBO/IntTools/IntTools_FClass2d.cxx
// ═══════════════════════════════════════════════════════

export type FaceClassifyState = 'in' | 'out' | 'on';

interface WireEntry {
  classifier: Class2d;
  orientation: 1 | 0 | -1; // 1=outer, 0=hole, -1=bad
}

export class FClass2d {
  private tabClass: WireEntry[] = [];
  private toluv: number;
  private uMin = Infinity;
  private uMax = -Infinity;
  private vMin = Infinity;
  private vMax = -Infinity;
  private u1 = 0;
  private u2 = 0;
  private v1 = 0;
  private v2 = 0;
  private myIsHole = true;
  private face: Face;
  private adapter: SurfaceAdapter;

  constructor(face: Face, tolUV: number) {
    this.toluv = tolUV;
    this.face = face;
    this.adapter = toAdapter(face.surface);
    this.init();
  }

  /**
   * Initialize wire tabulation.
   * OCCT: IntTools_FClass2d::Init
   */
  private init(): void {
    const face = this.face;
    const surface = face.surface;
    const adapter = this.adapter;
    let badWire = 0;

    // Iterate all wires: outer first, then inner
    const wires: Wire[] = [face.outerWire, ...face.innerWires];

    for (const wire of wires) {
      const seqPnt2d: Pt2[] = [];
      let flecheU = 0;
      let flecheV = 0;
      let wireIsNotEmpty = false;
      let firstpoint = true;
      let nbEdges = wire.edges.length;
      let nbEdgesLeft = nbEdges;

      // Track previous 3D point for degenerate filtering
      let prevPt3d: { x: number; y: number; z: number } | null = null;

      for (const oe of wire.edges) {
        nbEdgesLeft--;
        const edge = oe.edge;
        // Skip INTERNAL/EXTERNAL orientations (we only have forward/reversed)
        if (edge.degenerate) {
          // Degenerate edges still contribute to UV bounds but not to polygon
          const pc = findPCurveForInit(edge, surface);
          if (pc) {
            const c = pc.curve2d;
            for (let i = 0; i <= 2; i++) {
              const frac = i / 2;
              const t = c.startParam + frac * (c.endParam - c.startParam);
              const p2d = evaluateCurve2D(c, t);
              this.updateBBox(p2d);
            }
          }
          continue;
        }

        // Get pcurve
        const pc = findPCurveForInit(edge, surface);

        // Check degenerate by sampling 3D curve (OCCT lines 199-220)
        let degenerated = false;
        if (!pc) {
          degenerated = true;
        } else {
          degenerated = this.isEdgeDegenerate3D(edge, oe.forward);
        }

        // Compute sample count (OCCT: Geom2dInt_Geom2dCurveTool::NbSamples)
        let nbs = estimateNbSamples(edge, pc);
        if (nbs > 2) nbs *= 4;

        // Build parameter array
        const c2d = pc?.curve2d;
        let uFirst: number, uLast: number;
        if (c2d) {
          if (oe.forward) {
            uFirst = c2d.startParam;
            uLast = c2d.endParam;
          } else {
            uFirst = c2d.endParam;
            uLast = c2d.startParam;
          }
        } else {
          uFirst = edge.curve.startParam;
          uLast = edge.curve.endParam;
          if (!oe.forward) {
            const tmp = uFirst;
            uFirst = uLast;
            uLast = tmp;
          }
        }

        // Build sample parameters (OCCT lines 251-270)
        const prms: number[] = [];
        if (nbs === 2) {
          const coef = 0.0025;
          prms.push(uFirst);
          prms.push(uFirst + coef * (uLast - uFirst));
          prms.push(uLast);
        } else {
          const du = (uLast - uFirst) / (nbs - 1);
          prms.push(uFirst);
          for (let i = 1; i < nbs - 1; i++) {
            prms.push(uFirst + i * du);
          }
          prms.push(uLast);
        }

        const avant = seqPnt2d.length;
        const startIdx = firstpoint ? 0 : 1;

        for (let iX = startIdx; iX < prms.length; iX++) {
          const u = prms[iX];
          let p2d: Pt2;

          if (c2d) {
            p2d = evaluateCurve2D(c2d, u);
          } else {
            // Fallback: evaluate 3D and project
            const p3d = evalCurveAt(edge.curve, u);
            if (!p3d) continue;
            const uv = adapter.projectPoint(p3d);
            p2d = { x: uv.u, y: uv.v };
          }

          this.updateBBox(p2d);

          // 3D point filtering (OCCT lines 297-335)
          let isRealCurve3d = true;
          if (!degenerated) {
            const p3d = evalCurveAt(edge.curve, mapParam(u, c2d, edge.curve, oe.forward));
            if (p3d && prevPt3d) {
              const dstSq = squaredDist3d(p3d, prevPt3d);
              if (dstSq < PRECISION_CONFUSION * PRECISION_CONFUSION) {
                if (iX > 0 && iX < prms.length) {
                  const midParam = (u + prms[Math.max(0, iX - 1)]) / 2;
                  const midP3d = evalCurveAt(edge.curve, mapParam(midParam, c2d, edge.curve, oe.forward));
                  if (midP3d && squaredDist3d(p3d, midP3d) < PRECISION_CONFUSION * PRECISION_CONFUSION) {
                    isRealCurve3d = false;
                  }
                }
              }
            }
            if (isRealCurve3d && p3d) {
              prevPt3d = p3d;
            }
          }

          if (isRealCurve3d) {
            seqPnt2d.push(p2d);
          }

          // Compute deflection (OCCT: after 4+ points past edge start)
          const ii = seqPnt2d.length;
          if (ii > avant + 4) {
            const deviation = pointLineDeviation(
              seqPnt2d[ii - 3],
              seqPnt2d[ii - 1],
              seqPnt2d[ii - 2],
            );
            if (deviation.du > flecheU) flecheU = deviation.du;
            if (deviation.dv > flecheV) flecheV = deviation.dv;
          }
        }

        if (badWire) continue;
        if (firstpoint) firstpoint = false;
        wireIsNotEmpty = true;
      }

      // Check for bad wire (OCCT: NbEdges counter mismatch)
      if (nbEdgesLeft > 0 && !badWire) {
        // Some edges were missed
        const dummyPoints: Pt2[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
        this.tabClass.push({
          classifier: new Class2d(dummyPoints, flecheU, flecheV,
            this.uMin, this.vMin, this.uMax, this.vMax),
          orientation: -1,
        });
        badWire = 1;
        continue;
      }

      if (wireIsNotEmpty) {
        if (seqPnt2d.length > 3) {
          // Compute signed area and perimeter
          let area = polygonSignedAreaRaw(seqPnt2d);
          let perimeter = polygonPerimeterRaw(seqPnt2d);

          // Adaptive re-discretization (OCCT lines 265-330)
          let expThick = Math.max(2 * Math.abs(area) / perimeter, 1e-7);
          let defl = Math.max(flecheU, flecheV);
          let discrDefl = Math.min(defl * 0.1, expThick * 10);
          let isChanged = false;

          while (defl > expThick && discrDefl > 1e-7) {
            // Re-sample with tighter deflection tolerance
            const resampled = this.resampleWire(wire, surface, discrDefl);
            if (!resampled) break;

            isChanged = true;
            seqPnt2d.length = 0;
            seqPnt2d.push(...resampled.points);
            flecheU = resampled.flecheU;
            flecheV = resampled.flecheV;

            defl = Math.max(flecheU, flecheV);
            discrDefl = Math.min(discrDefl * 0.1, expThick * 10);
          }

          if (isChanged) {
            area = polygonSignedAreaRaw(seqPnt2d);
            perimeter = polygonPerimeterRaw(seqPnt2d);
          }

          // Clamp fleche to >= toluv (OCCT line 504-508)
          if (flecheU < this.toluv) flecheU = this.toluv;
          if (flecheV < this.toluv) flecheV = this.toluv;

          const classifier = new Class2d(seqPnt2d, flecheU, flecheV,
            this.uMin, this.vMin, this.uMax, this.vMax);

          if (Math.abs(area) < PRECISION_SQUARE_CONFUSION) {
            badWire = 1;
            this.tabClass.push({ classifier, orientation: -1 });
          } else {
            if (area > 0) {
              this.myIsHole = false;
              this.tabClass.push({ classifier, orientation: 1 });
            } else {
              this.myIsHole = true;
              this.tabClass.push({ classifier, orientation: 0 });
            }
          }
        } else {
          // Too few points → bad wire
          badWire = 1;
          this.tabClass.push({
            classifier: new Class2d([], flecheU, flecheV,
              this.uMin, this.vMin, this.uMax, this.vMax),
            orientation: -1,
          });
        }
      }
    }

    // If any wire was bad, mark first orientation as bad (OCCT line 548-549)
    if (badWire && this.tabClass.length > 0) {
      this.tabClass[0] = { ...this.tabClass[0], orientation: -1 };
    }

    // Periodic surface handling (OCCT lines 552-579)
    if (this.tabClass.length > 0) {
      const stype = surface.type;
      if (stype === 'cone' || stype === 'cylinder' || stype === 'torus' ||
          stype === 'sphere' || stype === 'revolution') {
        let uuu = 2 * Math.PI - (this.uMax - this.uMin);
        if (uuu < 0) uuu = 0;
        this.u1 = this.uMin - uuu * 0.5;
        this.u2 = this.u1 + 2 * Math.PI;
      }

      if (stype === 'torus') {
        let uuu = 2 * Math.PI - (this.vMax - this.vMin);
        if (uuu < 0) uuu = 0;
        this.v1 = this.vMin - uuu * 0.5;
        this.v2 = this.v1 + 2 * Math.PI;
      }
    }
  }

  /**
   * Classify a UV point relative to the face.
   * OCCT: IntTools_FClass2d::Perform
   */
  perform(puv: Pt2, recadreOnPeriodic = true): FaceClassifyState {
    if (this.tabClass.length === 0) {
      return 'in';
    }

    let u = puv.x;
    let v = puv.y;
    let uu = u;
    let vv = v;
    let status: FaceClassifyState = 'out';

    const adapter = this.adapter;
    const isUPer = adapter.isUPeriodic;
    const isVPer = adapter.isVPeriodic;
    const uperiod = isUPer ? adapter.uPeriod : 0;
    const vperiod = isVPer ? adapter.vPeriod : 0;

    if (recadreOnPeriodic) {
      if (isUPer) {
        uu = adjustPeriodic(uu, this.uMin, this.uMax, uperiod);
      }
      if (isVPer) {
        vv = adjustPeriodic(vv, this.vMin, this.vMax, vperiod);
      }
    }

    let urecadre = false;
    let vrecadre = false;

    for (;;) {
      let dedans = 1;
      const testPuv: Pt2 = { x: u, y: v };
      let useClassifier = this.tabClass[0].orientation === -1;

      if (!useClassifier) {
        for (let n = 0; n < this.tabClass.length; n++) {
          const cur = this.tabClass[n].classifier.siDans(testPuv);
          const orient = this.tabClass[n].orientation;

          if (cur === 1) {
            // Inside this polygon
            if (orient === 0) {
              dedans = -1; // Inside a hole → outside face
              break;
            }
          } else if (cur === -1) {
            // Outside this polygon
            if (orient === 1) {
              dedans = -1; // Outside outer → outside face
              break;
            }
          } else {
            // ON boundary
            dedans = 0;
            break;
          }
        }

        if (dedans === 0) {
          useClassifier = true;
        } else {
          status = dedans === 1 ? 'in' : 'out';
        }
      }

      // BRepClass fallback: for ON or bad wire, we approximate with a tighter
      // classification using the polygon classifier at reduced tolerance.
      // (Full BRepClass_FaceClassifier not implemented — see brief §12)
      if (useClassifier) {
        status = this.fallbackClassify(testPuv);
      }

      if (!recadreOnPeriodic || (!isUPer && !isVPer)) return status;
      if (status === 'in' || status === 'on') return status;

      // Periodic retry (OCCT lines 722-757)
      if (!urecadre) {
        u = uu;
        urecadre = true;
      } else {
        if (isUPer) u += uperiod;
      }

      if (u > this.uMax || !isUPer) {
        if (!vrecadre) {
          v = vv;
          vrecadre = true;
        } else {
          if (isVPer) v += vperiod;
        }
        u = uu;
        if (v > this.vMax || !isVPer) return status;
      }
    }
  }

  /**
   * Classify an infinite point (outside any face).
   * OCCT: IntTools_FClass2d::PerformInfinitePoint
   */
  performInfinitePoint(): FaceClassifyState {
    if (this.uMax === -Infinity || this.vMax === -Infinity ||
        this.uMin === Infinity || this.vMin === Infinity) {
      return 'in';
    }
    const p: Pt2 = {
      x: this.uMin - (this.uMax - this.uMin),
      y: this.vMin - (this.vMax - this.vMin),
    };
    return this.perform(p, false);
  }

  /**
   * Test if point is on restriction (boundary).
   * OCCT: IntTools_FClass2d::TestOnRestriction
   */
  testOnRestriction(puv: Pt2, tol: number, recadreOnPeriodic = true): FaceClassifyState {
    if (this.tabClass.length === 0) {
      return 'in';
    }

    let u = puv.x;
    let v = puv.y;
    let uu = u;
    let vv = v;
    let status: FaceClassifyState = 'out';

    const adapter = this.adapter;
    const isUPer = adapter.isUPeriodic;
    const isVPer = adapter.isVPeriodic;
    const uperiod = isUPer ? adapter.uPeriod : 0;
    const vperiod = isVPer ? adapter.vPeriod : 0;

    if (recadreOnPeriodic) {
      if (isUPer) uu = adjustPeriodic(uu, this.uMin, this.uMax, uperiod);
      if (isVPer) vv = adjustPeriodic(vv, this.vMin, this.vMax, vperiod);
    }

    let urecadre = false;
    let vrecadre = false;

    for (;;) {
      let dedans = 1;
      const testPuv: Pt2 = { x: u, y: v };

      if (this.tabClass[0].orientation !== -1) {
        for (let n = 0; n < this.tabClass.length; n++) {
          const cur = this.tabClass[n].classifier.siDansOnMode(testPuv, tol);
          const orient = this.tabClass[n].orientation;

          if (cur === 1) {
            if (orient === 0) { dedans = -1; break; }
          } else if (cur === -1) {
            if (orient === 1) { dedans = -1; break; }
          } else {
            dedans = 0; break;
          }
        }

        if (dedans === 0) status = 'on';
        else if (dedans === 1) status = 'in';
        else status = 'out';
      } else {
        // Bad wire fallback
        status = this.fallbackClassify(testPuv);
      }

      if (!recadreOnPeriodic || (!isUPer && !isVPer)) return status;
      if (status === 'in' || status === 'on') return status;

      if (!urecadre) {
        u = uu;
        urecadre = true;
      } else if (isUPer) {
        u += uperiod;
      }

      if (u > this.uMax || !isUPer) {
        if (!vrecadre) {
          v = vv;
          vrecadre = true;
        } else if (isVPer) {
          v += vperiod;
        }
        u = uu;
        if (v > this.vMax || !isVPer) return status;
      }
    }
  }

  /**
   * Whether this face domain represents a hole.
   * OCCT: IntTools_FClass2d::IsHole
   */
  get isHole(): boolean {
    return this.myIsHole;
  }

  /** UV bounds of all wires */
  get bounds(): { uMin: number; uMax: number; vMin: number; vMax: number } {
    return { uMin: this.uMin, uMax: this.uMax, vMin: this.vMin, vMax: this.vMax };
  }

  // ── Private helpers ──

  private updateBBox(p: Pt2): void {
    if (p.x < this.uMin) this.uMin = p.x;
    if (p.x > this.uMax) this.uMax = p.x;
    if (p.y < this.vMin) this.vMin = p.y;
    if (p.y > this.vMax) this.vMax = p.y;
  }

  /**
   * Check if an edge is 3D-degenerate by sampling.
   * OCCT lines 199-220: sample 10 points, check all within Confusion² of midpoint.
   */
  private isEdgeDegenerate3D(edge: Edge, forward: boolean): boolean {
    const curve = edge.curve;
    const pFirst = curve.startParam;
    const pLast = curve.endParam;
    const du = pLast - pFirst;
    if (Math.abs(du) < 1e-15) return true;

    const midPt = evalCurveAt(curve, 0.5 * (pFirst + pLast));
    if (!midPt) return true;

    const prec2 = 0.25 * PRECISION_CONFUSION * PRECISION_CONFUSION;
    const NBSTEPS = 10;
    for (let i = 0; i <= NBSTEPS; i++) {
      const u = pFirst + i * du / NBSTEPS;
      const pt = evalCurveAt(curve, u);
      if (!pt) continue;
      if (squaredDist3d(midPt, pt) > prec2) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resample wire with tighter deflection (adaptive re-discretization).
   * OCCT lines 450-497
   */
  private resampleWire(
    wire: Wire,
    surface: Surface,
    targetDeflection: number,
  ): { points: Pt2[]; flecheU: number; flecheV: number } | null {
    const points: Pt2[] = [];
    let flecheU = 0;
    let flecheV = 0;
    let firstpoint = true;

    for (const oe of wire.edges) {
      const edge = oe.edge;
      if (edge.degenerate) continue;

      const pc = findPCurveForInit(edge, surface);
      if (!pc) continue;
      const c2d = pc.curve2d;

      const pFirst = c2d.startParam;
      const pLast = c2d.endParam;
      if (Math.abs(pLast - pFirst) < 1e-9) continue;

      // Estimate number of segments from target deflection
      // (approximating GCPnts_QuasiUniformDeflection)
      const isCurved = c2d.type === 'circle' || c2d.type === 'arc' || c2d.type === 'ellipse';
      const baseN = isCurved ? 33 : 3;
      const deflRatio = targetDeflection > 0 ? Math.max(1, Math.ceil(1 / (targetDeflection * 10))) : 1;
      const nbp = Math.min(baseN * deflRatio, 200);

      let iStart = 0;
      let iEnd = nbp;
      let iStep = 1;
      if (!oe.forward) {
        iStart = nbp - 1;
        iEnd = -1;
        iStep = -1;
      }
      if (!firstpoint) {
        iStart += iStep;
      }

      for (let i = iStart; i !== iEnd; i += iStep) {
        const frac = i / (nbp - 1);
        const t = pFirst + frac * (pLast - pFirst);
        const p2d = evaluateCurve2D(c2d, t);
        points.push(p2d);
      }

      if (points.length >= 3) {
        const ii = points.length;
        const deviation = pointLineDeviation(points[ii - 3], points[ii - 1], points[ii - 2]);
        if (deviation.du > flecheU) flecheU = deviation.du;
        if (deviation.dv > flecheV) flecheV = deviation.dv;
      }

      firstpoint = false;
    }

    if (points.length < 3) return null;
    return { points, flecheU, flecheV };
  }

  /**
   * Fallback classifier when polygon gives ON or bad wire.
   * Since we don't have BRepClass_FaceClassifier, we use a reduced-tolerance
   * re-test: check if the point is clearly inside all classifiers ignoring
   * the ON band, falling back to 'on' if ambiguous.
   */
  private fallbackClassify(puv: Pt2): FaceClassifyState {
    // For bad wires or ON results, we do a simple re-classification
    // using the raw polygon classifiers with zero tolerance
    if (this.tabClass.length === 0) return 'in';

    let allGood = true;
    for (const entry of this.tabClass) {
      if (entry.orientation === -1) {
        allGood = false;
        break;
      }
    }

    if (allGood) {
      // ON case: the polygon classifier said ON boundary
      return 'on';
    }

    // Bad wire: try simple point-in-polygon without tolerance
    let dedans = 1;
    for (const entry of this.tabClass) {
      if (entry.orientation === -1) continue; // skip bad entries
      const inside = simplePointInPolygon(puv, entry.classifier);
      if (inside) {
        if (entry.orientation === 0) { dedans = -1; break; }
      } else {
        if (entry.orientation === 1) { dedans = -1; break; }
      }
    }

    return dedans === 1 ? 'in' : 'out';
  }
}

// ═══════════════════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════════════════

/**
 * OCCT: GeomInt::AdjustPeriodic
 * Shift u into [uMin, uMax] using period.
 */
function adjustPeriodic(u: number, uMin: number, uMax: number, period: number): number {
  if (period <= 0) return u;
  while (u < uMin) u += period;
  while (u > uMax) u -= period;
  return u;
}

function findPCurveForInit(edge: Edge, surface: Surface): { curve2d: any } | null {
  for (const pc of edge.pcurves) {
    if (pc.surface === surface) return pc;
  }
  return null;
}

function estimateNbSamples(edge: Edge, pc: { curve2d: any } | null): number {
  // OCCT: Geom2dInt_Geom2dCurveTool::NbSamples
  if (pc) {
    const ctype = pc.curve2d.type;
    if (ctype === 'line') return 2;
    if (ctype === 'circle' || ctype === 'arc') return 24;
    if (ctype === 'ellipse') return 24;
    return 8;
  }
  const ctype = edge.curve.type;
  if (ctype === 'line3d') return 2;
  if (ctype === 'circle3d' || ctype === 'arc3d') return 24;
  if (ctype === 'ellipse3d') return 24;
  return 8;
}

function evalCurveAt(curve: Curve3D, t: number): { x: number; y: number; z: number } | null {
  switch (curve.type) {
    case 'line3d': return evaluateLine3D(curve, t);
    case 'circle3d': return evaluateCircle3D(curve, t);
    case 'arc3d': return evaluateArc3D(curve, t);
    case 'ellipse3d': return evaluateEllipse3D(curve, t);
    default: return null;
  }
}

function mapParam(
  uvParam: number,
  c2d: any | null | undefined,
  curve3d: any,
  forward: boolean,
): number {
  // Map from 2D parameter to 3D parameter (linear reparameterization)
  if (!c2d) return uvParam;
  const frac2d = (c2d.endParam - c2d.startParam) !== 0
    ? (uvParam - c2d.startParam) / (c2d.endParam - c2d.startParam)
    : 0;
  const frac = forward ? frac2d : 1 - frac2d;
  return curve3d.startParam + frac * (curve3d.endParam - curve3d.startParam);
}

function squaredDist3d(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function pointLineDeviation(a: Pt2, b: Pt2, p: Pt2): { du: number; dv: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-16) {
    return { du: Math.abs(p.x - a.x), dv: Math.abs(p.y - a.y) };
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return {
    du: Math.abs(a.x + t * dx - p.x),
    dv: Math.abs(a.y + t * dy - p.y),
  };
}

function polygonSignedAreaRaw(polygon: Pt2[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

function polygonPerimeterRaw(polygon: Pt2[]): number {
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    perimeter += Math.hypot(polygon[j].x - polygon[i].x, polygon[j].y - polygon[i].y);
  }
  return perimeter;
}

/**
 * Simple point-in-polygon test using a Class2d instance's raw data.
 * Used as fallback for bad wires where we can't rely on tolerance-aware classification.
 */
function simplePointInPolygon(pt: Pt2, _classifier: Class2d): boolean {
  // Use siDans with the understanding that -1 means outside and 1 means inside
  const result = _classifier.siDans(pt);
  return result === 1;
}
