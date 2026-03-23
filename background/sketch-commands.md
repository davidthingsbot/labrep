# CAD Sketch Command Interface Research

*Research conducted 2026-03-23*

## Overview

This document analyzes how various CAD programs allow users to create and modify sketches, focusing on understanding interaction patterns for potential voice/text command interfaces.

### Input Method Categories

1. **Mouse + Tool Palette** — Traditional GUI workflow with toolbar clicks
2. **Mouse + Text Command** — Hybrid approach (like AutoCAD command line)
3. **Text Command Only** — Pure text/voice interface potential

---

## 1. AutoCAD

**The gold standard for text command interfaces in CAD.**

### Sketch Creation Workflow
- No explicit "sketch mode" — 2D drawing is the default workspace
- Plane selection: Use UCS (User Coordinate System) command to set working plane
- Drawing happens directly on the XY plane by default

### Drawing Elements

#### Lines
```
Command: LINE
From point: 0,0
To point: 10,0
To point: 10,5
To point: (Enter to end or C to close)
```

Coordinate formats:
- **Absolute:** `10,20` (X=10, Y=20)
- **Relative:** `@10,5` (10 right, 5 up from last point)
- **Polar:** `@10<45` (distance 10 at 45 degrees)
- **Absolute with #:** `#10,20` (forces absolute even in dynamic input)

#### Circles
```
Command: CIRCLE (or C)
Center point: 5,5
Radius: 2.5
```

Options: Center+Radius, Center+Diameter, 2-Point, 3-Point, Tan-Tan-Radius

#### Rectangles
```
Command: RECTANG (or REC)
First corner: 0,0
Other corner: 10,5
```

Options: Chamfer, Fillet, Width, Area, Dimensions, Rotation

### Adding Constraints (AutoCAD 2D Constraints)
```
Command: GEOMCONSTRAINT (or GCON)
Enter constraint type: HORIZONTAL
Select object: (click line)
```

Available geometric constraints:
- Coincident, Collinear, Concentric
- Fix, Parallel, Perpendicular
- Horizontal, Vertical
- Tangent, Smooth, Symmetric, Equal

Dimensional constraints:
```
Command: DIMCONSTRAINT
Select object or [Linear/Horizontal/Vertical/Aligned/Angular/Radial/Diameter]: H
```

### Input Methods Table

| Operation | Mouse+Palette | Mouse+Command | Text Only |
|-----------|--------------|---------------|-----------|
| Draw line | Ribbon > Line, click points | Type `L`, Enter, click points | `LINE 0,0 @10,0 @0,5 C` |
| Draw circle | Ribbon > Circle, click center, radius | Type `C`, click center, type radius | `CIRCLE 5,5 2.5` |
| Rectangle | Ribbon > Rectangle, click corners | Type `REC`, click corners | `RECTANG 0,0 10,5` |
| Horizontal constraint | Constrain panel > Horizontal, select | Type `GCON`, `H`, select | N/A (needs selection) |
| Dimension | Annotate > Dimension, select | Type `DIM`, select, place | `DIMLINEAR` + selections |

### Text/Voice Command Examples

```
# Rectangle at origin, 10x5
RECTANG 0,0 10,5

# Two lines made parallel (requires selection)
GEOMCONSTRAINT PARALLEL (select line1) (select line2)

# Set dimension to 20mm (after selecting)
DIMLINEAR (select points) 20

# Circle tangent to two lines (interactive)
CIRCLE TTR (select line1) (select line2) 3
```

---

## 2. SolidWorks

**Heavy emphasis on GUI, limited command-line support.**

### Sketch Creation Workflow
1. Click on a plane (Front, Top, Right) or existing face
2. Click "Sketch" button or right-click > "Sketch"
3. Automatically enters sketch mode oriented to selected plane
4. Exit with "Exit Sketch" button or Ctrl+Q

### Drawing Elements

Uses "Smart Dimension" for dimensioning — single tool handles all dimension types.

**Keyboard shortcuts (customizable via S-key menu):**
- `L` — Line
- `C` — Circle
- `R` — Rectangle
- `D` — Smart Dimension
- `A` — Arc
- `S` — Opens shortcut toolbar (customizable)

