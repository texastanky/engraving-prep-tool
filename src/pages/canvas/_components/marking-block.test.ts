import { describe, expect, it } from "vitest";
import {
  EMPTY_MARKING_FIELDS,
  MARKING_PRESETS,
  TYPICAL_MIN_TEXT_HEIGHT_IN,
  layoutMarkingLines,
  markingBlockHeight,
  markingWarnings,
  type MarkingFields,
} from "./marking-block.ts";

const fields: MarkingFields = {
  ...EMPTY_MARKING_FIELDS,
  maker: "PETES GUNS AND STUFF LLC",
  cityState: "HENDERSON, TX",
  model: "PGS-9",
  caliber: "9MM",
  serial: "ABC123",
};

describe("layoutMarkingLines", () => {
  it("stacks lines with the gap only between them", () => {
    const lines = layoutMarkingLines({
      fields,
      order: ["maker", "cityState"],
      textHeightIn: 0.0625,
      lineGapIn: 0.02,
    });

    expect(lines).toHaveLength(2);
    expect(lines[0].topIn).toBeCloseTo(0, 6);
    expect(lines[1].topIn).toBeCloseTo(0.0625 + 0.02, 6);
    expect(markingBlockHeight(lines, 0.02)).toBeCloseTo(0.0625 * 2 + 0.02, 6);
  });

  it("skips blank lines without leaving gaps behind", () => {
    const lines = layoutMarkingLines({
      fields: { ...fields, model: "", caliber: "   " },
      order: ["maker", "cityState", "model", "caliber", "serial"],
      textHeightIn: 0.07,
      lineGapIn: 0.01,
    });

    expect(lines.map((line) => line.key)).toEqual(["maker", "cityState", "serial"]);
    expect(markingBlockHeight(lines, 0.01)).toBeCloseTo(0.07 * 3 + 0.01 * 2, 6);
  });

  it("preserves the requested order", () => {
    const lines = layoutMarkingLines({
      fields,
      order: ["serial", "caliber", "model", "maker", "cityState"],
      textHeightIn: 0.06,
      lineGapIn: 0.01,
    });
    expect(lines.map((line) => line.key)).toEqual([
      "serial",
      "caliber",
      "model",
      "maker",
      "cityState",
    ]);
  });

  it("trims whitespace from field values", () => {
    const lines = layoutMarkingLines({
      fields: { ...fields, maker: "  PETES GUNS AND STUFF LLC  " },
      order: ["maker"],
      textHeightIn: 0.06,
      lineGapIn: 0.01,
    });
    expect(lines[0].text).toBe("PETES GUNS AND STUFF LLC");
  });

  it("returns nothing when every line is empty", () => {
    const lines = layoutMarkingLines({
      fields: EMPTY_MARKING_FIELDS,
      order: ["maker", "cityState", "serial"],
      textHeightIn: 0.06,
      lineGapIn: 0.01,
    });
    expect(lines).toEqual([]);
    expect(markingBlockHeight(lines, 0.01)).toBe(0);
  });

  it("never produces a zero or negative line height", () => {
    const lines = layoutMarkingLines({
      fields,
      order: ["maker"],
      textHeightIn: 0,
      lineGapIn: -5,
    });
    expect(lines[0].heightIn).toBeGreaterThan(0);
    expect(markingBlockHeight(lines, -5)).toBeGreaterThan(0);
  });
});

describe("markingWarnings", () => {
  it("flags text below the conventional minimum height", () => {
    const warnings = markingWarnings({
      fields,
      order: ["maker", "cityState"],
      textHeightIn: 0.05,
    });
    expect(warnings.join(" ")).toContain("below the 1/16 in");
  });

  it("accepts text at exactly the minimum height", () => {
    const warnings = markingWarnings({
      fields,
      order: ["maker", "cityState"],
      textHeightIn: TYPICAL_MIN_TEXT_HEIGHT_IN,
    });
    expect(warnings).toEqual([]);
  });

  it("flags missing maker and city/state", () => {
    const warnings = markingWarnings({
      fields: { ...EMPTY_MARKING_FIELDS, serial: "ABC123" },
      order: ["maker", "cityState", "serial"],
      textHeightIn: 0.07,
    });
    expect(warnings.join(" ")).toContain("Name / maker is empty");
    expect(warnings.join(" ")).toContain("City and State are empty");
  });

  it("flags a missing serial when the layout calls for one", () => {
    const warnings = markingWarnings({
      fields: { ...fields, serial: "" },
      order: ["maker", "cityState", "serial"],
      textHeightIn: 0.07,
    });
    expect(warnings.join(" ")).toContain("Serial number is empty");
  });

  it("does not nag about a serial the layout does not use", () => {
    const warnings = markingWarnings({
      fields: { ...fields, serial: "" },
      order: ["maker", "cityState"],
      textHeightIn: 0.07,
    });
    expect(warnings.join(" ")).not.toContain("Serial");
  });

  it("says so when there is nothing to mark", () => {
    const warnings = markingWarnings({
      fields: EMPTY_MARKING_FIELDS,
      order: ["maker"],
      textHeightIn: 0.07,
    });
    expect(warnings.join(" ")).toContain("No lines contain text");
  });
});

describe("presets", () => {
  it("offers the arrangements a licensed shop needs", () => {
    const ids = MARKING_PRESETS.map((preset) => preset.id);
    expect(ids).toContain("manufacturer");
    expect(ids).toContain("nfa-complete");
    expect(ids).toContain("form1");
    expect(ids).toContain("importer");
  });

  it("has unique ids and non-empty descriptions", () => {
    const ids = new Set(MARKING_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(MARKING_PRESETS.length);
    for (const preset of MARKING_PRESETS) {
      expect(preset.description.length).toBeGreaterThan(10);
      expect(preset.order.length).toBeGreaterThan(0);
    }
  });

  it("ships no hardcoded shop details", () => {
    // Shop-specific text must come from the shop profile so the app is not
    // personalised to one business.
    for (const preset of MARKING_PRESETS) {
      expect(preset.fields.maker).not.toMatch(/LLC|INC|CORP/i);
      expect(preset.fields.cityState).not.toMatch(/^[A-Z ]+, [A-Z]{2}$/);
    }
  });

  it("lays out cleanly at the conventional minimum height", () => {
    for (const preset of MARKING_PRESETS) {
      const lines = layoutMarkingLines({
        fields: preset.fields,
        order: preset.order,
        textHeightIn: TYPICAL_MIN_TEXT_HEIGHT_IN,
        lineGapIn: 0.01,
      });
      const height = markingBlockHeight(lines, 0.01);
      expect(height).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(height)).toBe(true);
    }
  });
});
