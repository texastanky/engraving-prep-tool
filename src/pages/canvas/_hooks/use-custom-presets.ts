/**
 * Custom part outlines saved to desktop app data or browser storage.
 */
import { useState, useCallback, useRef } from "react";
import { persistentStorage, storageError } from "@/lib/persistent-storage.ts";

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
  createdAt?: string;
  source?: "pen-trace" | "outline-tracer";
};

const STORAGE_KEY = "laser-canvas-custom-presets";

function loadPresets(): CustomPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = persistentStorage.getItem(STORAGE_KEY);
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
    storageError("Could not load saved part presets.");
    return [];
  }
}

export function useCustomPresets() {
  const [presets, setPresets] = useState<CustomPreset[]>(() => loadPresets());
  const currentPresets = useRef(presets);

  const persist = useCallback((updated: CustomPreset[]): boolean => {
    try {
      persistentStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      currentPresets.current = updated;
      setPresets(updated);
      return true;
    } catch {
      storageError("Could not save part presets. Try again or export your trace.");
      return false;
    }
  }, []);

  const addPreset = useCallback((preset: Omit<CustomPreset, "id">) => {
    const newPreset: CustomPreset = {
      ...preset,
      id: `custom-${crypto.randomUUID()}`,
    };
    return persist([...currentPresets.current, newPreset]) ? newPreset.id : null;
  }, [persist]);

  const removePreset = useCallback((id: string) => {
    return persist(currentPresets.current.filter((p) => p.id !== id));
  }, [persist]);

  return { presets, addPreset, removePreset };
}
