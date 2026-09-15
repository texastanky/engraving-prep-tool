/**
 * Import SVG artwork as editable vector objects.
 *
 * Illustrator exports nest groups and carry transforms on them, so the tree is
 * walked with the transform stack composed as we descend. Basic shapes are
 * converted to path data and re-parsed, which keeps one code path for geometry
 * and exercises the arc conversion for circles and rounded corners.
 *
 * The result is fitted (aspect preserved, centred) into a target box so imported
 * art lands on the material at a sensible size instead of overflowing.
 */

import { parsePathData } from "./svg-path-data.ts";
import {
  objectFromSubpaths,
  scaleSubpaths,
  subpathBounds,
  translateSubpaths,
  type SubPath,
  type VectorMode,
  type VectorObject,
} from "./vector-path.ts";

export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiply(parent: Matrix, child: Matrix): Matrix {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e,
    f: parent.b * child.e + parent.d * child.f + parent.f,
  };
}

/** Parse an SVG transform attribute into a single matrix. */
export function parseTransform(value: string | null): Matrix {
  if (!value) return { ...IDENTITY };
  let matrix: Matrix = { ...IDENTITY };

  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const name = match[1];
    const args = match[2]
      .split(/[\s,]+/)
      .map((part) => Number(part))
      .filter((part) => !Number.isNaN(part));

    let next: Matrix = { ...IDENTITY };
    switch (name) {
      case "matrix":
        if (args.length >= 6) {
          next = { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
        }
        break;
      case "translate":
        next = { ...IDENTITY, e: args[0] ?? 0, f: args[1] ?? 0 };
        break;
      case "scale": {
        const sx = args[0] ?? 1;
        next = { a: sx, b: 0, c: 0, d: args[1] ?? sx, e: 0, f: 0 };
        break;
      }
      case "rotate": {
        const radians = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const rotation: Matrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
        if (args.length >= 3) {
          const [, cx, cy] = args;
          next = multiply(
            multiply({ ...IDENTITY, e: cx, f: cy }, rotation),
            { ...IDENTITY, e: -cx, f: -cy }
          );
        } else {
          next = rotation;
        }
        break;
      }
      case "skewX":
        next = { a: 1, b: 0, c: Math.tan(((args[0] ?? 0) * Math.PI) / 180), d: 1, e: 0, f: 0 };
        break;
      case "skewY":
        next = { a: 1, b: Math.tan(((args[0] ?? 0) * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
        break;
      default:
        break;
    }

    matrix = multiply(matrix, next);
  }

  return matrix;
}

function applyMatrixToSubpaths(subpaths: SubPath[], matrix: Matrix): SubPath[] {
  const map = (point: { x: number; y: number }) => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  });

  return subpaths.map((subpath) => ({
    closed: subpath.closed,
    anchors: subpath.anchors.map((anchor) => ({
      ...map(anchor),
      ...(anchor.in ? { in: map(anchor.in) } : {}),
      ...(anchor.out ? { out: map(anchor.out) } : {}),
    })),
  }));
}

function num(element: Element, name: string, fallback = 0): number {
  const raw = element.getAttribute(name);
  if (raw === null) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Convert a basic shape element into path data (in its own coordinate space). */
export function shapeToPathData(element: Element): string | null {
  const tag = element.tagName.toLowerCase();

  switch (tag) {
    case "path":
      return element.getAttribute("d");

    case "rect": {
      const x = num(element, "x");
      const y = num(element, "y");
      const w = num(element, "width");
      const h = num(element, "height");
      if (w <= 0 || h <= 0) return null;
      const rxRaw = element.getAttribute("rx");
      const ryRaw = element.getAttribute("ry");
      const rx = Math.min(
        rxRaw !== null ? num(element, "rx") : ryRaw !== null ? num(element, "ry") : 0,
        w / 2
      );
      const ry = Math.min(
        ryRaw !== null ? num(element, "ry") : rxRaw !== null ? num(element, "rx") : 0,
        h / 2
      );
      if (rx <= 0 || ry <= 0) {
        return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      }
      return [
        `M ${x + rx} ${y}`,
        `H ${x + w - rx}`,
        `A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`,
        `V ${y + h - ry}`,
        `A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`,
        `H ${x + rx}`,
        `A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry}`,
        `V ${y + ry}`,
        `A ${rx} ${ry} 0 0 1 ${x + rx} ${y}`,
        "Z",
      ].join(" ");
    }

    case "circle": {
      const cx = num(element, "cx");
      const cy = num(element, "cy");
      const r = num(element, "r");
      if (r <= 0) return null;
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    }

    case "ellipse": {
      const cx = num(element, "cx");
      const cy = num(element, "cy");
      const rx = num(element, "rx");
      const ry = num(element, "ry");
      if (rx <= 0 || ry <= 0) return null;
      return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }

    case "line":
      return `M ${num(element, "x1")} ${num(element, "y1")} L ${num(element, "x2")} ${num(element, "y2")}`;

    case "polyline":
    case "polygon": {
      const raw = element.getAttribute("points");
      if (!raw) return null;
      const values = raw
        .trim()
        .split(/[\s,]+/)
        .map((part) => Number(part))
        .filter((part) => !Number.isNaN(part));
      if (values.length < 4) return null;
      const pairs: string[] = [];
      for (let i = 0; i + 1 < values.length; i += 2) {
        pairs.push(`${i === 0 ? "M" : "L"} ${values[i]} ${values[i + 1]}`);
      }
      return `${pairs.join(" ")}${tag === "polygon" ? " Z" : ""}`;
    }

    default:
      return null;
  }
}

const SKIPPED_TAGS = new Set([
  "defs", "clippath", "mask", "symbol", "marker", "pattern", "lineargradient",
  "radialgradient", "style", "title", "desc", "metadata", "filter", "script",
]);

/** Decide how the laser should treat an element from its paint. */
function modeForElement(element: Element, fallback: VectorMode): VectorMode {
  const style = element.getAttribute("style") || "";
  const styleFill = /fill\s*:\s*([^;]+)/.exec(style)?.[1]?.trim();
  const styleStroke = /stroke\s*:\s*([^;]+)/.exec(style)?.[1]?.trim();

  const fillValue = (element.getAttribute("fill") ?? styleFill ?? "").toLowerCase();
  const strokeValue = (element.getAttribute("stroke") ?? styleStroke ?? "").toLowerCase();

  if (fillValue && fillValue !== "none" && fillValue !== "transparent") return "engrave";
  if (strokeValue && strokeValue !== "none") return "cut";
  return fallback;
}

/**
 * Ceilings for one import.
 *
 * Illustrator artwork and traced scroll patterns routinely run to several
 * thousand paths, so these are deliberately generous. They exist because a file
 * far beyond what the editor can hold would otherwise lock the window up — and
 * because quietly importing a fraction of the artwork is worse than refusing
 * it: a truncated scroll pattern still looks plausible, and would be engraved
 * onto a part.
 *
 * Crossing a limit is therefore a refusal, not a silent trim.
 */
export const DEFAULT_MAX_OBJECTS = 5000;
export const DEFAULT_MAX_ANCHORS = 150_000;

export type SvgImportOptions = {
  /** Where the artwork should be placed, in canvas display pixels. */
  targetBox: { x: number; y: number; w: number; h: number };
  defaultMode?: VectorMode;
  /** Most shapes a single import may produce. */
  maxObjects?: number;
  /** Most path points (anchors) a single import may produce. */
  maxAnchors?: number;
};

export type SvgImportResult = {
  objects: VectorObject[];
  /** Non-fatal notes worth surfacing to the user. */
  warnings: string[];
  sourceBounds: { w: number; h: number };
  /** Set when the file was refused outright; `objects` is then empty. */
  error?: string;
  /** What had been counted when the import stopped, for diagnostics. */
  counts?: { shapes: number; anchors: number };
};

export function importSvgAsVectors(svgText: string, options: SvgImportOptions): SvgImportResult {
  const warnings: string[] = [];
  const fallbackMode = options.defaultMode ?? "cut";
  const maxObjects = options.maxObjects ?? DEFAULT_MAX_OBJECTS;
  const maxAnchors = options.maxAnchors ?? DEFAULT_MAX_ANCHORS;

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    return { objects: [], warnings: ["That SVG could not be parsed."], sourceBounds: { w: 0, h: 0 } };
  }

  const root = doc.documentElement;
  const collected: { name: string; mode: VectorMode; strokeWidth: number; subpaths: SubPath[] }[] = [];
  let shapeCount = 0;
  let anchorCount = 0;
  let refused: "shapes" | "anchors" | null = null;

  const walk = (element: Element, matrix: Matrix) => {
    for (const child of Array.from(element.children)) {
      const tag = child.tagName.toLowerCase();

      if (refused) return;
      if (SKIPPED_TAGS.has(tag)) continue;

      const local = multiply(matrix, parseTransform(child.getAttribute("transform")));

      if (tag === "g" || tag === "svg" || tag === "a") {
        walk(child, local);
        continue;
      }

      if (tag === "text") {
        warnings.push("Text was skipped — convert type to outlines in Illustrator first.");
        continue;
      }

      const data = shapeToPathData(child);
      if (!data) continue;

      const subpaths = applyMatrixToSubpaths(parsePathData(data), local);
      if (subpaths.length === 0) continue;

      // Count and check before storing, so an oversized file stops as soon as a
      // limit is crossed rather than after building thousands of objects.
      shapeCount += 1;
      if (shapeCount > maxObjects) {
        refused = "shapes";
        return;
      }

      anchorCount += subpaths.reduce((total, subpath) => total + subpath.anchors.length, 0);
      if (anchorCount > maxAnchors) {
        refused = "anchors";
        return;
      }

      const label =
        child.getAttribute("id") ||
        child.getAttribute("data-name") ||
        `${tag.charAt(0).toUpperCase()}${tag.slice(1)}`;

      const declaredStroke = child.getAttribute("stroke-width");
      const strokeScale = Math.sqrt(Math.abs(local.a * local.d - local.b * local.c)) || 1;

      collected.push({
        name: label.slice(0, 40),
        mode: modeForElement(child, fallbackMode),
        strokeWidth: declaredStroke
          ? Math.min(8, Math.max(0.5, Number.parseFloat(declaredStroke) * strokeScale))
          : 1.5,
        subpaths,
      });
    }
  };

  walk(root, parseTransform(root.getAttribute("transform")));

  if (refused) {
    return {
      objects: [],
      warnings,
      sourceBounds: { w: 0, h: 0 },
      error:
        refused === "shapes"
          ? `That file has more than ${maxObjects.toLocaleString()} shapes, which is the most this editor imports as editable paths. Cut the number of paths down (in Illustrator, simplify the artwork or merge layers before export), or add it as a design image instead — images engrave as a bitmap and carry far more detail.`
          : `That file contains more than ${maxAnchors.toLocaleString()} path points, which is too detailed to edit as paths. Simplify the nodes in the source file (in Illustrator, Object → Path → Simplify), or add it as a design image instead.`,
      counts: { shapes: shapeCount, anchors: anchorCount },
    };
  }

  if (collected.length === 0) {
    return {
      objects: [],
      warnings: [...warnings, "No drawable shapes were found in that file."],
      sourceBounds: { w: 0, h: 0 },
    };
  }

  // Fit every element with one shared transform so relative positions survive.
  const allSubpaths = collected.flatMap((item) => item.subpaths);
  const source = subpathBounds(allSubpaths);
  const safeW = source.w > 0 ? source.w : 1;
  const safeH = source.h > 0 ? source.h : 1;
  const fit = Math.min(options.targetBox.w / safeW, options.targetBox.h / safeH);
  const offsetX = options.targetBox.x + (options.targetBox.w - safeW * fit) / 2;
  const offsetY = options.targetBox.y + (options.targetBox.h - safeH * fit) / 2;

  const objects = collected.map((item) => {
    const scaled = scaleSubpaths(item.subpaths, { x: 0, y: 0 }, fit, fit);
    const placed = translateSubpaths(scaled, offsetX - source.x * fit, offsetY - source.y * fit);
    return objectFromSubpaths(item.name, placed, item.mode, item.strokeWidth);
  });

  return { objects, warnings, sourceBounds: { w: source.w, h: source.h } };
}