### Adding Constraints

**Automatic relations:** SolidWorks infers constraints while sketching:
- Drawing near horizontal → suggests Horizontal relation
- Endpoint near another endpoint → suggests Coincident

**Manual relations:**
1. Select entities
2. Left panel shows available relations
3. Click to apply (Horizontal, Vertical, Parallel, etc.)

**Keyboard modifiers:**
- `Ctrl` while sketching — disable automatic relations
- `Shift` while dimensioning — snap to max/min on arcs

### Input Methods Table

| Operation | Mouse+Palette | Mouse+Command | Text Only |
|-----------|--------------|---------------|-----------|
| Draw line | Click Line tool, click points | Press `L`, click points | Not supported |
| Draw circle | Click Circle tool, click center+edge | Press `C`, click | Not supported |
| Set horizontal | Select line, click Horizontal in panel | Select, none | Not supported |
| Add dimension | Click Smart Dimension, click entity, type | Press `D`, click, type | Not supported |

### Text/Voice Command Potential

SolidWorks has **no native command-line interface**. All operations require GUI interaction or mouse input. Voice commands would need to:
1. Simulate keyboard shortcuts
2. Use coordinate input via "Instant 2D" numeric entry
3. Rely on automatic relation inference

---

## 3. Fusion 360

**Modern cloud-based, some keyboard shortcuts but GUI-focused.**

### Sketch Creation Workflow
1. Create Sketch (Shift+S or Sketch > Create Sketch)
2. Select a plane or face
3. Sketch tools appear in toolbar
4. Finish Sketch to exit

### Drawing Elements

**Default shortcuts:**
- `L` — Line
- `C` — Circle
- `R` — Rectangle (2-point)
- `D` — Dimension
- `X` — Construction mode toggle
- `S` — Shortcut box (searchable command palette)

**The `S` key is powerful:** Opens a searchable command box where you can type any command name.

### Adding Constraints

Constraints panel in sketch mode:
- Coincident, Collinear, Concentric
- Midpoint, Fix/Unfix
- Parallel, Perpendicular
- Horizontal, Vertical
- Tangent, Smooth
- Equal, Symmetric

**No native shortcuts for constraints** — users request this frequently. Must use constraint panel or right-click menu.

### Input Methods Table

| Operation | Mouse+Palette | Mouse+Command | Text Only |
|-----------|--------------|---------------|-----------|
| Draw line | Toolbar > Line, click points | `L`, click points | Not supported |
| Center rectangle | Toolbar > Center Rectangle | `S` > "center rect", click | Not supported |
| Add constraint | Constraints panel > click | Right-click > constraint | Not supported |
| Dimension | Toolbar > Sketch Dimension | `D`, click entity, type | Partial (type value) |

### Text/Voice Command Potential

The `S` key shortcut box suggests Fusion 360 is moving toward searchable commands:
- Press `S`, type "circle", Enter → activates circle tool
- Could be extended to accept parameters

---

## 4. FreeCAD

**Open-source with full Python scripting — best text-command potential among traditional CAD.**

### Sketch Creation Workflow

**GUI:**
1. Select Sketcher workbench
2. Create new sketch (N) or click Sketch > New Sketch
3. Select plane (XY, XZ, YZ, or face)
4. Sketch opens in edit mode
5. Close sketch when done

**Python:**
```python
import FreeCAD as App
from FreeCAD import Vector
import Sketcher
import Part

# Create document and sketch
doc = App.newDocument()
sketch = doc.addObject('Sketcher::SketchObject', 'Sketch')

# Add geometry
sketch.addGeometry(Part.LineSegment(Vector(0,0,0), Vector(10,0,0)), False)
sketch.addGeometry(Part.LineSegment(Vector(10,0,0), Vector(10,5,0)), False)
```

### Drawing Elements (Python API)

