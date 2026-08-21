import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Calculator,
  ClipboardList,
  Copy,
  Download,
  FileUp,
  Save,
  Search,
  SlidersHorizontal,
  TableProperties,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

type RawSettingRow = {
  material?: string;
  thicknessMm?: string;
  preset?: string;
  description?: string;
  lightBurnType?: string;
  type?: string;
  xcsProcess?: string;
  power?: string;
  powerMin?: string;
  powerMax?: string;
  speed?: string;
  speedRaw?: string;
  frequencyHz?: string;
  frequencyKHz?: string;
  intervalMm?: string;
  linesPerCm?: string;
  dpi?: string;
  angle?: string;
  crossHatch?: string;
  bidirectional?: string;
  passes?: string;
  numPasses?: string;
  pulseWidth?: string;
  ppi?: string;
  ditherMode?: string;
  notes?: string;
};

type ConvertedPreset = {
  id: string;
  material: string;
  thicknessMm: string;
  preset: string;
  lightBurnType: string;
  xcsProcess: string;
  powerMin: string;
  powerMax: string;
  speed: string;
  frequencyHz: string;
  frequencyKHz: string;
  intervalMm: string;
  linesPerCm: string;
  dpi: string;
  angle: string;
  angleMode: string;
  crossHatch: string;
  bidirectional: string;
  passes: string;
  pulseWidth: string;
  ppi: string;
  ditherMode: string;
  notes: string;
};

type SavedPreset = ConvertedPreset & {
  savedId: string;
  savedName: string;
  savedAt: string;
  savedSource: string;
};

type QuickValues = {
  interval: string;
  lines: string;
  dpi: string;
};

const PROCESS_OPTIONS = ["Engrave / Fill", "Bitmap Engrave", "Cut / Score"] as const;
const SAVED_PRESETS_KEY = "pgs-xtool-converter-saved-presets-v1";

const EXAMPLE_ROWS: RawSettingRow[] = [
  {
    material: "Aluminum",
    thicknessMm: "-1.0000",
    preset: "Dark mark",
    lightBurnType: "Scan",
    powerMin: "65",
    powerMax: "73",
    speed: "1500",
    frequencyHz: "45000",
    intervalMm: "0.002",
    angle: "45",
    crossHatch: "1",
    bidirectional: "0",
    passes: "1",
  },
  {
    material: "Brass",
    thicknessMm: "-1.0000",
    preset: "Photo details",
    lightBurnType: "Image",
    powerMin: "14",
    powerMax: "73",
    speed: "250",
    frequencyHz: "50000",
    intervalMm: "0.025",
    angle: "0",
    crossHatch: "0",
    passes: "1",
  },
  {
    material: "Aluminum",
    thicknessMm: "-1.0000",
    preset: "Engrave",
    lightBurnType: "Scan",
    powerMin: "65",
    powerMax: "65",
    speed: "1000",
    frequencyHz: "25000",
    intervalMm: "0.025",
    angle: "45",
    crossHatch: "1",
    bidirectional: "0",
    passes: "1",
  },
];

function createSavedId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readSavedPresets(): SavedPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is SavedPreset =>
        item &&
        typeof item === "object" &&
        typeof item.savedId === "string" &&
        typeof item.material === "string" &&
        typeof item.preset === "string",
    );
  } catch {
    return [];
  }
}

