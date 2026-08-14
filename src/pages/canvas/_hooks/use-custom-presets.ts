/**
 * Hook for managing custom part outline presets stored in localStorage.
 */
import { useState, useCallback } from "react";

export type CustomPreset = {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: "in" | "mm";
  maskDataUrl: string; // PNG data URL of the traced outline
};

const STORAGE_KEY = "laser-canvas-custom-presets";

function loadPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: CustomPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
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
