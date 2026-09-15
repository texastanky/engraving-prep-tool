/**
 * Curve fitting (Schneider's algorithm).
 *
 * Boolean operations, offsets and traced text are computed on flattened
 * polylines. This module fits cubic Béziers back onto those results, so what
 * comes out of those tools is smooth curve geometry again — far fewer nodes to
 * edit and much smaller exports — while staying inside a stated tolerance of the
 * computed shape.
 *
 * Corners are detected first and become anchors without matching handles, so
 * rectangles and letter corners stay crisp and only genuinely curved runs get
 * curve segments.
 */

import type { Anchor, SubPath, VecPt } from "./vector-path.ts";

type Cubic = { c1: VecPt; c2: VecPt; end: VecPt };

const MAX_REFINEMENTS = 6;
const MAX_DEPTH = 12;

function distance(a: VecPt, b: VecPt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(v: VecPt): VecPt {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
}

export function cubicAt(p0: VecPt, c1: VecPt, c2: VecPt, p3: VecPt, t: number): VecPt {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p3.y,
  };
}

function cubicDerivative(p0: VecPt, c1: VecPt, c2: VecPt, p3: VecPt, t: number): VecPt {
  const mt = 1 - t;
  return {
    x:
      3 * mt * mt * (c1.x - p0.x) +
      6 * mt * t * (c2.x - c1.x) +
      3 * t * t * (p3.x - c2.x),
    y:
      3 * mt * mt * (c1.y - p0.y) +
      6 * mt * t * (c2.y - c1.y) +
      3 * t * t * (p3.y - c2.y),
  };
}

function cubicSecondDerivative(p0: VecPt, c1: VecPt, c2: VecPt, p3: VecPt, t: number): VecPt {
  return {
    x: 6 * (1 - t) * (c2.x - 2 * c1.x + p0.x) + 6 * t * (p3.x - 2 * c2.x + c1.x),
    y: 6 * (1 - t) * (c2.y - 2 * c1.y + p0.y) + 6 * t * (p3.y - 2 * c2.y + c1.y),
  };
}

/** Chord-length parameterisation, normalised to 0..1. */
export function parameterize(points: VecPt[]): number[] {
  const u = [0];
  for (let i = 1; i < points.length; i += 1) {
    u.push(u[i - 1] + distance(points[i], points[i - 1]));
  }
  const total = u[u.length - 1] || 1;
  return u.map((value) => value / total);
}

/**
 * Least-squares fit of one cubic through `points` at parameters `u`, with the
 * end tangents fixed. Control point distances are solved for; this is the core
 * of Schneider's method.
 */