function writeSavedPresets(presets: SavedPreset[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

function presetIdentity(row: ConvertedPreset): string {
  return [
    row.material,
    row.thicknessMm,
    row.preset,
    row.xcsProcess,
    row.powerMin,
    row.powerMax,
    row.speed,
    row.passes,
    row.linesPerCm,
    row.frequencyKHz,
    row.angle,
    row.crossHatch,
  ].join("\u001f");
}

function toSavedPreset(
  row: ConvertedPreset,
  sourceName: string,
  existing?: SavedPreset,
): SavedPreset {
  return {
    ...row,
    savedId: existing?.savedId ?? createSavedId(),
    savedName: existing?.savedName ?? `${row.material} - ${row.preset}`,
    savedAt: new Date().toISOString(),
    savedSource: sourceName || existing?.savedSource || "converter",
  };
}

function savedToConverted(row: SavedPreset): ConvertedPreset {
  const {
    savedId,
    savedName,
    savedAt,
    savedSource,
    ...converted
  } = row;

  void savedName;
  void savedAt;
  void savedSource;

  return {
    ...converted,
    id: `saved-${savedId}`,
  };
}

function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: string | number | null | undefined, places = 3): string {
  const number = numberOrNull(value);
  if (number === null) return "";
  return String(Number(number.toFixed(places)));
}

function childValue(parent: Element | null | undefined, tagName: string): string {
  if (!parent) return "";
  const node = parent.getElementsByTagName(tagName)[0];
  return node?.getAttribute("Value") ?? "";
}

function mapProcess(type: string | undefined): string {
  if (type === "Scan") return "Engrave / Fill";
  if (type === "Image") return "Bitmap Engrave";
  if (type === "Cut") return "Cut / Score";
  return type || "Unknown";
}

function normalizeBooleanLabel(value: string | undefined): "On" | "Off" {
  const text = String(value || "").trim();
  return text === "1" || /^(true|on|yes)$/i.test(text) ? "On" : "Off";
}

function normalizeRow(row: RawSettingRow, index: number): ConvertedPreset {
  const interval = numberOrNull(row.intervalMm);
  const linesPerCm =
    interval !== null && interval > 0
      ? 10 / interval
      : numberOrNull(row.linesPerCm);
  const dpi = linesPerCm ? linesPerCm * 2.54 : numberOrNull(row.dpi);
  const frequencyHz = numberOrNull(row.frequencyHz);
  const frequencyKHz =
    numberOrNull(row.frequencyKHz) ?? (frequencyHz ? frequencyHz / 1000 : null);
  const powerMax = row.powerMax || row.power || "";
  const powerMin = row.powerMin || "";
  const angle = row.angle || "0";
  const bidirectional = normalizeBooleanLabel(row.bidirectional);

  return {
    id: `${index}-${row.material || "material"}-${row.preset || row.description || "preset"}-${row.lightBurnType || row.type || "type"}`,
    material: row.material || "Unknown Material",
    thicknessMm: row.thicknessMm || "",
    preset: row.preset || row.description || "Preset",
    lightBurnType: row.lightBurnType || row.type || "",
    xcsProcess: row.xcsProcess || mapProcess(row.lightBurnType || row.type),
    powerMin,
    powerMax,
    speed: row.speed || row.speedRaw || "",
    frequencyHz: row.frequencyHz || "",
    frequencyKHz: frequencyKHz ? round(frequencyKHz, 3) : "",
    intervalMm: interval ? round(interval, 4) : row.intervalMm || "",
    linesPerCm: linesPerCm ? String(Math.round(linesPerCm)) : row.linesPerCm || "",
    dpi: dpi ? String(Math.round(dpi)) : row.dpi || "",
    angle,
    angleMode: angle !== "0" && angle !== "" ? "Fixed" : "Fixed at 0",
    crossHatch: normalizeBooleanLabel(row.crossHatch),
    bidirectional: bidirectional === "On" ? "Bi-directional" : "Uni-directional or default",
    passes: row.passes || row.numPasses || "1",
    pulseWidth: row.pulseWidth || "Not in CLB",
    ppi: row.ppi || "",
    ditherMode: row.ditherMode || "",
    notes: row.notes || "",
  };
}

function parseClb(text: string): ConvertedPreset[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text.trim(), "application/xml");
  if (xml.querySelector("parsererror")) {
    throw new Error("That XML could not be parsed.");
  }

  const root = xml.querySelector("LightBurnLibrary");
  if (!root) {
    throw new Error("This does not look like a LightBurn .clb library.");
  }

  const rawRows: RawSettingRow[] = [];
  Array.from(root.querySelectorAll("Material")).forEach((material) => {
    Array.from(material.querySelectorAll("Entry")).forEach((entry) => {
      const setting = entry.querySelector("CutSetting");
      const type = setting?.getAttribute("type") || "";
      rawRows.push({
        material: material.getAttribute("name") || "Unknown Material",
        thicknessMm: entry.getAttribute("Thickness") || "",
        preset: entry.getAttribute("Desc") || "Preset",
        lightBurnType: type,
        xcsProcess: mapProcess(type),
        powerMin: childValue(setting, "minPower"),
        powerMax: childValue(setting, "maxPower"),
        speed: childValue(setting, "speed"),
        frequencyHz: childValue(setting, "frequency"),
        intervalMm: childValue(setting, "interval"),
        angle: childValue(setting, "angle"),
        crossHatch: childValue(setting, "crossHatch"),
        bidirectional: childValue(setting, "bidir"),
        passes: childValue(setting, "numPasses") || "1",
        ppi: childValue(setting, "PPI"),
        ditherMode: childValue(setting, "ditherMode"),
      });
    });
  });

  return rawRows.map(normalizeRow);
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getCsvValue(source: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const direct = source[alias];
    if (direct) return direct;
    const normalized = source[normalizeHeader(alias)];
    if (normalized) return normalized;
  }
  return "";
}

