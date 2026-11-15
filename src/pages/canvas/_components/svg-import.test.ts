import { describe, expect, it } from "vitest";
import { importSvgAsVectors, multiply, parseTransform, shapeToPathData } from "./svg-import.ts";
import { objectBounds, subpathBounds, objectFromSubpaths, rectSubpaths } from "./vector-path.ts";
import { buildVectorSvg } from "./vector-export.ts";

const BOX = { x: 0, y: 0, w: 200, h: 200 };

describe("actual-size SVG placement", () => {
  const options = {
    targetBox: { x: 0, y: 0, w: 1200, h: 720 },
    materialSizeIn: { width: 5, height: 3 },
  };

  it.each(["5in", "5.in", "12.7cm", "127mm", "360pt", "30pc", "480px", "480"])(
    "honors document width %s and keeps the document origin", (width) => {
      const result = importSvgAsVectors(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="3in" viewBox="0 0 500 300">
        <rect x="100" y="50" width="200" height="100" fill="#000"/></svg>`, options);
      expect(result.actualSize).toBe(true);
      expect(result.warnings).toEqual([]);
      const bounds = objectBounds(result.objects[0]);
      expect(bounds.x).toBeCloseTo(240);
      expect(bounds.y).toBeCloseTo(120);
      expect(bounds.w).toBeCloseTo(480);
      expect(bounds.h).toBeCloseTo(240);
    },
  );

  it("maps pixels at 96 dpi when the SVG has no viewBox", () => {
    const result = importSvgAsVectors(`<svg width="2in" height="1in"><rect x="48" y="24" width="96" height="48"/></svg>`, options);
    expect(objectBounds(result.objects[0])).toMatchObject({ x: 120, y: 60, w: 240, h: 120 });
  });

  it.each([
    ["xMidYMid meet", 250, 500],
    ["xMinYMax meet", 500, 500],
    ["none", 0, 1000],
  ])("preserves viewBox origin and %s alignment", (aspect, y, h) => {
    const result = importSvgAsVectors(`<svg width="100mm" height="100mm" viewBox="10 20 100 50" preserveAspectRatio="${aspect}">
      <rect x="10" y="20" width="100" height="50"/></svg>`, {
      targetBox: { x: 0, y: 0, w: 1000, h: 1000 }, materialSizeIn: { width: 100 / 25.4, height: 100 / 25.4 },
    });
    const bounds = objectBounds(result.objects[0]);
    expect(bounds.x).toBeCloseTo(0);
    expect(bounds.y).toBeCloseTo(y);
    expect(bounds.w).toBeCloseTo(1000);
    expect(bounds.h).toBeCloseTo(h);
  });

  it("infers a missing physical dimension from the viewBox aspect", () => {
    const result = importSvgAsVectors(`<svg width="5in" viewBox="0 0 500 300"><rect x="100" y="50" width="200" height="100"/></svg>`, options);
    expect(result.actualSize).toBe(true);
    expect(objectBounds(result.objects[0]).w).toBeCloseTo(480);
  });

  it("fits unmeasured artwork with an explicit warning instead of claiming actual size", () => {
    const result = importSvgAsVectors(`<svg viewBox="0 0 100 50"><rect width="100" height="50"/></svg>`, options);
    expect(result.actualSize).not.toBe(true);
    expect(result.warnings.join(" ")).toMatch(/no supported absolute document size/);
    expect(objectBounds(result.objects[0]).w).toBeCloseTo(1200);
  });

  it("does not infer an absolute size from a percentage or unsupported unit", () => {
    for (const width of ["100%", "5em"]) {
      const result = importSvgAsVectors(`<svg width="${width}" height="3in" viewBox="0 0 500 300">
        <rect width="500" height="300"/></svg>`, options);
      expect(result.actualSize).not.toBe(true);
      expect(result.warnings.join(" ")).toMatch(/no supported absolute document size/);
    }
  });

  it("keeps oversized artwork at its declared size and warns instead of silently shrinking it", () => {
    const result = importSvgAsVectors(`<svg width="10in" height="6in" viewBox="0 0 100 60"><rect width="100" height="60"/></svg>`, options);
    expect(objectBounds(result.objects[0]).w).toBeCloseTo(2400);
    expect(result.warnings.join(" ")).toMatch(/extends beyond the material/);
  });

  it("keeps nested transforms, operation groups and physical stroke width", () => {
    const result = importSvgAsVectors(`<svg width="5in" height="3in" viewBox="0 0 127 76.2">
      <g transform="translate(25.4 12.7)" data-operation="score">
        <path d="M0 0h25.4" fill="none" stroke="blue" stroke-width="0.1"/>
      </g></svg>`, options);
    expect(result.objects[0].mode).toBe("score");
    expect(objectBounds(result.objects[0]).x).toBeCloseTo(240);
    expect(objectBounds(result.objects[0]).y).toBeCloseTo(120);
    expect(result.objects[0].strokeWidth / 240 * 25.4).toBeCloseTo(0.1);
  });

  it("round-trips an exported job at another canvas size without moving or enlarging the shapes", () => {
    const original = ["cut", "score", "engrave"].map((mode, index) => objectFromSubpaths(
      mode, rectSubpaths(75 + index * 90, 55 + index * 30, 70, 45),
      mode as "cut" | "score" | "engrave", 1.5,
    ));
    const exported = buildVectorSvg({
      objects: original, displayWidth: 612, displayHeight: 367, materialWidthIn: 5, materialHeightIn: 3,
    });
    const imported = importSvgAsVectors(exported.svg, {
      targetBox: { x: 0, y: 0, w: 820, h: 492 }, materialSizeIn: { width: 5, height: 3 },
    });
    expect(imported.actualSize).toBe(true);
    expect(imported.objects).toHaveLength(3);
    for (const object of original) {
      const before = objectBounds(object);
      const after = objectBounds(imported.objects.find((item) => item.mode === object.mode)!);
      expect(after.x / 820 * 127).toBeCloseTo(before.x / 612 * 127, 2);
      expect(after.y / 492 * 76.2).toBeCloseTo(before.y / 367 * 76.2, 2);
      expect(after.w / 820 * 127).toBeCloseTo(before.w / 612 * 127, 2);
      expect(after.h / 492 * 76.2).toBeCloseTo(before.h / 367 * 76.2, 2);
    }
  });
});

function parseOne(svg: string) {
  return new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
}

describe("parseTransform", () => {
  it("returns identity for missing or empty values", () => {
    expect(parseTransform(null)).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(parseTransform("")).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it("parses translate", () => {
    expect(parseTransform("translate(10 20)")).toMatchObject({ e: 10, f: 20 });
  });

  it("repeats the single scale argument", () => {
    expect(parseTransform("scale(2)")).toMatchObject({ a: 2, d: 2 });
    expect(parseTransform("scale(2 3)")).toMatchObject({ a: 2, d: 3 });
  });

  it("parses rotation about a point", () => {
    const matrix = parseTransform("rotate(90 10 10)");
    // The centre of rotation is a fixed point.
    const x = matrix.a * 10 + matrix.c * 10 + matrix.e;
    const y = matrix.b * 10 + matrix.d * 10 + matrix.f;
    expect(x).toBeCloseTo(10, 6);
    expect(y).toBeCloseTo(10, 6);
  });

  it("parses a raw matrix", () => {
    expect(parseTransform("matrix(1 0 0 1 5 6)")).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 6 });
  });

  it("composes multiple transforms in order", () => {
    const matrix = parseTransform("translate(10 0) scale(2)");
    // Point (1,0) is scaled first, then translated: 1*2 + 10 = 12.
    expect(matrix.a * 1 + matrix.e).toBeCloseTo(12, 6);
  });

  it("multiplies matrices as parent then child", () => {
    const result = multiply(
      { a: 1, b: 0, c: 0, d: 1, e: 10, f: 0 },
      { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }
    );
    expect(result).toMatchObject({ a: 2, d: 2, e: 10 });
  });
});

describe("shapeToPathData", () => {
  it("converts a plain rect", () => {
    const el = parseOne('<rect x="1" y="2" width="10" height="20" />');
    expect(shapeToPathData(el)).toBe("M 1 2 H 11 V 22 H 1 Z");
  });

  it("uses arcs for a rounded rect", () => {
    const el = parseOne('<rect x="0" y="0" width="20" height="10" rx="3" />');
    const data = shapeToPathData(el) || "";
    expect(data).toContain("A 3 3");
    expect(data.endsWith("Z")).toBe(true);
  });

  it("mirrors rx onto ry when only one is given", () => {
    const el = parseOne('<rect width="20" height="10" rx="3" />');
    expect(shapeToPathData(el)).toContain("A 3 3");
  });

  it("converts a circle into two arcs", () => {
    const el = parseOne('<circle cx="50" cy="50" r="10" />');
    const data = shapeToPathData(el) || "";
    expect((data.match(/A/g) || []).length).toBe(2);
  });

  it("converts polygons and polylines", () => {
    expect(shapeToPathData(parseOne('<polygon points="0,0 10,0 10,10" />'))).toBe("M 0 0 L 10 0 L 10 10 Z");
    expect(shapeToPathData(parseOne('<polyline points="0,0 10,0" />'))).toBe("M 0 0 L 10 0");
  });

  it("returns null for unsupported or degenerate elements", () => {
    expect(shapeToPathData(parseOne('<rect width="0" height="5" />'))).toBeNull();
    expect(shapeToPathData(parseOne("<g />"))).toBeNull();
  });
});

describe("importSvgAsVectors", () => {
  it("imports shapes and fits them into the target box", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <rect x="0" y="0" width="100" height="50" fill="#000" />
    </svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.objects).toHaveLength(1);

    const bounds = objectBounds(result.objects[0]);
    // A 2:1 source inside a square box: full width, half the height, centred.
    expect(bounds.w).toBeCloseTo(200, 3);
    expect(bounds.h).toBeCloseTo(100, 3);
    expect(bounds.x).toBeCloseTo(0, 3);
    expect(bounds.y).toBeCloseTo(50, 3);
  });

  it("detects engrave from a fill and cut from a stroke", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect width="10" height="10" fill="#f00" />
      <rect x="20" width="10" height="10" fill="none" stroke="#000" />
      <rect x="40" width="10" height="10" style="fill:none;stroke:#000" />
    </svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.objects.map((object) => object.mode)).toEqual(["engrave", "cut", "cut"]);
  });

  it("applies transforms from nested groups", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(10 0)">
        <g transform="scale(2)">
          <rect width="10" height="10" fill="#000" />
        </g>
      </g>
    </svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    // Source geometry is a 20x20 square at (10,0); it fills the square box.
    const bounds = objectBounds(result.objects[0]);
    expect(bounds.w).toBeCloseTo(200, 3);
    expect(bounds.h).toBeCloseTo(200, 3);
  });

  it("keeps relative positions of multiple shapes", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect width="10" height="10" fill="#000" />
      <rect x="10" y="0" width="10" height="10" fill="#000" />
    </svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.objects).toHaveLength(2);
    const [left, right] = result.objects.map(objectBounds);
    expect(right.x - left.x).toBeCloseTo(left.w, 3);
    expect(left.y).toBeCloseTo(right.y, 3);
  });

  it("preserves the declared stroke width", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="0" x2="10" y2="0" stroke="#000" stroke-width="4" />
    </svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.objects[0].strokeWidth).toBe(4);
  });

  it("clamps an implausible stroke width into the editable range", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="0" x2="10" y2="0" stroke="#000" stroke-width="90" />
    </svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.objects[0].strokeWidth).toBe(8);
  });

  it("skips definitions, styles and metadata", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs><rect width="10" height="10" fill="#000" /></defs>
      <style>.a{fill:#000}</style>
      <title>t</title>
      <rect width="10" height="10" fill="#000" />
    </svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.objects).toHaveLength(1);
  });

  it("warns when text is present instead of silently dropping it", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="10">COLORADO</text>
      <rect width="10" height="10" fill="#000" />
    </svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.objects).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("Text was skipped");
  });

  it("reports when nothing drawable was found", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs /></svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.objects).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("No drawable shapes");
  });

  it("reports malformed SVG", () => {
    const result = importSvgAsVectors("<svg><rect", { targetBox: BOX });
    expect(result.objects).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it("refuses a file with too many shapes instead of importing part of it", () => {
    const shapes = Array.from(
      { length: 10 },
      (_, i) => `<rect x="${i * 12}" width="10" height="10" fill="#000" />`
    ).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX, maxObjects: 4 });
    // Nothing at all: a partly imported pattern still looks finished, and would
    // be engraved as though it were complete.
    expect(result.objects).toHaveLength(0);
    expect(result.error).toContain("more than 4 shapes");
    expect(result.counts?.shapes).toBe(5);
  });

  it("imports well past the old 400-shape ceiling by default", () => {
    const shapes = Array.from(
      { length: 1200 },
      (_, i) =>
        `<rect x="${i % 40}" y="${Math.floor(i / 40)}" width="1" height="1" fill="#000" />`
    ).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.error).toBeUndefined();
    expect(result.objects).toHaveLength(1200);
  });

  it("refuses a file whose path detail exceeds the point budget", () => {
    const points = Array.from({ length: 400 }, (_, i) => `L ${i} ${i % 5}`).join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 ${points}" fill="#000" /></svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX, maxAnchors: 100 });
    expect(result.objects).toHaveLength(0);
    expect(result.error).toContain("100 path points");
    expect(result.counts?.anchors).toBeGreaterThan(100);
  });

  it("keeps the source aspect ratio recorded for reporting", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="40" height="20" fill="#000" /></svg>`;
    const result = importSvgAsVectors(svg, { targetBox: BOX });
    expect(result.sourceBounds).toEqual({ w: 40, h: 20 });
    expect(subpathBounds(result.objects[0].subpaths).w).toBeCloseTo(200, 3);
  });
});
