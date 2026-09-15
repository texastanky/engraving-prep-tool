import { describe, expect, it } from "vitest";
import { cubicAt, fitRing, fitSubpaths, parameterize } from "./curve-fit.ts";
import {
  ellipseSubpaths,
  rectSubpaths,
  samplePath,
  subpathBounds,
  type SubPath,
} from "./vector-path.ts";

function circlePoints(cx: number, cy: number, r: number, count = 64) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  points.push(points[0]);
  return points;
}

/**
 * Largest distance from each original point to the fitted curve. Sampled finely
 * so the measurement itself is not the dominant error term.
 */
function maxDeviation(original: { x: number; y: number }[], fitted: SubPath): number {
  const samples = samplePath([fitted], 200);
  let worst = 0;
  for (const point of original) {
    let nearest = Infinity;
    for (const sample of samples) {
      const d = Math.hypot(sample.x - point.x, sample.y - point.y);
      if (d < nearest) nearest = d;
    }
    if (nearest > worst) worst = nearest;
  }
  return worst;
}

describe("parameterize", () => {
  it("spans 0..1 and is monotonic", () => {
    const u = parameterize([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(u[0]).toBe(0);
    expect(u[u.length - 1]).toBeCloseTo(1, 9);
    // Chords are 1 and 2, so the middle point sits at 1/3 of the total.
    expect(u[1]).toBeCloseTo(1 / 3, 9);
  });
});

describe("fitRing", () => {
  it("turns a sampled circle into a handful of curve segments", () => {
    const fitted = fitRing(circlePoints(50, 50, 40), 0.2);
    expect(fitted).not.toBeNull();
    expect(fitted!.anchors.length).toBeLessThanOrEqual(12);
    expect(fitted!.anchors.length).toBeGreaterThanOrEqual(3);
  });

  it("stays close to the sampled circle", () => {
    const points = circlePoints(50, 50, 40);
    const fitted = fitRing(points, 0.2)!;
    // Tolerance is 0.2; the slack covers sampling in the measurement.
    const deviation = maxDeviation(points, fitted);
    expect(deviation).toBeLessThan(0.35);
  });

  it("emits curve handles rather than only corners", () => {
    const fitted = fitRing(circlePoints(0, 0, 25), 0.2)!;
    const withHandles = fitted.anchors.filter((anchor) => anchor.in || anchor.out);
    expect(withHandles.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a rectangle crisp with four sharp corners", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ];
    const fitted = fitRing(square, 0.2)!;
    expect(fitted.anchors).toHaveLength(4);
    // A square has no curvature, so no handles are needed anywhere.
    expect(fitted.anchors.every((anchor) => !anchor.in && !anchor.out)).toBe(true);
  });

  it("preserves a rectangle's bounds", () => {
    const square = [
      { x: 5, y: 10 },
      { x: 105, y: 10 },
      { x: 105, y: 60 },
      { x: 5, y: 60 },
      { x: 5, y: 10 },
    ];
    const fitted = fitRing(square, 0.2)!;
    const bounds = subpathBounds([fitted]);
    expect(bounds.x).toBeCloseTo(5, 5);
    expect(bounds.y).toBeCloseTo(10, 5);
    expect(bounds.w).toBeCloseTo(100, 5);
    expect(bounds.h).toBeCloseTo(50, 5);
  });

  it("smooths a staircase into curves within tolerance", () => {
    const points = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = (i / 24) * (Math.PI / 2);
      points.push({ x: 50 + 50 * Math.cos(t), y: 50 - 50 * Math.sin(t) });
    }
    points.push(points[0]);

    const fitted = fitRing(points, 0.15)!;
    expect(fitted.anchors.length).toBeLessThan(points.length / 2);
    expect(maxDeviation(points, fitted)).toBeLessThan(0.5);
  });

  it("closes the loop so the last segment joins the first anchor", () => {
    const fitted = fitRing(circlePoints(0, 0, 10), 0.2)!;
    expect(fitted.closed).toBe(true);
    expect(fitted.anchors[0].in).toBeDefined();
  });

  it("returns null for degenerate rings", () => {
    expect(fitRing([], 0.2)).toBeNull();
    expect(fitRing([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0.2)).toBeNull();
  });

  it("is deterministic", () => {
    const points = circlePoints(10, 20, 15);
    expect(JSON.stringify(fitRing(points, 0.2))).toBe(JSON.stringify(fitRing(points, 0.2)));
  });
});

describe("fitSubpaths", () => {
  it("fits closed subpaths and leaves open ones untouched", () => {
    const open: SubPath = {
      closed: false,
      anchors: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 }],
    };
    const closed = rectSubpaths(0, 0, 10, 10)[0];
    const result = fitSubpaths([open, closed, ...ellipseSubpaths(50, 50, 20, 20)], 0.2);

    expect(result[0]).toBe(open);
    expect(result[1].anchors.length).toBeLessThanOrEqual(4);
    expect(result[2].closed).toBe(true);
  });

  it("lowers node counts on a flattened circle", () => {
    const flat: SubPath = {
      closed: true,
      anchors: samplePath(ellipseSubpaths(0, 0, 40, 40), 24).map((point) => ({
        x: point.x,
        y: point.y,
      })),
    };
    const before = flat.anchors.length;
    const after = fitSubpaths([flat], 0.2)[0].anchors.length;
    expect(after).toBeLessThan(before / 3);
  });

  it("keeps fitted curves faithful enough for engraving", () => {
    const source = ellipseSubpaths(0, 0, 30, 30);
    const flat: SubPath = {
      closed: true,
      anchors: samplePath(source, 12).map((point) => ({ x: point.x, y: point.y })),
    };
    const fitted = fitSubpaths([flat], 0.2)[0];
    for (const anchor of fitted.anchors) {
      expect(Math.hypot(anchor.x, anchor.y)).toBeCloseTo(30, 1);
    }
  });
});

describe("cubicAt", () => {
  it("interpolates between the endpoints", () => {
    const point = cubicAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, 0.5);
    expect(point.x).toBeCloseTo(5, 6);
  });

  it("hits the endpoints at the extremes", () => {
    const start = cubicAt({ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }, { x: 7, y: 8 }, 0);
    expect(start).toMatchObject({ x: 1, y: 2 });
  });
});
