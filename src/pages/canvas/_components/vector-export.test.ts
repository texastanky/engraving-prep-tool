import { describe, expect, it } from "vitest";
import { buildVectorSvg, describeVectorExport } from "./vector-export.ts";
import {
  ellipseSubpaths,
  lineSubpaths,
  objectFromSubpaths,
  rectSubpaths,
  type VectorObject,
} from "./vector-path.ts";

// 4 x 4 inch material at a 400px canvas => 101.6mm across, 0.254mm per pixel.
const BASE = {
  displayWidth: 400,
  displayHeight: 400,
  materialWidthIn: 4,
  materialHeightIn: 4,
};

function object(
  name: string,
  mode: VectorObject["mode"],
  subpaths = rectSubpaths(0, 0, 200, 200)
): VectorObject {
  return objectFromSubpaths(name, subpaths, mode);
}

describe("buildVectorSvg", () => {
  it("sizes the document in millimetres at actual size", () => {
    const { svg, widthMm, heightMm } = buildVectorSvg({ ...BASE, objects: [] });
    expect(widthMm).toBeCloseTo(101.6, 5);
    expect(heightMm).toBeCloseTo(101.6, 5);
    expect(svg).toContain('width="101.6mm"');
    expect(svg).toContain('height="101.6mm"');
    expect(svg).toContain('viewBox="0 0 101.6 101.6"');
  });

  it("converts pixel geometry into millimetres", () => {
    const { svg } = buildVectorSvg({ ...BASE, objects: [object("Rect", "cut")] });
    // A 200px square on a 400px canvas is half the material: 50.8mm.
    expect(svg).toContain("M 0 0 L 50.8 0 L 50.8 50.8 L 0 50.8 Z");
  });

  it("emits real path data rather than an embedded bitmap", () => {
    const { svg } = buildVectorSvg({ ...BASE, objects: [object("Rect", "cut")] });
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("base64");
  });

  it("fills engrave objects and strokes cut objects", () => {
    const { svg } = buildVectorSvg({
      ...BASE,
      objects: [object("Fill", "engrave"), object("Outline", "cut")],
    });

    const engraveGroup = svg.slice(svg.indexOf('id="engrave"'), svg.indexOf('id="cut"'));
    expect(engraveGroup).toContain('fill="#000000"');
    expect(engraveGroup).toContain('stroke="none"');

    const cutGroup = svg.slice(svg.indexOf('id="cut"'));
    expect(cutGroup).toContain('fill="none"');
    expect(cutGroup).toContain('stroke="#ef4444"');
    expect(cutGroup).toContain("stroke-width=");
  });

  it("keeps cut lines thin enough for a clean kerf", () => {
    const { svg } = buildVectorSvg({ ...BASE, objects: [object("Outline", "cut")] });
    const width = Number(svg.match(/stroke-width="([\d.]+)"/)?.[1]);
    expect(width).toBeGreaterThan(0);
    // A hairline in pixel terms must not become a fat line in millimetres.
    expect(width).toBeLessThanOrEqual(0.5);
  });

  it("omits groups with no objects", () => {
    const { svg, counts } = buildVectorSvg({ ...BASE, objects: [object("Outline", "cut")] });
    expect(counts).toEqual({ engrave: 0, cut: 1, score: 0 });
    expect(svg).not.toContain('id="engrave"');
    expect(svg).not.toContain('id="score"');
    expect(svg).toContain('id="cut"');
  });

  it("groups by operation so laser software can assign layers", () => {
    const { svg, counts } = buildVectorSvg({
      ...BASE,
      objects: [object("A", "engrave"), object("B", "cut"), object("C", "score")],
    });
    expect(counts).toEqual({ engrave: 1, cut: 1, score: 1 });
    expect(svg).toContain('data-operation="engrave"');
    expect(svg).toContain('data-operation="score"');
    expect(svg).toContain('data-operation="cut"');
  });

  it("records the object name and position as attributes", () => {
    const { svg } = buildVectorSvg({ ...BASE, objects: [object("Name Plate", "cut")] });
    expect(svg).toContain('data-name="Name Plate"');
  });

  it("escapes XML in object names", () => {
    const { svg } = buildVectorSvg({ ...BASE, objects: [object('A & B "C" <D>', "cut")] });
    expect(svg).toContain("A &amp; B &quot;C&quot; &lt;D&gt;");
    expect(svg).not.toContain('A & B "C" <D>');
  });

  it("handles curved geometry", () => {
    const { svg } = buildVectorSvg({
      ...BASE,
      objects: [object("Circle", "cut", ellipseSubpaths(100, 100, 50, 50))],
    });
    expect(svg).toContain("C ");
    expect(svg).toContain("Z");
  });

  it("handles open paths", () => {
    const { svg } = buildVectorSvg({
      ...BASE,
      objects: [object("Line", "cut", lineSubpaths({ x: 0, y: 0 }, { x: 400, y: 400 }))],
    });
    expect(svg).toContain("M 0 0 L 101.6 101.6");
    expect(svg).not.toContain("Z");
  });

  it("tolerates a zero-sized canvas instead of dividing by zero", () => {
    const { svg } = buildVectorSvg({
      ...BASE,
      displayWidth: 0,
      displayHeight: 0,
      objects: [object("Rect", "cut")],
    });
    expect(svg).toContain("<path");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("uses the provided title", () => {
    const { svg } = buildVectorSvg({ ...BASE, objects: [], title: "Glock 19 panel" });
    expect(svg).toContain("<title>Glock 19 panel</title>");
  });
});

describe("describeVectorExport", () => {
  it("summarises the operations and physical size", () => {
    const result = buildVectorSvg({
      ...BASE,
      objects: [object("A", "engrave"), object("B", "cut")],
    });
    expect(describeVectorExport(result)).toBe("1 cut · 1 engrave — 101.6 × 101.6 mm");
  });

  it("says so when there is nothing to export", () => {
    expect(describeVectorExport(buildVectorSvg({ ...BASE, objects: [] }))).toContain("no objects");
  });
});
