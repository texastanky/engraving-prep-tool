import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useCustomPresets } from "./use-custom-presets.ts";

const preset = { name: "Plate outline", width: 2, height: 1, unit: "in" as const, maskDataUrl: "data:image/png;base64,test" };
beforeEach(() => window.localStorage.clear());
afterEach(() => { delete window.engravingStorage; vi.restoreAllMocks(); });

it("keeps multiple saves made before React rerenders", () => {
  const { result } = renderHook(useCustomPresets);
  act(() => {
    expect(result.current.addPreset(preset)).toEqual(expect.any(String));
    expect(result.current.addPreset({ ...preset, name: "Second" })).toEqual(expect.any(String));
  });
  expect(result.current.presets.map(p => p.name)).toEqual(["Plate outline", "Second"]);
  expect(JSON.parse(window.localStorage.getItem("laser-canvas-custom-presets")!)).toHaveLength(2);
});

it("reports failed additions and deletions without changing saved presets", () => {
  const error = vi.spyOn(toast, "error").mockImplementation(() => "test-toast");
  const existing = { ...preset, id: "existing" };
  window.engravingStorage = {
    getItem: () => JSON.stringify([existing]),
    setItem: () => { throw new Error("Disk full"); },
  };
  const { result } = renderHook(useCustomPresets);
  act(() => { expect(result.current.addPreset(preset)).toBeNull(); });
  expect(result.current.presets).toEqual([existing]);
  act(() => { expect(result.current.removePreset(existing.id)).toBe(false); });
  expect(result.current.presets).toEqual([existing]);
  expect(error).toHaveBeenCalledTimes(2);
});