function parseCsv(text: string): ConvertedPreset[] {
  const rows = csvToRows(text);
  if (rows.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const headers = rows[0].map((header) => header.trim());
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim()));

  return dataRows.map((cells, index) => {
    const source: Record<string, string> = {};
    headers.forEach((header, i) => {
      const value = cells[i] || "";
      source[header] = value;
      source[normalizeHeader(header)] = value;
    });

    return normalizeRow(
      {
        material: getCsvValue(source, ["Material"]),
        thicknessMm: getCsvValue(source, ["ThicknessMM", "Thickness mm"]),
        preset: getCsvValue(source, ["PresetName", "Description", "Preset"]),
        xcsProcess: getCsvValue(source, ["XcsProcess", "XCS Process"]),
        lightBurnType: getCsvValue(source, ["LightBurnType", "Type"]),
        powerMin: getCsvValue(source, ["PowerMinPercent", "Power Min Percent"]),
        powerMax: getCsvValue(source, ["PowerMaxPercent", "PowerMax", "Power"]),
        speed: getCsvValue(source, ["SpeedRaw", "Speed"]),
        frequencyHz: getCsvValue(source, ["FrequencyHz", "Frequency Hz"]),
        frequencyKHz: getCsvValue(source, ["FrequencyKHz", "Frequency kHz"]),
        intervalMm: getCsvValue(source, ["LineIntervalMM", "IntervalMM", "Interval mm"]),
        linesPerCm: getCsvValue(source, ["LinesPerCm", "Lines per cm"]),
        dpi: getCsvValue(source, ["CalculatedDPI", "DPI"]),
        angle: getCsvValue(source, ["AngleDeg", "Angle"]),
        crossHatch: getCsvValue(source, ["CrossHatch", "Cross"]),
        bidirectional: getCsvValue(source, ["Bidirectional"]),
        passes: getCsvValue(source, ["NumPasses", "PassCount", "Pass"]),
        pulseWidth: getCsvValue(source, ["PulseWidth", "Pulse width"]),
        ppi: getCsvValue(source, ["PPI"]),
        ditherMode: getCsvValue(source, ["DitherMode"]),
        notes: getCsvValue(source, ["Notes"]),
      },
      index,
    );
  });
}

function csvToRows(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      current.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      current.push(cell);
      rows.push(current);
      current = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || current.length) {
    current.push(cell);
    rows.push(current);
  }

  return rows;
}

function detectAndParse(text: string, name = "pasted data"): ConvertedPreset[] {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  if (!trimmed) throw new Error("No data found.");

  const rows =
    trimmed.startsWith("<") ||
    name.toLowerCase().endsWith(".clb") ||
    name.toLowerCase().endsWith(".xml")
      ? parseClb(trimmed)
      : parseCsv(trimmed);

  if (!rows.length) throw new Error("No presets were found.");
  return rows;
}

function powerDisplay(row: ConvertedPreset): string {
  if (row.powerMin && row.powerMax && row.powerMin !== row.powerMax) {
    return `${row.powerMin}-${row.powerMax}`;
  }
  return row.powerMax || row.powerMin || "";
}

function selectedChecklist(row: ConvertedPreset | null): string {
  if (!row) return "";
  return [
    `Material: ${row.material}`,
    `Preset: ${row.preset}`,
    `XCS process: ${row.xcsProcess}`,
    `Power (%): ${powerDisplay(row)}`,
    `Speed (mm/s): ${row.speed}`,
    `Pass: ${row.passes}`,
    `Lines per cm: ${row.linesPerCm}`,
    `DPI: ${row.dpi}`,
    `Interval (mm): ${row.intervalMm}`,
    `Frequency (kHz): ${row.frequencyKHz}`,
    `Advanced > Engraving angle: ${row.angle || 0}`,
    `Advanced > Angle mode: ${row.angleMode}`,
    `Advanced > Cross hatch: ${row.crossHatch}`,
    `Engraving mode: ${row.bidirectional}`,
    `Pulse width (ns): ${row.pulseWidth}`,
  ].join("\n");
}

