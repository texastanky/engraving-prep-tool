/**
 * FFL / NFA marking blocks.
 *
 * Licensed manufacturers and importers have to mark firearms and NFA firearms
 * with specific information — typically the maker's name, the city and state,
 * and on NFA items also the model, caliber and serial. Laying that text out by
 * hand, at the right size and consistently positioned, is slow and easy to get
 * wrong, so this builds it as editable outlines.
 *
 * IMPORTANT: this is a layout tool, not legal advice. The defaults here are
 * conventional values for a licensed manufacturer's markings; the responsible
 * person must confirm the current requirements (for example 27 CFR 478.92 and
 * 479.102), including required text, minimum character height, minimum depth and
 * placement, and must measure a test mark before touching a finished part.
 */

import { traceTextToSubpaths } from "./text-outline.ts";
import type { SubPath } from "./vector-path.ts";

export type MarkingLineKey = "maker" | "cityState" | "model" | "caliber" | "serial" | "extra";

export type MarkingFields = Record<MarkingLineKey, string>;

export type MarkingPreset = {
  id: string;
  name: string;
  description: string;
  fields: MarkingFields;
  order: MarkingLineKey[];
};

/** Conventional minimum character height for licensed manufacturer markings. */
export const TYPICAL_MIN_TEXT_HEIGHT_IN = 1 / 16;

/** Conventional minimum engraving depth for licensed manufacturer markings. */
export const TYPICAL_MIN_DEPTH_IN = 0.003;

export const MARKING_LINE_LABELS: Record<MarkingLineKey, string> = {
  maker: "Name / maker",
  cityState: "City, State",
  model: "Model",
  caliber: "Caliber",
  serial: "Serial number",
  extra: "Extra line",
};

export const EMPTY_MARKING_FIELDS: MarkingFields = {
  maker: "",
  cityState: "",
  model: "",
  caliber: "",
  serial: "",
  extra: "",
};

export const MARKING_PRESETS: MarkingPreset[] = [
  {
    id: "manufacturer",
    name: "Manufacturer marking",
    description:
      "Maker name and city/state, as a licensed manufacturer marks a firearm it builds.",
    // Shop-specific text comes from the shop profile, not hardcoded here.
    fields: EMPTY_MARKING_FIELDS,
    order: ["maker", "cityState"],
  },
  {
    id: "nfa-complete",
    name: "NFA marking (full)",
    description:
      "Maker, city/state, model, caliber and serial — the usual set for an NFA firearm you manufacture.",
    fields: EMPTY_MARKING_FIELDS,
    order: ["maker", "cityState", "model", "caliber", "serial"],
  },
  {
    id: "form1",
    name: "Form 1 applicant",
    description: "The name, city and state exactly as they appear on the approved application.",
    fields: EMPTY_MARKING_FIELDS,
    order: ["maker", "cityState", "model", "caliber", "serial"],
  },
  {
    id: "importer",
    name: "Importer marking",
    description: "Importer name and location, plus the country of origin line.",
    fields: { ...EMPTY_MARKING_FIELDS, extra: "MADE IN" },
    order: ["maker", "cityState", "model", "caliber", "serial", "extra"],
  },
  {
    id: "serial-only",
    name: "Serial, model, caliber",
    description: "Just the identifying lines, when the rest is already marked elsewhere.",
    fields: EMPTY_MARKING_FIELDS,
    order: ["model", "caliber", "serial"],
  },
  {
    id: "custom",
    name: "Custom",
    description: "Start from what you have configured and edit the lines freely.",
    fields: EMPTY_MARKING_FIELDS,
    order: ["maker", "cityState", "model", "caliber", "serial", "extra"],
  },
];

export type MarkingLayoutOptions = {
  fields: MarkingFields;
  order: MarkingLineKey[];
  /** Cap height of each line, in inches. */
  textHeightIn: number;
  /** Gap between lines, in inches. */
  lineGapIn: number;
};

export type MarkingLayoutLine = {
  key: MarkingLineKey;
  text: string;
  /** Top of this line, measured from the top of the block, in inches. */
  topIn: number;
  heightIn: number;
};

