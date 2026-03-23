# OCCT Gap Analysis for labrep

**Generated:** 2026-03-23  
**Scope:** Phases 1-6 (Math foundation, 2D curves, STL/STEP I/O, Sketches, 3D geometry + topology)

This document compares labrep's current implementation against OpenCASCADE Technology (OCCT) to identify missing functionality that may be needed for future phases.

---

## Phase 1-2: Core Math Foundation

### Point3D vs gp_Pnt

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from coordinates | ✅ `point3d(x, y, z)` | `gp_Pnt(x, y, z)` | — |
| Get coordinates | ✅ Direct property access | `X()`, `Y()`, `Z()` | — |
| Distance | ✅ `distance(a, b)` | `Distance(other)` | — |
| Midpoint | ✅ `midpoint(a, b)` | — (computed manually) | — |
| Add vector | ✅ `addVector(p, v)` | `Translate(vec)` | — |
| Subtract points | ✅ `subtractPoints(a, b)` | — (use gp_Vec constructor) | — |
| Equality test | ✅ `pointsEqual(a, b)` | `IsEqual(other, tol)` | — |
| Square distance | ❌ | `SquareDistance(other)` | Low |
| BaryCenter | ❌ | `BaryCenter(alpha, P, beta)` | Low |
| Mirror (point) | ❌ | `Mirror(P)`, `Mirrored(P)` | Medium |
| Mirror (axis) | ❌ | `Mirror(Ax1)`, `Mirrored(Ax1)` | Medium |
| Mirror (plane) | ❌ | `Mirror(Ax2)`, `Mirrored(Ax2)` | Medium |
| Rotate | ❌ | `Rotate(Ax1, angle)` | Medium |
| Scale | ❌ | `Scale(P, factor)` | Medium |
| Transform | ❌ | `Transform(Trsf)` | **High** |

**Gap Summary:** Missing direct transform/rotate/scale/mirror operations on Point3D. Currently requires manual composition with Transform3D.

**Recommendation:** Add `transformPoint3D(t: Transform3D, p: Point3D)` as convenience (already exists), but consider adding point-centric operations like `rotatePoint`, `scalePoint`, `mirrorPoint` for API parity.

---

### Vector3D vs gp_Vec

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from components | ✅ `vec3d(x, y, z)` | `gp_Vec(x, y, z)` | — |
| Create from two points | ❌ | `gp_Vec(P1, P2)` | Low |
| Length/magnitude | ✅ `length(v)` | `Magnitude()` | — |
| Normalize | ✅ `normalize(v)` | `Normalize()`, `Normalized()` | — |
| Add | ✅ `add(a, b)` | `Add()`, `Added()` | — |
| Subtract | ✅ `subtract(a, b)` | `Subtract()`, `Subtracted()` | — |
| Scale | ✅ `scale(v, s)` | `Multiply()`, `Multiplied()` | — |
| Dot product | ✅ `dot(a, b)` | `Dot(other)` | — |
| Cross product | ✅ `cross(a, b)` | `Cross()`, `Crossed()` | — |
| Negate | ✅ `negate(v)` | `Reverse()`, `Reversed()` | — |
| Square magnitude | ❌ | `SquareMagnitude()` | Low |
| Angle between | ❌ | `Angle(other)` | Medium |
| Angle with reference | ❌ | `AngleWithRef(other, ref)` | Medium |
| Is parallel | ❌ | `IsParallel(other, tol)` | Medium |
| Is normal | ❌ | `IsNormal(other, tol)` | Low |
| Is opposite | ❌ | `IsOpposite(other, tol)` | Low |
| Divide | ❌ | `Divide()`, `Divided()` | Low |
| Mirror | ❌ | `Mirror()`, `Mirrored()` | Low |
| Rotate | ❌ | `Rotate()`, `Rotated()` | Medium |
| Transform | ❌ | `Transform(Trsf)` | Medium |

**Gap Summary:** Missing angle computation and parallel/normal checks. These are useful for geometric analysis.

