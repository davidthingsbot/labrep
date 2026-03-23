'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  XY_PLANE,
  createSketch,
  addElement,
  findProfiles,
  profileArea,
  profileContainsPoint,
  makeLine2D,
  makeCircle2D,
  makeArc2D,
  makeWire2D,
  lengthWire2D,
} from '@labrep/generation';
import { PointViz, BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';
import type { Profile2D, Wire2D, Curve2D } from '@labrep/generation';

/** Colors for different profiles. */
const PROFILE_COLORS = ['cyan', 'magenta', '#44aa88', 'orange', '#8888ff', '#ff8844'];

/** Discretize a wire into polyline points for rendering. */
function wireToPoints(wire: Wire2D, segsPerCurve: number = 32): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (const curve of wire.curves) {
    const curvePts = curveToPoints(curve, segsPerCurve);
    if (pts.length > 0) curvePts.shift(); // skip duplicate at joint
    pts.push(...curvePts);
  }
  return pts;
}

function curveToPoints(curve: Curve2D, segs: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  if (curve.type === 'line') {
    for (let i = 0; i <= segs; i++) {
      const t = curve.startParam + (i / segs) * (curve.endParam - curve.startParam);
      const p = { x: curve.origin.x + t * curve.direction.x, y: curve.origin.y + t * curve.direction.y };
      pts.push([p.x, p.y, 0]);
    }
  } else if (curve.type === 'arc') {
    for (let i = 0; i <= segs; i++) {
      const t = curve.startAngle + (i / segs) * (curve.endAngle - curve.startAngle);
      pts.push([curve.center.x + curve.radius * Math.cos(t), curve.center.y + curve.radius * Math.sin(t), 0]);
    }
  } else if (curve.type === 'circle') {
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * 2 * Math.PI;
      pts.push([curve.center.x + curve.radius * Math.cos(t), curve.center.y + curve.radius * Math.sin(t), 0]);
    }
  }
  return pts;
}

