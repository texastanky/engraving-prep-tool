import { describe, expect, it } from "vitest";
import { subpathsFromBinaryGrid, traceBinaryContours } from "./text-outline.ts";
import { subpathsArea } from "./vector-boolean.ts";
import { subpathBounds } from "./vector-path.ts";

/** Build a grid from ASCII art: '#' is foreground. */
function grid(rows: string[]) {
  const height = rows.length;
  const width = rows[0].length;
  const binary = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      binary[y * width + x] = row[x] === "#" ? 1 : 0;
    }
  });
  return { binary, width, height };
}

describe("traceBinaryContours", () => {
  it("traces a single pixel as a four corner square", () => {
    const { binary, width, height } = grid(["#."]);
    const rings = traceBinaryContours(binary, width, height);
    expect(rings).toHaveLength(1);
    // Four corners plus the repeated closing point.
    expect(rings[0]).toHaveLength(5);
  });

  it("traces a solid block as one contour", () => {
    const { binary, width, height } = grid(["###", "###", "###"]);
    expect(traceBinaryContours(binary, width, height)).toHaveLength(1);
  });

  it("traces a ring as an outer contour plus a hole", () => {
    const { binary, width, height } = grid([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    expect(traceBinaryContours(binary, width, height)).toHaveLength(2);
  });

  it("traces two separate blobs as two contours", () => {
    const { binary, width, height } = grid(["#.#"]);
    expect(traceBinaryContours(binary, width, height)).toHaveLength(2);
  });

  it("returns nothing for an empty grid", () => {
    const { binary, width, height } = grid(["...", "..."]);
    expect(traceBinaryContours(binary, width, height)).toHaveLength(0);
  });

  it("copes with a shape touching the grid edge", () => {
    const { binary, width, height } = grid(["##", "##"]);
    const rings = traceBinaryContours(binary, width, height);
    expect(rings).toHaveLength(1);
    // A 2x2 block has a perimeter of 8 unit edges, so 8 distinct corners.
    expect(rings[0]).toHaveLength(9);
  });
});

describe("subpathsFromBinaryGrid", () => {
  it("measures a solid block accurately", () => {
    const { binary, width, height } = grid(["####", "####", "####", "####"]);
    const subpaths = subpathsFromBinaryGrid(binary, width, height, { tolerance: 0 });
    expect(subpaths).toHaveLength(1);
    expect(subpathsArea(subpaths)).toBeCloseTo(16, 3);
  });

  it("subtracts a hole from the filled area", () => {
    // 5x5 block with a 3x3 hole => 25 - 9 = 16.
    const { binary, width, height } = grid([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const subpaths = subpathsFromBinaryGrid(binary, width, height, { tolerance: 0 });
    expect(subpaths).toHaveLength(2);
    expect(subpathsArea(subpaths)).toBeCloseTo(16, 3);
  });

  it("applies scale and offset", () => {
    const { binary, width, height } = grid(["##", "##"]);
    const subpaths = subpathsFromBinaryGrid(binary, width, height, {
      tolerance: 0,
      scale: 0.5,
      offset: { x: 10, y: 20 },
    });
    const bounds = subpathBounds(subpaths);
    // Tolerance covers the curve refit, which may move an edge fractionally.
    expect(bounds.x).toBeCloseTo(10, 1);
    expect(bounds.y).toBeCloseTo(20, 1);
    expect(bounds.w).toBeCloseTo(1, 1);
    expect(bounds.h).toBeCloseTo(1, 1);
  });

  it("simplifies a long staircase without losing the shape", () => {
    // A diagonal edge: simplification should cut the vertex count hard.
    const rows = Array.from({ length: 12 }, (_, y) => ".".repeat(11 - y) + "#".repeat(y + 1));
    const { binary, width, height } = grid(rows);
    const detailed = subpathsFromBinaryGrid(binary, width, height, { tolerance: 0 });
    const simplified = subpathsFromBinaryGrid(binary, width, height, { tolerance: 1.5 });

    const detailedPoints = detailed[0].anchors.length;
    const simplifiedPoints = simplified[0].anchors.length;
    expect(simplifiedPoints).toBeLessThan(detailedPoints);

    // The area of a triangle with 12 steps is close in both cases.
    const detailedArea = subpathsArea(detailed);
    const simplifiedArea = subpathsArea(simplified);
    expect(simplifiedArea).toBeGreaterThan(detailedArea * 0.9);
    expect(simplifiedArea).toBeLessThan(detailedArea * 1.1);
  });

  it("produces closed subpaths", () => {
    const { binary, width, height } = grid(["###", "#.#", "###"]);
    for (const subpath of subpathsFromBinaryGrid(binary, width, height, { tolerance: 0 })) {
      expect(subpath.closed).toBe(true);
    }
  });

  it("returns nothing when there is nothing to trace", () => {
    const { binary, width, height } = grid(["..", ".."]);
    expect(subpathsFromBinaryGrid(binary, width, height)).toEqual([]);
  });
});