**Recommendation:** Add `angle(a, b)`, `isParallel(a, b, tol)`, `isNormal(a, b, tol)` for geometric queries.

---

### Transform3D vs gp_Trsf

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Identity | ✅ `identity()` | Default constructor | — |
| Translation | ✅ `translation(dx, dy, dz)` | `SetTranslation(vec)` | — |
| Rotation X/Y/Z | ✅ `rotationX/Y/Z(angle)` | `SetRotation(Ax1, angle)` | — |
| Rotation around axis | ❌ | `SetRotation(Ax1, angle)` | **High** |
| Rotation via quaternion | ❌ | `SetRotation(Quaternion)` | Medium |
| Scaling | ✅ `scaling(sx, sy, sz)` | `SetScale(P, factor)` | — |
| Uniform scale at point | ❌ | `SetScale(P, factor)` | Medium |
| Mirror (point) | ❌ | `SetMirror(P)` | Medium |
| Mirror (axis) | ❌ | `SetMirror(Ax1)` | Medium |
| Mirror (plane) | ❌ | `SetMirror(Ax2)` | Medium |
| Compose | ✅ `compose(a, b)` | `Multiply()`, `PreMultiply()` | — |
| Inverse | ✅ `inverse(t)` | `Invert()`, `Inverted()` | — |
| Transform point | ✅ `transformPoint(t, p)` | Applied via Transform method | — |
| Transform vector | ✅ `transformVector(t, v)` | Applied via VectorialPart | — |
| Get scale factor | ❌ | `ScaleFactor()` | Low |
| Get translation part | ❌ | `TranslationPart()` | Low |
| Get rotation (axis/angle) | ❌ | `GetRotation(axis, angle)` | Medium |
| Is negative (mirror) | ❌ | `IsNegative()` | Low |
| Set from coordinate systems | ❌ | `SetDisplacement()`, `SetTransformation()` | Medium |

**Gap Summary:** Missing rotation around arbitrary axis (critical for CAD), mirror transforms, and decomposition methods.

**Recommendation:** 
1. **High priority:** Add `rotationAxis(origin, direction, angle)` for arbitrary axis rotation
2. Medium: Add mirror transforms `mirrorPoint`, `mirrorAxis`, `mirrorPlane`
3. Low: Add decomposition methods if needed for STEP export

---

### Plane vs gp_Pln

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from origin/normal/xAxis | ✅ `plane(origin, normal, xAxis)` | `gp_Pln(Ax3)` | — |
| Standard planes | ✅ `XY_PLANE`, `XZ_PLANE`, `YZ_PLANE` | `gp::XOY()`, etc. | — |
| Distance to point | ✅ `distanceToPoint(pl, pt)` | `Distance(P)` | — |
| Project point | ✅ `projectPoint(pl, pt)` | — (use formula) | — |
| Contains point | ✅ `containsPoint(pl, pt)` | `Contains(P, tol)` | — |
| Coefficients (A, B, C, D) | ❌ | `Coefficients()` | Low |
| Mirror | ❌ | `Mirror()`, `Mirrored()` | Low |
| Rotate | ❌ | `Rotate()` | Low |
| Translate | ❌ | `Translate()` | Low |
| Transform | ❌ | `Transform(Trsf)` | Medium |

**Gap Summary:** Plane implementation is adequate for current needs.

---

### Axis vs gp_Ax1

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from origin/direction | ✅ `axis(origin, direction)` | `gp_Ax1(P, Dir)` | — |
| Standard axes | ✅ `X_AXIS_3D`, `Y_AXIS_3D`, `Z_AXIS_3D` | `gp::OX()`, etc. | — |
| Contains point | ❌ | — | Low |
| Distance to point | ❌ | — | Medium |
| Angle with axis | ❌ | `Angle(other)` | Medium |
| Is coaxial | ❌ | `IsCoaxial(other, tol)` | Low |
| Is parallel | ❌ | `IsParallel(other, tol)` | Medium |
| Reverse | ❌ | `Reverse()`, `Reversed()` | Low |
| Transform | ❌ | `Transform(Trsf)` | Medium |

