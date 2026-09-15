/**
 * Vector path model for authoring artwork from scratch.
 *
 * Objects store absolute anchor coordinates in canvas display pixels — the same
 * space as the design layer — so rendering, hit testing and export all agree
 * without a transform stack. Move/scale/rotate are applied by transforming the
 * anchors directly, which is exact for cubic Béziers (an affine transform of a
 * Bézier is the transform of its control points).
 *
 * Export converts display pixels into material units (mm) at the edges.
 */

export type VecPt = { x: number; y: number };

/** A path anchor with optional absolute control handles. */
export type Anchor = {
  x: number;
  y: number;
  /** Incoming handle (absolute position), omitted for straight segments. */
  in?: VecPt;
  /** Outgoing handle (absolute position). */
  out?: VecPt;
};

export type SubPath = {
  anchors: Anchor[];
  closed: boolean;
};

/** How the laser treats the object. */
export type VectorMode = "engrave" | "cut" | "score";

export type VectorObject = {
  id: string;
  name: string;
  mode: VectorMode;
  /** Stroke width in display pixels (converted to mm on export). */
  strokeWidth: number;
  subpaths: SubPath[];
};

export type Bounds = { x: number; y: number; w: number; h: number };

export const MODE_INFO: Record<VectorMode, { label: string; stroke: string; fill: string }> = {
  engrave: { label: "Engrave", stroke: "#111111", fill: "#111111" },
  cut: { label: "Cut", stroke: "#ef4444", fill: "none" },
  score: { label: "Score", stroke: "#3b82f6", fill: "none" },
};

/** Bézier circle constant: handle length as a fraction of the radius. */
const KAPPA = 0.5522847498;

let idCounter = 0;
export function nextObjectId(): string {
  idCounter += 1;
  return `vec-${Date.now().toString(36)}-${idCounter}`;
}

// --- Geometry helpers -------------------------------------------------------

