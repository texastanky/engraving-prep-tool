/**
 * Non-destructive clipping masks for the design layer.
 *
 * Modelled on the Illustrator clipping-mask / CorelDRAW PowerClip workflow: a
 * shape acts as a container and the design is clipped into it at draw time. The
 * source artwork is never modified, so the mask stays editable, reversible and
 * exportable at full resolution.
 *
 * Every shape is described as SVG path data inside its own local box so the
 * same definition can be used for rendering, thumbnails and the canvas fill.
 */

import { PART_SHAPES } from "./part-shapes.ts";

export type MaskShapeGroup = "shape" | "part";

export type MaskShapeDef = {
  id: string;
  name: string;
  group: MaskShapeGroup;
  /** SVG path data inside this shape's own box (boxW × boxH). */
  path: string;
  boxW: number;
  boxH: number;
  /** Natural width / height ratio. */
  aspect: number;
  fillRule: "nonzero" | "evenodd";
  /** Rounded rectangles expose a corner-radius control. */
  supportsCornerRadius?: boolean;
  /** Real-world size in inches, when the shape is a known part. */
  inches?: { width: number; height: number };
};

export type MaskBox = { x: number; y: number; w: number; h: number };

export type DesignMask = {
  shapeId: string;
  /** Box in canvas (display) pixels, matching the design's coordinate space. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, rotated around the box centre. */
  rotation: number;
  /** 0 = square corners, 1 = fully rounded (rounded-rectangle shape only). */
  cornerRadius: number;
  /** 0..100 — softens the clipped edge. */
  feather: number;
  /** Keep everything *outside* the shape instead of inside it. */
  invert: boolean;
  /** Constrain resizing to the shape's natural aspect ratio. */
  lockAspect: boolean;
};

const BOX = 100;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Rounded rectangle. Radius is a fraction of the half-box (0..1). */
export function roundedRectPath(radius01: number): string {
  const radius = Math.max(0, Math.min(1, radius01)) * (BOX / 2);
  if (radius < 0.5) {
    return `M0,0 H${BOX} V${BOX} H0 Z`;
  }
  const r = round(radius);
  const inner = round(BOX - radius);
  return (
    `M${r},0 H${inner} A${r},${r} 0 0 1 ${BOX},${r} V${inner} ` +
    `A${r},${r} 0 0 1 ${inner},${BOX} H${r} A${r},${r} 0 0 1 0,${inner} ` +
    `V${r} A${r},${r} 0 0 1 ${r},0 Z`
  );
}

/** Regular polygon inscribed in the box. */
export function polygonPath(sides: number, startAngle = -90): string {
  const cx = BOX / 2;
  const cy = BOX / 2;
  const radius = BOX / 2;
  const points: string[] = [];

  for (let i = 0; i < sides; i += 1) {
    const angle = ((startAngle + (360 * i) / sides) * Math.PI) / 180;
    const x = round(cx + radius * Math.cos(angle));
    const y = round(cy + radius * Math.sin(angle));
    points.push(`${i === 0 ? "M" : "L"}${x},${y}`);
  }

  return `${points.join(" ")} Z`;
}

/** Star with alternating outer/inner radii. */
export function starPath(points: number, innerRatio = 0.42, startAngle = -90): string {
  const cx = BOX / 2;
  const cy = BOX / 2;
  const outer = BOX / 2;
  const inner = outer * innerRatio;
  const segments: string[] = [];

  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = ((startAngle + (180 * i) / points) * Math.PI) / 180;
    const x = round(cx + radius * Math.cos(angle));
    const y = round(cy + radius * Math.sin(angle));
    segments.push(`${i === 0 ? "M" : "L"}${x},${y}`);
  }

  return `${segments.join(" ")} Z`;
}

/** Ellipse traced with two arcs so it scales with a non-square box. */
export const ELLIPSE_PATH = `M0,${BOX / 2} A${BOX / 2},${BOX / 2} 0 1 0 ${BOX},${BOX / 2} A${BOX / 2},${BOX / 2} 0 1 0 0,${BOX / 2} Z`;

const HEART_PATH =
  "M50,90 C20,68 2,52 2,33 C2,17 14,7 26,7 C36,7 45,13 50,22 C55,13 64,7 74,7 " +
  "C86,7 98,17 98,33 C98,52 80,68 50,90 Z";

const SHIELD_PATH =
  "M50,2 L97,18 L97,53 C97,78 76,93 50,99 C24,93 3,78 3,53 L3,18 Z";

const PLAQUE_PATH = roundedRectPath(0.16);