**Gap Summary:** Missing geometric query functions. Low priority for current phases.

---

### BoundingBox3D vs Bnd_Box

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from min/max | ✅ `boundingBox(min, max)` | `Bnd_Box(min, max)` | — |
| Create empty | ✅ `emptyBoundingBox()` | Default constructor | — |
| Add point | ✅ `addPoint(box, pt)` | `Add(P)`, `Update(x,y,z)` | — |
| Contains point | ✅ `contains(box, pt)` | — (use Get + compare) | — |
| Center | ✅ `center(box)` | — (computed) | — |
| Size | ✅ `size(box)` | — (computed from Get) | — |
| Intersects | ✅ `intersects(a, b)` | `IsOut(box)` (negated) | — |
| Is empty | ✅ `isEmpty(box)` | `IsVoid()` | — |
| Add box (union) | ❌ | `Add(box)` | Medium |
| Enlarge/gap | ❌ | `Enlarge(tol)`, `SetGap()` | Low |
| Transform | ❌ | `Transformed(Trsf)` | Medium |
| Is open (infinite) | ❌ | `IsOpen()`, `OpenXmin()`, etc. | Low |
| Set whole (infinite) | ❌ | `SetWhole()` | Low |
| Corner min/max | ❌ | `CornerMin()`, `CornerMax()` | Low |

**Gap Summary:** Missing union operation and transform. Consider adding for Phase 7+ operations.

**Recommendation:** Add `unionBoundingBox(a, b)` and `transformBoundingBox(t, box)`.

---

## Phase 5: 2D Curves

### Line2D vs Geom2d_Line

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from two points | ✅ `makeLine2D(start, end)` | `GC_MakeLine(P1, P2)` | — |
| Create from point/direction | ✅ `makeLine2DFromPointDir(origin, dir)` | `Geom2d_Line(P, Dir)` | — |
| Evaluate at parameter | ✅ `evaluateLine2D(line, t)` | `Value(u)` | — |
| Tangent at parameter | ✅ `tangentLine2D(line, t)` | `DN(u, 1)` | — |
| Length | ✅ `lengthLine2D(line)` | — (computed) | — |
| Reverse | ✅ `reverseLine2D(line)` | `Reverse()`, `Reversed()` | — |
| Parameter at point | ❌ | — (requires projection) | Medium |
| Distance to point | ❌ | `Distance(P)` | Medium |
| Transform | ❌ | `Transform(Trsf)` | Medium |

**Gap Summary:** Adequate for sketching. May need projection/distance for constraints.

---

### Circle2D vs Geom2d_Circle

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from center/radius | ✅ `makeCircle2D(center, radius)` | `Geom2d_Circle(Ax2, radius)` | — |
| Create through 3 points | ✅ `makeCircle2DThrough3Points(p1, p2, p3)` | `GCE2d_MakeCircle` | — |
| Evaluate | ✅ `evaluateCircle2D(circle, t)` | `Value(u)` | — |
| Tangent | ✅ `tangentCircle2D(circle, t)` | `DN(u, 1)` | — |
| Length (circumference) | ✅ `lengthCircle2D(circle)` | — (2πr) | — |
| Parameter at point | ❌ | — (atan2) | Low |
| Transform | ❌ | `Transform(Trsf)` | Medium |

---

### Arc2D vs Geom2d_TrimmedCurve

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from center/radius/angles | ✅ `makeArc2D(center, r, start, end)` | `GCE2d_MakeArcOfCircle` | — |
| Create through 3 points | ✅ `makeArc2DThrough3Points(p1, p2, p3)` | `GCE2d_MakeArcOfCircle` | — |
| Create from bulge | ✅ `makeArc2DFromBulge(start, end, bulge)` | — | — |
| Evaluate | ✅ `evaluateArc2D(arc, t)` | `Value(u)` | — |
| Tangent | ✅ `tangentArc2D(arc, t)` | `DN(u, 1)` | — |
| Length | ✅ `lengthArc2D(arc)` | `Length()` | — |
| Reverse | ✅ `reverseArc2D(arc)` | `Reverse()` | — |
| Transform | ❌ | `Transform(Trsf)` | Medium |