export function distance(a: VecPt, b: VecPt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function cloneSubpaths(subpaths: SubPath[]): SubPath[] {
  return subpaths.map((subpath) => ({
    closed: subpath.closed,
    anchors: subpath.anchors.map((anchor) => ({
      x: anchor.x,
      y: anchor.y,
      ...(anchor.in ? { in: { ...anchor.in } } : {}),
      ...(anchor.out ? { out: { ...anchor.out } } : {}),
    })),
  }));
}

export function cloneVectorObject(object: VectorObject): VectorObject {
  return { ...object, subpaths: cloneSubpaths(object.subpaths) };
}

function mapSubpaths(subpaths: SubPath[], map: (p: VecPt) => VecPt): SubPath[] {
  return subpaths.map((subpath) => ({
    closed: subpath.closed,
    anchors: subpath.anchors.map((anchor) => {
      const next: Anchor = { ...map(anchor) };
      if (anchor.in) next.in = map(anchor.in);
      if (anchor.out) next.out = map(anchor.out);
      return next;
    }),
  }));
}

export function translateSubpaths(subpaths: SubPath[], dx: number, dy: number): SubPath[] {
  return mapSubpaths(subpaths, (p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function scaleSubpaths(
  subpaths: SubPath[],
  origin: VecPt,
  sx: number,
  sy: number
): SubPath[] {
  return mapSubpaths(subpaths, (p) => ({
    x: origin.x + (p.x - origin.x) * sx,
    y: origin.y + (p.y - origin.y) * sy,
  }));
}

export function rotateSubpaths(
  subpaths: SubPath[],
  origin: VecPt,
  degrees: number
): SubPath[] {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return mapSubpaths(subpaths, (p) => {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    return {
      x: origin.x + dx * cos - dy * sin,
      y: origin.y + dx * sin + dy * cos,
    };
  });
}

/** Control hull of every anchor and handle. */
export function subpathBounds(subpaths: SubPath[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (p: VecPt) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };

  for (const subpath of subpaths) {
    for (const anchor of subpath.anchors) {
      visit(anchor);
      if (anchor.in) visit(anchor.in);
      if (anchor.out) visit(anchor.out);
    }
  }

  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function objectBounds(object: VectorObject): Bounds {
  return subpathBounds(object.subpaths);
}

export function boundsCenter(bounds: Bounds): VecPt {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

export function objectCenter(object: VectorObject): VecPt {
  return boundsCenter(objectBounds(object));
}

/** Point-in-object test used for click selection (bounds based, padded). */
export function hitTestObject(object: VectorObject, point: VecPt, padding = 6): boolean {
  const b = objectBounds(object);
  return (
    point.x >= b.x - padding &&
    point.x <= b.x + b.w + padding &&
    point.y >= b.y - padding &&
    point.y <= b.y + b.h + padding
  );
}

// --- Path serialisation -----------------------------------------------------

function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Serialise subpaths to an SVG path `d` string. */
export function toPathData(subpaths: SubPath[]): string {
  const parts: string[] = [];

  for (const subpath of subpaths) {
    const anchors = subpath.anchors;
    if (anchors.length === 0) continue;

    parts.push(`M ${fmt(anchors[0].x)} ${fmt(anchors[0].y)}`);

    const segmentCount = subpath.closed ? anchors.length : anchors.length - 1;

    for (let i = 0; i < segmentCount; i += 1) {
      const from = anchors[i];
      const to = anchors[(i + 1) % anchors.length];
      const c1 = from.out;
      const c2 = to.in;
      const isClosingSegment = subpath.closed && (i + 1) % anchors.length === 0;

      if (c1 || c2) {
        const a = c1 ?? from;
        const b = c2 ?? to;
        parts.push(
          `C ${fmt(a.x)} ${fmt(a.y)} ${fmt(b.x)} ${fmt(b.y)} ${fmt(to.x)} ${fmt(to.y)}`
        );
      } else if (!isClosingSegment) {
        // `Z` already draws the straight closing segment.
        parts.push(`L ${fmt(to.x)} ${fmt(to.y)}`);
      }
    }

    if (subpath.closed) parts.push("Z");
  }

  return parts.join(" ");
}

/**
 * Trace subpaths onto a 2D context, scaling display pixels into the target
 * space. Typed structurally so it can be driven by a recorder in tests.
 */
export function traceSubpaths(
  ctx: {
    moveTo: (x: number, y: number) => void;
    lineTo: (x: number, y: number) => void;
    bezierCurveTo: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) => void;
    closePath: () => void;
  },
  subpaths: SubPath[],
  sx = 1,
  sy = 1
): void {
  for (const subpath of subpaths) {
    const anchors = subpath.anchors;
    if (anchors.length === 0) continue;

    ctx.moveTo(anchors[0].x * sx, anchors[0].y * sy);
    const segmentCount = subpath.closed ? anchors.length : anchors.length - 1;

    for (let i = 0; i < segmentCount; i += 1) {
      const from = anchors[i];
      const to = anchors[(i + 1) % anchors.length];
      const c1 = from.out ?? from;
      const c2 = to.in ?? to;
      const isClosingSegment = subpath.closed && (i + 1) % anchors.length === 0;

      if (from.out || to.in) {
        ctx.bezierCurveTo(c1.x * sx, c1.y * sy, c2.x * sx, c2.y * sy, to.x * sx, to.y * sy);
      } else if (!isClosingSegment) {
        // closePath() draws the straight closing segment.
        ctx.lineTo(to.x * sx, to.y * sy);
      }
    }

    if (subpath.closed) ctx.closePath();
  }
}

// --- Shape builders ---------------------------------------------------------

export function rectSubpaths(x: number, y: number, w: number, h: number): SubPath[] {
  return [
    {
      closed: true,
      anchors: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
    },
  ];
}

export function ellipseSubpaths(cx: number, cy: number, rx: number, ry: number): SubPath[] {
  const hx = rx * KAPPA;
  const hy = ry * KAPPA;
  return [
    {
      closed: true,
      anchors: [
        { x: cx, y: cy - ry, in: { x: cx - hx, y: cy - ry }, out: { x: cx + hx, y: cy - ry } },
        { x: cx + rx, y: cy, in: { x: cx + rx, y: cy - hy }, out: { x: cx + rx, y: cy + hy } },
        { x: cx, y: cy + ry, in: { x: cx + hx, y: cy + ry }, out: { x: cx - hx, y: cy + ry } },
        { x: cx - rx, y: cy, in: { x: cx - rx, y: cy + hy }, out: { x: cx - rx, y: cy - hy } },
      ],
    },
  ];
}

export function lineSubpaths(a: VecPt, b: VecPt): SubPath[] {
  return [{ closed: false, anchors: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] }];
}

export function polygonSubpaths(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  startAngle = -90
): SubPath[] {
  const anchors: Anchor[] = [];
  for (let i = 0; i < Math.max(3, sides); i += 1) {
    const angle = ((startAngle + (360 * i) / Math.max(3, sides)) * Math.PI) / 180;
    anchors.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return [{ closed: true, anchors }];
}

export function starSubpaths(
  cx: number,
  cy: number,
  outerRadius: number,
  points: number,
  innerRatio = 0.42,
  startAngle = -90
): SubPath[] {
  const count = Math.max(3, points);
  const inner = outerRadius * innerRatio;
  const anchors: Anchor[] = [];

  for (let i = 0; i < count * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : inner;
    const angle = ((startAngle + (180 * i) / count) * Math.PI) / 180;
    anchors.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }

  return [{ closed: true, anchors }];
}

export function objectFromSubpaths(
  name: string,
  subpaths: SubPath[],
  mode: VectorMode = "cut",
  strokeWidth?: number
): VectorObject {
  return {
    id: nextObjectId(),
    name,
    mode,
    strokeWidth: strokeWidth ?? 1.5,
    subpaths,
  };
}

/** Append a subpath to an existing object (pen drawing that keeps going). */
export function addSubpath(object: VectorObject, subpath: SubPath): VectorObject {
  return { ...object, subpaths: [...object.subpaths, subpath] };
}

// --- Export helpers ---------------------------------------------------------

export type UnitScale = { sx: number; sy: number };

/** Convert display pixels to the export unit (mm) and offset to the origin. */
export function scaleSubpathsToUnit(subpaths: SubPath[], scale: UnitScale): SubPath[] {
  return mapSubpaths(subpaths, (p) => ({ x: p.x * scale.sx, y: p.y * scale.sy }));
}

export type SegmentHit = {
  subpathIndex: number;
  segmentIndex: number;
  /** Parameter along the segment, 0..1. */
  t: number;
  distance: number;
  point: VecPt;
};

function lerp(a: VecPt, b: VecPt, t: number): VecPt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cubicAt(p0: VecPt, c1: VecPt, c2: VecPt, p3: VecPt, t: number): VecPt {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p3.y,
  };
}

/**
 * Find the closest point on the path to `target`. Used to decide where a new
 * node should be inserted when the user clicks on a segment.
 */
export function nearestPointOnPath(
  subpaths: SubPath[],
  target: VecPt,
  samples = 32
): SegmentHit | null {
  let best: SegmentHit | null = null;

  subpaths.forEach((subpath, subpathIndex) => {
    const anchors = subpath.anchors;
    const segmentCount = subpath.closed ? anchors.length : anchors.length - 1;

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const from = anchors[segmentIndex];
      const to = anchors[(segmentIndex + 1) % anchors.length];
      const c1 = from.out ?? from;
      const c2 = to.in ?? to;

      for (let step = 0; step <= samples; step += 1) {
        const t = step / samples;
        const point = cubicAt(from, c1, c2, to, t);
        const distance = Math.hypot(point.x - target.x, point.y - target.y);
        if (!best || distance < best.distance) {
          best = { subpathIndex, segmentIndex, t, distance, point };
        }
      }
    }
  });

  return best;
}

/**
 * Insert a node on a segment using de Casteljau, which splits the curve without
 * changing its shape.
 */
export function splitSegment(
  subpaths: SubPath[],
  subpathIndex: number,
  segmentIndex: number,
  t: number
): SubPath[] {
  const clampedT = Math.min(0.999, Math.max(0.001, t));

  return subpaths.map((subpath, si) => {
    if (si !== subpathIndex) return subpath;
    const anchors = subpath.anchors;
    const fromIndex = segmentIndex;
    const toIndex = (segmentIndex + 1) % anchors.length;
    const from = anchors[fromIndex];
    const to = anchors[toIndex];

    const c1 = from.out ?? from;
    const c2 = to.in ?? to;

    const a = lerp(from, c1, clampedT);
    const b = lerp(c1, c2, clampedT);
    const c = lerp(c2, to, clampedT);
    const d = lerp(a, b, clampedT);
    const e = lerp(b, c, clampedT);
    const f = lerp(d, e, clampedT);

    const nextAnchors: Anchor[] = anchors.map((anchor) => ({ ...anchor }));
    nextAnchors[fromIndex] = { ...nextAnchors[fromIndex], out: a };
    nextAnchors[toIndex] = { ...nextAnchors[toIndex], in: c };

    const inserted: Anchor = { x: f.x, y: f.y, in: d, out: e };
    nextAnchors.splice(fromIndex + 1, 0, inserted);

    return { ...subpath, anchors: nextAnchors };
  });
}

/** Remove a node, dropping the subpath if too little remains. */
export function removeAnchor(
  subpaths: SubPath[],
  subpathIndex: number,
  anchorIndex: number
): SubPath[] {
  const result: SubPath[] = [];

  subpaths.forEach((subpath, si) => {
    if (si !== subpathIndex) {
      result.push(subpath);
      return;
    }

    const anchors = subpath.anchors.filter((_, index) => index !== anchorIndex);
    if (anchors.length < 2) return;

    // Straighten the gap left behind so no dangling handle remains.
    const previousIndex = anchorIndex === 0 ? anchors.length - 1 : anchorIndex - 1;
    const previous = { ...anchors[previousIndex] };
    delete previous.out;
    anchors[previousIndex] = previous;

    result.push({ ...subpath, anchors });
  });

  return result;
}

/** Move one node (and its handles) to a new position. */
export function moveAnchor(
  subpaths: SubPath[],
  subpathIndex: number,
  anchorIndex: number,
  dx: number,
  dy: number
): SubPath[] {
  return subpaths.map((subpath, si) => {
    if (si !== subpathIndex) return subpath;
    return {
      ...subpath,
      anchors: subpath.anchors.map((anchor, ai) => {
        if (ai !== anchorIndex) return anchor;
        return {
          x: anchor.x + dx,
          y: anchor.y + dy,
          ...(anchor.in ? { in: { x: anchor.in.x + dx, y: anchor.in.y + dy } } : {}),
          ...(anchor.out ? { out: { x: anchor.out.x + dx, y: anchor.out.y + dy } } : {}),
        };
      }),
    };
  });
}

/** Move a single bezier handle. */
export function moveHandle(
  subpaths: SubPath[],
  subpathIndex: number,
  anchorIndex: number,
  which: "in" | "out",
  point: VecPt
): SubPath[] {
  return subpaths.map((subpath, si) => {
    if (si !== subpathIndex) return subpath;
    return {
      ...subpath,
      anchors: subpath.anchors.map((anchor, ai) =>
        ai === anchorIndex ? { ...anchor, [which]: { x: point.x, y: point.y } } : anchor
      ),
    };
  });
}

/** A cubic point sampler — used for previewing and for point-based hit tests. */
export function samplePath(subpaths: SubPath[], perSegment = 12): VecPt[] {
  const points: VecPt[] = [];

  for (const subpath of subpaths) {
    const anchors = subpath.anchors;
    if (anchors.length === 0) continue;

    points.push({ x: anchors[0].x, y: anchors[0].y });
    const segmentCount = subpath.closed ? anchors.length : anchors.length - 1;

    for (let i = 0; i < segmentCount; i += 1) {
      const from = anchors[i];
      const to = anchors[(i + 1) % anchors.length];
      const c1 = from.out ?? from;
      const c2 = to.in ?? to;

      for (let step = 1; step <= perSegment; step += 1) {
        const t = step / perSegment;
        const mt = 1 - t;
        const x =
          mt * mt * mt * from.x +
          3 * mt * mt * t * c1.x +
          3 * mt * t * t * c2.x +
          t * t * t * to.x;
        const y =
          mt * mt * mt * from.y +
          3 * mt * mt * t * c1.y +
          3 * mt * t * t * c2.y +
          t * t * t * to.y;
        points.push({ x, y });
      }
    }
  }

  return points;
}