```python
# Line
sketch.addGeometry(Part.LineSegment(Vector(x1,y1,0), Vector(x2,y2,0)))

# Circle
sketch.addGeometry(Part.Circle(Vector(cx,cy,0), Vector(0,0,1), radius))

# Arc
sketch.addGeometry(Part.ArcOfCircle(
    Part.Circle(Vector(cx,cy,0), Vector(0,0,1), radius),
    start_angle, end_angle
))

# Rectangle (as 4 lines)
sketch.addGeometry(Part.LineSegment(Vector(0,0,0), Vector(10,0,0)))
sketch.addGeometry(Part.LineSegment(Vector(10,0,0), Vector(10,5,0)))
sketch.addGeometry(Part.LineSegment(Vector(10,5,0), Vector(0,5,0)))
sketch.addGeometry(Part.LineSegment(Vector(0,5,0), Vector(0,0,0)))
```

### Adding Constraints (Python API)

```python
# Horizontal constraint on line index 0
sketch.addConstraint(Sketcher.Constraint('Horizontal', 0))

# Vertical constraint
sketch.addConstraint(Sketcher.Constraint('Vertical', 1))

# Coincident (connect line 0 end to line 1 start)
sketch.addConstraint(Sketcher.Constraint('Coincident', 0, 2, 1, 1))
# Points: 1=start, 2=end, 3=center

# Distance constraint (set length)
sketch.addConstraint(Sketcher.Constraint('Distance', 0, 10.0))

# Parallel
sketch.addConstraint(Sketcher.Constraint('Parallel', 0, 2))

# Equal length
sketch.addConstraint(Sketcher.Constraint('Equal', 0, 2))

# Perpendicular
sketch.addConstraint(Sketcher.Constraint('Perpendicular', 0, 1))
```

### Input Methods Table

| Operation | Mouse+Palette | Mouse+Command | Text Only (Python) |
|-----------|--------------|---------------|-----------|
| Draw line | Sketcher > Line, click | Keyboard shortcuts vary | `addGeometry(Part.LineSegment(...))` |
| Circle | Sketcher > Circle, click | None standard | `addGeometry(Part.Circle(...))` |
| Horizontal | Select, Constrain Horizontal | `H` (if configured) | `addConstraint(Sketcher.Constraint('Horizontal', idx))` |
| Dimension | Constrain Distance, select | None standard | `addConstraint(Sketcher.Constraint('Distance', idx, val))` |

### Text/Voice Command Examples (Python)

```python
# Rectangle at origin, 10x5
for (p1, p2) in [
    ((0,0), (10,0)), ((10,0), (10,5)),
    ((10,5), (0,5)), ((0,5), (0,0))
]:
    sketch.addGeometry(Part.LineSegment(Vector(*p1,0), Vector(*p2,0)))

# Make lines 0 and 2 parallel
sketch.addConstraint(Sketcher.Constraint('Parallel', 0, 2))

# Set line 0 length to 20mm
sketch.addConstraint(Sketcher.Constraint('Distance', 0, 20.0))

# Circle tangent to two lines (complex, requires solver)
# Not directly expressible as single constraint
```

---

## 5. OnShape

**Browser-based, full keyboard shortcuts, modern workflow.**

### Sketch Creation Workflow
1. Press `Shift+S` or click Sketch button
2. Select plane or face
3. Sketch toolbar activates
4. Press `Shift+S` again or click checkmark to finish

### Drawing Elements

**Keyboard shortcuts:**
- `L` — Line
- `C` — Circle
- `R` — Rectangle (corner)
- `Shift+R` — Center rectangle
- `A` — Arc (3-point)
- `Q` — Toggle construction geometry
- `U` — Use/Project entities
- `N` — Normal to sketch plane view
- `D` — Dimension

### Adding Constraints

Constraints have shortcuts in OnShape:
- `H` — Horizontal
- `V` — Vertical
- `O` — Coincident
- `L` — Parallel (when lines selected)
- `P` — Perpendicular
- `T` — Tangent
- `E` — Equal
- `S` — Symmetric
- `X` — Fix

### Input Methods Table

| Operation | Mouse+Palette | Mouse+Command | Text Only |
|-----------|--------------|---------------|-----------|
| Draw line | Toolbar > Line, click | `L`, click points | Not supported |
| Rectangle | Toolbar > Rectangle | `R`, click corners | Not supported |
| Horizontal | Constraints > Horizontal | Select, press `H` | Not supported |
| Dimension | Toolbar > Dimension | `D`, select, type value | Partial (value only) |