---

### Wire2D vs TopoDS_Wire (2D)

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from curves | ✅ `makeWire2D(curves)` | `BRepBuilderAPI_MakeWire` | — |
| Is closed | ✅ `wire.isClosed` | `BRep_Tool::IsClosed()` | — |
| Length | ✅ `lengthWire2D(wire)` | Sum edges | — |
| Start/end points | ✅ `wire.startPoint`, `wire.endPoint` | Via edge query | — |
| Reverse | ❌ | `TopoDS::Reverse()` | Medium |
| Explore edges | ❌ | `TopExp_Explorer` | Low |

---

### 2D Intersections

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Line-Line | ✅ `intersectLine2DLine2D` | `Geom2dAPI_InterCurveCurve` | — |
| Line-Circle | ✅ `intersectLine2DCircle2D` | `Geom2dAPI_InterCurveCurve` | — |
| Circle-Circle | ✅ `intersectCircle2DCircle2D` | `Geom2dAPI_InterCurveCurve` | — |
| Arc-Line | ❌ | `Geom2dAPI_InterCurveCurve` | Medium |
| Arc-Arc | ❌ | `Geom2dAPI_InterCurveCurve` | Medium |
| Arc-Circle | ❌ | `Geom2dAPI_InterCurveCurve` | Medium |

**Gap Summary:** Arc intersection functions needed for complex sketch geometry.

**Recommendation:** Add `intersectLine2DArc2D`, `intersectArc2DArc2D`, `intersectCircle2DArc2D`.

---

## Phase 6: 3D Geometry & Topology

### Line3D vs Geom_Line

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from two points | ✅ `makeLine3D(start, end)` | `GC_MakeLine` | — |
| Create from point/dir/length | ✅ `makeLine3DFromPointDir` | `Geom_Line(P, Dir)` | — |
| Evaluate | ✅ `evaluateLine3D` | `Value(u)` | — |
| Tangent | ✅ `tangentLine3D` | `DN(u, 1)` | — |
| Length | ✅ `lengthLine3D` | — | — |
| Reverse | ✅ `reverseLine3D` | `Reverse()` | — |
| Transform | ❌ | `Transform(Trsf)` | Medium |

---

### Circle3D vs Geom_Circle

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from plane/radius | ✅ `makeCircle3D(plane, radius)` | `Geom_Circle(Ax2, radius)` | — |
| Evaluate | ✅ `evaluateCircle3D` | `Value(u)` | — |
| Tangent | ✅ `tangentCircle3D` | `DN(u, 1)` | — |
| Length | ✅ `lengthCircle3D` | — | — |
| Create through 3 points | ❌ | `GC_MakeCircle` | Medium |
| Transform | ❌ | `Transform(Trsf)` | Medium |

---

### Arc3D vs Geom_TrimmedCurve

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from plane/radius/angles | ✅ `makeArc3D` | `GC_MakeArcOfCircle` | — |
| Create through 3 points | ✅ `makeArc3DThrough3Points` | `GC_MakeArcOfCircle` | — |
| Evaluate | ✅ `evaluateArc3D` | `Value(u)` | — |
| Tangent | ✅ `tangentArc3D` | `DN(u, 1)` | — |
| Length | ✅ `lengthArc3D` | `Length()` | — |
| Reverse | ✅ `reverseArc3D` | `Reverse()` | — |
| Transform | ❌ | `Transform(Trsf)` | Medium |

---

