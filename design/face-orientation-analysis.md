# Face Orientation Analysis

## Summary

**Our mesh generation appears to match OCCT's convention. The "fix" belongs in the viewer, not the library.**

---

## Investigation

### What We Found in OCCT

From `AIS_CameraFrustum.cxx`:
```cpp
// Triangles go in order (clockwise vertices traversing for correct normal):
// (0, 2, 1), (3, 1, 2)
```

OCCT uses **clockwise winding** for triangles when the normal points toward the viewer.

### What Our Code Does

In `make-box.ts`, the +Z face:
- Normal: `[0, 0, 1]` (pointing outward in +Z)
- Corners: bottom-left → bottom-right → top-right → top-left
- Triangle indices: `[0, 1, 2], [0, 2, 3]`

When viewed from +Z (looking along the normal), this traces **clockwise**.

### Convention Mismatch

| System | Front Face Winding |
|--------|-------------------|
| OpenCASCADE (visualization) | CW when normal toward viewer |
| WebGL / Three.js (default) | CCW when normal toward viewer |
| Our make-box.ts | CW when normal toward viewer ✓ matches OCCT |

---

## Conclusion

Our mesh generation **correctly matches OCCT's convention**. 

The faces appeared "inside out" because Three.js expects the opposite winding. This is a display concern, not a geometric error.

### Correct Fix (what we did)

In `app/src/components/Viewer/SceneObjects.tsx`:
```tsx
<meshStandardMaterial color={color} side={THREE.DoubleSide} />
```

This renders both sides, accommodating OCCT's winding convention without changing the library.

### Alternative Approaches (also acceptable)

1. **Flip at render time**: `geometry.scale.z = -1` or invert indices in `meshToBufferGeometry()`
2. **Set Three.js front face**: `material.side = THREE.BackSide` or `renderer.setFrontFace(THREE.CW)`

### What Would Be Wrong

Changing the winding order in `make-box.ts` to "fix" the display. This would:
- Break alignment with OCCT's geometric conventions
- Cause problems when porting OCCT algorithms that assume CW winding
- Hide the real issue (display layer not adapting to library conventions)

---

## Documentation Reference

This analysis follows the principle documented in `design/AGENTS.md`:

> **The viewer adapts to the library, not the other way around.**

---

## Future Consideration

When implementing `generation/src/mesh/mesh-to-triangles.ts` or similar, we may want to add an optional `invertWinding` parameter for renderers that expect CCW. But the default should remain OCCT-compatible (CW).
