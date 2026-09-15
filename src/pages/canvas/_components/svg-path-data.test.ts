import { describe, expect, it } from "vitest";
import { arcToCubics, parsePathData, tokenizePathData } from "./svg-path-data.ts";
import { samplePath } from "./vector-path.ts";

describe("tokenizePathData", () => {
  it("splits commands from numbers", () => {
    expect(tokenizePathData("M 0 0 L 10 10")).toEqual([
      { type: "command", value: "M" },
      { type: "number", value: 0 },
      { type: "number", value: 0 },
      { type: "command", value: "L" },
      { type: "number", value: 10 },
      { type: "number", value: 10 },
    ]);
  });

  it("handles commas, tight separators and negative numbers", () => {
    const values = tokenizePathData("M0,0L-5.5,-10.25")
      .filter((token) => token.type === "number")
      .map((token) => token.value);
    expect(values).toEqual([0, 0, -5.5, -10.25]);
  });

  it("handles exponents", () => {
    const values = tokenizePathData("L 1e2 2.5e-1")
      .filter((token) => token.type === "number")
      .map((token) => token.value);
    expect(values).toEqual([100, 0.25]);
  });
});

describe("parsePathData", () => {
  it("parses a straight closed rectangle", () => {
    const subpaths = parsePathData("M 0 0 H 10 V 10 H 0 Z");
    expect(subpaths).toHaveLength(1);
    expect(subpaths[0].closed).toBe(true);
    expect(subpaths[0].anchors.map((a) => [a.x, a.y])).toEqual([
      [0, 0], [10, 0], [10, 10], [0, 10],
    ]);
  });

  it("drops a duplicated final anchor when closing", () => {
    const subpaths = parsePathData("M 0 0 L 10 0 L 10 10 L 0 0 Z");
    expect(subpaths[0].anchors).toHaveLength(3);
    expect(subpaths[0].closed).toBe(true);
  });

  it("treats extra coordinate pairs after M as line commands", () => {
    const subpaths = parsePathData("M 0 0 5 5 10 0");
    expect(subpaths[0].anchors.map((a) => [a.x, a.y])).toEqual([[0, 0], [5, 5], [10, 0]]);
  });

  it("supports relative commands", () => {
    const subpaths = parsePathData("m 10 10 l 5 0 v 5");
    expect(subpaths[0].anchors.map((a) => [a.x, a.y])).toEqual([[10, 10], [15, 10], [15, 15]]);
  });

  it("attaches cubic handles to the right anchors", () => {
    const subpaths = parsePathData("M 0 0 C 10 0 20 10 20 20");
    const [first, second] = subpaths[0].anchors;
    expect(first.out).toEqual({ x: 10, y: 0 });
    expect(second.in).toEqual({ x: 20, y: 10 });
    expect([second.x, second.y]).toEqual([20, 20]);
  });

  it("reflects the control point for a smooth curve", () => {
    const subpaths = parsePathData("M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0");
    const anchors = subpaths[0].anchors;
    // S mirrors the previous control point about the cursor, which sits at
    // (10,0) after the C: 2*(10,0) - (10,10) = (10,-10).
    expect(anchors[1].out).toEqual({ x: 10, y: -10 });
    // Its own control point is taken verbatim from the data.
    expect(anchors[2].in).toEqual({ x: 20, y: -10 });
  });

  it("elevates quadratic curves to cubics", () => {
    const subpaths = parsePathData("M 0 0 Q 10 0 10 10");
    const anchors = subpaths[0].anchors;
    // c1 = p0 + 2/3 (q - p0) = (6.667, 0), c2 = p2 + 2/3 (q - p2) = (10, 3.333)
    expect(anchors[0].out?.x).toBeCloseTo(6.6667, 3);
    expect(anchors[0].out?.y).toBeCloseTo(0, 5);
    expect(anchors[1].in?.x).toBeCloseTo(10, 5);
    expect(anchors[1].in?.y).toBeCloseTo(3.3333, 3);
  });

  it("converts arcs into curves that stay on the circle", () => {
    const subpaths = parsePathData("M 0 0 A 5 5 0 1 0 10 0 A 5 5 0 1 0 0 0 Z");
    const points = samplePath(subpaths, 16);
    // Every sampled point should sit ~5px from the circle centre (5, 0).
    const radii = points.map((p) => Math.hypot(p.x - 5, p.y));
    for (const radius of radii) expect(radius).toBeCloseTo(5, 1);
  });

  it("handles multiple subpaths", () => {
    const subpaths = parsePathData("M 0 0 L 10 0 Z M 20 0 L 30 0 Z");
    expect(subpaths).toHaveLength(2);
    expect(subpaths[1].anchors[0].x).toBe(20);
  });

  it("returns nothing for empty or junk data", () => {
    expect(parsePathData("")).toEqual([]);
    expect(parsePathData("not a path")).toEqual([]);
  });
});

describe("arcToCubics", () => {
  it("splits a large arc into no more than 90 degree segments", () => {
    const segments = arcToCubics({ x: 0, y: 0 }, 10, 10, 0, true, true, { x: 0, y: 20 });
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.length).toBeLessThanOrEqual(4);
  });

  it("degenerates to a straight line when a radius is zero", () => {
    const segments = arcToCubics({ x: 0, y: 0 }, 0, 0, 0, false, true, { x: 10, y: 0 });
    expect(segments).toHaveLength(1);
    expect(segments[0].end).toEqual({ x: 10, y: 0 });
  });
});