function basicShape(def: Omit<MaskShapeDef, "group" | "boxW" | "boxH" | "aspect">): MaskShapeDef {
  return { ...def, group: "shape", boxW: BOX, boxH: BOX, aspect: 1 };
}

const BASIC_SHAPES: MaskShapeDef[] = [
  basicShape({ id: "rect", name: "Rectangle", path: `M0,0 H${BOX} V${BOX} H0 Z`, fillRule: "nonzero" }),
  basicShape({
    id: "rounded",
    name: "Rounded",
    path: roundedRectPath(0.3),
    fillRule: "nonzero",
    supportsCornerRadius: true,
  }),
  basicShape({ id: "ellipse", name: "Ellipse", path: ELLIPSE_PATH, fillRule: "nonzero" }),
  basicShape({ id: "triangle", name: "Triangle", path: polygonPath(3), fillRule: "nonzero" }),
  basicShape({ id: "diamond", name: "Diamond", path: polygonPath(4), fillRule: "nonzero" }),
  basicShape({ id: "pentagon", name: "Pentagon", path: polygonPath(5), fillRule: "nonzero" }),
  basicShape({ id: "hexagon", name: "Hexagon", path: polygonPath(6), fillRule: "nonzero" }),
  basicShape({ id: "star5", name: "Star 5", path: starPath(5), fillRule: "nonzero" }),
  basicShape({ id: "star6", name: "Star 6", path: starPath(6, 0.55), fillRule: "nonzero" }),
  basicShape({ id: "heart", name: "Heart", path: HEART_PATH, fillRule: "nonzero" }),
  basicShape({ id: "shield", name: "Shield", path: SHIELD_PATH, fillRule: "nonzero" }),
  basicShape({ id: "plaque", name: "Plaque", path: PLAQUE_PATH, fillRule: "nonzero" }),
];

/** Part silhouettes — same shapes used for known laser surfaces. */
const PART_MASK_SHAPES: MaskShapeDef[] = PART_SHAPES.map((shape) => ({
  id: `part:${shape.id}`,
  name: shape.name,
  group: "part" as const,
  path: shape.svgPath,
  boxW: 1000,
  boxH: Math.round((shape.height / shape.width) * 1000),
  aspect: shape.width / shape.height,
  fillRule: shape.fillRule ?? "nonzero",
  inches: { width: shape.width, height: shape.height },
}));

export const MASK_SHAPES: MaskShapeDef[] = [...BASIC_SHAPES, ...PART_MASK_SHAPES];

export const MASK_SHAPE_GROUPS: { id: MaskShapeGroup; label: string; shapes: MaskShapeDef[] }[] = [
  { id: "shape", label: "Shapes", shapes: BASIC_SHAPES },
  { id: "part", label: "Parts", shapes: PART_MASK_SHAPES },
];

export const DEFAULT_MASK_SHAPE_ID = "rounded";

export function getMaskShape(id: string): MaskShapeDef {
  return MASK_SHAPES.find((shape) => shape.id === id) ?? BASIC_SHAPES[1];
}

/** Corner radius is only meaningful for the rounded-rectangle shape. */
export function maskPathData(mask: Pick<DesignMask, "shapeId" | "cornerRadius">): {
  path: string;
  boxW: number;
  boxH: number;
  fillRule: "nonzero" | "evenodd";
} {
  const shape = getMaskShape(mask.shapeId);
  const path = shape.supportsCornerRadius ? roundedRectPath(mask.cornerRadius) : shape.path;
  return { path, boxW: shape.boxW, boxH: shape.boxH, fillRule: shape.fillRule };
}

/** The mask's centre point. */
export function maskCenter(mask: Pick<DesignMask, "x" | "y" | "w" | "h">): { x: number; y: number } {
  return { x: mask.x + mask.w / 2, y: mask.y + mask.h / 2 };
}