### Text/Voice Command Potential

OnShape has extensive keyboard shortcuts but no command line. The shortcut system suggests good voice mapping:
- "Line" → `L`
- "Horizontal" → `H` (after selection)
- "Dimension ten" → `D` + type "10"

---

## 6. OpenSCAD

**Pure code — no mouse sketching at all.**

### Sketch Creation Workflow

OpenSCAD has no interactive sketching. Everything is code:

```openscad
// 2D primitives
circle(r=5);           // or d=10 for diameter
square(10);            // 10x10 square
square([10, 5]);       // 10x5 rectangle
polygon([[0,0], [10,0], [10,5], [0,5]]);  // arbitrary polygon
```

### Drawing Elements

```openscad
// Circle
circle(r=radius);
circle(d=diameter);
circle(r=5, $fn=100);  // high resolution

// Square/Rectangle
square(size);                    // size x size, corner at origin
square(size, center=true);       // centered
square([width, height]);         // rectangle
square([10, 5], center=true);    // centered rectangle

// Polygon (arbitrary shape)
polygon(points=[[x1,y1], [x2,y2], ...]);
polygon(points=[[0,0], [10,0], [5,8]]);  // triangle

// Text
text("Hello", size=10, font="Liberation Sans");
```

### Constraints in OpenSCAD

**OpenSCAD has no constraints.** Geometry is defined explicitly through coordinates and transformations:

```openscad
// Instead of constraining lines parallel, you compute positions
module two_parallel_lines(length, spacing) {
    for (y = [0, spacing]) {
        translate([0, y, 0])
            square([length, 0.1]);
    }
}

// Instead of dimensions, you use variables
width = 10;
height = 5;
square([width, height]);
```

### Input Methods Table

| Operation | Mouse+Palette | Mouse+Command | Text Only |
|-----------|--------------|---------------|-----------|
| Rectangle | N/A | N/A | `square([10, 5]);` |
| Circle | N/A | N/A | `circle(r=5);` |
| Parallel lines | N/A | N/A | Computed via transforms |
| Set dimension | N/A | N/A | Variable assignment |

### Text/Voice Command Examples

```openscad
// Rectangle at origin, 10x5
square([10, 5]);

// Centered rectangle
translate([-5, -2.5]) square([10, 5]);
// OR
square([10, 5], center=true);

// Circle tangent to edges (computed)
difference() {
    square([10, 10]);
    translate([5, 0]) circle(r=2);  // tangent to bottom
}
```

---

## 7. CadQuery

**Python library with fluent API — excellent for text commands.**

### Sketch Creation Workflow

```python
import cadquery as cq

# Workplane approach (implicit sketch)
result = cq.Workplane("XY").box(10, 10, 1)

# Explicit sketch
sketch = cq.Sketch().rect(10, 5)
result = cq.Workplane("XY").placeSketch(sketch).extrude(1)
```

### Drawing Elements

```python
# Basic shapes (implicit sketch on workplane)
cq.Workplane("XY").circle(5)
cq.Workplane("XY").rect(10, 5)
cq.Workplane("XY").polygon(6, 10)  # hexagon

# Explicit sketch API
sketch = (
    cq.Sketch()
    .rect(10, 5)                    # centered rectangle
    .circle(2)                      # centered circle
    .push([(5, 0), (-5, 0)])        # set locations
    .circle(1)                      # circles at locations
)

# Edge-based sketch (for complex paths)
sketch = (
    cq.Sketch()
    .segment((0, 0), (10, 0))       # line segment
    .segment((10, 5))               # continues from last point
    .close()                        # close back to start
    .arc((5, 2.5), 2, 0, 360)       # arc
    .assemble()                     # convert to face
)
```

### Constraints in CadQuery

CadQuery's Sketch has experimental constraint support:

