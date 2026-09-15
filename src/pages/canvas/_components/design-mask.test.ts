import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MASK_SHAPES,
  MASK_SHAPE_GROUPS,
  applyMaskToCanvas,
  changeMaskShape,
  createDesignMask,
  featherRadius,
  fitAspectInside,
  fitMaskToBox,
  getMaskShape,
  maskPathData,
  polygonPath,
  roundedRectPath,
  starPath,
} from "./design-mask.ts";

const BOX = { x: 100, y: 50, w: 400, h: 300 };

describe("mask shape catalog", () => {
  it("exposes shapes and parts with usable geometry", () => {
    expect(MASK_SHAPES.length).toBeGreaterThan(10);

    for (const shape of MASK_SHAPES) {
      expect(shape.path.length).toBeGreaterThan(4);
      expect(shape.boxW).toBeGreaterThan(0);
      expect(shape.boxH).toBeGreaterThan(0);
      expect(shape.aspect).toBeGreaterThan(0);
      expect(shape.name.length).toBeGreaterThan(0);
    }
  });

  it("groups every shape exactly once", () => {
    const grouped = MASK_SHAPE_GROUPS.flatMap((group) => group.shapes);
    expect(grouped).toHaveLength(MASK_SHAPES.length);
  });

  it("falls back to a usable shape for an unknown id", () => {
    expect(getMaskShape("does-not-exist").path.length).toBeGreaterThan(4);
  });

  it("carries real proportions for part silhouettes", () => {
    const slide = getMaskShape("part:glock-19-slide");
    expect(slide.group).toBe("part");
    expect(slide.aspect).toBeCloseTo(6.85 / 1.1, 5);
    expect(slide.inches).toEqual({ width: 6.85, height: 1.1 });
  });
});

describe("shape path builders", () => {
  it("returns a plain rectangle when the corner radius is zero", () => {
    expect(roundedRectPath(0)).toBe("M0,0 H100 V100 H0 Z");
  });

  it("emits four arcs for a rounded rectangle", () => {
    expect(roundedRectPath(0.5).match(/A/g)).toHaveLength(4);
  });

  it("produces the requested number of points", () => {
    // One move command plus one line command per remaining point.
    expect(polygonPath(3).match(/L/g)).toHaveLength(2);
    expect(polygonPath(6).match(/L/g)).toHaveLength(5);
    expect(starPath(5).match(/L/g)).toHaveLength(9);
  });

  it("uses the corner radius only for shapes that support it", () => {
    const rounded = maskPathData({ shapeId: "rounded", cornerRadius: 0 });
    expect(rounded.path).toBe("M0,0 H100 V100 H0 Z");

    const ellipse = maskPathData({ shapeId: "ellipse", cornerRadius: 0 });
    expect(ellipse.path).toContain("A");
  });
});

describe("createDesignMask", () => {
  it("centres a free shape inside the art box", () => {
    const mask = createDesignMask("rect", BOX);

    expect(mask.w).toBeCloseTo(BOX.w * 0.92, 5);
    expect(mask.h).toBeCloseTo(BOX.h * 0.92, 5);
    expect(mask.x + mask.w / 2).toBeCloseTo(BOX.x + BOX.w / 2, 5);
    expect(mask.y + mask.h / 2).toBeCloseTo(BOX.y + BOX.h / 2, 5);
    expect(mask.lockAspect).toBe(false);
    expect(mask.invert).toBe(false);
    expect(mask.feather).toBe(0);
  });

  it("preserves the natural proportions of a part silhouette", () => {
    const shape = getMaskShape("part:glock-19-slide");
    const mask = createDesignMask(shape.id, BOX);

    expect(mask.lockAspect).toBe(true);
    expect(mask.w / mask.h).toBeCloseTo(shape.aspect, 3);
    expect(mask.w).toBeLessThanOrEqual(BOX.w);
    expect(mask.h).toBeLessThanOrEqual(BOX.h);
  });

  it("never produces a degenerate box", () => {
    const mask = createDesignMask("star5", { x: 0, y: 0, w: 0, h: 0 });
    expect(mask.w).toBeGreaterThan(0);
    expect(mask.h).toBeGreaterThan(0);
  });
});