/** Example demonstrating sketch profile detection. */
export function SketchProfilesExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // --- Scene 1: Rectangle (4 lines → 1 profile) ---
    let s1 = createSketch(XY_PLANE);
    s1 = addElement(s1, makeLine2D(point2d(-4, -2), point2d(-2, -2)).result!);
    s1 = addElement(s1, makeLine2D(point2d(-2, -2), point2d(-2, -0.5)).result!);
    s1 = addElement(s1, makeLine2D(point2d(-2, -0.5), point2d(-4, -0.5)).result!);
    s1 = addElement(s1, makeLine2D(point2d(-4, -0.5), point2d(-4, -2)).result!);
    const p1 = findProfiles(s1);

    // --- Scene 2: Rectangle with divider → 2 profiles ---
    let s2 = createSketch(XY_PLANE);
    s2 = addElement(s2, makeLine2D(point2d(-0.5, -2), point2d(2.5, -2)).result!);
    s2 = addElement(s2, makeLine2D(point2d(2.5, -2), point2d(2.5, -0.5)).result!);
    s2 = addElement(s2, makeLine2D(point2d(2.5, -0.5), point2d(-0.5, -0.5)).result!);
    s2 = addElement(s2, makeLine2D(point2d(-0.5, -0.5), point2d(-0.5, -2)).result!);
    s2 = addElement(s2, makeLine2D(point2d(1, -2), point2d(1, -0.5)).result!); // divider
    const p2 = findProfiles(s2);

    // --- Scene 3: Rectangle with hole (circle inside) ---
    let s3 = createSketch(XY_PLANE);
    s3 = addElement(s3, makeLine2D(point2d(-4, 1), point2d(-1.5, 1)).result!);
    s3 = addElement(s3, makeLine2D(point2d(-1.5, 1), point2d(-1.5, 3)).result!);
    s3 = addElement(s3, makeLine2D(point2d(-1.5, 3), point2d(-4, 3)).result!);
    s3 = addElement(s3, makeLine2D(point2d(-4, 3), point2d(-4, 1)).result!);
    s3 = addElement(s3, makeCircle2D(point2d(-2.75, 2), 0.5).result!);
    const p3 = findProfiles(s3);

    // --- Scene 4: Semicircle (arc + line) ---
    let s4 = createSketch(XY_PLANE);
    s4 = addElement(s4, makeLine2D(point2d(0.5, 1.5), point2d(2.5, 1.5)).result!);
    s4 = addElement(s4, makeArc2D(point2d(1.5, 1.5), 1, 0, Math.PI).result!);
    const p4 = findProfiles(s4);

    return { p1, p2, p3, p4, s1, s2, s3, s4 };
  }, []);

  if (!data) return null;
  const { p1, p2, p3, p4, s1, s2, s3, s4 } = data;

  // Animated test point for containsPoint demo
  const testX = -2.75 + Math.cos(animationAngle) * 0.8;
  const testY = 2 + Math.sin(animationAngle) * 0.8;
  const testPt = point2d(testX, testY);
  const isInside = p3.length > 0 && profileContainsPoint(p3[0], testPt);

  return (
    <group>
      <BillboardText position={[0, 4, 0]} fontSize={0.35} color="white">
        Sketch Profiles
      </BillboardText>

      {/* --- Scene 1: Rectangle → 1 profile --- */}
      {renderSketchElements(s1, '#555555')}
      {p1.map((p, i) => renderProfile(p, PROFILE_COLORS[i], `1-${i}`))}
      <BillboardText position={[-3, -2.5, 0]} fontSize={0.1} color="gray">
        {`rectangle: ${p1.length} profile, area=${p1[0] ? Math.abs(profileArea(p1[0])).toFixed(1) : '?'}`}
      </BillboardText>

      {/* --- Scene 2: Divided rectangle → 2 profiles --- */}
      {renderSketchElements(s2, '#555555')}
      {p2.map((p, i) => renderProfile(p, PROFILE_COLORS[i], `2-${i}`))}
      <BillboardText position={[1, -2.5, 0]} fontSize={0.1} color="gray">
        {`divided: ${p2.length} profiles`}
      </BillboardText>

      {/* --- Scene 3: Rectangle + hole --- */}
      {renderSketchElements(s3, '#555555')}
      {p3.map((p, i) => renderProfile(p, PROFILE_COLORS[i + 2], `3-${i}`))}
      <BillboardText position={[-2.75, 0.5, 0]} fontSize={0.1} color="gray">
        {`with hole: ${p3.length} profile, ${p3[0]?.holes.length ?? 0} hole`}
      </BillboardText>

      {/* Animated containsPoint probe */}
      <PointViz
        point={{ x: testX, y: testY, z: 0 }}
        color={isInside ? '#00ff88' : 'red'}
        size={0.06}
        label={isInside ? 'inside' : 'outside'}
      />

      {/* --- Scene 4: Arc + line → 1 profile --- */}
      {renderSketchElements(s4, '#555555')}
      {p4.map((p, i) => renderProfile(p, PROFILE_COLORS[i + 4], `4-${i}`))}
      <BillboardText position={[1.5, 0.9, 0]} fontSize={0.1} color="gray">
        {`arc+line: ${p4.length} profile`}
      </BillboardText>

      {/* Legend */}
      <BillboardText position={[0, -3.2, 0]} fontSize={0.1} color="gray">
        gray = sketch elements, colored = detected profiles
      </BillboardText>
    </group>
  );
}

/** Render all sketch elements as gray lines. */
function renderSketchElements(sketch: { elements: readonly { geometry: Curve2D }[] }, color: string) {
  return sketch.elements.map((el, i) => {
    const pts = curveToPoints(el.geometry, 32);
    return <Line key={`elem-${i}`} points={pts} color={color} lineWidth={1} />;
  });
}

/** Render a profile's outer boundary and holes. */
function renderProfile(profile: Profile2D, color: string, key: string) {
  const outerPts = wireToPoints(profile.outer);
  return (
    <group key={key}>
      <Line points={outerPts} color={color} lineWidth={2.5} />
      {profile.holes.map((hole, hi) => {
        const holePts = wireToPoints(hole);
        return <Line key={`hole-${hi}`} points={holePts} color={color} lineWidth={2.5} dashed dashSize={0.05} gapSize={0.05} />;
      })}
    </group>
  );
}
