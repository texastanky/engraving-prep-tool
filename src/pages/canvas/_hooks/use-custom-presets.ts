/**
 * Hook for managing custom part outline presets, with a private cloud library
 * when the user is signed in.
 *
 * Local layers (in order of preference): the app's file store through the local
 * API, then localStorage. Browser storage is keyed to the page's origin, and
 * the desktop app served its page from a different port every launch — so
 * parts saved in the workspace did not survive a restart. A file does.
 *
 * Cloud layer: when the user is signed in, saved parts are also written to
 * their `part_templates` table rows so the library follows them between
 * machines. On start the cloud list, when it answers, wins: it is newer than
 * anything local.
 */
import { useState, useCallback, useEffect } from "react";
import type { DesignMask } from "../_components/design-mask.ts";
import {
  deletePartTemplate,
  ensureValidSession,
  insertPartTemplate,
  listPartTemplates,
  type NewPartTemplate,
  type PartTemplateRow,
} from "@/lib/supabase.ts";

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
    centerX: number;
    centerY: number;
    width: number;
    rotation: number;
  };
  mask?: DesignMask | null;
  keepOuts?: DesignMask[];
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

/** The saved parts, from the app's file store. Null when there is no store. */
async function loadFromStore(): Promise<CustomPreset[] | null> {
  try {
    const response = await fetch("/api/presets");
    if (!response.ok) return null;
    const payload = await response.json();
    if (!Array.isArray(payload?.presets)) return null;
    return payload.presets.filter(
      (preset: CustomPreset) => preset && typeof preset.id === "string"
    );
  } catch {
    return null;
  }
}

async function saveToStore(presets: CustomPreset[]): Promise<void> {
  try {
    await fetch("/api/presets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presets }),
    });
  } catch {
    // The localStorage mirror above stands in for it.
  }
}

function rowToPreset(row: PartTemplateRow): CustomPreset {
  const preset: CustomPreset = {
    id: `cloud-${row.id}`,
    name: row.name,
    width: row.width,
    height: row.height,
    unit: row.unit,
    maskDataUrl: row.mask_data_url,
    createdAt: row.created_at,
  };
  if (Array.isArray(row.trace_points)) preset.tracePoints = row.trace_points as CustomPresetPoint[];
  if (typeof row.trace_closed === "boolean") preset.traceClosed = row.trace_closed;
  if (row.trace_style && typeof row.trace_style === "object") {
    preset.traceStyle = row.trace_style as CustomPresetTraceStyle;
  }
  if (row.setup && typeof row.setup === "object") preset.setup = row.setup as CustomPresetSetup;
  if (row.source === "pen-trace" || row.source === "outline-tracer") preset.source = row.source;
  return preset;
}

function presetToRow(preset: CustomPreset): NewPartTemplate {
  return {
    name: preset.name,
    width: preset.width,
    height: preset.height,
    unit: preset.unit,
    mask_data_url: preset.maskDataUrl,
    trace_points: preset.tracePoints ?? null,
    trace_closed: preset.traceClosed ?? null,
    trace_style: preset.traceStyle ?? null,
    setup: preset.setup ?? null,
    source: preset.source ?? null,
  };
}

export function useCustomPresets() {
  const [presets, setPresets] = useState<CustomPreset[]>(() => loadPresets());

  // Adopt the file store once it answers. localStorage can be empty simply
  // because the app landed on a new port again, which is no reason to lose parts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadFromStore();
      if (cancelled || !stored) return;
      setPresets(stored);
      savePresets(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cloud adoption: when signed in, the cloud library wins on start.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await ensureValidSession();
      if (!session || cancelled) return;
      const rows = await listPartTemplates(session);
      if (cancelled || !rows) return;
      const cloudPresets = rows.map(rowToPreset);
      setPresets(cloudPresets);
      savePresets(cloudPresets);
      void saveToStore(cloudPresets);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addPreset = useCallback((preset: Omit<CustomPreset, "id">) => {
    const newPreset: CustomPreset = {
      ...preset,
      id: `custom-${Date.now()}`,
    };
    setPresets((prev) => {
      const updated = [...prev, newPreset];
      savePresets(updated);
      void saveToStore(updated);
      return updated;
    });
    void (async () => {
      const session = await ensureValidSession();
      if (!session) return;
      const row = await insertPartTemplate(session, presetToRow(newPreset));
      if (row) {
        setPresets((prev) =>
          prev.map((p) => (p.id === newPreset.id ? rowToPreset(row) : p))
        );
      }
    })();
    return newPreset.id;
  }, []);

  const removePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      savePresets(updated);
      void saveToStore(updated);
      return updated;
    });
    void (async () => {
      if (!id.startsWith("cloud-")) return;
      const session = await ensureValidSession();
      if (!session) return;
      await deletePartTemplate(session, id.slice("cloud-".length));
    })();
  }, []);

  return { presets, addPreset, removePreset };
}