/** Largest rect with `aspect` that fits inside `box`, centred. */
export function fitAspectInside(aspect: number, box: MaskBox): MaskBox {
  const safeAspect = aspect > 0 ? aspect : 1;
  let w = box.w;
  let h = w / safeAspect;
  if (h > box.h) {
    h = box.h;
    w = h * safeAspect;
  }
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

/**
 * Build a mask for a shape, sized to `box`. Part silhouettes keep their real
 * proportions; free shapes fill the box so they behave like a drawn rectangle.
 */
export function createDesignMask(
  shapeId: string,
  box: MaskBox,
  options: { inset?: number; lockAspect?: boolean } = {}
): DesignMask {
  const shape = getMaskShape(shapeId);
  const inset = options.inset ?? 0.92;
  const lockAspect = options.lockAspect ?? shape.group === "part";

  const padded: MaskBox = {
    x: box.x,
    y: box.y,
    w: Math.max(1, box.w * inset),
    h: Math.max(1, box.h * inset),
  };
  const padded2: MaskBox = {
    ...padded,
    x: box.x + (box.w - padded.w) / 2,
    y: box.y + (box.h - padded.h) / 2,
  };

  const fitted = lockAspect
    ? fitAspectInside(shape.aspect, padded2)
    : { x: padded2.x, y: padded2.y, w: padded2.w, h: padded2.h };

  return {
    shapeId: shape.id,
    x: fitted.x,
    y: fitted.y,
    w: fitted.w,
    h: fitted.h,
    rotation: 0,
    cornerRadius: 0.3,
    feather: 0,
    invert: false,
    lockAspect,
  };
}

/** Reposition an existing mask to fill a new box (used by Fit / Center actions). */
export function fitMaskToBox(mask: DesignMask, box: MaskBox, lockAspect = mask.lockAspect): DesignMask {
  const shape = getMaskShape(mask.shapeId);
  const next = lockAspect
    ? fitAspectInside(shape.aspect, box)
    : { x: box.x, y: box.y, w: Math.max(1, box.w), h: Math.max(1, box.h) };

  return { ...mask, ...next };
}

/**
 * Switch the container shape without losing the mask's placement, keeping the
 * aspect ratio when the new shape has fixed proportions.
 */
export function changeMaskShape(mask: DesignMask, shapeId: string): DesignMask {
  const shape = getMaskShape(shapeId);
  const lockAspect = shape.group === "part";
  const box: MaskBox = { x: mask.x, y: mask.y, w: mask.w, h: mask.h };

  if (!lockAspect) {
    return { ...mask, shapeId: shape.id, lockAspect };
  }

  const fitted = fitAspectInside(shape.aspect, box);
  return { ...mask, shapeId: shape.id, lockAspect, ...fitted };
}

/** Blur radius in pixels for a 0..100 feather value at a given mask size. */
export function featherRadius(feather: number, maskW: number, maskH: number): number {
  if (feather <= 0) return 0;
  const scale = Math.min(Math.abs(maskW), Math.abs(maskH));
  return Math.min(80, (feather / 100) * 0.25 * scale);
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * Clip `target` to `mask` in place (the PowerClip step).
 *
 * Feather is applied by blurring the mask alpha before compositing, which gives
 * a soft edge that survives export — something a plain `ctx.clip()` cannot do.
 */
export function applyMaskToCanvas(
  target: HTMLCanvasElement,
  mask: DesignMask | null | undefined,
  scaleX = 1,
  scaleY = 1
): void {
  if (!mask) return;
  const width = target.width;
  const height = target.height;
  if (!width || !height) return;

  const { path, boxW, boxH, fillRule } = maskPathData(mask);
  const boxW_ = boxW * scaleX;
  const boxH_ = boxH * scaleY;
  if (boxW_ <= 0 || boxH_ <= 0) return;

  const shapeLayer = makeCanvas(width, height);
  const shapeCtx = shapeLayer.getContext("2d");
  if (!shapeCtx) return;

  const maskW = mask.w * scaleX;
  const maskH = mask.h * scaleY;
  const centerX = (mask.x + mask.w / 2) * scaleX;
  const centerY = (mask.y + mask.h / 2) * scaleY;

  shapeCtx.save();
  if (mask.invert) {
    // Everything outside the shape is kept, so start from a full canvas and
    // punch the silhouette out of it.
    shapeCtx.fillStyle = "#ffffff";
    shapeCtx.fillRect(0, 0, width, height);
    shapeCtx.globalCompositeOperation = "destination-out";
  }
  shapeCtx.translate(centerX, centerY);
  shapeCtx.rotate((mask.rotation * Math.PI) / 180);
  shapeCtx.translate(-maskW / 2, -maskH / 2);
  shapeCtx.scale(maskW / boxW, maskH / boxH);
  shapeCtx.fillStyle = "#ffffff";

  try {
    shapeCtx.fill(new Path2D(path), fillRule);
  } catch {
    // Path2D unavailable (non-browser test env) — leave the design unmasked.
    return;
  }
  shapeCtx.restore();

  let maskLayer = shapeLayer;
  const radius = featherRadius(mask.feather, maskW, maskH);
  if (radius > 0) {
    const blurred = makeCanvas(width, height);
    const blurredCtx = blurred.getContext("2d");
    if (blurredCtx) {
      blurredCtx.filter = `blur(${radius.toFixed(2)}px)`;
      blurredCtx.drawImage(shapeLayer, 0, 0);
      blurredCtx.filter = "none";
      maskLayer = blurred;
    }
  }

  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskLayer, 0, 0);
  ctx.restore();
}
