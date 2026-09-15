/**
 * Text to outlines.
 *
 * Type is rasterised with the browser's own font stack at a high supersampling
 * factor, then traced into vector contours. That means any font installed on the
 * machine can be used, and the exported artwork carries no font dependency — the
 * laser only ever sees paths.
 *
 * The grid tracer is deliberately separate from the canvas work so it can be
 * tested headlessly: `subpathsFromBinaryGrid` is pure.
 */

import { fitSubpaths } from "./curve-fit.ts";
import { regionToSubpaths, ringsToRegion, type Ring } from "./vector-boolean.ts";
import type { SubPath } from "./vector-path.ts";

/** Where tracing happens: high enough that curves come out smooth. */
const DEFAULT_SUPERSAMPLE = 6;

/** Ramer–Douglas–Peucker simplification. */
function simplify(points: Ring, epsilon: number): Ring {
  if (points.length <= 3) return points;

  const first = points[0];
  const last = points[points.length - 1];
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const length = Math.hypot(dx, dy) || 1;

  let maxDistance = 0;
  let maxIndex = -1;

  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i];
    const distance =
      Math.abs(dy * px - dx * py + last[0] * first[1] - last[1] * first[0]) / length;
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance <= epsilon || maxIndex < 0) return [first, last];

  const left = simplify(points.slice(0, maxIndex + 1), epsilon);
  const right = simplify(points.slice(maxIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

/**
 * Simplify a closed ring.
 *
 * RDP needs distinct endpoints, so the ring is split at its two most distant
 * points into two open chains. Feeding it a closed chain (first point equal to
 * last) makes the distance test collapse to zero and nothing would simplify.
 */
function simplifyRing(ring: Ring, epsilon: number): Ring {
  const points = ring.slice(0, -1);
  if (points.length <= 4) return ring;

  // Pivot at the top-most, then left-most point so the result is deterministic.
  let pivot = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i];
    const [bx, by] = points[pivot];
    if (y < by || (y === by && x < bx)) pivot = i;
  }

  const rotated = [...points.slice(pivot), ...points.slice(0, pivot)];

  let farIndex = 0;
  let farDistance = -1;
  for (let i = 1; i < rotated.length; i += 1) {
    const distance = Math.hypot(
      rotated[i][0] - rotated[0][0],
      rotated[i][1] - rotated[0][1]
    );
    if (distance > farDistance) {
      farDistance = distance;
      farIndex = i;
    }
  }

  if (farIndex === 0) return ring;

  const chainA = rotated.slice(0, farIndex + 1);
  const chainB = [...rotated.slice(farIndex), rotated[0]];

  const simplifiedA = simplify(chainA, epsilon);
  const simplifiedB = simplify(chainB, epsilon);

  // Keep both chains' shared endpoints only once.
  const combined = [...simplifiedA, ...simplifiedB.slice(1, -1)];
  if (combined.length < 3) return ring;

  return [...combined, [combined[0][0], combined[0][1]]];
}

/**
 * Trace the boundary of a binary grid into closed rings.
 *
 * Every foreground pixel contributes its exposed sides as directed edges, which
 * chains into loops without any pixel-order guesswork: outer contours come out
 * clockwise in screen coordinates and counters (the hole in an "O") come out
 * anticlockwise, so nesting resolves correctly later.
 */
export function traceBinaryContours(
  binary: Uint8Array,
  width: number,
  height: number
): Ring[] {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : binary[y * width + x];

  const cornerIndex = (x: number, y: number) => y * (width + 1) + x;
  const cornerPoint = (index: number): [number, number] => [
    index % (width + 1),
    Math.floor(index / (width + 1)),
  ];

  // Directed edges keyed by their start vertex (grid corners).
  const edges = new Map<number, number[]>();
  const addEdge = (fromX: number, fromY: number, toX: number, toY: number) => {
    const key = cornerIndex(fromX, fromY);
    const list = edges.get(key);
    const target = cornerIndex(toX, toY);
    if (list) list.push(target);
    else edges.set(key, [target]);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (at(x, y) === 0) continue;
      if (at(x, y - 1) === 0) addEdge(x + 1, y, x, y);
      if (at(x + 1, y) === 0) addEdge(x + 1, y + 1, x + 1, y);
      if (at(x, y + 1) === 0) addEdge(x, y + 1, x + 1, y + 1);
      if (at(x - 1, y) === 0) addEdge(x, y, x, y + 1);
    }
  }

  const rings: Ring[] = [];
  const limit = width * height * 4 + 16;

  for (const [startKey] of edges) {
    let guard = 0;
    while ((edges.get(startKey)?.length ?? 0) > 0 && guard < limit) {
      guard += 1;

      const ring: Ring = [];
      let currentKey = startKey;

      for (;;) {
        const list = edges.get(currentKey);
        if (!list || list.length === 0) break;

        const next = list.shift();
        if (next === undefined) break;

        const point = cornerPoint(currentKey);
        ring.push([point[0], point[1]]);
        currentKey = next;

        if (currentKey === startKey) break;
      }

      if (ring.length >= 4) {
        ring.push([ring[0][0], ring[0][1]]);
        rings.push(ring);
      }
    }
  }

  return rings;
}