### PlaneSurface vs Geom_Plane

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from plane | ✅ `makePlaneSurface(plane)` | `Geom_Plane(Ax3)` | — |
| Evaluate (u, v) | ✅ `evaluatePlaneSurface` | `Value(u, v)` | — |
| Normal | ✅ `normalPlaneSurface` | `DN(u, v, 0, 1)` | — |
| Coefficients | ❌ | `Coefficients()` | Low |
| Transform | ❌ | `Transform(Trsf)` | Medium |

---

### CylindricalSurface vs Geom_CylindricalSurface

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from axis/radius | ✅ `makeCylindricalSurface` | `Geom_CylindricalSurface` | — |
| Evaluate (θ, v) | ✅ `evaluateCylindricalSurface` | `Value(u, v)` | — |
| Normal | ✅ `normalCylindricalSurface` | `DN(u, v, 0, 1)` | — |
| Transform | ❌ | `Transform(Trsf)` | Medium |

---

### Missing Surfaces (OCCT provides)

| Surface Type | labrep | OCCT | Critical for Future? |
|--------------|--------|------|---------------------|
| Conical | ❌ | `Geom_ConicalSurface` | Medium (Phase 8+) |
| Spherical | ❌ | `Geom_SphericalSurface` | Medium (Phase 8+) |
| Toroidal | ❌ | `Geom_ToroidalSurface` | Low |
| BSpline | ❌ | `Geom_BSplineSurface` | **High** (freeform) |
| Bezier | ❌ | `Geom_BezierSurface` | Medium |
| Surface of Revolution | ❌ | `Geom_SurfaceOfRevolution` | **High** (Phase 8) |
| Surface of Extrusion | ❌ | `Geom_SurfaceOfLinearExtrusion` | **High** (Phase 7) |
| Offset Surface | ❌ | `Geom_OffsetSurface` | Medium |
| Trimmed Surface | ❌ | `Geom_RectangularTrimmedSurface` | Medium |

**Gap Summary:** Missing freeform surfaces and swept surfaces needed for advanced operations.

**Recommendation:** Plan for `ExtrusionSurface` and `RevolutionSurface` in Phase 7-8.

---

### Topology: Vertex vs TopoDS_Vertex

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from point | ✅ `makeVertex(point)` | `BRepBuilderAPI_MakeVertex` | — |
| Get point | ✅ `vertexPoint(v)` | `BRep_Tool::Pnt(V)` | — |
| Tolerance | ❌ | `BRep_Tool::Tolerance(V)` | Low |

---

### Topology: Edge vs TopoDS_Edge

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from curve + vertices | ✅ `makeEdge` | `BRepBuilderAPI_MakeEdge` | — |
| Create from curve (auto vertices) | ✅ `makeEdgeFromCurve` | `BRepBuilderAPI_MakeEdge` | — |
| Start/end point | ✅ `edgeStartPoint`, `edgeEndPoint` | `TopExp::FirstVertex` | — |
| Length | ✅ `edgeLength` | `GCPnts_AbscissaPoint::Length` | — |
| Get curve | ❌ | `BRep_Tool::Curve(E)` | Low |
| Parameter range | ❌ | `BRep_Tool::Range(E)` | Low |
| Evaluate at parameter | ❌ | Via underlying curve | Medium |
| Tolerance | ❌ | `BRep_Tool::Tolerance(E)` | Low |
| Is degenerate | ❌ | `BRep_Tool::Degenerated(E)` | Low |
| Is seam | ❌ | `BRep_Tool::IsClosed(E, F)` | Low |
| 2D curve on face (PCurve) | ❌ | `BRep_Tool::CurveOnSurface` | **High** (STEP) |
| Reverse | ❌ | `TopoDS::Reverse(E)` | Medium |

**Gap Summary:** Missing PCurve support (2D representation on surface) — critical for STEP export of trimmed surfaces.

**Recommendation:** Add PCurve support when implementing trimmed faces in STEP.

---