describe("fitAspectInside", () => {
  it("limits a wide shape by width", () => {
    const fitted = fitAspectInside(4, BOX);
    expect(fitted.w).toBeCloseTo(BOX.w, 5);
    expect(fitted.h).toBeCloseTo(BOX.w / 4, 5);
    expect(fitted.y + fitted.h / 2).toBeCloseTo(BOX.y + BOX.h / 2, 5);
  });

  it("limits a tall shape by height", () => {
    const fitted = fitAspectInside(0.25, BOX);
    expect(fitted.h).toBeCloseTo(BOX.h, 5);
    expect(fitted.w).toBeCloseTo(BOX.h * 0.25, 5);
    expect(fitted.x + fitted.w / 2).toBeCloseTo(BOX.x + BOX.w / 2, 5);
  });
});

describe("fitMaskToBox", () => {
  const base = createDesignMask("rect", BOX);

  it("stretches to fill the box when the aspect is unlocked", () => {
    const fitted = fitMaskToBox({ ...base, lockAspect: false }, { x: 0, y: 0, w: 800, h: 200 });
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(0);
    expect(fitted.w).toBe(800);
    expect(fitted.h).toBe(200);
  });

  it("keeps the mask inside the box when the aspect is locked", () => {
    const shape = getMaskShape("part:ar-lower");
    const mask = { ...createDesignMask(shape.id, BOX), lockAspect: true };
    const fitted = fitMaskToBox(mask, { x: 0, y: 0, w: 600, h: 600 });

    expect(fitted.w / fitted.h).toBeCloseTo(shape.aspect, 3);
    expect(fitted.w).toBeLessThanOrEqual(600);
    expect(fitted.h).toBeLessThanOrEqual(600);
  });
});

describe("changeMaskShape", () => {
  it("keeps the placement when switching between free shapes", () => {
    const mask = createDesignMask("rect", BOX);
    const next = changeMaskShape(mask, "hexagon");

    expect(next.shapeId).toBe("hexagon");
    expect(next.x).toBeCloseTo(mask.x, 5);
    expect(next.y).toBeCloseTo(mask.y, 5);
    expect(next.w).toBeCloseTo(mask.w, 5);
    expect(next.h).toBeCloseTo(mask.h, 5);
    expect(next.lockAspect).toBe(false);
  });

  it("re-fits and locks the aspect for a part silhouette", () => {
    const mask = createDesignMask("rect", BOX);
    const shape = getMaskShape("part:glock-17-slide");
    const next = changeMaskShape(mask, shape.id);

    expect(next.lockAspect).toBe(true);
    expect(next.w / next.h).toBeCloseTo(shape.aspect, 3);
    expect(next.w).toBeLessThanOrEqual(mask.w);
    // Stays centred on the original box
    expect(next.x + next.w / 2).toBeCloseTo(mask.x + mask.w / 2, 5);
    expect(next.y + next.h / 2).toBeCloseTo(mask.y + mask.h / 2, 5);
  });
});

describe("featherRadius", () => {
  it("is zero when feathering is off", () => {
    expect(featherRadius(0, 400, 300)).toBe(0);
  });

  it("scales with the mask and is capped", () => {
    expect(featherRadius(100, 400, 300)).toBeGreaterThan(0);
    expect(featherRadius(100, 4000, 3000)).toBeLessThanOrEqual(80);
  });
});

/**
 * jsdom cannot rasterise, so the compositing step is checked against a
 * recording 2D context: it verifies the mask is scaled into place, painted with
 * the right fill rule, softened when feathered, and applied as a clip.
 */