export function fitOneCubic(
  points: VecPt[],
  u: number[],
  leftTangent: VecPt,
  rightTangent: VecPt
): Cubic {
  const p0 = points[0];
  const p3 = points[points.length - 1];

  if (points.length === 2) {
    const scale = distance(p0, p3) / 3;
    return {
      c1: { x: p0.x + leftTangent.x * scale, y: p0.y + leftTangent.y * scale },
      c2: { x: p3.x + rightTangent.x * scale, y: p3.y + rightTangent.y * scale },
      end: { ...p3 },
    };
  }

  // Control points sit along the direction of travel: c1 goes forward from the
  // start, c2 goes backwards from the end.
  const t1 = { x: leftTangent.x, y: leftTangent.y };
  const t2 = { x: -rightTangent.x, y: -rightTangent.y };

  const b0 = (t: number) => (1 - t) ** 3;
  const b1 = (t: number) => 3 * t * (1 - t) ** 2;
  const b2 = (t: number) => 3 * t * t * (1 - t);
  const b3 = (t: number) => t ** 3;

  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 0; i < points.length; i += 1) {
    const t = u[i];
    const a1 = { x: t1.x * b1(t), y: t1.y * b1(t) };
    const a2 = { x: t2.x * b2(t), y: t2.y * b2(t) };

    c00 += a1.x * a1.x + a1.y * a1.y;
    c01 += a1.x * a2.x + a1.y * a2.y;
    c11 += a2.x * a2.x + a2.y * a2.y;

    const base = {
      x: p0.x * (b0(t) + b1(t)) + p3.x * (b2(t) + b3(t)),
      y: p0.y * (b0(t) + b1(t)) + p3.y * (b2(t) + b3(t)),
    };
    const target = points[i];

    x0 += a1.x * (target.x - base.x) + a1.y * (target.y - base.y);
    x1 += a2.x * (target.x - base.x) + a2.y * (target.y - base.y);
  }

  const det = c00 * c11 - c01 * c01;
  let alpha1: number;
  let alpha2: number;

  if (Math.abs(det) > 1e-12) {
    alpha1 = (x0 * c11 - x1 * c01) / det;
    alpha2 = (x1 * c00 - x0 * c01) / det;
  } else {
    alpha1 = Math.sqrt(Math.max(0, x0 / (c00 || 1)));
    alpha2 = Math.sqrt(Math.max(0, x1 / (c11 || 1)));
  }

  const chord = distance(p0, p3) || 1;
  if (!Number.isFinite(alpha1) || alpha1 < 1e-6) alpha1 = chord / 3;
  if (!Number.isFinite(alpha2) || alpha2 < 1e-6) alpha2 = chord / 3;

  // Safety clamp: a poorly conditioned solve can otherwise throw a control point
  // far off the shape. A real fit never needs handles longer than the chord.
  const limit = chord * 2;
  if (alpha1 > limit) alpha1 = limit;
  if (alpha2 > limit) alpha2 = limit;

  return {
    c1: { x: p0.x + t1.x * alpha1, y: p0.y + t1.y * alpha1 },
    c2: { x: p3.x + t2.x * alpha2, y: p3.y + t2.y * alpha2 },
    end: { ...p3 },
  };
}

