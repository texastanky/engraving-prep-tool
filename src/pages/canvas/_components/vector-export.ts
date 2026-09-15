/**
 * True vector SVG export at actual material size.
 *
 * Objects are grouped by how the laser should treat them — `engrave` (filled),
 * `cut` and `score` (stroked) — which is how xTool / LightBurn style software
 * assigns operations from an imported SVG. Geometry stays as real <path> data,
 * so nothing is rasterised: the F2 can vector-mark with the MOPA and cut with
 * the diode from the same file.
 *
 * Units are millimetres throughout (page size, viewBox and stroke widths) so the
 * imported file lands at the right physical size with no scaling guesswork.
 */

import {
  MODE_INFO,
  objectBounds,
  scaleSubpathsToUnit,
  toPathData,
  type VectorMode,
  type VectorObject,
} from "./vector-path.ts";

export type VectorExportOptions = {
  objects: VectorObject[];
  /** Canvas size in display pixels. */
  displayWidth: number;
  displayHeight: number;
  /** Physical material size in inches. */
  materialWidthIn: number;
  materialHeightIn: number;
  /** Optional job title written into the <title> element. */
  title?: string;
};

export type VectorExportResult = {
  svg: string;
  counts: Record<VectorMode, number>;
  widthMm: number;
  heightMm: number;
};

const MM_PER_INCH = 25.4;

/** Cut/score line width in mm — thin enough for a clean kerf. */
const DEFAULT_CUT_MM = 0.1;
const DEFAULT_SCORE_MM = 0.08;

function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MODE_ORDER: VectorMode[] = ["engrave", "score", "cut"];

export function buildVectorSvg(options: VectorExportOptions): VectorExportResult {
  const { objects, displayWidth, displayHeight, materialWidthIn, materialHeightIn } = options;

  const widthMm = materialWidthIn * MM_PER_INCH;
  const heightMm = materialHeightIn * MM_PER_INCH;
  const safeW = displayWidth > 0 ? displayWidth : 1;
  const safeH = displayHeight > 0 ? displayHeight : 1;

  const scale = { sx: widthMm / safeW, sy: heightMm / safeH };

  const counts: Record<VectorMode, number> = { engrave: 0, cut: 0, score: 0 };
  const groups: string[] = [];

  for (const mode of MODE_ORDER) {
    const group = objects.filter((object) => object.mode === mode);
    counts[mode] = group.length;
    if (group.length === 0) continue;

    const info = MODE_INFO[mode];
    const isEngrave = mode === "engrave";
    const defaultMm = mode === "cut" ? DEFAULT_CUT_MM : DEFAULT_SCORE_MM;

    const paths = group.map((object) => {
      const scaled = scaleSubpathsToUnit(object.subpaths, scale);
      const d = toPathData(scaled);
      const bounds = objectBounds(object);
      const attributes = [
        `id="${escapeXml(object.id)}"`,
        `data-name="${escapeXml(object.name)}"`,
        `data-x="${fmt(bounds.x * scale.sx)}"`,
        `data-y="${fmt(bounds.y * scale.sy)}"`,
      ].join(" ");

      if (isEngrave) {
        return `    <path ${attributes} d="${d}" fill="#000000" stroke="none" />`;
      }

      // Cut/score keep their own width when the user set one, but never go
      // below a practical kerf.
      const width = Math.max(defaultMm, object.strokeWidth * scale.sx);
      return `    <path ${attributes} d="${d}" fill="none" stroke="${info.stroke}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round" />`;
    });

    groups.push(`  <g id="${mode}" data-operation="${mode}">\n${paths.join("\n")}\n  </g>`);
  }

  const title = options.title ? escapeXml(options.title) : "Engraving Prep Tool — vector export";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(widthMm)}mm" height="${fmt(heightMm)}mm" viewBox="0 0 ${fmt(widthMm)} ${fmt(heightMm)}">`,
    `  <title>${title}</title>`,
    `  <desc>Actual size: ${fmt(widthMm)} x ${fmt(heightMm)} mm (${fmt(materialWidthIn)} x ${fmt(materialHeightIn)} in). Groups: engrave = fill, cut/score = stroke.</desc>`,
    ...groups,
    `</svg>`,
  ].join("\n");

  return { svg, counts, widthMm, heightMm };
}

export function describeVectorExport(result: VectorExportResult): string {
  const parts: string[] = [];
  if (result.counts.cut) parts.push(`${result.counts.cut} cut`);
  if (result.counts.score) parts.push(`${result.counts.score} score`);
  if (result.counts.engrave) parts.push(`${result.counts.engrave} engrave`);
  const detail = parts.length ? parts.join(" · ") : "no objects";
  return `${detail} — ${fmt(result.widthMm)} × ${fmt(result.heightMm)} mm`;
}