```python
sketch = (
    cq.Sketch()
    .segment((0, 0), (0, 3.0), "s1")          # named segment
    .arc((0.0, 3.0), (1.5, 1.5), (0.0, 0.0), "a1")  # named arc
    .constrain("s1", "Fixed", None)            # fix position
    .constrain("s1", "a1", "Coincident", None) # connect endpoints
    .constrain("a1", "s1", "Coincident", None)
    .constrain("s1", "a1", "Angle", 45)        # 45° angle between
    .solve()                                   # run constraint solver
    .assemble()
)
```

**Available constraints:**
- `Fixed`, `FixedPoint` — lock position
- `Coincident` — connect points
- `Angle` — angle between entities
- `Length` — fix entity length
- `Distance` — distance between points
- `Radius` — fix arc radius
- `Orientation` — parallel to direction
- `ArcAngle` — fix arc span

### Input Methods Table

| Operation | Mouse+Palette | Mouse+Command | Text Only (Python) |
|-----------|--------------|---------------|-----------|
| Rectangle | N/A (code only) | N/A | `cq.Sketch().rect(10, 5)` |
| Circle | N/A | N/A | `cq.Sketch().circle(5)` |
| Line segment | N/A | N/A | `.segment((0,0), (10,0))` |
| Parallel | N/A | N/A | `.constrain(s1, s2, "Angle", 0)` |
| Dimension | N/A | N/A | `.constrain(s1, "Length", 20)` |

### Text/Voice Command Examples

```python
# Rectangle at origin, 10x5
cq.Sketch().rect(10, 5)

# Two parallel lines (using angle constraint)
sketch = (
    cq.Sketch()
    .segment((0, 0), (10, 0), "line1")
    .segment((0, 5), (10, 5), "line2")
    .constrain("line1", "line2", "Angle", 0)  # parallel = 0° angle
    .solve()
    .assemble()
)

# Set line length to 20
sketch = (
    cq.Sketch()
    .segment((0, 0), (10, 0), "line1")
    .constrain("line1", "Length", 20)
    .solve()
    .assemble()
)

# Circle tangent would require construction geometry
```

---

## Synthesis: Common Patterns & Recommendations

### Common Interaction Patterns

| Pattern | Programs | Notes |
|---------|----------|-------|
| Single-key tool shortcuts | All except OpenSCAD | `L`=Line, `C`=Circle universal |
| Coordinate input | AutoCAD, FreeCAD Python | `x,y` or `@dx,dy` syntax |
| Automatic constraint inference | SolidWorks, Fusion 360, OnShape | While sketching near horizontal → suggests constraint |
| Named entity references | FreeCAD, CadQuery | Assign tags/names for later constraint references |
| Construction geometry toggle | All GUI programs | Separate "construction" vs "real" geometry |

### Best Practices for Text Command Syntax

Based on the research, effective text command syntax should:

1. **Use short, memorable keywords**
   - `LINE`, `CIRCLE`, `RECT` (not `CREATE_LINE_SEGMENT`)
   - Single-letter aliases: `L`, `C`, `R`

2. **Support coordinate formats**
   - Absolute: `10,20`
   - Relative: `@10,5` or `+10,5`
   - Polar: `@10<45` (distance and angle)

3. **Allow command chaining**
   - AutoCAD: `LINE 0,0 10,0 10,5 C` (close)
   - CadQuery: `.rect().circle().fillet()`

4. **Use consistent parameter ordering**
   - Center-based: `CIRCLE center_x,center_y radius`
   - Corner-based: `RECT x1,y1 x2,y2`

5. **Support named references**
   - `LINE 0,0 10,0 AS base_line`
   - `PARALLEL base_line new_line`

### Voice-Friendly Design Considerations

#### Avoiding Ambiguity

| Ambiguous | Clear Alternative |
|-----------|------------------|
| "line" | "draw a line" vs "select line" |
| "ten" | "ten millimeters" / "ten units" |
| "there" | use coordinates or reference names |

#### Reference Naming Patterns

1. **Automatic naming with context:**
   - "the last line"
   - "the circle I just drew"
   - "the horizontal line"

2. **Explicit naming:**
   - "call this line 'base'"
   - "name that circle 'hole1'"