function distanceToSegment(p: VecPt, a: VecPt, b: VecPt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return distance(p, a);

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from a point to the polyline through `points`. */
function distanceToPolyline(p: VecPt, points: VecPt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const d = distanceToSegment(p, points[i], points[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function nearestIndex(points: VecPt[], target: VecPt): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = distance(points[i], target);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * Deviation of the fitted curve from the source polyline.
 *
 * Checking only the sample points is not enough: a cubic can pass close to every
 * sample and still bulge wildly in between, which is exactly how a rounded
 * corner ends up with control handles shooting off the shape.
 */
function curveDeviation(
  points: VecPt[],
  cubic: Cubic,
  samples = 32
): { error: number; t: number } {
  const p0 = points[0];
  const p3 = points[points.length - 1];
  let error = 0;
  let worstT = 0.5;

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const point = cubicAt(p0, cubic.c1, cubic.c2, p3, t);
    const d = distanceToPolyline(point, points);
    if (d > error) {
      error = d;
      worstT = t;
    }
  }

  return { error, t: worstT };
}

/** Worst deviation between the cubic and the input points, and where it is. */
function computeError(
  points: VecPt[],
  u: number[],
  cubic: Cubic
): { error: number; index: number } {
  const p0 = points[0];
  const p3 = points[points.length - 1];
  let error = 0;
  let index = 0;

  for (let i = 0; i < points.length; i += 1) {
    const point = cubicAt(p0, cubic.c1, cubic.c2, p3, u[i]);
    const d = distance(point, points[i]);
    if (d > error) {
      error = d;
      index = i;
    }
  }

  return { error, index };
}

/** One Newton-Raphson step per point, pulling parameters onto the curve. */
function reparameterize(points: VecPt[], u: number[], cubic: Cubic): number[] {
  const p0 = points[0];
  const p3 = points[points.length - 1];

  return u.map((t, i) => {
    const current = cubicAt(p0, cubic.c1, cubic.c2, p3, t);
    const d1 = cubicDerivative(p0, cubic.c1, cubic.c2, p3, t);
    const d2 = cubicSecondDerivative(p0, cubic.c1, cubic.c2, p3, t);
    const diff = { x: current.x - points[i].x, y: current.y - points[i].y };

    const numerator = diff.x * d1.x + diff.y * d1.y;
    const denominator = d1.x * d1.x + d1.y * d1.y + diff.x * d2.x + diff.y * d2.y;
    if (Math.abs(denominator) < 1e-12) return t;

    const next = t - numerator / denominator;
    return next >= 0 && next <= 1 ? next : t;
  });
}

/** Fit an open run of points, splitting where the error exceeds tolerance. */
export function fitRun(
  points: VecPt[],
  leftTangent: VecPt,
  rightTangent: VecPt,
  tolerance: number,
  depth = 0
): Cubic[] {
  if (points.length <= 2) {
    const u = parameterize(points);
    return [fitOneCubic(points, u, leftTangent, rightTangent)];
  }

  let u = parameterize(points);
  let cubic = fitOneCubic(points, u, leftTangent, rightTangent);
  let { error, index } = computeError(points, u, cubic);

  for (let i = 0; i < MAX_REFINEMENTS && error > tolerance; i += 1) {
    const nextU = reparameterize(points, u, cubic);
    const nextCubic = fitOneCubic(points, nextU, leftTangent, rightTangent);
    const measured = computeError(points, nextU, nextCubic);
    if (measured.error >= error) break;
    u = nextU;
    cubic = nextCubic;
    error = measured.error;
    index = measured.index;
  }

  // Now check the curve itself, and split at the bulge if there is one.
  const curve = curveDeviation(points, cubic);
  if (curve.error > error) {
    error = curve.error;
    index = nearestIndex(
      points,
      cubicAt(points[0], cubic.c1, cubic.c2, points[points.length - 1], curve.t)
    );
  }

  if (error <= tolerance) return [cubic];

  if (depth >= MAX_DEPTH || index <= 0 || index >= points.length - 1) {
    // Cannot subdivide any further: fall back to exact straight segments rather
    // than shipping a curve that does not follow the shape.
    if (error <= tolerance) return [cubic];
    return points.slice(0, -1).map((point, i) => ({
      c1: { ...point },
      c2: { ...points[i + 1] },
      end: { ...points[i + 1] },
    }));
  }

  // Split at the worst point, sharing one travel direction so the join is smooth.
  const centreTangent = normalize({
    x: points[index + 1].x - points[index - 1].x,
    y: points[index + 1].y - points[index - 1].y,
  });

  return [
    ...fitRun(points.slice(0, index + 1), leftTangent, centreTangent, tolerance, depth + 1),
    ...fitRun(points.slice(index), centreTangent, rightTangent, tolerance, depth + 1),
  ];
}

/**
 * Prepare a ring for fitting.
 *
 * Clipping output routinely contains duplicate and nearly-collinear points (a
 * corner arc emits a cluster of very short segments). Feeding those to a
 * least-squares fit produces ill-conditioned solves and wildly overshooting
 * handles, so they are removed first.
 */
export function cleanRing(ring: VecPt[], tolerance = 0.2): VecPt[] {
  const deduped: VecPt[] = [];
  const minSpacing = Math.max(tolerance * 0.5, 1e-6);

  for (const point of ring) {
    const last = deduped[deduped.length - 1];
    if (last && distance(last, point) <= minSpacing) continue;
    deduped.push({ x: point.x, y: point.y });
  }

  // Drop the closing duplicate so the ring can be treated as a loop.
  if (
    deduped.length > 1 &&
    distance(deduped[0], deduped[deduped.length - 1]) <= minSpacing
  ) {
    deduped.pop();
  }

  if (deduped.length < 3) return deduped;

  // Remove points that sit on a straight line between their neighbours.
  const result: VecPt[] = [];
  for (let i = 0; i < deduped.length; i += 1) {
    const previous = result[result.length - 1];
    const next = deduped[(i + 1) % deduped.length];
    if (previous) {
      const a = normalize({
        x: deduped[i].x - previous.x,
        y: deduped[i].y - previous.y,
      });
      const b = normalize({ x: next.x - deduped[i].x, y: next.y - deduped[i].y });
      const cross = Math.abs(a.x * b.y - a.y * b.x);
      const dot = a.x * b.x + a.y * b.y;
      if (cross < 1e-4 && dot > 0) continue;
    }
    result.push(deduped[i]);
  }

  return result.length >= 3 ? result : deduped;
}

/** Turn angle at a vertex, in degrees. */
function turnAngle(previous: VecPt, current: VecPt, next: VecPt): number {
  const a = normalize({ x: current.x - previous.x, y: current.y - previous.y });
  const b = normalize({ x: next.x - current.x, y: next.y - current.y });
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return (Math.acos(dot) * 180) / Math.PI;
}

/** Convert an ordered list of cubics into a closed subpath. */
function cubicsToClosedSubpath(cubics: Cubic[], start: VecPt): SubPath | null {
  if (cubics.length === 0) return null;

  const anchors: Anchor[] = [
    { x: start.x, y: start.y, out: { ...cubics[0].c1 } },
  ];

  for (let i = 0; i < cubics.length - 1; i += 1) {
    anchors.push({
      x: cubics[i].end.x,
      y: cubics[i].end.y,
      in: { ...cubics[i].c2 },
      out: { ...cubics[i + 1].c1 },
    });
  }

  // Close the loop: the last cubic's incoming handle belongs to the first anchor.
  anchors[0].in = { ...cubics[cubics.length - 1].c2 };

  if (anchors.length < 2) return null;
  return { closed: true, anchors };
}

/**
 * Fit a closed ring, preserving corners.
 *
 * The ring is split into runs between detected corners; adjacent runs share the
 * corner anchor, and because the incoming and outgoing handles differ there the
 * corner stays sharp.
 */
export function fitRing(ring: VecPt[], tolerance = 0.2, cornerAngleDeg = 40): SubPath | null {
  const points = cleanRing(ring, tolerance);
  if (points.length < 3) return null;

  // Deterministic start: top-most, then left-most point.
  let start = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (
      points[i].y < points[start].y ||
      (points[i].y === points[start].y && points[i].x < points[start].x)
    ) {
      start = i;
    }
  }

  const rotated = [...points.slice(start), ...points.slice(0, start)];
  const total = rotated.length;

  const corners: number[] = [0];
  for (let i = 1; i < total; i += 1) {
    const previous = rotated[(i - 1 + total) % total];
    const next = rotated[(i + 1) % total];
    if (turnAngle(previous, rotated[i], next) > cornerAngleDeg) corners.push(i);
  }

  // A shape that is mostly corners is better left as straight segments.
  if (corners.length > total / 2) {
    return { closed: true, anchors: rotated.map((point) => ({ x: point.x, y: point.y })) };
  }

  const cubics: Cubic[] = [];

  for (let i = 0; i < corners.length; i += 1) {
    const from = corners[i];
    const rawTo = corners[(i + 1) % corners.length];
    const to = rawTo > from ? rawTo : rawTo + total;

    const runPoints: VecPt[] = [];
    for (let index = from; index <= to; index += 1) {
      runPoints.push(rotated[index % total]);
    }
    if (runPoints.length < 2) continue;

    const leftTangent = normalize({
      x: runPoints[1].x - runPoints[0].x,
      y: runPoints[1].y - runPoints[0].y,
    });
    const lastIndex = runPoints.length - 1;
    const rightTangent = normalize({
      x: runPoints[lastIndex].x - runPoints[lastIndex - 1].x,
      y: runPoints[lastIndex].y - runPoints[lastIndex - 1].y,
    });

    cubics.push(...fitRun(runPoints, leftTangent, rightTangent, tolerance));
  }

  const startPoint = rotated[0];
  return cubicsToClosedSubpath(cubics, startPoint) ?? {
    closed: true,
    anchors: rotated.map((point) => ({ x: point.x, y: point.y })),
  };
}

/**
 * Fit every closed subpath back to curves. Open subpaths are returned as-is,
 * as are subpaths whose fit would fail.
 */
export function fitSubpaths(subpaths: SubPath[], tolerance = 0.2): SubPath[] {
  return subpaths.map((subpath) => {
    if (!subpath.closed) return subpath;
    const fitted = fitRing(
      subpath.anchors.map((anchor) => ({ x: anchor.x, y: anchor.y })),
      tolerance
    );
    return fitted ?? subpath;
  });
}