### Topology: Wire vs TopoDS_Wire

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from oriented edges | ✅ `makeWire` | `BRepBuilderAPI_MakeWire` | — |
| Create from edges (auto orient) | ✅ `makeWireFromEdges` | `BRepBuilderAPI_MakeWire` | — |
| Is closed | ✅ `wire.isClosed` | `BRep_Tool::IsClosed(W)` | — |
| Length | ✅ `wireLength` | Sum of edge lengths | — |
| Start/end point | ✅ `wireStartPoint`, `wireEndPoint` | Via edge query | — |
| Explore edges | ❌ (only via `wire.edges`) | `TopExp_Explorer` | Low |
| Reverse | ❌ | `TopoDS::Reverse(W)` | Medium |
| Number of edges | ❌ | Count via explorer | Low |

---

### Topology: Face vs TopoDS_Face

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from surface + wires | ✅ `makeFace` | `BRepBuilderAPI_MakeFace` | — |
| Create planar (infer plane) | ✅ `makePlanarFace` | `BRepBuilderAPI_MakeFace` | — |
| Outer wire | ✅ `faceOuterWire` | `BRepTools::OuterWire(F)` | — |
| Inner wires | ✅ `faceInnerWires` | Via `TopExp_Explorer` | — |
| Surface | ✅ `faceSurface` | `BRep_Tool::Surface(F)` | — |
| Orientation | ❌ | `F.Orientation()` | Medium |
| Normal at point | ❌ | `BRepGProp_Face::Normal()` | Medium |
| UV bounds | ❌ | `BRepTools::UVBounds(F)` | Medium |
| Area | ❌ | `GProp_GProps` | Medium |
| Is plane | ❌ | Check surface type | Low |
| Triangulation | ❌ | `BRep_Tool::Triangulation(F)` | Low (have mesh) |

**Gap Summary:** Missing normal/UV queries and area calculation.

---

### Topology: Shell vs TopoDS_Shell

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from faces | ✅ `makeShell` | `BRep_Builder::MakeShell` | — |
| Is closed | ✅ `shellIsClosed` (heuristic) | `BRepCheck_Shell` | — |
| Get faces | ✅ `shellFaces` | `TopExp_Explorer` | — |
| Proper closed check | ❌ | `BRepCheck_Shell::Closed()` | **High** |
| Orientation | ❌ | `BRepCheck_Shell::Orientation()` | Medium |
| Number of faces | ❌ | Count via explorer | Low |

**Gap Summary:** The `isClosed` heuristic (faces ≥ 6) is inadequate. Need proper edge-connectivity analysis.

**Recommendation:** Implement proper manifold/watertight check by analyzing edge sharing between faces.

---

### Topology: Solid vs TopoDS_Solid

| Function | labrep ✅ | OCCT | Critical? |
|----------|-----------|------|-----------|
| Create from shell | ✅ `makeSolid` | `BRep_Builder::MakeSolid` | — |
| Outer shell | ✅ `solidOuterShell` | `TopExp_Explorer` | — |
| Inner shells (voids) | ✅ `solidInnerShells` | `TopExp_Explorer` | — |
| Volume | ✅ `solidVolume` (bbox approx) | `GProp_GProps` | — |
| Proper volume calculation | ❌ | `BRepGProp::VolumeProperties` | **High** |
| Center of mass | ❌ | `GProp_GProps::CentreOfMass()` | Medium |
| Surface area | ❌ | `GProp_GProps::SurfaceProperties` | Medium |
| Moments of inertia | ❌ | `GProp_GProps::MatrixOfInertia()` | Low |

**Gap Summary:** Volume calculation uses bounding box approximation — only works for axis-aligned boxes.

**Recommendation:** Implement proper volume calculation using divergence theorem (surface integral over faces).

---

## Missing OCCT Concepts (Not Yet in labrep)

### Curve Types Not Implemented