3. **Positional references:**
   - "the line on the left"
   - "the top edge"

4. **Type-based references:**
   - "the red line" (if colors supported)
   - "the dashed line" (if styles supported)

#### Undo/Correction Patterns

| Voice Command | Action |
|---------------|--------|
| "undo" | Remove last operation |
| "undo line" | Remove last line specifically |
| "delete the circle" | Remove referenced entity |
| "change length to 15" | Modify constraint |
| "make it horizontal" | Add/change constraint |
| "no wait, I meant 20" | Correct last value |
| "start over" | Clear current sketch |

### Recommended Approach for labrep

Based on this research, I recommend a **hybrid command syntax** inspired by AutoCAD's command line with CadQuery's fluent chaining:

#### Core Command Structure

```
COMMAND [parameters] [AS name]
```

#### Basic Drawing Commands

```
# Lines
LINE x1,y1 x2,y2                    # Absolute coordinates
LINE x1,y1 TO x2,y2                 # More readable
LINE FROM 0,0 TO 10,0 AS base       # Named line

# Relative coordinates
LINE 0,0 +10,0 +0,5 CLOSE           # Relative with +

# Circles
CIRCLE x,y RADIUS r
CIRCLE x,y DIAMETER d
CIRCLE 5,5 RADIUS 2.5 AS hole1

# Rectangles
RECT x1,y1 x2,y2                    # Two corners
RECT x,y WIDTH w HEIGHT h           # Origin + dimensions
RECT CENTER x,y WIDTH w HEIGHT h    # Centered

# Arcs
ARC x1,y1 x2,y2 x3,y3              # 3-point
ARC CENTER x,y RADIUS r FROM a1 TO a2
```

#### Constraint Commands

```
# Geometric constraints
HORIZONTAL line_name
VERTICAL line_name
PARALLEL line1 line2
PERPENDICULAR line1 line2
TANGENT circle line
COINCIDENT point1 point2

# Dimensional constraints
LENGTH line_name value
DISTANCE point1 point2 value
RADIUS circle_name value
ANGLE line1 line2 value
```

#### Reference System

```
# Explicit names
LINE 0,0 10,0 AS edge1

# Automatic references
LAST                    # Most recent entity
LAST LINE               # Most recent line
LAST CIRCLE             # Most recent circle

# Positional
TOP EDGE
LEFT EDGE
CENTER POINT

# By index (for scripting)
LINE[0], LINE[1], CIRCLE[0]
```

#### Voice-Optimized Alternatives

```
# Natural language mode
"draw a line from zero zero to ten zero"
"make a circle at five five with radius two"
"rectangle ten by five at the origin"
"make that line horizontal"
"set the length to twenty millimeters"
"connect those two lines"
"undo"
```

#### Implementation Priority

1. **Phase 1:** Basic shapes with coordinate input
   - LINE, CIRCLE, RECT with absolute coordinates
   - Named references

2. **Phase 2:** Constraints
   - HORIZONTAL, VERTICAL, PARALLEL, PERPENDICULAR
   - LENGTH, RADIUS dimensional constraints

3. **Phase 3:** Advanced references
   - LAST entity references
   - Positional references (TOP, LEFT, etc.)

4. **Phase 4:** Natural language parsing
   - Map spoken phrases to commands
   - Handle ambiguity resolution

---

## References

### Official Documentation
- [AutoCAD Keyboard Shortcuts](https://www.autodesk.com/shortcuts/autocad)
- [Fusion 360 Shortcuts](https://www.autodesk.com/shortcuts/fusion-360)
- [OnShape Keyboard Shortcuts](https://cad.onshape.com/help/Content/shortcut_keys.htm)
- [OpenSCAD Cheatsheet](https://openscad.org/cheatsheet/)
- [CadQuery Documentation](https://cadquery.readthedocs.io/)
- [FreeCAD Sketcher Workbench](https://wiki.freecadweb.org/Sketcher_Workbench)

### Research Papers
- "Natural Voice-Enabled CAD: Modeling via Natural Discourse" (2009)
- Google Patent US9613020B1: "Natural language user interface for computer-aided design systems"
