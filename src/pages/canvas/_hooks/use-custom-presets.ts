/**
 * Hook for managing custom part outline presets stored in localStorage.
 */
import { useState, useCallback } from "react";
import type { DesignMask } from "../_components/design-mask.ts";

export type CustomPresetPoint = {
  x: number;
  y: number;
};

export type CustomPresetTraceStyle = {
  strokeColor?: string;
  strokeWidth?: number;
  fillEnabled?: boolean;
  fillColor?: string;
};

/**
 * The rest of the job, so a part can be repeated exactly rather than
 * approximately: where the artwork sat, and the shapes cut into or out of it.
 * The numbers are in canvas pixels, with the space they were measured in, so
 * they can be scaled onto a workspace of any size. Optional, because presets
 * saved before this existed carry only the outline.
 */
export type CustomPresetSetup = {
  space: { width: number; height: number };
  design?: {
    /** Centre of the artwork on the workspace. */
    centerX: number;
    centerY: number;
    /** Rendered width, so a different resolution of the same art still works. */
    width: number;
    rotation: number;
  };
  mask?: DesignMask | null;
  keepOuts?: DesignMask[];
  /**
   * Other parts on the bed, as offsets from the traced outline. A part may carry
   * its own outline (a saved trace of a different piece).
   */
  partCopies?: {
    id: string;
    dx: number;
    dy: number;
    name?: string;
    points?: { x: number; y: number }[];
    closed?: boolean;
  }[];
  clipToTrace?: boolean;
};

export type CustomPreset = {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: "in" | "mm";
  maskDataUrl: string; // image data URL of the traced outline preview
  tracePoints?: CustomPresetPoint[];
  traceClosed?: boolean;
  traceStyle?: CustomPresetTraceStyle;
  setup?: CustomPresetSetup;
  createdAt?: string;
  source?: "pen-trace" | "outline-tracer";
};

const STORAGE_KEY = "laser-canvas-custom-presets";

function loadPresets(): CustomPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((preset): preset is CustomPreset => (
      preset &&
      typeof preset.id === "string" &&
      typeof preset.name === "string" &&
      typeof preset.width === "number" &&
      typeof preset.height === "number" &&
      (preset.unit === "in" || preset.unit === "mm") &&
      typeof preset.maskDataUrl === "string"
    ));
  } catch {
    return [];
  }
}

function savePresets(presets: CustomPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Storage may be full; silently ignore
  }
}

export function useCustomPresets() {
  const [presets, setPresets] = useState<CustomPreset[]>(() => loadPresets());

  const addPreset = useCallback((preset: Omit<CustomPreset, "id">) => {
    const newPreset: CustomPreset = {
      ...preset,
      id: `custom-${Date.now()}`,
    };
    setPresets((prev) => {
      const updated = [...prev, newPreset];
      savePresets(updated);
      return updated;
    });
    return newPreset.id;
  }, []);

  const removePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      savePresets(updated);
      return updated;
    });
  }, []);

  return { presets, addPreset, removePreset };
}