function mappingFields(row: ConvertedPreset | null): Array<{
  label: string;
  value: string;
  copy?: string;
}> {
  if (!row) return [];
  return [
    { label: "Power (%)", value: powerDisplay(row), copy: row.powerMax || row.powerMin },
    { label: "Speed (mm/s)", value: row.speed },
    { label: "Pass", value: row.passes },
    { label: "Lines per cm", value: row.linesPerCm },
    { label: "DPI", value: row.dpi },
    { label: "Interval (mm)", value: row.intervalMm },
    { label: "Frequency (kHz)", value: row.frequencyKHz },
    { label: "Engraving angle", value: `${row.angle || 0} deg` },
    { label: "Angle mode", value: row.angleMode },
    { label: "Cross hatch", value: row.crossHatch },
    { label: "Engraving mode", value: row.bidirectional },
    { label: "Pulse width (ns)", value: row.pulseWidth },
  ];
}

function guidanceText(row: ConvertedPreset | null): string[] {
  if (!row) return ["Import a CLB/CSV and select a preset to see the XCS fields."];
  const notes: string[] = [];
  if (row.powerMin && row.powerMax && row.powerMin !== row.powerMax) {
    notes.push(
      `LightBurn has a ${row.powerMin}-${row.powerMax}% range. XCS usually wants one power value, so start with ${row.powerMax}% and test.`,
    );
  }
  if (row.crossHatch === "On") {
    notes.push("Turn Cross hatch on in Advanced settings. It is separate from Bi-directional engraving.");
  }
  if (row.angle && row.angle !== "0") {
    notes.push(`Set Engraving angle to ${row.angle} and choose Fixed.`);
  }
  if (row.pulseWidth === "Not in CLB") {
    notes.push("Pulse width is not stored in the LightBurn row. Leave your known F2 value or test by material.");
  }
  if (!notes.length) {
    notes.push("Enter these values in the selected object's XCS settings, then test a small patch.");
  }
  return notes;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function rowsToCsv(rows: ConvertedPreset[]): string {
  const headers = [
    "Material",
    "ThicknessMM",
    "PresetName",
    "XcsProcess",
    "Power",
    "PowerMinPercent",
    "PowerMaxPercent",
    "SpeedRaw",
    "Pass",
    "LinesPerCm",
    "DPI",
    "LineIntervalMM",
    "FrequencyKHz",
    "FrequencyHz",
    "AngleDeg",
    "AngleMode",
    "CrossHatch",
    "EngravingMode",
    "PulseWidth",
  ];

  return [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.material,
        row.thicknessMm,
        row.preset,
        row.xcsProcess,
        powerDisplay(row),
        row.powerMin,
        row.powerMax,
        row.speed,
        row.passes,
        row.linesPerCm,
        row.dpi,
        row.intervalMm,
        row.frequencyKHz,
        row.frequencyHz,
        row.angle,
        row.angleMode,
        row.crossHatch,
        row.bidirectional,
        row.pulseWidth,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}

async function copyText(text: string): Promise<void> {
  if (!text) {
    toast.info("Nothing to copy yet.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  toast.success("Copied.");
}

function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function QuickConverter() {
  const [quick, setQuick] = useState<QuickValues>({
    interval: "0.025",
    lines: "400",
    dpi: "1016",
  });

  const updateFromInterval = (value: string) => {
    const interval = numberOrNull(value);
    if (!interval || interval <= 0) {
      setQuick((current) => ({ ...current, interval: value }));
      return;
    }
    const lines = 10 / interval;
    setQuick({
      interval: value,
      lines: String(Math.round(lines)),
      dpi: String(Math.round(lines * 2.54)),
    });
  };

  const updateFromLines = (value: string) => {
    const lines = numberOrNull(value);
    if (!lines || lines <= 0) {
      setQuick((current) => ({ ...current, lines: value }));
      return;
    }
    setQuick({
      interval: round(10 / lines, 4),
      lines: value,
      dpi: String(Math.round(lines * 2.54)),
    });
  };

  const updateFromDpi = (value: string) => {
    const dpi = numberOrNull(value);
    if (!dpi || dpi <= 0) {
      setQuick((current) => ({ ...current, dpi: value }));
      return;
    }
    const lines = dpi / 2.54;
    setQuick({
      interval: round(10 / lines, 4),
      lines: String(Math.round(lines)),
      dpi: value,
    });
  };

  return (
    <div className="rounded-md border border-border/70 bg-secondary/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Calculator className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Quick Converter
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Interval mm</Label>
          <Input
            className="h-8 font-mono text-xs"
            inputMode="decimal"
            value={quick.interval}
            onChange={(event) => updateFromInterval(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Lines per cm</Label>
          <Input
            className="h-8 font-mono text-xs"
            inputMode="numeric"
            value={quick.lines}
            onChange={(event) => updateFromLines(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">DPI</Label>
          <Input
            className="h-8 font-mono text-xs"
            inputMode="numeric"
            value={quick.dpi}
            onChange={(event) => updateFromDpi(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function XtoolSettingsConverterPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(() =>
    typeof window !== "undefined" && window.location.hash === "#xtool-settings",
  );
  const [rows, setRows] = useState<ConvertedPreset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [query, setQuery] = useState("");
  const [processFilter, setProcessFilter] = useState("all");
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(readSavedPresets);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesText =
        !search ||
        `${row.material} ${row.preset} ${row.xcsProcess}`.toLowerCase().includes(search);
      const matchesProcess = processFilter === "all" || row.xcsProcess === processFilter;
      return matchesText && matchesProcess;
    });
  }, [processFilter, query, rows]);

  const fields = mappingFields(selectedRow);
  const notes = guidanceText(selectedRow);

  const loadRows = (nextRows: ConvertedPreset[], nextSourceName: string) => {
    setRows(nextRows);
    setSelectedId(nextRows[0]?.id ?? null);
    setSourceName(nextSourceName);
    setQuery("");
    setProcessFilter("all");
    toast.success(`Loaded ${nextRows.length} presets from ${nextSourceName}.`);
  };

  const parseText = (text: string, name: string) => {
    try {
      loadRows(detectAndParse(text, name), name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not parse that file.");
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => parseText(String(reader.result || ""), file.name);
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsText(file);
  };

  const exportCsv = () => {
    if (!rows.length) {
      toast.info("Nothing to export yet.");
      return;
    }
    downloadText("xtool-converted-settings.csv", rowsToCsv(rows));
    toast.success("Exported converted CSV.");
  };

  const loadExampleRows = () => {
    loadRows(EXAMPLE_ROWS.map(normalizeRow), "example rows");
  };

  const persistSavedPresets = (nextPresets: SavedPreset[]) => {
    if (!writeSavedPresets(nextPresets)) {
      toast.error("Could not save presets in this browser.");
      return false;
    }
    setSavedPresets(nextPresets);
    return true;
  };

  const saveRowsLocally = (rowsToSave: ConvertedPreset[]) => {
    if (!rowsToSave.length) {
      toast.info("No converted presets to save yet.");
      return;
    }

    const nextPresets = [...savedPresets];
    let savedCount = 0;

    rowsToSave.forEach((row) => {
      const key = presetIdentity(row);
      const existingIndex = nextPresets.findIndex(
        (preset) => presetIdentity(preset) === key,
      );
      const existing = existingIndex >= 0 ? nextPresets[existingIndex] : undefined;
      const saved = toSavedPreset(row, sourceName, existing);

      if (existingIndex >= 0) {
        nextPresets.splice(existingIndex, 1);
      } else {
        savedCount += 1;
      }
      nextPresets.unshift(saved);
    });

    if (!persistSavedPresets(nextPresets)) return;
    toast.success(
      savedCount === 0
        ? "Updated saved presets locally."
        : `Saved ${savedCount} preset${savedCount === 1 ? "" : "s"} locally.`,
    );
  };

  const loadSavedRows = () => {
    if (!savedPresets.length) {
      toast.info("No saved presets yet.");
      return;
    }
    loadRows(savedPresets.map(savedToConverted), "saved presets");
  };

  const deleteSavedPreset = (savedId: string) => {
    if (!persistSavedPresets(savedPresets.filter((preset) => preset.savedId !== savedId))) {
      return;
    }
    toast.success("Deleted saved preset.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <DialogTrigger asChild>
          <button
            className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
            type="button"
          >
            <div className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <span className="block truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  xTool Settings Converter
                </span>
                <span className="block truncate text-[10px] text-muted-foreground/70">
                  CLB/CSV to XCS fields
                </span>
              </div>
            </div>
            <Badge variant={rows.length ? "default" : "outline"} className="shrink-0">
              {rows.length}
            </Badge>
          </button>
        </DialogTrigger>
        <div className="space-y-2 border-t border-border px-4 py-3">
          <QuickConverter />
          <Button
            className="h-8 w-full text-xs"
            size="sm"
            variant="secondary"
            type="button"
            onClick={() => setOpen(true)}
          >
            <TableProperties className="h-3.5 w-3.5" />
            Open full converter
          </Button>
        </div>
      </div>

      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-[min(1180px,calc(100vw-2rem))]">
        <div className="border-b border-border bg-card px-5 py-4">
          <DialogHeader className="gap-1 pr-8">
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              xTool Settings Converter
            </DialogTitle>
            <DialogDescription>
              Convert LightBurn CLB or converted CSV rows into the xTool Creative Space fields.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid max-h-[calc(92vh-85px)] min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[260px_minmax(0,1fr)_330px]">
          <aside className="space-y-3 border-b border-border p-4 lg:border-b-0 lg:border-r">
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".clb,.csv,.xml,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readFile(file);
                event.currentTarget.value = "";
              }}
            />

            <button
              className="flex min-h-28 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-secondary/30 px-4 py-5 text-center transition-colors hover:border-primary hover:bg-secondary/50"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) readFile(file);
              }}
            >
              <FileUp className="mb-2 h-5 w-5 text-primary" />
              <strong className="text-sm">Import .clb or .csv</strong>
              <span className="mt-1 text-xs text-muted-foreground">
                LightBurn library or converted table
              </span>
            </button>

            <div className="space-y-2">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Paste Data
              </Label>
              <Textarea
                className="min-h-28 resize-y font-mono text-xs"
                spellCheck={false}
                placeholder="Paste LightBurn XML or converted CSV..."
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-8 text-xs"
                  size="sm"
                  type="button"
                  onClick={() => parseText(pasteText, "pasted data")}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Parse
                </Button>
                <Button
                  className="h-8 text-xs"
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPasteText("");
                    setRows([]);
                    setSelectedId(null);
                    setSourceName("");
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            <QuickConverter />

            <div className="rounded-md border border-border/70 bg-secondary/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Save className="h-3.5 w-3.5 text-primary" />
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Saved In App
                  </p>
                </div>
                <Badge variant="outline">{savedPresets.length}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-8 text-xs"
                  disabled={!selectedRow}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => saveRowsLocally(selectedRow ? [selectedRow] : [])}
                >
                  Save selected
                </Button>
                <Button
                  className="h-8 text-xs"
                  disabled={!rows.length}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => saveRowsLocally(rows)}
                >
                  Save all
                </Button>
              </div>
              <Button
                className="mt-2 h-8 w-full text-xs"
                disabled={!savedPresets.length}
                size="sm"
                type="button"
                onClick={loadSavedRows}
              >
                Load saved
              </Button>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Local only in this browser. Nothing here is uploaded or made public.
              </p>
              {savedPresets.length > 0 && (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                  {savedPresets.slice(0, 8).map((preset) => (
                    <div
                      key={preset.savedId}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md border border-border/60 bg-background/30 p-1.5"
                    >
                      <button
                        className="min-w-0 text-left"
                        type="button"
                        onClick={() => loadRows([savedToConverted(preset)], preset.savedName)}
                      >
                        <span className="block truncate text-xs font-medium">
                          {preset.savedName}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {powerDisplay(preset)}% | {preset.speed || "-"} mm/s | {preset.linesPerCm || "-"} l/cm
                        </span>
                      </button>
                      <Button
                        aria-label={`Delete ${preset.savedName}`}
                        className="h-6 w-6"
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                        onClick={() => deleteSavedPreset(preset.savedId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border/70 bg-secondary/20 p-3 text-xs leading-relaxed text-muted-foreground">
              <p>
                Lines per cm = 10 / interval mm. DPI = lines per cm x 2.54.
              </p>
              <p className="mt-2">
                Cross hatch is the Advanced settings toggle, separate from
                Bi-directional engraving.
              </p>
            </div>
          </aside>

          <section className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <TableProperties className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Converted Presets</h3>
                  <Badge variant="outline">{filteredRows.length} shown</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sourceName ? `Source: ${sourceName}` : "No library loaded yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="h-8 text-xs" size="sm" variant="secondary" type="button" onClick={loadExampleRows}>
                  Example
                </Button>
                <Button className="h-8 text-xs" size="sm" variant="secondary" type="button" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button
                  className="h-8 text-xs"
                  disabled={!selectedRow}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => saveRowsLocally(selectedRow ? [selectedRow] : [])}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
                <Button
                  className="h-8 text-xs"
                  size="sm"
                  type="button"
                  onClick={() => copyText(selectedChecklist(selectedRow))}
                  disabled={!selectedRow}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Checklist
                </Button>
              </div>
            </div>

            <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs"
                  placeholder="Search material, preset, or process"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Select value={processFilter} onValueChange={setProcessFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Process" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All processes</SelectItem>
                  {PROCESS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="min-w-[820px] text-left text-xs">
                <thead className="bg-secondary/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Material</th>
                    <th className="px-2 py-2 font-medium">Preset</th>
                    <th className="px-2 py-2 font-medium">Process</th>
                    <th className="px-2 py-2 font-medium">Power</th>
                    <th className="px-2 py-2 font-medium">Speed</th>
                    <th className="px-2 py-2 font-medium">Lines/cm</th>
                    <th className="px-2 py-2 font-medium">DPI</th>
                    <th className="px-2 py-2 font-medium">Freq kHz</th>
                    <th className="px-2 py-2 font-medium">Cross</th>
                  </tr>
                </thead>
                <tbody>
                  {!rows.length && (
                    <tr>
                      <td className="px-3 py-8 text-center text-muted-foreground" colSpan={10}>
                        Import a CLB or CSV file to begin.
                      </td>
                    </tr>
                  )}
                  {rows.length > 0 && filteredRows.length === 0 && (
                    <tr>
                      <td className="px-3 py-8 text-center text-muted-foreground" colSpan={10}>
                        No presets match the current filters.
                      </td>
                    </tr>
                  )}
                  {filteredRows.map((row, index) => {
                    const isSelected = row.id === selectedId;
                    return (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-t border-border transition-colors ${
                          isSelected ? "bg-primary/15" : "hover:bg-secondary/40"
                        }`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td className="px-2 py-2 font-mono text-muted-foreground">{index + 1}</td>
                        <td className="px-2 py-2 font-medium">{row.material}</td>
                        <td className="px-2 py-2">{row.preset}</td>
                        <td className="px-2 py-2">{row.xcsProcess}</td>
                        <td className="px-2 py-2 font-mono">{powerDisplay(row)}</td>
                        <td className="px-2 py-2 font-mono">{row.speed}</td>
                        <td className="px-2 py-2 font-mono">{row.linesPerCm}</td>
                        <td className="px-2 py-2 font-mono">{row.dpi}</td>
                        <td className="px-2 py-2 font-mono">{row.frequencyKHz}</td>
                        <td className="px-2 py-2">
                          <Badge variant={row.crossHatch === "On" ? "default" : "outline"}>
                            {row.crossHatch}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="min-w-0 space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">XCS Checklist</h3>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {selectedRow ? `${selectedRow.material} - ${selectedRow.preset}` : "No preset selected"}
                </p>
              </div>
              <Button
                aria-label="Copy selected XCS checklist"
                disabled={!selectedRow}
                size="icon-sm"
                type="button"
                variant="secondary"
                onClick={() => copyText(selectedChecklist(selectedRow))}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="rounded-md border border-border">
              {fields.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Select a preset to see the XCS fields.
                </div>
              ) : (
                fields.map((field) => (
                  <div
                    key={field.label}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-border px-3 py-2 first:border-t-0"
                  >
                    <span className="text-xs text-muted-foreground">{field.label}</span>
                    <strong className="max-w-36 truncate text-right font-mono text-xs">
                      {field.value || "-"}
                    </strong>
                    <Button
                      aria-label={`Copy ${field.label}`}
                      className="h-6 w-6"
                      disabled={!field.value}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                      onClick={() => copyText(field.copy || field.value)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-md border border-border/70 bg-secondary/20 p-3">
              <div className="mb-2 flex items-center gap-2">
                <ClipboardList className="h-3.5 w-3.5 text-primary" />
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Notes
                </p>
              </div>
              <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                {notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default XtoolSettingsConverterPanel;