/**
 * Stack the non-empty lines top to bottom. Gaps are only counted *between*
 * lines, so the block height is the sum of the lines plus the gaps.
 */
export function layoutMarkingLines(options: MarkingLayoutOptions): MarkingLayoutLine[] {
  const lines: MarkingLayoutLine[] = [];
  const height = Math.max(0.001, options.textHeightIn);
  const gap = Math.max(0, options.lineGapIn);

  let top = 0;
  for (const key of options.order) {
    const text = (options.fields[key] ?? "").trim();
    if (!text) continue;
    lines.push({ key, text, topIn: top, heightIn: height });
    top += height + gap;
  }

  return lines;
}

/** Total height of a laid-out block, in inches. */
export function markingBlockHeight(lines: MarkingLayoutLine[], lineGapIn: number): number {
  if (lines.length === 0) return 0;
  const last = lines[lines.length - 1];
  return last.topIn + last.heightIn;
}

export type MarkingWarningsOptions = {
  fields: MarkingFields;
  order: MarkingLineKey[];
  textHeightIn: number;
};

/**
 * Things worth flagging before a marking is cut. Reminders, not compliance
 * determinations.
 */
export function markingWarnings(options: MarkingWarningsOptions): string[] {
  const warnings: string[] = [];
  const present = (key: MarkingLineKey) => (options.fields[key] ?? "").trim().length > 0;

  if (options.textHeightIn + 1e-9 < TYPICAL_MIN_TEXT_HEIGHT_IN) {
    warnings.push(
      "Character height is below the 1/16 in (0.0625 in) minimum conventionally used for licensed manufacturer markings."
    );
  }

  const filled = options.order.filter((key) => present(key));
  if (filled.length === 0) {
    warnings.push("No lines contain text yet.");
    return warnings;
  }

  if (!present("maker")) {
    warnings.push("Name / maker is empty — it is normally required.");
  }
  if (!present("cityState")) {
    warnings.push("City and State are empty — they are normally required.");
  }
  if (options.order.includes("serial") && !present("serial")) {
    warnings.push("Serial number is empty — NFA markings normally require it.");
  }

  return warnings;
}

export type MarkingBuildOptions = {
  lines: MarkingLayoutLine[];
  /** Display pixels per inch on the canvas. */
  pxPerInch: number;
  /** Top-left of the block, in display pixels. */
  originPx: { x: number; y: number };
  fontFamily: string;
  bold?: boolean;
  lineGapIn: number;
};

export type MarkingBuildResult = {
  subpaths: SubPath[];
  widthPx: number;
  heightPx: number;
};

/**
 * Build the block as editable outlines. Each line is traced independently and
 * left-aligned to the block origin, which is how these markings are normally
 * laid out and easiest to verify against the part.
 */
export function buildMarkingBlock(options: MarkingBuildOptions): MarkingBuildResult {
  const subpaths: SubPath[] = [];
  let widthPx = 0;

  for (const line of options.lines) {
    const traced = traceTextToSubpaths({
      text: line.text,
      fontFamily: options.fontFamily,
      sizePx: Math.max(3, line.heightIn * options.pxPerInch),
      bold: options.bold,
    });
    if (!traced) continue;

    const offsetX = options.originPx.x;
    const offsetY = options.originPx.y + line.topIn * options.pxPerInch;

    for (const subpath of traced.subpaths) {
      subpaths.push({
        ...subpath,
        anchors: subpath.anchors.map((anchor) => ({
          x: anchor.x + offsetX,
          y: anchor.y + offsetY,
          ...(anchor.in ? { in: { x: anchor.in.x + offsetX, y: anchor.in.y + offsetY } } : {}),
          ...(anchor.out
            ? { out: { x: anchor.out.x + offsetX, y: anchor.out.y + offsetY } }
            : {}),
        })),
      });
    }

    widthPx = Math.max(widthPx, traced.width);
  }

  const heightIn = markingBlockHeight(options.lines, options.lineGapIn);

  return { subpaths, widthPx, heightPx: heightIn * options.pxPerInch };
}