export type GridTraceOptions = {
  /** Simplification tolerance in grid units. */
  tolerance?: number;
  /** Scale applied to grid coordinates (e.g. 1 / supersample). */
  scale?: number;
  /** Offset applied after scaling. */
  offset?: { x: number; y: number };
};

/** Pure grid → editable subpaths, with holes resolved by even-odd nesting. */
export function subpathsFromBinaryGrid(
  binary: Uint8Array,
  width: number,
  height: number,
  options: GridTraceOptions = {}
): SubPath[] {
  const tolerance = options.tolerance ?? 1;
  const scale = options.scale ?? 1;
  const offset = options.offset ?? { x: 0, y: 0 };

  const contours = traceBinaryContours(binary, width, height)
    .map((ring) => simplifyRing(ring, tolerance))
    .map((ring) =>
      ring.map(([x, y]) => [x * scale + offset.x, y * scale + offset.y] as [number, number])
    )
    .filter((ring) => ring.length >= 4);

  if (contours.length === 0) return [];

  // Tracing leaves stair-stepped polylines; fit curves back on so letterforms
  // come out smooth and editable.
  return fitSubpaths(regionToSubpaths(ringsToRegion(contours)), 0.15);
}

export type TextOutlineOptions = {
  text: string;
  fontFamily: string;
  /** Cap height in target pixels. */
  sizePx: number;
  bold?: boolean;
  italic?: boolean;
  /** Extra gap between letters, as a fraction of the font size. */
  letterSpacing?: number;
  supersample?: number;
};

export type TextOutlineResult = {
  subpaths: SubPath[];
  /** Bounding box of the traced outlines, in target pixels. */
  width: number;
  height: number;
};

/**
 * Convert a line of text into outlines. Requires a canvas, so it only runs in
 * the browser.
 */
export function traceTextToSubpaths(options: TextOutlineOptions): TextOutlineResult | null {
  const text = options.text;
  if (!text.trim()) return null;

  const supersample = options.supersample ?? DEFAULT_SUPERSAMPLE;
  const baseSize = 100;
  const fontFor = (size: number) =>
    `${options.italic ? "italic " : ""}${options.bold ? "bold " : ""}${size}px ${options.fontFamily}`;

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) return null;

  measureCtx.font = fontFor(baseSize);
  const measured = measureCtx.measureText(text);
  const ascent = measured.actualBoundingBoxAscent || baseSize * 0.8;
  const descent = measured.actualBoundingBoxDescent || baseSize * 0.2;
  const sizeRatio = options.sizePx / baseSize;
  const targetWidth = measured.width * sizeRatio;
  const targetHeight = options.sizePx;

  if (targetWidth <= 0) return null;

  const padding = 8;
  const canvasWidth = Math.ceil(targetWidth * supersample) + padding * 2;
  const canvasHeight = Math.ceil(targetHeight * supersample) + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.font = fontFor(baseSize * supersample * sizeRatio);

  // Position the baseline so the glyph box sits inside the canvas.
  const baseline = padding + (ascent / (ascent + descent)) * targetHeight * supersample;

  // Letter spacing is applied by drawing character by character, which works
  // regardless of whether the context supports the letterSpacing property.
  const spacingPx = (options.letterSpacing ?? 0) * baseSize * supersample * sizeRatio;

  if (spacingPx === 0) {
    ctx.fillText(text, padding, baseline);
  } else {
    let cursor = padding;
    const characters = [...text];
    characters.forEach((character, index) => {
      ctx.fillText(character, cursor, baseline);
      cursor += ctx.measureText(character).width;
      if (index < characters.length - 1) cursor += spacingPx;
    });
  }

  const image = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const binary = new Uint8Array(canvasWidth * canvasHeight);
  for (let i = 0; i < binary.length; i += 1) {
    binary[i] = image.data[i * 4 + 3] > 127 ? 1 : 0;
  }

  // Tolerance is in supersampled pixels, so 1 grid unit here is ~0.17 target
  // pixels — fine detail for the tracer, which then fits curves onto the result.
  const scale = 1 / supersample;
  const subpaths = subpathsFromBinaryGrid(binary, canvasWidth, canvasHeight, {
    tolerance: 1,
    scale,
    offset: { x: -padding * scale, y: -padding * scale },
  });

  if (subpaths.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const subpath of subpaths) {
    for (const anchor of subpath.anchors) {
      if (anchor.x < minX) minX = anchor.x;
      if (anchor.y < minY) minY = anchor.y;
      if (anchor.x > maxX) maxX = anchor.x;
      if (anchor.y > maxY) maxY = anchor.y;
    }
  }

  // Normalise so the caller can place the text by its top-left corner.
  const moved = subpaths.map((subpath) => ({
    ...subpath,
    anchors: subpath.anchors.map((anchor) => ({
      x: anchor.x - minX,
      y: anchor.y - minY,
    })),
  }));

  return { subpaths: moved, width: maxX - minX, height: maxY - minY };
}

/** Fonts offered for text outlines; all resolve to a locally installed family. */
export const TEXT_FONTS = [
  "Arial",
  "Segoe UI",
  "Tahoma",
  "Verdana",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Garamond",
  "Courier New",
  "Impact",
  "Arial Black",
  "Comic Sans MS",
];