describe("applyMaskToCanvas", () => {
  type Op = { op: string; args: unknown[] };

  function setup() {
    const ops: Op[] = [];

    const makeContext = () => {
      let filterValue = "none";
      const ctx = {
        save: () => ops.push({ op: "save", args: [] }),
        restore: () => ops.push({ op: "restore", args: [] }),
        translate: (...args: unknown[]) => ops.push({ op: "translate", args }),
        rotate: (...args: unknown[]) => ops.push({ op: "rotate", args }),
        scale: (...args: unknown[]) => ops.push({ op: "scale", args }),
        fill: (path: { d?: string } | null, rule?: string) =>
          ops.push({ op: "fill", args: [path?.d ?? null, rule] }),
        fillRect: (...args: unknown[]) => ops.push({ op: "fillRect", args }),
        drawImage: (...args: unknown[]) =>
          ops.push({ op: "drawImage", args: [args.length, filterValue] }),
        fillStyle: "",
      };
      Object.defineProperty(ctx, "filter", {
        get: () => filterValue,
        set: (value: string) => {
          filterValue = value;
          ops.push({ op: "filter", args: [value] });
        },
      });
      let compositeValue = "source-over";
      Object.defineProperty(ctx, "globalCompositeOperation", {
        get: () => compositeValue,
        set: (value: string) => {
          compositeValue = value;
          ops.push({ op: "composite", args: [value] });
        },
      });
      return ctx as unknown as CanvasRenderingContext2D;
    };

    vi.stubGlobal("document", {
      createElement: () => {
        const canvas = { width: 0, height: 0, getContext: () => makeContext() };
        return canvas as unknown as HTMLCanvasElement;
      },
    });
    vi.stubGlobal(
      "Path2D",
      class {
        constructor(public d: string) {}
      }
    );

    const target = document.createElement("canvas");
    target.width = 400;
    target.height = 300;
    return { ops, target };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing without a mask", () => {
    const { ops, target } = setup();
    applyMaskToCanvas(target, null);
    expect(ops).toHaveLength(0);
  });

  it("paints the shape and clips the artwork to it", () => {
    const { ops, target } = setup();
    applyMaskToCanvas(target, { ...createDesignMask("rect", { x: 0, y: 0, w: 400, h: 300 }) });

    const fills = ops.filter((op) => op.op === "fill");
    expect(fills).toHaveLength(1);
    expect(String(fills[0].args[0])).toContain("H100");
    expect(fills[0].args[1]).toBe("nonzero");

    // No punching and no blurring for a plain, hard-edged mask.
    expect(ops.some((op) => op.op === "fillRect")).toBe(false);
    expect(ops.some((op) => op.op === "filter")).toBe(false);
    expect(ops.some((op) => op.op === "drawImage")).toBe(true);
    expect(ops.some((op) => op.op === "composite" && op.args[0] === "destination-in")).toBe(true);
  });

  it("maps the mask box into canvas coordinates", () => {
    const { ops, target } = setup();
    const mask = { ...createDesignMask("rect", { x: 0, y: 0, w: 400, h: 300 }), rotation: 0 };
    applyMaskToCanvas(target, mask, 2, 2);

    const translate = ops.find((op) => op.op === "translate");
    expect(translate?.args).toEqual([(mask.x + mask.w / 2) * 2, (mask.y + mask.h / 2) * 2]);

    const scale = ops.find((op) => op.op === "scale");
    expect(scale?.args).toEqual([(mask.w * 2) / 100, (mask.h * 2) / 100]);
  });

  it("punches the shape out of a full canvas when inverted", () => {
    const { ops, target } = setup();
    applyMaskToCanvas(target, { ...createDesignMask("ellipse", { x: 0, y: 0, w: 400, h: 300 }), invert: true });

    // Full-canvas fill first, then the silhouette is erased out of it.
    const fillRect = ops.find((op) => op.op === "fillRect");
    expect(fillRect?.args).toEqual([0, 0, 400, 300]);
    expect(ops.some((op) => op.op === "composite" && op.args[0] === "destination-out")).toBe(true);

    const fillIndex = ops.findIndex((op) => op.op === "fill");
    const punchIndex = ops.findIndex((op) => op.op === "composite" && op.args[0] === "destination-out");
    expect(punchIndex).toBeLessThan(fillIndex);
  });

  it("softens the edge with a blur when feathered", () => {
    const { ops, target } = setup();
    applyMaskToCanvas(target, { ...createDesignMask("rect", { x: 0, y: 0, w: 400, h: 300 }), feather: 60 });

    const blur = ops.find((op) => op.op === "filter" && String(op.args[0]).startsWith("blur("));
    expect(blur).toBeDefined();

    // Blurred pass plus the final clip composite.
    const composites = ops.filter((op) => op.op === "drawImage");
    expect(composites.length).toBeGreaterThanOrEqual(2);
    expect(composites.some((op) => String(op.args[1]).startsWith("blur("))).toBe(true);
  });
});
