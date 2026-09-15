/**
 * Boolean operations and path offsetting for vector objects.
 *
 * Bezier segments are flattened to fine polylines first, then a well-tested
 * polygon clipping library does the hard part (intersections, self-intersection
 * cleanup, winding). The result is polylines, not curves — at engraving
 * tolerances the difference is well below what the laser can resolve.
 *
 * Regions are built by XOR-ing every ring, which reproduces the even-odd fill
 * rule a shape with cut-outs (an ejection port, a hole in a plaque) depends on.
 */

import polygonClipping from "polygon-clipping";
import type { Anchor, SubPath, VecPt } from "./vector-path.ts";

export type Ring = [number, number][];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export type BooleanOp = "union" | "intersection" | "difference" | "exclude";

type ClipGeom = Polygon | MultiPolygon;

/**
 * The library's overloads require a first argument plus a rest list, which makes
 * spreading a computed array awkward. This narrow view accepts a plain rest list.
 */
const clip = polygonClipping as unknown as {
  union: (...geoms: ClipGeom[]) => MultiPolygon;
  intersection: (...geoms: ClipGeom[]) => MultiPolygon;
  difference: (...geoms: ClipGeom[]) => MultiPolygon;
  xor: (...geoms: ClipGeom[]) => MultiPolygon;
};

export const DEFAULT_TOLERANCE = 0.25;

function cubicAt(p0: VecPt, c1: VecPt, c2: VecPt, p3: VecPt, t: number): VecPt {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p3.y,
  };
}

/** Sensible number of samples for a segment, based on its control polygon length. */
function stepsFor(from: VecPt, c1: VecPt, c2: VecPt, to: VecPt, tolerance: number): number {
  const rough =
    Math.hypot(c1.x - from.x, c1.y - from.y) +
    Math.hypot(c2.x - c1.x, c2.y - c1.y) +
    Math.hypot(to.x - c2.x, to.y - c2.y);
  const step = Math.max(tolerance * 4, 0.5);
  return Math.max(2, Math.min(240, Math.ceil(rough / step)));
}

/** Flatten subpaths into closed rings of points. Open subpaths are closed. */
export function flattenSubpaths(subpaths: SubPath[], tolerance = DEFAULT_TOLERANCE): Ring[] {
  const rings: Ring[] = [];

  for (const subpath of subpaths) {
    const anchors = subpath.anchors;
    if (anchors.length < 2) continue;

    const points: VecPt[] = [{ x: anchors[0].x, y: anchors[0].y }];
    const segmentCount = subpath.closed ? anchors.length : anchors.length - 1;

    for (let i = 0; i < segmentCount; i += 1) {
      const from = anchors[i];
      const to = anchors[(i + 1) % anchors.length];
      const c1 = from.out ?? from;
      const c2 = to.in ?? to;
      // A straight segment needs no subdivision at all.
      const straight = !from.out && !to.in;
      const steps = straight ? 1 : stepsFor(from, c1, c2, to, tolerance);

      for (let step = 1; step <= steps; step += 1) {
        points.push(cubicAt(from, c1, c2, to, step / steps));
      }
    }

    // Drop a duplicated closing point, then close the ring explicitly.
    const last = points[points.length - 1];
    if (points.length > 2 && Math.hypot(last.x - points[0].x, last.y - points[0].y) < 1e-9) {
      points.pop();
    }
    if (points.length < 3) continue;

    rings.push([
      ...points.map((point) => [point.x, point.y] as [number, number]),
      [points[0].x, points[0].y],
    ]);
  }

  return rings;
}

/** Even-odd region for a set of rings (XOR toggles holes and nested shapes). */
export function ringsToRegion(rings: Ring[]): MultiPolygon {
  const usable = rings.filter((ring) => ring.length >= 4);
  if (usable.length === 0) return [];
  if (usable.length === 1) {
    return [[usable[0]]];
  }
  return clip.xor(...usable.map((ring): Polygon => [ring]));
}

export function subpathsToRegion(
  subpaths: SubPath[],
  tolerance = DEFAULT_TOLERANCE
): MultiPolygon {
  return ringsToRegion(flattenSubpaths(subpaths, tolerance));
}

/** Turn a clipped region back into editable (closed, straight-edged) subpaths. */
export function regionToSubpaths(region: MultiPolygon): SubPath[] {
  const subpaths: SubPath[] = [];

  for (const polygon of region) {
    for (const ring of polygon) {
      // Drop the duplicate closing point polygon-clipping emits.
      const points = ring.slice();
      if (points.length > 1) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
          points.pop();
        }
      }
      if (points.length < 3) continue;

      const anchors: Anchor[] = points.map(([x, y]) => ({ x, y }));
      subpaths.push({ anchors, closed: true });
    }
  }

  return subpaths;
}

