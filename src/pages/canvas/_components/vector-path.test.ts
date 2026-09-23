import { describe, expect, it } from "vitest";
import {
  ellipseSubpaths,
  hitTestObject,
  lineSubpaths,
  longAxisAngle,
  objectBounds,
  objectFromSubpaths,
  objectCenter,
  polygonSubpaths,
  rectSubpaths,
  rotateSubpaths,
  samplePath,
  scaleSubpaths,
  starSubpaths,
  subpathBounds,
  toPathData,
  traceSubpaths,
  translateSubpaths,
} from "./vector-path.ts";

describe("path serialisation", () => {
  it("writes a closed rectangle", () => {
    expect(toPathData(rectSubpaths(0, 0, 10, 20))).toBe("M 0 0 L 10 0 L 10 20 L 0 20 Z");
  });

  it("writes an open polyline without a close marker", () => {
    expect(toPathData(lineSubpaths({ x: 1, y: 2 }, { x: 3, y: 4 }))).toBe("M 1 2 L 3 4");
  });

  it("uses cubic segments when handles are present", () => {
    const d = toPathData(ellipseSubpaths(50, 50, 10, 10));
    expect(d.startsWith("M 50 40")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(4);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("rounds coordinates to three decimals", () => {
    const d = toPathData(lineSubpaths({ x: 0.123456, y: 1 }, { x: 2, y: 2 }));
    expect(d).toContain("0.123");
    expect(d).not.toContain("0.1234");
  });
});

describe("traceSubpaths", () => {
  function recorder() {
    const ops: string[] = [];
    return {
      ops,
      ctx: {
        moveTo: (x: number, y: number) => ops.push(`M ${x} ${y}`),
        lineTo: (x: number, y: number) => ops.push(`L ${x} ${y}`),
        bezierCurveTo: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) =>
          ops.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`),
        closePath: () => ops.push("Z"),
      },
    };
  }

  it("traces a closed rectangle", () => {
    const { ops, ctx } = recorder();
    traceSubpaths(ctx, rectSubpaths(0, 0, 10, 10));
    // The closing segment comes from closePath(), not an extra lineTo.
    expect(ops).toEqual(["M 0 0", "L 10 0", "L 10 10", "L 0 10", "Z"]);
  });

  it("scales coordinates into the target space", () => {
    const { ops, ctx } = recorder();
    traceSubpaths(ctx, lineSubpaths({ x: 1, y: 2 }, { x: 3, y: 4 }), 2, 10);
    expect(ops).toEqual(["M 2 20", "L 6 40"]);
  });

  it("emits bezier segments for curved shapes", () => {
    const { ops, ctx } = recorder();
    traceSubpaths(ctx, ellipseSubpaths(50, 50, 10, 10));
    expect(ops.filter((op) => op.startsWith("C"))).toHaveLength(4);
    expect(ops.at(-1)).toBe("Z");
  });
});

describe("bounds", () => {
  it("measures a rectangle", () => {
    expect(objectBounds(objectFromSubpaths("Rect", rectSubpaths(5, 10, 20, 30)))).toEqual({
      x: 5,
      y: 10,
      w: 20,
      h: 30,
    });
  });

  it("includes control handles for curved paths", () => {
    const bounds = subpathBounds(ellipseSubpaths(0, 0, 10, 10));
    // Handles extend beyond the anchors, so the hull is at least the radii.
    expect(bounds.w).toBeGreaterThanOrEqual(20);
    expect(bounds.h).toBeGreaterThanOrEqual(20);
  });

  it("returns an empty box for a path with no anchors", () => {
    expect(subpathBounds([{ closed: false, anchors: [] }])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("finds the centre", () => {
    expect(objectCenter(objectFromSubpaths("Rect", rectSubpaths(0, 0, 10, 20)))).toEqual({
      x: 5,
      y: 10,
    });
  });
});

describe("transforms", () => {
  const square = rectSubpaths(0, 0, 10, 10);

  it("translates anchors", () => {
    expect(objectBounds(objectFromSubpaths("R", translateSubpaths(square, 5, -2)))).toEqual({
      x: 5,
      y: -2,
      w: 10,
      h: 10,
    });
  });

  it("scales about an origin", () => {
    const scaled = scaleSubpaths(square, { x: 0, y: 0 }, 2, 3);
    expect(objectBounds(objectFromSubpaths("R", scaled))).toEqual({ x: 0, y: 0, w: 20, h: 30 });
  });

  it("rotates 90 degrees about the centre", () => {
    // A wide box becomes tall when rotated a quarter turn.
    const rotated = rotateSubpaths(rectSubpaths(0, 0, 40, 10), { x: 20, y: 5 }, 90);
    const bounds = objectBounds(objectFromSubpaths("R", rotated));
    expect(bounds.w).toBeCloseTo(10, 5);
    expect(bounds.h).toBeCloseTo(40, 5);
    expect(bounds.x + bounds.w / 2).toBeCloseTo(20, 5);
    expect(bounds.y + bounds.h / 2).toBeCloseTo(5, 5);
  });

  it("keeps scaling exact for curves (affine transform of control points)", () => {
    const ellipse = ellipseSubpaths(0, 0, 10, 5);
    const scaled = scaleSubpaths(ellipse, { x: 0, y: 0 }, 2, 1);
    const original = ellipse[0].anchors[1];
    const moved = scaled[0].anchors[1];
    expect(moved.x).toBeCloseTo(original.x * 2, 6);
    expect(moved.y).toBeCloseTo(original.y, 6);
  });
});

describe("shape builders", () => {
  it("builds polygons with the requested side count", () => {
    expect(polygonSubpaths(0, 0, 10, 6)[0].anchors).toHaveLength(6);
    // Sides below 3 are clamped so the shape stays a polygon.
    expect(polygonSubpaths(0, 0, 10, 1)[0].anchors).toHaveLength(3);
  });

  it("builds stars with alternating radii", () => {
    const star = starSubpaths(0, 0, 10, 5)[0];
    expect(star.anchors).toHaveLength(10);
    const outer = Math.hypot(star.anchors[0].x, star.anchors[0].y);
    const inner = Math.hypot(star.anchors[1].x, star.anchors[1].y);
    expect(outer).toBeCloseTo(10, 5);
    expect(inner).toBeCloseTo(4.2, 5);
  });

  it("closes generated shapes but not lines", () => {
    expect(rectSubpaths(0, 0, 1, 1)[0].closed).toBe(true);
    expect(lineSubpaths({ x: 0, y: 0 }, { x: 1, y: 1 })[0].closed).toBe(false);
  });

  it("keeps the closing curve when the last segment is curved", () => {
    // Dropping the final segment is only safe when it is a straight line.
    const d = toPathData(ellipseSubpaths(0, 0, 10, 10));
    expect(d.match(/C/g)).toHaveLength(4);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("hit testing", () => {
  const object = objectFromSubpaths("Rect", rectSubpaths(10, 10, 20, 20));

  it("hits inside the bounds", () => {
    expect(hitTestObject(object, { x: 20, y: 20 })).toBe(true);
  });

  it("misses well outside the bounds", () => {
    expect(hitTestObject(object, { x: 100, y: 100 })).toBe(false);
  });

  it("allows a small padding so thin lines are still clickable", () => {
    const line = objectFromSubpaths("Line", lineSubpaths({ x: 10, y: 10 }, { x: 10, y: 40 }));
    expect(hitTestObject(line, { x: 14, y: 25 })).toBe(true);
  });
});

describe("samplePath", () => {
  it("starts at the first anchor", () => {
    const points = samplePath(lineSubpaths({ x: 1, y: 1 }, { x: 5, y: 1 }), 4);
    expect(points[0]).toEqual({ x: 1, y: 1 });
  });

  it("ends at the final anchor for an open path", () => {
    const points = samplePath(lineSubpaths({ x: 0, y: 0 }, { x: 10, y: 0 }), 4);
    const last = points.at(-1);
    expect(last?.x).toBeCloseTo(10, 5);
    expect(last?.y).toBeCloseTo(0, 5);
  });
});

describe("longAxisAngle", () => {
  const rotatedRect = (degrees: number, w = 200, h = 60) => {
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ].map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  };

  it("reads zero for a part already square to the bed", () => {
    expect(longAxisAngle(rotatedRect(0))).toBeCloseTo(0, 6);
  });

  it("reads the tilt of a part lying at an angle", () => {
    expect(longAxisAngle(rotatedRect(30))).toBeCloseTo(30, 6);
    expect(longAxisAngle(rotatedRect(-12.5))).toBeCloseTo(-12.5, 6);
  });

  it("folds a part at 150 degrees onto the same line as -30", () => {
    expect(longAxisAngle(rotatedRect(150))).toBeCloseTo(-30, 6);
  });

  it("ignores stray points that do not change the outline", () => {
    const withNoise = [...rotatedRect(20), { x: 50, y: 12 }, { x: 120, y: 20 }];
    expect(longAxisAngle(withNoise)).toBeCloseTo(20, 6);
  });

  it("has no opinion about a square part", () => {
    expect(longAxisAngle(rotatedRect(0, 100, 100))).toBeNull();
    expect(longAxisAngle(rotatedRect(45, 90, 88))).toBeNull();
  });

  it("needs a shape to measure", () => {
    expect(longAxisAngle([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeNull();
  });
});