| Type | OCCT Class | Priority | Use Case |
|------|------------|----------|----------|
| Ellipse | `Geom_Ellipse` / `Geom2d_Ellipse` | Medium | Sketch geometry |
| Parabola | `Geom_Parabola` | Low | Conic sections |
| Hyperbola | `Geom_Hyperbola` | Low | Conic sections |
| BSpline Curve | `Geom_BSplineCurve` | **High** | Freeform curves |
| Bezier Curve | `Geom_BezierCurve` | Medium | Simple freeform |
| Offset Curve | `Geom_OffsetCurve` | Medium | CAM operations |

### Topology Concepts Not Implemented

| Concept | OCCT Support | Priority | Use Case |
|---------|--------------|----------|----------|
| Compound | `TopoDS_Compound` | Medium | Multi-body models |
| CompSolid | `TopoDS_CompSolid` | Low | Connected solids |
| Shape orientation | `TopAbs_Orientation` | Medium | Consistent normals |
| Shape sharing | Topology sharing | Medium | Memory efficiency |

### Algorithms Not Implemented

| Algorithm | OCCT Classes | Priority | Use Case |
|-----------|--------------|----------|----------|
| Boolean Operations | `BRepAlgoAPI_*` | **Critical** (Phase 7) | Union/cut/intersect |
| Fillet/Chamfer | `BRepFilletAPI_*` | **High** (Phase 8) | Edge blending |
| Extrusion | `BRepPrimAPI_MakePrism` | **High** (Phase 7) | Sketch to solid |
| Revolution | `BRepPrimAPI_MakeRevol` | **High** (Phase 8) | Lathe operations |
| Loft | `BRepOffsetAPI_ThruSections` | Medium | Multi-profile sweep |
| Sweep | `BRepOffsetAPI_MakePipe` | Medium | Path extrusion |
| Shell/Offset | `BRepOffsetAPI_MakeOffsetShape` | Medium | Wall thickness |
| Section | `BRepAlgoAPI_Section` | Medium | Cross-sections |
| Heal/Fix | `ShapeFix_*` | Medium | Import repair |

---

## Priority Summary

### Critical (Phase 7-8 blockers)

1. **Rotation around arbitrary axis** — `rotationAxis(origin, direction, angle)` in Transform3D
2. **Proper shell closed detection** — edge-connectivity analysis, not face count
3. **Proper solid volume calculation** — divergence theorem, not bbox
4. **Arc intersections** — for complex sketch geometry
5. **PCurve support** — for trimmed surface STEP export

### High Priority (Near-term)

1. **Extrusion surface** — for sketch extrusion
2. **Revolution surface** — for lathe operations  
3. **BSpline curves** — for imported STEP geometry
4. **Point/vector transform convenience** — direct rotate/mirror operations

### Medium Priority (Quality of life)

1. **Angle between vectors** — `angle(a, b)`
2. **Parallel/normal checks** — `isParallel`, `isNormal`
3. **BoundingBox union** — `unionBoundingBox(a, b)`
4. **Face normal at point** — for visualization/analysis
5. **Transform for all geometry types** — consistent transform API

### Low Priority (Can defer)

1. Quaternion rotation support
2. Coordinate system transformations
3. Ellipse/parabola/hyperbola curves
4. Tolerance on topology elements
5. Shape exploration utilities

---

## Conclusion

labrep's current implementation covers the essential functionality for Phases 1-6. The main gaps are:

1. **Transform operations** — Missing arbitrary axis rotation and mirror transforms
2. **Geometry queries** — Missing angle calculations, parallel/normal checks
3. **Topology validation** — Shell/solid closedness checks are heuristics
4. **Volume/area calculations** — Using approximations instead of proper integrals
5. **Arc intersections** — Needed for complex sketch geometry

For Phase 7 (operations), the critical missing pieces are:
- Arbitrary axis rotation (for positioning before operations)
- Proper volume calculation (for operation validation)
- Extrusion/revolution surfaces (for operation results)

The functional programming style and immutable data structures are well-suited for the current scope. As complexity grows, consider whether some mutable internal state (like OCCT's builders) would simplify implementation of algorithms.
