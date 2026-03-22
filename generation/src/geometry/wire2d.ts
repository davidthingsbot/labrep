import { Point2D, distance2d, TOLERANCE } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Line2D, lengthLine2D } from './line2d';
import { Circle2D, lengthCircle2D } from './circle2d';
import { Arc2D, lengthArc2D } from './arc2d';

/**
 * Union type for all 2D curve types.
 */
export type Curve2D = Line2D | Circle2D | Arc2D;

/**
 * A connected sequence of 2D curves forming a path.
 * 
 * Curves must connect end-to-end (within tolerance).
 * A wire is closed if the end of the last curve connects
 * to the start of the first curve.
 * 
 * OCCT reference: TopoDS_Wire (2D)
 */
export interface Wire2D {
  /** Ordered sequence of curves */
  readonly curves: readonly Curve2D[];
  
  /** True if wire forms a closed loop */
  readonly isClosed: boolean;
  
  /** Start point of the wire (start of first curve) */
  readonly startPoint: Point2D;
  
  /** End point of the wire (end of last curve) */
  readonly endPoint: Point2D;
}

/**
 * Get the start point of a curve.
 */
function curveStartPoint(curve: Curve2D): Point2D {
  return curve.startPoint;
}

/**
 * Get the end point of a curve.
 */
function curveEndPoint(curve: Curve2D): Point2D {
  return curve.endPoint;
}

/**
 * Get the length of a curve.
 */
function curveLength(curve: Curve2D): number {
  switch (curve.type) {
    case 'line':
      return lengthLine2D(curve);
    case 'circle':
      return lengthCircle2D(curve);
    case 'arc':
      return lengthArc2D(curve);
  }
}

/**
 * Check if two points are within tolerance.
 */
function pointsConnect(p1: Point2D, p2: Point2D): boolean {
  return distance2d(p1, p2) <= TOLERANCE * 1000; // Use a slightly larger tolerance for connectivity
}

/**
 * Create a wire from connected curves.
 * 
 * @param curves - Array of curves that must connect end-to-end
 * @returns Wire2D or failure if curves don't connect or array is empty
 */
export function makeWire2D(curves: Curve2D[]): OperationResult<Wire2D> {
  if (curves.length === 0) {
    return failure('Cannot create wire from empty curve array');
  }
  
  // Verify connectivity: each curve's end must connect to next curve's start
  for (let i = 0; i < curves.length - 1; i++) {
    const endOfCurrent = curveEndPoint(curves[i]);
    const startOfNext = curveStartPoint(curves[i + 1]);
    
    if (!pointsConnect(endOfCurrent, startOfNext)) {
      return failure(`Curves do not connect at index ${i} to ${i + 1}`);
    }
  }
  
  const startPoint = curveStartPoint(curves[0]);
  const endPoint = curveEndPoint(curves[curves.length - 1]);
  
  // Check if wire is closed
  const isClosed = pointsConnect(endPoint, startPoint);
  
  return success({
    curves: [...curves], // Copy array
    isClosed,
    startPoint,
    endPoint,
  });
}

/**
 * Get the total length of the wire.
 * 
 * @param wire - The wire
 * @returns Sum of all curve lengths
 */
export function lengthWire2D(wire: Wire2D): number {
  return wire.curves.reduce((sum, curve) => sum + curveLength(curve), 0);
}
