/**
 * Hook for managing custom part outline presets stored in localStorage.
 */
import { useState, useCallback } from "react";

export type CustomPresetPoint = {
  x: number;
  y: number;
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
