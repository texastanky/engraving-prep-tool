import { describe, expect, it } from "vitest";
import {
  booleanSubpaths,
  flattenSubpaths,
  offsetSubpaths,
  regionToSubpaths,
  subpathsArea,
} from "./vector-boolean.ts";
import {
  ellipseSubpaths,
  rectSubpaths,
  subpathBounds,
  type SubPath,
} from "./vector-path.ts";

const square = (x: number, y: number, size: number): SubPath[] => rectSubpaths(x, y, size, size);

describe("flattenSubpaths", () => {
  it("closes a ring and drops the duplicated final point", () => {
    const rings = flattenSubpaths(rectSubpaths(0, 0, 10, 10));
    expect(rings).toHaveLength(1);
    const ring = rings[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(5);
  });

  it("samples curves finely enough to follow them", () => {
    const rings = flattenSubpaths(ellipseSubpaths(50, 50, 40, 40));
    for (const [x, y] of rings[0]) {
      expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(40, 1);
    }
  });

  it("closes an open subpath so it can take part in booleans", () => {
    const open: SubPath[] = [
      { closed: false, anchors: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
    ];
    const rings = flattenSubpaths(open);
    expect(rings).toHaveLength(1);
    expect(rings[0].length).toBeGreaterThanOrEqual(4);
  });
});

describe("booleanSubpaths", () => {
  const a = square(0, 0, 100);
  const b = square(50, 50, 100);

  it("unions two overlapping squares", () => {
    // Two 100x100 squares overlapping by 50x50 => 17500.
    expect(subpathsArea(booleanSubpaths(a, b, "union"))).toBeCloseTo(17500, 0);
  });

  it("intersects two overlapping squares", () => {
    expect(subpathsArea(booleanSubpaths(a, b, "intersection"))).toBeCloseTo(2500, 0);
  });

  it("subtracts the second shape from the first", () => {
    const result = booleanSubpaths(a, b, "difference");
    expect(subpathsArea(result)).toBeCloseTo(7500, 0);
  });

  it("excludes the overlap", () => {
    expect(subpathsArea(booleanSubpaths(a, b, "exclude"))).toBeCloseTo(15000, 0);
  });

  it("keeps disjoint shapes separate when unioned", () => {
    const result = booleanSubpaths(square(0, 0, 10), square(100, 100, 10), "union");
    expect(result.length).toBe(2);
    expect(subpathsArea(result)).toBeCloseTo(200, 0);
  });

  it("returns nothing when disjoint shapes are intersected", () => {
    expect(booleanSubpaths(square(0, 0, 10), square(100, 100, 10), "intersection")).toEqual([]);
  });

  it("produces closed paths", () => {
    for (const subpath of booleanSubpaths(a, b, "union")) {
      expect(subpath.closed).toBe(true);
      expect(subpath.anchors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("honours holes in the input via even-odd filling", () => {
    // Outer 100x100 with a 40x40 hole: 10000 - 1600.
    const withHole = [...rectSubpaths(0, 0, 100, 100), ...rectSubpaths(30, 30, 40, 40)];
    expect(subpathsArea(withHole)).toBeCloseTo(8400, 0);

    // Cutting inside the hole removes no material.
    expect(subpathsArea(booleanSubpaths(withHole, square(40, 40, 10), "difference")))
      .toBeCloseTo(8400, 0);
  });
});

describe("offsetSubpaths", () => {
  it("grows a square outward by the requested distance", () => {
    const bounds = subpathBounds(offsetSubpaths(square(0, 0, 100), 10));
    expect(bounds.x).toBeCloseTo(-10, 1);
    expect(bounds.y).toBeCloseTo(-10, 1);
    expect(bounds.w).toBeCloseTo(120, 1);
  });

  it("shrinks a square inward by the requested distance", () => {
    const bounds = subpathBounds(offsetSubpaths(square(0, 0, 100), -10));
    expect(bounds.x).toBeCloseTo(10, 1);
    expect(bounds.w).toBeCloseTo(80, 1);
  });

  it("rounds the corners rather than producing mitre spikes", () => {
    const area = subpathsArea(offsetSubpaths(square(0, 0, 100), 10));
    // A true rounded square would be 14314; the corner discs are 12-gons, so the
    // result sits just under that. Either way it must be short of the mitred
    // 14400 — the point is that corners are rounded, not spiked.
    expect(area).toBeLessThan(14400);
    expect(area).toBeGreaterThan(14250);
  });

  it("treats growing and eroding as symmetric operations", () => {
    const grown = subpathBounds(offsetSubpaths(square(0, 0, 100), 10));
    const eroded = subpathBounds(offsetSubpaths(square(0, 0, 100), -10));
    expect(grown.w - 100).toBeCloseTo(100 - eroded.w, 1);
  });

  it("shrinks a hole when growing the material around it", () => {
    const withHole = [...rectSubpaths(0, 0, 100, 100), ...rectSubpaths(30, 30, 40, 40)];
    expect(subpathsArea(offsetSubpaths(withHole, 5))).toBeGreaterThan(subpathsArea(withHole));
  });

  it("offsets a circle outward into a circle", () => {
    const grown = offsetSubpaths(ellipseSubpaths(0, 0, 50, 50), 10, 0.1);
    for (const subpath of grown) {
      for (const anchor of subpath.anchors) {
        expect(Math.hypot(anchor.x, anchor.y)).toBeGreaterThanOrEqual(59);
        expect(Math.hypot(anchor.x, anchor.y)).toBeLessThanOrEqual(61);
      }
    }
  });

  it("is a no-op for a zero offset", () => {
    const original = square(0, 0, 10);
    expect(offsetSubpaths(original, 0)).toBe(original);
  });

  it("collapses to nothing when eroding past the shape's half width", () => {
    expect(subpathsArea(offsetSubpaths(square(0, 0, 20), -15))).toBeCloseTo(0, 1);
  });
});

describe("regionToSubpaths", () => {
  it("drops degenerate results", () => {
    expect(regionToSubpaths([])).toEqual([]);
    expect(regionToSubpaths([[[[0, 0], [1, 1], [0, 0]]]])).toEqual([]);
  });
});