export function booleanSubpaths(
  a: SubPath[],
  b: SubPath[],
  op: BooleanOp,
  tolerance = DEFAULT_TOLERANCE
): SubPath[] {
  const regionA = subpathsToRegion(a, tolerance);
  const regionB = subpathsToRegion(b, tolerance);

  if (regionA.length === 0) {
    return op === "union" ? regionToSubpaths(regionB) : [];
  }
  if (regionB.length === 0) {
    return op === "difference" || op === "union" ? regionToSubpaths(regionA) : [];
  }

  const result =
    op === "union"
      ? clip.union(regionA, regionB)
      : op === "intersection"
        ? clip.intersection(regionA, regionB)
        : op === "difference"
          ? clip.difference(regionA, regionB)
          : clip.xor(regionA, regionB);

  // NOTE: results stay as polylines. Refitting curves onto clipped output is
  // implemented (see curve-fit.ts) but produced non-monotonic anchors and
  // overshooting handles on clipped straight edges, so it is not applied here
  // until it can be validated. Polygons are accurate, if heavier on nodes.
  return regionToSubpaths(result);
}

/** Number of segments used to round an offset corner. */
const CORNER_SEGMENTS = 16;

/**
 * Nudge used to break exactly-coincident edges between neighbouring band
 * pieces. Sweep-line clipping is numerically unhappy about coincident edges,
 * and an error this small is far below anything the laser can resolve.
 */
const BAND_EPSILON = 0.001;

function circleRing(center: VecPt, radius: number, segments = CORNER_SEGMENTS): Ring {
  const ring: Ring = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    ring.push([center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle)]);
  }
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/**
 * Offset (grow/shrink) a path by `delta` — positive grows, negative erodes.
 *
 * Built as a Minkowski sum/difference with a disc: a rectangle per edge plus a
 * disc per vertex forms the boundary band, which is added to grow the shape or
 * subtracted to erode it. Because the band is derived from every ring, holes are
 * handled for free: growing the material shrinks them, eroding enlarges them.
 * Corners come out round, which avoids the spikes a mitre can produce.
 */
export function offsetSubpaths(
  subpaths: SubPath[],
  delta: number,
  tolerance = DEFAULT_TOLERANCE
): SubPath[] {
  if (Math.abs(delta) < 1e-6) return subpaths;

  const rings = flattenSubpaths(subpaths, tolerance).filter((ring) => ring.length >= 4);
  if (rings.length === 0) return subpaths;

  const base = ringsToRegion(rings);
  if (base.length === 0) return subpaths;

  const radius = Math.abs(delta);
  const band: Polygon[] = [];

  for (const ring of rings) {
    const points = ring.slice(0, -1); // drop the closing duplicate

    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;

      // Stretch the rectangle slightly past both ends so it overlaps the corner
      // discs instead of exactly touching them.
      const ux = dx / length;
      const uy = dy / length;
      const nx = -uy * radius;
      const ny = ux * radius;
      const ax = x1 - ux * BAND_EPSILON;
      const ay = y1 - uy * BAND_EPSILON;
      const bx = x2 + ux * BAND_EPSILON;
      const by = y2 + uy * BAND_EPSILON;

      band.push([
        [
          [ax + nx, ay + ny],
          [bx + nx, by + ny],
          [bx - nx, by - ny],
          [ax - nx, ay - ny],
          [ax + nx, ay + ny],
        ],
      ]);
      band.push([circleRing({ x: x1, y: y1 }, radius + BAND_EPSILON)]);
    }
  }

  if (band.length === 0) return subpaths;

  const bandRegion = clip.union(...band);

  const result =
    delta > 0 ? clip.union(base, bandRegion) : clip.difference(base, bandRegion);

  return regionToSubpaths(result);
}

/** Signed area of a ring (positive = counter-clockwise). */
export function ringArea(ring: Ring): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

/** Total area of a region, accounting for holes. */
export function regionArea(region: MultiPolygon): number {
  let total = 0;
  for (const polygon of region) {
    polygon.forEach((ring, index) => {
      const area = Math.abs(ringArea(ring));
      total += index === 0 ? area : -area;
    });
  }
  return total;
}

/** Area of the filled region described by subpaths (holes included). */
export function subpathsArea(subpaths: SubPath[], tolerance = DEFAULT_TOLERANCE): number {
  return regionArea(subpathsToRegion(subpaths, tolerance));
}
