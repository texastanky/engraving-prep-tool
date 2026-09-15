import { describe, expect, it } from "vitest";
import {
  ellipseSubpaths,
  moveAnchor,
  moveHandle,
  nearestPointOnPath,
  rectSubpaths,
  removeAnchor,
  samplePath,
  splitSegment,
  toPathData,
} from "./vector-path.ts";

describe("nearestPointOnPath", () => {
  it("finds a point on a straight edge", () => {
    const hit = nearestPointOnPath(rectSubpaths(0, 0, 100, 100), { x: 50, y: -3 });
    expect(hit).not.toBeNull();
    expect(hit?.subpathIndex).toBe(0);
    expect(hit?.segmentIndex).toBe(0); // top edge
    expect(hit?.t).toBeCloseTo(0.5, 1);
    expect(hit?.distance).toBeCloseTo(3, 0);
  });

  it("identifies the correct segment of a rectangle", () => {
    // Right edge runs from (100,0) to (100,100).
    const hit = nearestPointOnPath(rectSubpaths(0, 0, 100, 100), { x: 103, y: 50 });
    expect(hit?.segmentIndex).toBe(1);
  });

  it("reports distance so callers can ignore far clicks", () => {
    const hit = nearestPointOnPath(rectSubpaths(0, 0, 10, 10), { x: 500, y: 500 });
    expect(hit?.distance).toBeGreaterThan(100);
  });

  it("returns null for an empty path", () => {
    expect(nearestPointOnPath([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("splitSegment", () => {
  it("keeps a straight edge straight and adds one node", () => {
    const split = splitSegment(rectSubpaths(0, 0, 100, 100), 0, 0, 0.5);
    expect(split[0].anchors).toHaveLength(5);
    // The new node sits at the midpoint of the top edge.
    expect(split[0].anchors[1].x).toBeCloseTo(50, 5);
    expect(split[0].anchors[1].y).toBeCloseTo(0, 5);
  });

  it("does not change the shape of the curve", () => {
    const before = ellipseSubpaths(50, 50, 30, 20);
    const after = splitSegment(before, 0, 0, 0.37);

    // Sample both and compare: a de Casteljau split is shape-preserving.
    const beforePoints = samplePath(before, 64);
    const afterPoints = samplePath(after, 64);

    for (const point of beforePoints) {
      const nearest = Math.min(
        ...afterPoints.map((other) => Math.hypot(other.x - point.x, other.y - point.y))
      );
      expect(nearest).toBeLessThan(0.35);
    }
  });

  it("adds exactly one node to the requested subpath only", () => {
    const two = [
      ...rectSubpaths(0, 0, 10, 10),
      ...rectSubpaths(50, 50, 10, 10),
    ];
    const split = splitSegment(two, 1, 0, 0.5);
    expect(split[0].anchors).toHaveLength(4);
    expect(split[1].anchors).toHaveLength(5);
  });

  it("clamps the parameter so a duplicate node is never inserted", () => {
    const split = splitSegment(rectSubpaths(0, 0, 100, 100), 0, 0, 1);
    const inserted = split[0].anchors[1];
    expect(inserted.x).toBeLessThan(100);
  });
});

describe("removeAnchor", () => {
  it("removes the chosen node", () => {
    const after = removeAnchor(rectSubpaths(0, 0, 100, 100), 0, 1);
    expect(after[0].anchors).toHaveLength(3);
    expect(after[0].anchors.some((anchor) => anchor.x === 100 && anchor.y === 0)).toBe(false);
  });

  it("clears the handle left dangling by the removal", () => {
    const curved = ellipseSubpaths(50, 50, 30, 30);
    const after = removeAnchor(curved, 0, 1);
    expect(after[0].anchors[0].out).toBeUndefined();
  });

  it("drops a subpath that would become degenerate", () => {
    const line = [{ closed: false, anchors: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }];
    expect(removeAnchor(line, 0, 0)).toHaveLength(0);
  });
});

describe("moveAnchor", () => {
  it("moves the node and carries its handles along", () => {
    const curved = ellipseSubpaths(50, 50, 30, 30);
    const before = curved[0].anchors[0];
    const after = moveAnchor(curved, 0, 0, 10, -5)[0].anchors[0];

    expect(after.x).toBeCloseTo(before.x + 10, 5);
    expect(after.y).toBeCloseTo(before.y - 5, 5);
    expect(after.in?.x).toBeCloseTo((before.in?.x ?? 0) + 10, 5);
    expect(after.out?.y).toBeCloseTo((before.out?.y ?? 0) - 5, 5);
  });

  it("leaves other nodes alone", () => {
    const after = moveAnchor(rectSubpaths(0, 0, 10, 10), 0, 0, 100, 100);
    expect(after[0].anchors[1]).toEqual({ x: 10, y: 0 });
  });
});

describe("moveHandle", () => {
  it("moves one handle without moving the anchor", () => {
    const after = moveHandle(rectSubpaths(0, 0, 10, 10), 0, 0, "out", { x: 5, y: -5 });
    expect(after[0].anchors[0]).toMatchObject({ x: 0, y: 0, out: { x: 5, y: -5 } });
  });

  it("introduces curvature into the path data", () => {
    const after = moveHandle(rectSubpaths(0, 0, 10, 10), 0, 0, "out", { x: 5, y: -5 });
    expect(toPathData(after)).toContain("C");
  });
});
