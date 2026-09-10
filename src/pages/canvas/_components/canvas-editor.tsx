import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import {
  Upload,
  RotateCw,
  RotateCcw,
  Maximize2,
  Move,
  ZoomIn,
  ZoomOut,
  Trash2,
  ArrowLeft,
  ChevronDown,
  Download,
  FolderOpen,
  ImageIcon,
  Ruler,
  Save,
  FlipHorizontal,
  FlipVertical,
  RefreshCw,
  Sun,
  Contrast,
  Palette,
  LayoutTemplate,
  Undo2,
  Redo2,
  GripHorizontal,
  Languages,
} from "lucide-react";
import {
  MATERIAL_PRESETS,
  type UnitType,
  convertToPixels,
  convertFromPixels,
  inToMm,
  mmToIn,
} from "./material-presets.ts";
import { ENGRAVING_TEMPLATES, TEMPLATE_CATEGORIES } from "./templates.ts";
import AiComposePanel from "./ai-compose-panel.tsx";
import CanvasAssistant, { type CanvasAssistantContext } from "./assistant-panel.tsx";
import EngraveAiPanel from "./engrave-ai-panel.tsx";
import TraceVectorize from "./trace-vectorize.tsx";
import XtoolSettingsConverterPanel from "./xtool-settings-converter.tsx";
import { useCustomPresets, type CustomPreset } from "../_hooks/use-custom-presets.ts";
import { ScanLine, Crop, Wand2, Eraser, Frame, PenTool, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { persistentStorage, storageError } from "@/lib/persistent-storage.ts";
import CropModal from "./crop-modal.tsx";
import { removeBackground, roundCorners } from "./image-utils.ts";
import {
  engravingT,
  getEngravingLocale,
  normalizeEngravingLocale,
  saveEngravingLocale,
  type EngravingCopyValues,
  type EngravingLocale,
} from "./engraving-copy.ts";
import {
  EXPORT_DPI,
  createActualSizeSvg,
  setJpegDpi,
  setPngDpi,
} from "./export-calibration.ts";

// --- Types ---

type ImageFilters = {
  brightness: number; // 0–200 (100 = normal)
  contrast: number;   // 0–200 (100 = normal)
  grayscale: number;  // 0–100
  invert: number;     // 0–100
};

type Pt = { x: number; y: number };

type PenTraceStyle = {
  strokeColor: string;
  strokeWidth: number;
  fillEnabled: boolean;
  fillColor: string;
};

const DEFAULT_PEN_TRACE_STYLE: PenTraceStyle = {
  strokeColor: "#facc15",
  strokeWidth: 2,
  fillEnabled: false,
  fillColor: "#000000",
};

function formatPathNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function clampPointToCanvas(point: Pt, width: number, height: number): Pt {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildTracePath(points: Pt[], closed: boolean): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  const segments = [
    `M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`,
    ...rest.map((point) => `L ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`),
  ];
  if (closed && points.length > 2) segments.push("Z");
  return segments.join(" ");
}

function previewTraceFill(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}33`;
  return color;
}

function createPenTraceSvg({
  points,
  closed,
  width,
  height,
  strokeWidth = 2,
  strokeColor = "#000000",
  fillEnabled = false,
  fillColor = "#000000",
}: {
  points: Pt[];
  closed: boolean;
  width: number;
  height: number;
  strokeWidth?: number;
  strokeColor?: string;
  fillEnabled?: boolean;
  fillColor?: string;
}): string {
  const path = buildTracePath(points, closed);
  const w = formatPathNumber(width);
  const h = formatPathNumber(height);
  const fill = fillEnabled && closed ? fillColor : "none";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <path d="${path}" fill="${fill}" stroke="${strokeColor}" stroke-width="${formatPathNumber(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
</svg>`;
}

function createActualSizePenTraceSvg({
  points,
  closed,
  displayWidth,
  displayHeight,
  widthIn,
  heightIn,
  style = DEFAULT_PEN_TRACE_STYLE,
}: {
  points: Pt[];
  closed: boolean;
  displayWidth: number;
  displayHeight: number;
  widthIn: number;
  heightIn: number;
  style?: PenTraceStyle;
}): string {
  const widthMm = inToMm(widthIn);
  const heightMm = inToMm(heightIn);
  const strokeWidthMm = Math.max(
    0.05,
    ((style.strokeWidth / displayWidth) * widthMm + (style.strokeWidth / displayHeight) * heightMm) / 2
  );
  const scaledPoints = points.map((point) => ({
    x: (point.x / displayWidth) * widthMm,
    y: (point.y / displayHeight) * heightMm,
  }));
  const path = buildTracePath(scaledPoints, closed);
  const w = formatPathNumber(widthMm);
  const h = formatPathNumber(heightMm);
  const fill = style.fillEnabled && closed ? style.fillColor : "none";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <title>Manual pen trace ${widthIn.toFixed(3)}in x ${heightIn.toFixed(3)}in</title>
  <path d="${path}" fill="${fill}" stroke="${style.strokeColor}" stroke-width="${formatPathNumber(strokeWidthMm)}" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function drawTraceOnCanvas(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  closed: boolean,
  options: {
    scaleX?: number;
    scaleY?: number;
    strokeStyle?: string;
    fillStyle?: string;
    lineWidth?: number;
  } = {}
) {
  if (points.length < 2) return;
  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? 1;
  ctx.save();
  ctx.strokeStyle = options.strokeStyle ?? "#000000";
  ctx.lineWidth = options.lineWidth ?? 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x * scaleX, point.y * scaleY);
  }
  if (closed && points.length > 2) ctx.closePath();
  if (closed && options.fillStyle) {
    ctx.fillStyle = options.fillStyle;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function clipToTracePath(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  scaleX = 1,
  scaleY = 1
) {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x * scaleX, point.y * scaleY);
  }
  ctx.closePath();
  ctx.clip();
}

function normalizeTracePoints(points: Pt[], width: number, height: number): Pt[] {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  return points.map((point) => ({
    x: Math.max(0, Math.min(1, point.x / safeWidth)),
    y: Math.max(0, Math.min(1, point.y / safeHeight)),
  }));
}

function scaleTracePoints(points: Pt[], width: number, height: number): Pt[] {
  return points.map((point) => ({
    x: point.x * width,
    y: point.y * height,
  }));
}

function hasSavedTracePoints(preset: CustomPreset): preset is CustomPreset & { tracePoints: Pt[] } {
  return Array.isArray(preset.tracePoints) && preset.tracePoints.length >= 2;
}

// A pin on an edge, t=0..1 is position along that edge between its two corners
type EdgePin = { id: string; t: number; offset: Pt }; // offset = how far this pin has been dragged from its natural position on the straight edge
type InteriorWarpPin = { id: string; s: number; t: number; offset: Pt; radius: number };

type WarpMesh = {
  tl: Pt; tr: Pt; bl: Pt; br: Pt;         // corners — always present
  top:    EdgePin[];   // pins along top edge (tl→tr), sorted by t
  bottom: EdgePin[];   // pins along bottom edge (bl→br), sorted by t
  left:   EdgePin[];   // pins along left edge (tl→bl), sorted by t
  right:  EdgePin[];   // pins along right edge (tr→br), sorted by t
  interior: InteriorWarpPin[]; // local pins inside the art for spot corrections
};

type ImageState = {
  x: number;
  y: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  naturalWidth: number;
  naturalHeight: number;
  element: HTMLImageElement;
  flipH: boolean;
  flipV: boolean;
  filters: ImageFilters;
  warpMesh: WarpMesh | null; // null = no warp
};

type MaterialSize = {
  widthIn: number;
  heightIn: number;
};

const DEFAULT_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  invert: 0,
};

const SCREEN_DPI = 96;
const STORAGE_KEY = "pgs-canvas-editor-v1";
const HISTORY_LIMIT = 80;
const RULER_THICKNESS = 20;
const MIN_CANVAS_SIZE = 80;
const CANVAS_MARGIN = 8;
const DEFAULT_LOCAL_WARP_RADIUS = 0.24;

// Serializable subset of ImageState (no HTMLImageElement)
type SavedDesignState = Omit<ImageState, "element">;

type SavedCanvasState = {
  unit: UnitType;
  material: MaterialSize;
  selectedPresetId: string;
  showRuler: boolean;
  resizeMode: boolean;
  partPhotoSrc: string | null;
  designSrc: string | null;
  designState: SavedDesignState | null;
};

type ResizeDragState = {
  edge: "right" | "bottom" | "corner";
  startX: number;
  startY: number;
  startW: number;
  startH: number;
};

// --- Helpers ---

function inchesToDisplay(inches: number, displayPixels: number, materialInches: number): number {
  return (inches / materialInches) * displayPixels;
}

function displayToInches(pixels: number, displayPixels: number, materialInches: number): number {
  return (pixels / displayPixels) * materialInches;
}

function cloneWarpMesh(mesh: WarpMesh | null): WarpMesh | null {
  if (!mesh) return null;
  return {
    tl: { ...mesh.tl },
    tr: { ...mesh.tr },
    bl: { ...mesh.bl },
    br: { ...mesh.br },
    top: mesh.top.map((pin) => ({ ...pin, offset: { ...pin.offset } })),
    bottom: mesh.bottom.map((pin) => ({ ...pin, offset: { ...pin.offset } })),
    left: mesh.left.map((pin) => ({ ...pin, offset: { ...pin.offset } })),
    right: mesh.right.map((pin) => ({ ...pin, offset: { ...pin.offset } })),
    interior: (mesh.interior ?? []).map((pin) => ({ ...pin, offset: { ...pin.offset } })),
  };
}

function cloneImageState(state: ImageState): ImageState {
  return {
    ...state,
    filters: { ...state.filters },
    warpMesh: cloneWarpMesh(state.warpMesh),
  };
}

function roundHistoryNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function imageStateSignature(state: ImageState): string {
  const imageSrc = state.element.currentSrc || state.element.src || "";
  const sourceKey = `${imageSrc.length}:${imageSrc.slice(0, 128)}:${imageSrc.slice(-128)}`;

  return JSON.stringify({
    sourceKey,
    x: roundHistoryNumber(state.x),
    y: roundHistoryNumber(state.y),
    scale: roundHistoryNumber(state.scale),
    scaleX: roundHistoryNumber(state.scaleX),
    scaleY: roundHistoryNumber(state.scaleY),
    rotation: roundHistoryNumber(state.rotation),
    opacity: roundHistoryNumber(state.opacity),
    naturalWidth: state.naturalWidth,
    naturalHeight: state.naturalHeight,
    flipH: state.flipH,
    flipV: state.flipV,
    filters: state.filters,
    warpMesh: state.warpMesh,
  });
}

function applyFiltersToCanvas(
  src: HTMLImageElement,
  filters: ImageFilters,
  w: number,
  h: number,
  eraserMask?: HTMLCanvasElement | null
): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  if (!ctx) return off;
  ctx.filter = [
    `brightness(${filters.brightness}%)`,
    `contrast(${filters.contrast}%)`,
    `grayscale(${filters.grayscale}%)`,
    `invert(${filters.invert}%)`,
  ].join(" ");
  ctx.drawImage(src, 0, 0, w, h);
  if (eraserMask) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(eraserMask, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }
  return off;
}

/** Get the canvas position of a point on the warp mesh at (s=0..1, t=0..1).
 *  Uses Coons patch with quadratic Bezier edges built from the mesh pins.
 *  s = horizontal (left→right), t = vertical (top→bottom)
 */
function boundaryMeshPt(mesh: WarpMesh, s: number, t: number): Pt {
  // Build top edge point at s
  const topPt = edgePt(mesh.tl, mesh.tr, mesh.top, s);
  // Build bottom edge point at s
  const botPt = edgePt(mesh.bl, mesh.br, mesh.bottom, s);
  // Build left edge point at t
  const leftPt = edgePt(mesh.tl, mesh.bl, mesh.left, t);
  // Build right edge point at t
  const rightPt = edgePt(mesh.tr, mesh.br, mesh.right, t);
  // Bilinear corner blend
  const cx = (1-s)*(1-t)*mesh.tl.x + s*(1-t)*mesh.tr.x + (1-s)*t*mesh.bl.x + s*t*mesh.br.x;
  const cy = (1-s)*(1-t)*mesh.tl.y + s*(1-t)*mesh.tr.y + (1-s)*t*mesh.bl.y + s*t*mesh.br.y;
  return {
    x: (1-t)*topPt.x + t*botPt.x + (1-s)*leftPt.x + s*rightPt.x - cx,
    y: (1-t)*topPt.y + t*botPt.y + (1-s)*leftPt.y + s*rightPt.y - cy,
  };
}

function localWarpWeight(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0;
  const amount = 1 - distance / radius;
  return amount * amount * (3 - 2 * amount);
}

function localWarpOffset(mesh: WarpMesh, s: number, t: number): Pt {
  let x = 0;
  let y = 0;
  for (const pin of mesh.interior ?? []) {
    const distance = Math.hypot(s - pin.s, t - pin.t);
    const weight = localWarpWeight(distance, pin.radius || DEFAULT_LOCAL_WARP_RADIUS);
    x += pin.offset.x * weight;
    y += pin.offset.y * weight;
  }
  return { x, y };
}

function meshPt(mesh: WarpMesh, s: number, t: number): Pt {
  const base = boundaryMeshPt(mesh, s, t);
  const offset = localWarpOffset(mesh, s, t);
  return {
    x: base.x + offset.x,
    y: base.y + offset.y,
  };
}

/** Interpolate along an edge (from `a` to `b`) with optional pins, at parameter u.
 *  Pins define local offsets from the straight line. Between pins we lerp the offset.
 */
function edgePt(a: Pt, b: Pt, pins: EdgePin[], u: number): Pt {
  // Straight line point
  const lx = a.x + (b.x - a.x) * u;
  const ly = a.y + (b.y - a.y) * u;
  if (pins.length === 0) return { x: lx, y: ly };
  // Find the two surrounding pins (with virtual pins at t=0 offset=0 and t=1 offset=0)
  const all: { t: number; offset: Pt }[] = [
    { t: 0, offset: { x: 0, y: 0 } },
    ...pins,
    { t: 1, offset: { x: 0, y: 0 } },
  ];
  let i = 0;
  while (i < all.length - 1 && all[i + 1].t <= u) i++;
  const p0 = all[i];
  const p1 = all[Math.min(i + 1, all.length - 1)];
  const span = p1.t - p0.t;
  const f = span < 0.0001 ? 0 : (u - p0.t) / span;
  const ox = p0.offset.x + (p1.offset.x - p0.offset.x) * f;
  const oy = p0.offset.y + (p1.offset.y - p0.offset.y) * f;
  return { x: lx + ox, y: ly + oy };
}

/** Draw a warped image using the WarpMesh. Renders as a grid of small quads. */
function drawWarpedImage(
  ctx: CanvasRenderingContext2D,
  filtered: HTMLCanvasElement,
  mesh: WarpMesh,
  opacity: number,
  divisions = 48
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  const W = filtered.width;
  const H = filtered.height;
  const cellW = 1 / divisions;
  const cellH = 1 / divisions;
  for (let col = 0; col < divisions; col++) {
    const s0 = col / divisions;
    const s1 = (col + 1) / divisions;
    const srcX = Math.floor(W * s0);
    const srcW = Math.ceil(W / divisions) + 1;
    for (let row = 0; row < divisions; row++) {
      const t0 = row / divisions;
      const t1 = (row + 1) / divisions;
      const srcY = Math.floor(H * t0);
      const srcH = Math.ceil(H / divisions) + 1;
      const p00 = meshPt(mesh, s0, t0);
      const p10 = meshPt(mesh, s1, t0);
      const p01 = meshPt(mesh, s0, t1);
      const p11 = meshPt(mesh, s1, t1);
      ctx.save();
      ctx.setTransform(
        (p10.x - p00.x) / cellW,
        (p10.y - p00.y) / cellW,
        (p01.x - p00.x) / cellH,
        (p01.y - p00.y) / cellH,
        p00.x, p00.y
      );
      ctx.drawImage(filtered, srcX, srcY, srcW, srcH, 0, 0, cellW, cellH);
      ctx.restore();
      void p11;
    }
  }
  ctx.restore();
}

// --- Main Component ---

function TemplateThumbnail({ url, name }: { url: string; name: string }) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let nextObjectUrl: string | null = null;
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        nextObjectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [url]);

  return (
    <>
      {objectUrl && (
        <img
          src={objectUrl}
          alt={name}
          className="w-full h-full object-contain"
        />
      )}
      {!objectUrl && !failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[8px] text-gray-400 animate-pulse">Loading…</span>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center px-1">
          <span className="text-[8px] text-gray-500 text-center leading-tight">{name}</span>
        </div>
      )}
    </>
  );
}

// Load saved non-image state synchronously before first render
function loadSavedState(): Partial<SavedCanvasState> {
  try {
    const raw = persistentStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SavedCanvasState;
  } catch {
    storageError("Could not load saved canvas settings.");
    return {};
  }
}

const _saved = loadSavedState();

type CanvasEditorProps = {
  initialLocale?: string;
};

export default function CanvasEditor({ initialLocale }: CanvasEditorProps = {}) {
  const [locale, setLocale] = useState<EngravingLocale>(
    () => normalizeEngravingLocale(initialLocale) ?? getEngravingLocale()
  );
  const t = useCallback(
    (key: string, values?: EngravingCopyValues) => engravingT(key, values, locale),
    [locale]
  );
  const handleLocaleChange = useCallback((next: EngravingLocale) => {
    saveEngravingLocale(next);
    setLocale(next);
  }, []);

  useEffect(() => {
    const routeLocale = normalizeEngravingLocale(initialLocale);
    if (routeLocale) {
      saveEngravingLocale(routeLocale);
      setLocale(routeLocale);
    }
  }, [initialLocale]);

  const {
    presets: customPresets,
    addPreset: addCustomPreset,
    removePreset: removeCustomPreset,
  } = useCustomPresets();
  const tracePresets = useMemo(
    () => customPresets.filter(hasSavedTracePoints),
    [customPresets]
  );
  const [tracePresetName, setTracePresetName] = useState("");
  const [pendingTracePreset, setPendingTracePreset] = useState<CustomPreset | null>(null);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropPartOpen, setCropPartOpen] = useState(false);
  const [bgRemoving, setBgRemoving] = useState(false);
  const [cornerRadius, setCornerRadius] = useState(10);
  const [roundingProcessing, setRoundingProcessing] = useState(false);
  const [eraserActive, setEraserActive] = useState(false);
  const [eraserSize, setEraserSize] = useState(30); // brush radius in display pixels
  const eraserMaskRef = useRef<HTMLCanvasElement | null>(null);
  const [warpMode, setWarpMode] = useState(false);
  const [penTraceActive, setPenTraceActive] = useState(false);
  const [penTracePoints, setPenTracePoints] = useState<Pt[]>([]);
  const [penTraceClosed, setPenTraceClosed] = useState(false);
  const [penTraceHover, setPenTraceHover] = useState<Pt | null>(null);
  const [penTraceStyle, setPenTraceStyle] = useState<PenTraceStyle>(DEFAULT_PEN_TRACE_STYLE);
  const [clipDesignToTrace, setClipDesignToTrace] = useState(false);
  const penTraceDragPointRef = useRef<number | null>(null);
  const isErasingRef = useRef(false);
  const [partPhoto, setPartPhoto] = useState<HTMLImageElement | null>(null);
  // Images are NOT restored from localStorage — start fresh each session
  const [partPhotoSrc, setPartPhotoSrc] = useState<string | null>(null);
  const [designSrc, setDesignSrc] = useState<string | null>(null);
  const [partRotation, setPartRotation] = useState(0); // degrees
  const [design, setDesign] = useState<ImageState | null>(null);
  const latestDesignRef = useRef<ImageState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDropHover, setIsDropHover] = useState(false);
  const [containerWidth, setContainerWidth] = useState(() => {
    if (typeof window === "undefined") return 800;
    return Math.max(
      MIN_CANVAS_SIZE + RULER_THICKNESS,
      Math.min(window.innerWidth - 32, 800),
    );
  });
  const [unit, setUnit] = useState<UnitType>(_saved.unit ?? "in");
  const [material, setMaterial] = useState<MaterialSize>(_saved.material ?? { widthIn: 4.0, heightIn: 4.0 });
  const [selectedPresetId, setSelectedPresetId] = useState<string>(_saved.selectedPresetId ?? "custom");
  const [showRuler, setShowRuler] = useState(_saved.showRuler ?? true);
  const [resizeMode, setResizeMode] = useState(_saved.resizeMode ?? false);
  const [manualDisplaySize, setManualDisplaySize] = useState<{ w: number; h: number } | null>(null);
  // Saved design state (position/scale/filters) to restore after image loads — not persisted
  const savedDesignStateRef = useRef<SavedDesignState | null>(null);
  // Design real-world size inputs (in current unit)
  const [designWidthInput, setDesignWidthInput] = useState("");
  const [designHeightInput, setDesignHeightInput] = useState("");

  // Undo/redo history
  const historyRef = useRef<ImageState[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const skipHistoryRef = useRef(false);
  const continuousEditRef = useRef(false);
  const lastHistorySignatureRef = useRef<string | null>(null);

  const pushHistory = useCallback((state: ImageState) => {
    if (skipHistoryRef.current) return;
    const snapshot = cloneImageState(state);
    const signature = imageStateSignature(snapshot);
    if (signature === lastHistorySignatureRef.current) return;

    // Drop any future states if we're mid-history
    let nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(snapshot);
    if (nextHistory.length > HISTORY_LIMIT) {
      nextHistory = nextHistory.slice(nextHistory.length - HISTORY_LIMIT);
    }
    historyRef.current = nextHistory;
    historyIndexRef.current = historyRef.current.length - 1;
    lastHistorySignatureRef.current = signature;
  }, []);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    skipHistoryRef.current = true;
    continuousEditRef.current = false;
    const snapshot = cloneImageState(historyRef.current[historyIndexRef.current]);
    latestDesignRef.current = snapshot;
    lastHistorySignatureRef.current = imageStateSignature(snapshot);
    setDesign(snapshot);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    skipHistoryRef.current = true;
    continuousEditRef.current = false;
    const snapshot = cloneImageState(historyRef.current[historyIndexRef.current]);
    latestDesignRef.current = snapshot;
    lastHistorySignatureRef.current = imageStateSignature(snapshot);
    setDesign(snapshot);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const updateDesignContinuously = useCallback((updater: (state: ImageState) => ImageState) => {
    const current = latestDesignRef.current;
    if (!current) return;
    const next = updater(current);
    continuousEditRef.current = true;
    latestDesignRef.current = next;
    setDesign(next);
  }, []);

  const commitDesignChange = useCallback((next: ImageState) => {
    continuousEditRef.current = false;
    const snapshot = cloneImageState(next);
    latestDesignRef.current = snapshot;
    setDesign(snapshot);
    pushHistory(snapshot);
    updateUndoRedoState();
  }, [pushHistory, updateUndoRedoState]);

  const commitDesignUpdate = useCallback((updater: (state: ImageState) => ImageState) => {
    const current = latestDesignRef.current;
    if (!current) return;
    commitDesignChange(updater(current));
  }, [commitDesignChange]);

  const commitCurrentDesign = useCallback(() => {
    const current = latestDesignRef.current;
    if (!current) {
      continuousEditRef.current = false;
      return;
    }
    commitDesignChange(current);
  }, [commitDesignChange]);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRulerRef = useRef<HTMLCanvasElement>(null);
  const leftRulerRef = useRef<HTMLCanvasElement>(null);
  const partInputRef = useRef<HTMLInputElement>(null);
  const designInputRef = useRef<HTMLInputElement>(null);
  const resizeDragRef = useRef<ResizeDragState | null>(null);

  // Design bounding-box resize
  type DesignResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
  type DesignResizeDrag = {
    handle: DesignResizeHandle;
    startMouseX: number;
    startMouseY: number;
    startScaleX: number;
    startScaleY: number;
    startX: number;
    startY: number;
    startImgW: number;
    startImgH: number;
    shiftKey: boolean;
  };
  const designResizeDragRef = useRef<DesignResizeDrag | null>(null);

  // Save tool settings; source images remain session-only.
  useEffect(() => {
    const toSave: SavedCanvasState = {
      unit,
      material,
      selectedPresetId,
      showRuler,
      resizeMode,
      partPhotoSrc: null,
      designSrc: null,
      designState: null,
    };
    try {
      persistentStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      storageError("Could not save canvas settings. Try again before closing the app.");
    }
  }, [unit, material, selectedPresetId, showRuler, resizeMode]);

  // When resizeMode turns off, reset manual display size
  useEffect(() => {
    if (!resizeMode) {
      setManualDisplaySize(null);
    }
  }, [resizeMode]);

  // Restore part photo from saved src on mount
  useEffect(() => {
    if (!partPhotoSrc) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPartPhoto(img);
    img.src = partPhotoSrc;
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    latestDesignRef.current = design;
  }, [design]);

  // Track design changes into history
  useEffect(() => {
    if (!design) return;
    if (skipHistoryRef.current) {
      // This change came from undo/redo — clear the flag and don't push
      skipHistoryRef.current = false;
      updateUndoRedoState();
      return;
    }
    if (isDragging || continuousEditRef.current) {
      return;
    }
    pushHistory(design);
    updateUndoRedoState();
  }, [design, isDragging, pushHistory, updateUndoRedoState]);

  // Responsive sizing
  useEffect(() => {
    const update = () => {
      if (canvasContainerRef.current) {
        setContainerWidth(canvasContainerRef.current.clientWidth);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (canvasContainerRef.current) ro.observe(canvasContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // Canvas display size — driven by material aspect ratio (or manual override)
  const rulerThickness = showRuler ? RULER_THICKNESS : 0;
  const availableWorkspaceWidth = Math.max(
    containerWidth - CANVAS_MARGIN,
    MIN_CANVAS_SIZE + rulerThickness,
  );
  const maxW = Math.min(
    Math.max(availableWorkspaceWidth - rulerThickness, MIN_CANVAS_SIZE),
    820,
  );
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const isCompactLayout = containerWidth < 640;
  const maxH = Math.min(
    viewportHeight * (isCompactLayout ? 0.44 : 0.58),
    isCompactLayout ? 420 : 520,
  );
  const materialRatio = material.widthIn / material.heightIn;

  let displayWidth: number;
  let displayHeight: number;

  if (resizeMode && manualDisplaySize) {
    const manualRatio =
      manualDisplaySize.h > 0 ? manualDisplaySize.w / manualDisplaySize.h : materialRatio;
    displayWidth = Math.min(Math.max(manualDisplaySize.w, MIN_CANVAS_SIZE), maxW);
    displayHeight = Math.min(Math.max(manualDisplaySize.h, MIN_CANVAS_SIZE), maxH);
    if (manualDisplaySize.w > maxW) {
      displayHeight = Math.round(displayWidth / manualRatio);
    }
    if (displayHeight > maxH) {
      displayHeight = maxH;
      displayWidth = Math.min(maxW, Math.round(displayHeight * manualRatio));
    }
  } else {
    displayWidth = maxW;
    displayHeight = Math.round(displayWidth / materialRatio);
    if (displayHeight > maxH) {
      displayHeight = maxH;
      displayWidth = Math.round(displayHeight * materialRatio);
    }
  }

  // Pixels-per-inch on screen for this canvas
  const screenPpi = displayWidth / material.widthIn;

  useEffect(() => {
    if (!pendingTracePreset) return;
    if (!hasSavedTracePoints(pendingTracePreset)) {
      setPendingTracePreset(null);
      return;
    }
    setPenTracePoints(scaleTracePoints(pendingTracePreset.tracePoints, displayWidth, displayHeight));
    setPenTraceClosed(pendingTracePreset.traceClosed ?? pendingTracePreset.tracePoints.length >= 3);
    if (pendingTracePreset.traceStyle) {
      setPenTraceStyle((current) => ({
        ...current,
        ...pendingTracePreset.traceStyle,
      }));
    }
    setPenTraceActive(false);
    setPenTraceHover(null);
    setPendingTracePreset(null);
    toast.success(t("toast.penTracePresetLoaded", { name: pendingTracePreset.name }));
  }, [displayHeight, displayWidth, pendingTracePreset, t]);

  useEffect(() => {
    if (clipDesignToTrace && (!penTraceClosed || penTracePoints.length < 3)) {
      setClipDesignToTrace(false);
    }
  }, [clipDesignToTrace, penTraceClosed, penTracePoints.length]);

  // Draw everything
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Material background
    if (partPhoto) {
      const rad = (partRotation * Math.PI) / 180;
      ctx.save();
      ctx.translate(displayWidth / 2, displayHeight / 2);
      ctx.rotate(rad);
      // Scale to fill the canvas even when rotated
      const absCos = Math.abs(Math.cos(rad));
      const absSin = Math.abs(Math.sin(rad));
      const scale = Math.min(
        displayWidth / (displayWidth * absCos + displayHeight * absSin),
        displayHeight / (displayWidth * absSin + displayHeight * absCos)
      ) * (partRotation % 90 !== 0 ? 1 : 1); // fill mode
      const drawW = displayWidth / scale;
      const drawH = displayHeight / scale;
      ctx.scale(scale, scale);
      ctx.drawImage(partPhoto, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      // Grid placeholder
      const tile = 20;
      for (let y = 0; y < displayHeight; y += tile) {
        for (let x = 0; x < displayWidth; x += tile) {
          ctx.fillStyle =
            (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0
              ? "#1a1f2e"
              : "#1e2436";
          ctx.fillRect(x, y, tile, tile);
        }
      }
      // Material border
      ctx.strokeStyle = "rgba(200,160,60,0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(1, 1, displayWidth - 2, displayHeight - 2);
      ctx.setLineDash([]);
    }

    // Design overlay
    if (design) {
      const imgW = design.naturalWidth * design.scale * design.scaleX;
      const imgH = design.naturalHeight * design.scale * design.scaleY;
      const cx = design.x + imgW / 2;
      const cy = design.y + imgH / 2;
      const shouldClipDesign = clipDesignToTrace && penTraceClosed && penTracePoints.length >= 3;

      ctx.save();
      if (shouldClipDesign) {
        clipToTracePath(ctx, penTracePoints);
      }

      // Apply filters via offscreen canvas
      const filtered = applyFiltersToCanvas(design.element, design.filters, imgW, imgH, eraserMaskRef.current);

      if (design.warpMesh) {
        drawWarpedImage(ctx, filtered, design.warpMesh, design.opacity);
      } else {
        ctx.save();
        ctx.globalAlpha = design.opacity;
        ctx.translate(cx, cy);
        ctx.rotate((design.rotation * Math.PI) / 180);
        if (design.flipH) ctx.scale(-1, 1);
        if (design.flipV) ctx.scale(1, -1);
        ctx.drawImage(filtered, -imgW / 2, -imgH / 2, imgW, imgH);
        ctx.restore();
      }
      ctx.restore();
    }

  }, [partPhoto, partRotation, design, displayWidth, displayHeight, clipDesignToTrace, penTraceClosed, penTracePoints]);

  // --- External ruler drawing (drawn on dedicated canvases outside the workspace) ---
  const drawExternalRulers = useCallback(() => {
    const topCanvas = topRulerRef.current;
    const leftCanvas = leftRulerRef.current;
    if (!topCanvas || !leftCanvas) return;

    const w = displayWidth;
    const h = displayHeight;
    const matW = unit === "mm" ? inToMm(material.widthIn) : material.widthIn;
    const matH = unit === "mm" ? inToMm(material.heightIn) : material.heightIn;
    const u = unit;
    const rT = RULER_THICKNESS;

    const ppiX = w / matW;
    const ppiY = h / matH;
    const tickInterval = u === "in" ? 0.5 : 10;
    const subTick = u === "in" ? 0.25 : 5;
    const bg = "rgba(200,160,60,0.18)";
    const tickColor = "rgba(200,160,60,0.7)";
    const labelColor = "rgba(200,160,60,0.85)";

    // Top (horizontal) ruler
    topCanvas.width = w;
    topCanvas.height = rT;
    const tCtx = topCanvas.getContext("2d");
    if (tCtx) {
      tCtx.clearRect(0, 0, w, rT);
      tCtx.fillStyle = bg;
      tCtx.fillRect(0, 0, w, rT);
      tCtx.fillStyle = "rgba(200,160,60,0.35)";
      tCtx.fillRect(0, rT - 1, w, 1);
      tCtx.font = "8px monospace";
      for (let v = 0; v <= matW + 0.001; v += subTick) {
        const isMajor = Math.abs(v % tickInterval) < 0.001 || Math.abs(v % tickInterval - tickInterval) < 0.001;
        const px = Math.round(v * ppiX);
        const tickH = isMajor ? rT * 0.55 : rT * 0.3;
        tCtx.fillStyle = tickColor;
        tCtx.fillRect(px, rT - tickH, 1, tickH);
        if (isMajor && v > 0) {
          tCtx.fillStyle = labelColor;
          const label = u === "in" ? `${v}"` : `${v}`;
          tCtx.fillText(label, px + 2, rT - tickH - 2);
        }
      }
    }

    // Left (vertical) ruler
    leftCanvas.width = rT;
    leftCanvas.height = h;
    const lCtx = leftCanvas.getContext("2d");
    if (lCtx) {
      lCtx.clearRect(0, 0, rT, h);
      lCtx.fillStyle = bg;
      lCtx.fillRect(0, 0, rT, h);
      lCtx.fillStyle = "rgba(200,160,60,0.35)";
      lCtx.fillRect(rT - 1, 0, 1, h);
      lCtx.font = "8px monospace";
      for (let v = 0; v <= matH + 0.001; v += subTick) {
        const isMajor = Math.abs(v % tickInterval) < 0.001 || Math.abs(v % tickInterval - tickInterval) < 0.001;
        const py = Math.round(v * ppiY);
        const tW = isMajor ? rT * 0.55 : rT * 0.3;
        lCtx.fillStyle = tickColor;
        lCtx.fillRect(rT - tW, py, tW, 1);
        if (isMajor && v > 0) {
          lCtx.save();
          lCtx.translate(rT - tW - 2, py - 2);
          lCtx.rotate(-Math.PI / 2);
          lCtx.fillStyle = labelColor;
          const label = u === "in" ? `${v}"` : `${v}`;
          lCtx.fillText(label, 0, 0);
          lCtx.restore();
        }
      }
    }
  }, [displayWidth, displayHeight, material, unit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    draw();
    drawExternalRulers();
  }, [displayWidth, displayHeight, draw, drawExternalRulers, showRuler]);

  // --- File loading ---
  const loadPartPhoto = useCallback((src: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setPartPhoto(img);
      setPartPhotoSrc(src);
    };
    img.onerror = () => toast.error(t("toast.partPhotoLoadFail"));
    img.src = src;
  }, [t]);

  const loadDesign = useCallback(
    (src: string, restoreState?: SavedDesignState) => {
      const applyImg = (imgSrc: string) => {
        const img = new Image();
        img.onload = () => {
          // SVGs without explicit width/height report 0 — fall back to a sensible default
          const natW = img.naturalWidth || 500;
          const natH = img.naturalHeight || 500;

          if (restoreState) {
            // Restore saved position/scale/filters exactly
            setDesign({ ...restoreState, naturalWidth: natW, naturalHeight: natH, element: img });
            eraserMaskRef.current = null;
            setEraserActive(false);
            const wIn = displayToInches(natW * restoreState.scale * restoreState.scaleX, displayWidth, material.widthIn);
            const hIn = displayToInches(natH * restoreState.scale * restoreState.scaleY, displayHeight, material.heightIn);
            setDesignWidthInput(unit === "in" ? wIn.toFixed(2) : inToMm(wIn).toFixed(1));
            setDesignHeightInput(unit === "in" ? hIn.toFixed(2) : inToMm(hIn).toFixed(1));
            return;
          }

          const initScale = Math.min(
            (displayWidth * 0.5) / natW,
            (displayHeight * 0.5) / natH
          );
          setDesign({
            x: (displayWidth - natW * initScale) / 2,
            y: (displayHeight - natH * initScale) / 2,
            scale: initScale,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
            naturalWidth: natW,
            naturalHeight: natH,
            element: img,
            flipH: false,
            flipV: false,
            filters: { ...DEFAULT_FILTERS },
            warpMesh: null,
          });
          eraserMaskRef.current = null;
          setEraserActive(false);
          const widthIn = displayToInches(natW * initScale, displayWidth, material.widthIn);
          const heightIn = displayToInches(natH * initScale, displayHeight, material.heightIn);
          if (unit === "in") {
            setDesignWidthInput(widthIn.toFixed(2));
            setDesignHeightInput(heightIn.toFixed(2));
          } else {
            setDesignWidthInput(inToMm(widthIn).toFixed(1));
            setDesignHeightInput(inToMm(heightIn).toFixed(1));
          }
        };
        img.onerror = () => toast.error(t("toast.designLoadFail"));
        img.src = imgSrc;
      };

      if (src.startsWith("data:") || src.startsWith("blob:")) {
        // Local file (drag & drop or file picker) — load directly
        applyImg(src);
      } else {
        // Remote URL (template CDN or bundled asset) — preserve the file's real image type.
        fetch(src)
          .then((r) => {
            if (!r.ok) throw new Error("Unable to load design image");
            return r.blob();
          })
          .then((blob) => {
            const objectUrl = URL.createObjectURL(blob);
            applyImg(objectUrl);
          })
          .catch(() => toast.error(t("toast.designLoadFail")));
      }
      setDesignSrc(src);
    },
    [displayWidth, displayHeight, material, t, unit]
  );

  // Restore design from saved src on mount (after loadDesign is defined)
  const didRestoreDesign = useRef(false);
  useEffect(() => {
    if (didRestoreDesign.current || !designSrc) return;
    didRestoreDesign.current = true;
    loadDesign(designSrc, savedDesignStateRef.current ?? undefined);
  // Only run once after loadDesign is ready
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDesign]);

  const readFile = useCallback((file: File, onLoad: (src: string) => void) => {
    const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
    const hasKnownImageExtension = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);
    if (!file.type.startsWith("image/") && !isSvg && !hasKnownImageExtension) {
      toast.error(t("toast.imageUnsupported"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = String(ev.target?.result ?? "");
      if (!src) {
        toast.error(t("toast.imageReadFail"));
        return;
      }
      onLoad(src);
    };
    reader.onerror = () => toast.error(t("toast.imageReadFail"));
    reader.readAsDataURL(file);
  }, [t]);

  const handlePartUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file, loadPartPhoto);
      e.currentTarget.value = "";
    },
    [loadPartPhoto, readFile]
  );

  const handleDesignUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file, loadDesign);
      e.currentTarget.value = "";
    },
    [loadDesign, readFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDropHover(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!partPhoto) {
        readFile(file, loadPartPhoto);
      } else {
        readFile(file, loadDesign);
      }
    },
    [partPhoto, loadPartPhoto, loadDesign, readFile]
  );

  // --- Material preset ---
  const handlePresetChange = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = MATERIAL_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setMaterial({ widthIn: preset.width, heightIn: preset.height });
    }
  }, []);

  // --- Real-world design sizing ---
  const applyDesignSize = useCallback(
    (widthVal: string, heightVal: string) => {
      if (!design) return;
      const wNum = parseFloat(widthVal);
      const hNum = parseFloat(heightVal);
      if (isNaN(wNum) && isNaN(hNum)) return;

      // Always apply both width and height independently — no aspect ratio lock
      const targetWidthIn = unit === "in" ? (isNaN(wNum) ? 1 : wNum) : mmToIn(isNaN(wNum) ? 25.4 : wNum);
      const targetHeightIn = unit === "in" ? (isNaN(hNum) ? 1 : hNum) : mmToIn(isNaN(hNum) ? 25.4 : hNum);

      const targetWidthPx = inchesToDisplay(targetWidthIn, displayWidth, material.widthIn);
      const targetHeightPx = inchesToDisplay(targetHeightIn, displayHeight, material.heightIn);
      const newScaleX = targetWidthPx / design.naturalWidth;
      const newScaleY = targetHeightPx / design.naturalHeight;
      setDesign({ ...design, scale: 1, scaleX: newScaleX, scaleY: newScaleY });

      // Update inputs
      if (unit === "in") {
        setDesignWidthInput(targetWidthIn.toFixed(2));
        setDesignHeightInput(targetHeightIn.toFixed(2));
      } else {
        setDesignWidthInput(inToMm(targetWidthIn).toFixed(1));
        setDesignHeightInput(inToMm(targetHeightIn).toFixed(1));
      }
    },
    [design, unit, displayWidth, displayHeight, material]
  );

  // Sync design size inputs when design scale changes externally
  const currentDesignSizeLabel = useMemo(() => {
    if (!design) return null;
    const wIn = displayToInches(design.naturalWidth * design.scale * design.scaleX, displayWidth, material.widthIn);
    const hIn = displayToInches(design.naturalHeight * design.scale * design.scaleY, displayHeight, material.heightIn);
    if (unit === "in") {
      return `${wIn.toFixed(2)}" × ${hIn.toFixed(2)}"`;
    }
    return `${inToMm(wIn).toFixed(1)}mm × ${inToMm(hIn).toFixed(1)}mm`;
  }, [design, displayWidth, displayHeight, material, unit]);

  // --- Drag to reposition ---
  const getPos = useCallback((clientX: number, clientY: number): Pt => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const addPenTracePoint = useCallback(
    (point: Pt) => {
      if (penTraceClosed) return;
      setPenTracePoints((current) => [
        ...current,
        clampPointToCanvas(point, displayWidth, displayHeight),
      ]);
    },
    [displayWidth, displayHeight, penTraceClosed]
  );

  const handlePenTracePointMouseDown = useCallback(
    (e: React.MouseEvent, pointIndex: number) => {
      e.stopPropagation();
      e.preventDefault();
      penTraceDragPointRef.current = pointIndex;

      const onMove = (ev: MouseEvent) => {
        const point = clampPointToCanvas(getPos(ev.clientX, ev.clientY), displayWidth, displayHeight);
        setPenTracePoints((current) =>
          current.map((existing, index) => (index === pointIndex ? point : existing))
        );
      };

      const onUp = () => {
        penTraceDragPointRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [displayWidth, displayHeight, getPos]
  );

  const getEraserPosInDesign = useCallback((canvasX: number, canvasY: number): { x: number; y: number } | null => {
    if (!design) return null;
    const imgW = design.naturalWidth * design.scale * design.scaleX;
    const imgH = design.naturalHeight * design.scale * design.scaleY;
    const cx = design.x + imgW / 2;
    const cy = design.y + imgH / 2;
    // Translate to design center
    const dx = canvasX - cx;
    const dy = canvasY - cy;
    // Undo rotation
    const rad = (design.rotation * Math.PI) / 180;
    const cosA = Math.cos(-rad);
    const sinA = Math.sin(-rad);
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;
    // Undo flip
    const fx = design.flipH ? -rx : rx;
    const fy = design.flipV ? -ry : ry;
    // Map to image coords (0..naturalWidth, 0..naturalHeight)
    const ix = (fx + imgW / 2) * (design.naturalWidth / imgW);
    const iy = (fy + imgH / 2) * (design.naturalHeight / imgH);
    return { x: ix, y: iy };
  }, [design]);

  const applyEraserStroke = useCallback((imgX: number, imgY: number) => {
    if (!design) return;
    // Create mask canvas lazily at natural image size
    if (!eraserMaskRef.current) {
      const c = document.createElement("canvas");
      c.width = design.naturalWidth;
      c.height = design.naturalHeight;
      eraserMaskRef.current = c;
    }
    const ctx = eraserMaskRef.current.getContext("2d");
    if (!ctx) return;
    // Scale brush radius from display pixels to image pixels
    const imgW = design.naturalWidth * design.scale * design.scaleX;
    const brushRadius = eraserSize * (design.naturalWidth / imgW);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.arc(imgX, imgY, brushRadius, 0, Math.PI * 2);
    ctx.fill();
  }, [design, eraserSize]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (penTraceActive) {
        e.preventDefault();
        addPenTracePoint(getPos(e.clientX, e.clientY));
        return;
      }
      if (!design) return;
      e.preventDefault();
      const pos = getPos(e.clientX, e.clientY);
      if (eraserActive) {
        isErasingRef.current = true;
        const imgPos = getEraserPosInDesign(pos.x, pos.y);
        if (imgPos) { applyEraserStroke(imgPos.x, imgPos.y); draw(); }
        return;
      }
      setIsDragging(true);
      setDragStart({ x: pos.x - design.x, y: pos.y - design.y });
    },
    [addPenTracePoint, design, eraserActive, getPos, getEraserPosInDesign, applyEraserStroke, draw, penTraceActive]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (penTraceActive) {
        setPenTraceHover(clampPointToCanvas(getPos(e.clientX, e.clientY), displayWidth, displayHeight));
        return;
      }
      if (!design) return;
      const pos = getPos(e.clientX, e.clientY);
      if (eraserActive) {
        if (isErasingRef.current) {
          const imgPos = getEraserPosInDesign(pos.x, pos.y);
          if (imgPos) { applyEraserStroke(imgPos.x, imgPos.y); draw(); }
        }
        return;
      }
      if (!isDragging) return;
      updateDesignContinuously((current) => ({ ...current, x: pos.x - dragStart.x, y: pos.y - dragStart.y }));
    },
    [isDragging, design, dragStart, eraserActive, getPos, getEraserPosInDesign, applyEraserStroke, draw, updateDesignContinuously, penTraceActive, displayWidth, displayHeight]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) commitCurrentDesign();
    isErasingRef.current = false;
    setIsDragging(false);
  }, [isDragging, commitCurrentDesign]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (penTraceActive && e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        addPenTracePoint(getPos(touch.clientX, touch.clientY));
        return;
      }
      if (!design || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const pos = getPos(touch.clientX, touch.clientY);
      if (eraserActive) {
        isErasingRef.current = true;
        const imgPos = getEraserPosInDesign(pos.x, pos.y);
        if (imgPos) { applyEraserStroke(imgPos.x, imgPos.y); draw(); }
        return;
      }
      setIsDragging(true);
      setDragStart({ x: pos.x - design.x, y: pos.y - design.y });
    },
    [addPenTracePoint, design, eraserActive, getPos, getEraserPosInDesign, applyEraserStroke, draw, penTraceActive]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (penTraceActive) {
        e.preventDefault();
        return;
      }
      if (!design || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const pos = getPos(touch.clientX, touch.clientY);
      if (eraserActive) {
        if (isErasingRef.current) {
          const imgPos = getEraserPosInDesign(pos.x, pos.y);
          if (imgPos) { applyEraserStroke(imgPos.x, imgPos.y); draw(); }
        }
        return;
      }
      if (!isDragging) return;
      updateDesignContinuously((current) => ({ ...current, x: pos.x - dragStart.x, y: pos.y - dragStart.y }));
    },
    [isDragging, design, dragStart, eraserActive, getPos, getEraserPosInDesign, applyEraserStroke, draw, updateDesignContinuously, penTraceActive]
  );

  const handleTouchEnd = useCallback(() => {
    if (isDragging) commitCurrentDesign();
    isErasingRef.current = false;
    setIsDragging(false);
  }, [isDragging, commitCurrentDesign]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (penTraceActive) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && penTracePoints.length > 0) {
          e.preventDefault();
          setPenTracePoints((current) => current.slice(0, -1));
          setPenTraceClosed(false);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setPenTraceActive(false);
          setPenTraceHover(null);
          return;
        }
        if (e.key === "Enter" && penTracePoints.length >= 3) {
          e.preventDefault();
          setPenTraceClosed(true);
          return;
        }
        if ((e.key === "Backspace" || e.key === "Delete") && penTracePoints.length > 0) {
          e.preventDefault();
          setPenTracePoints((current) => current.slice(0, -1));
          setPenTraceClosed(false);
          return;
        }
      }
      if (!design) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); handleUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); handleRedo(); return; }
      if (!design) return;
      if (e.key === "r" || e.key === "R")
        setDesign({ ...design, rotation: (design.rotation + 15) % 360 });
      if (e.key === "+" || e.key === "=")
        setDesign({ ...design, scale: Math.min(design.scale * 1.05, 10) });
      if (e.key === "-")
        setDesign({ ...design, scale: Math.max(design.scale * 0.95, 0.01) });
      if (e.key === "ArrowLeft") { e.preventDefault(); setDesign({ ...design, x: design.x - 2 }); }
      if (e.key === "ArrowRight") { e.preventDefault(); setDesign({ ...design, x: design.x + 2 }); }
      if (e.key === "ArrowUp") { e.preventDefault(); setDesign({ ...design, y: design.y - 2 }); }
      if (e.key === "ArrowDown") { e.preventDefault(); setDesign({ ...design, y: design.y + 2 }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [design, handleUndo, handleRedo, penTraceActive, penTracePoints.length]);

  // Quick actions
  const handleFill = useCallback(() => {
    if (!design) return;
    const coverScale = Math.max(
      displayWidth / design.naturalWidth,
      displayHeight / design.naturalHeight
    );
    const filledWidthIn = displayToInches(design.naturalWidth * coverScale, displayWidth, material.widthIn);
    const filledHeightIn = displayToInches(design.naturalHeight * coverScale, displayHeight, material.heightIn);
    setDesign({
      ...design,
      scale: coverScale,
      scaleX: 1,
      scaleY: 1,
      x: (displayWidth - design.naturalWidth * coverScale) / 2,
      y: (displayHeight - design.naturalHeight * coverScale) / 2,
      rotation: 0,
    });
    if (unit === "in") {
      setDesignWidthInput(filledWidthIn.toFixed(2));
      setDesignHeightInput(filledHeightIn.toFixed(2));
    } else {
      setDesignWidthInput(inToMm(filledWidthIn).toFixed(1));
      setDesignHeightInput(inToMm(filledHeightIn).toFixed(1));
    }
  }, [design, displayWidth, displayHeight, material.heightIn, material.widthIn, unit]);

  const handleCenter = useCallback(() => {
    if (!design) return;
    const imgW = design.naturalWidth * design.scale * design.scaleX;
    const imgH = design.naturalHeight * design.scale * design.scaleY;
    setDesign({
      ...design,
      x: (displayWidth - imgW) / 2,
      y: (displayHeight - imgH) / 2,
    });
  }, [design, displayWidth, displayHeight]);

  // --- Export ---
  const getExportCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!partPhoto && !design && penTracePoints.length < 2) return null;
    // Export at laser-friendly 300 DPI based on material size
    const expW = Math.round(material.widthIn * EXPORT_DPI);
    const expH = Math.round(material.heightIn * EXPORT_DPI);
    const scaleX = expW / displayWidth;
    const scaleY = expH / displayHeight;

    const offscreen = document.createElement("canvas");
    offscreen.width = expW;
    offscreen.height = expH;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return null;

    if (partPhoto) {
      const rad = (partRotation * Math.PI) / 180;
      const absCos = Math.abs(Math.cos(rad));
      const absSin = Math.abs(Math.sin(rad));
      const scale = Math.min(
        expW / (expW * absCos + expH * absSin),
        expH / (expW * absSin + expH * absCos)
      );
      const drawW = expW / scale;
      const drawH = expH / scale;
      ctx.save();
      ctx.translate(expW / 2, expH / 2);
      ctx.rotate(rad);
      ctx.scale(scale, scale);
      ctx.drawImage(partPhoto, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }

    if (design) {
      const imgW = design.naturalWidth * design.scale * design.scaleX * scaleX;
      const imgH = design.naturalHeight * design.scale * design.scaleY * scaleY;
      const cx = design.x * scaleX + imgW / 2;
      const cy = design.y * scaleY + imgH / 2;
      const filtered = applyFiltersToCanvas(design.element, design.filters, imgW, imgH, eraserMaskRef.current);
      const shouldClipDesign = clipDesignToTrace && penTraceClosed && penTracePoints.length >= 3;

      ctx.save();
      if (shouldClipDesign) {
        clipToTracePath(ctx, penTracePoints, scaleX, scaleY);
      }
      if (design.warpMesh) {
        const m = design.warpMesh;
        const scaledMesh: WarpMesh = {
          tl: { x: m.tl.x * scaleX, y: m.tl.y * scaleY },
          tr: { x: m.tr.x * scaleX, y: m.tr.y * scaleY },
          bl: { x: m.bl.x * scaleX, y: m.bl.y * scaleY },
          br: { x: m.br.x * scaleX, y: m.br.y * scaleY },
          top:    m.top.map(p    => ({ ...p, offset: { x: p.offset.x * scaleX, y: p.offset.y * scaleY } })),
          bottom: m.bottom.map(p => ({ ...p, offset: { x: p.offset.x * scaleX, y: p.offset.y * scaleY } })),
          left:   m.left.map(p   => ({ ...p, offset: { x: p.offset.x * scaleX, y: p.offset.y * scaleY } })),
          right:  m.right.map(p  => ({ ...p, offset: { x: p.offset.x * scaleX, y: p.offset.y * scaleY } })),
          interior: (m.interior ?? []).map(p => ({ ...p, offset: { x: p.offset.x * scaleX, y: p.offset.y * scaleY } })),
        };
        drawWarpedImage(ctx, filtered, scaledMesh, design.opacity, 96);
      } else {
        ctx.save();
        ctx.globalAlpha = design.opacity;
        ctx.translate(cx, cy);
        ctx.rotate((design.rotation * Math.PI) / 180);
        if (design.flipH) ctx.scale(-1, 1);
        if (design.flipV) ctx.scale(1, -1);
        ctx.drawImage(filtered, -imgW / 2, -imgH / 2, imgW, imgH);
        ctx.restore();
      }
      ctx.restore();
    }

    if (penTracePoints.length > 1) {
      drawTraceOnCanvas(ctx, penTracePoints, penTraceClosed, {
        scaleX,
        scaleY,
        strokeStyle: penTraceStyle.strokeColor,
        fillStyle: penTraceStyle.fillEnabled && penTraceClosed ? penTraceStyle.fillColor : undefined,
        lineWidth: Math.max(1, penTraceStyle.strokeWidth * Math.min(scaleX, scaleY)),
      });
    }
    return offscreen;
  }, [partPhoto, partRotation, design, displayWidth, displayHeight, material, penTracePoints, penTraceClosed, penTraceStyle, clipDesignToTrace]);

  const dl = useCallback((dataUrl: string, ext: string) => {
    const a = document.createElement("a");
    a.download = `engraving-${Date.now()}.${ext}`;
    a.href = dataUrl;
    a.click();
  }, []);

  const dlText = useCallback((text: string, ext: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.download = `engraving-${Date.now()}.${ext}`;
    a.href = url;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const togglePenTrace = useCallback(() => {
    setPenTraceActive((active) => {
      const nextActive = !active;
      if (nextActive) {
        setEraserActive(false);
        setWarpMode(false);
      } else {
        setPenTraceHover(null);
      }
      return nextActive;
    });
  }, []);

  const closePenTrace = useCallback(() => {
    if (penTracePoints.length < 3) {
      toast.error(t("toast.penTraceNeedPoints"));
      return;
    }
    setPenTraceClosed(true);
    setPenTraceHover(null);
  }, [penTracePoints.length, t]);

  const undoPenTracePoint = useCallback(() => {
    setPenTracePoints((current) => current.slice(0, -1));
    setPenTraceClosed(false);
  }, []);

  const canUndoPenTrace = penTracePoints.length > 0;
  const canUseUndo = canUndo || canUndoPenTrace;

  const handleHeaderUndo = useCallback(() => {
    if (canUndoPenTrace && (penTraceActive || !canUndo)) {
      undoPenTracePoint();
      return;
    }
    handleUndo();
  }, [canUndo, canUndoPenTrace, handleUndo, penTraceActive, undoPenTracePoint]);

  const clearPenTrace = useCallback(() => {
    setPenTracePoints([]);
    setPenTraceClosed(false);
    setPenTraceHover(null);
    setClipDesignToTrace(false);
  }, []);

  const applyDetectedTrace = useCallback(
    (points: Pt[], clipDesign: boolean) => {
      setPenTracePoints(points);
      setPenTraceClosed(true);
      setPenTraceActive(false);
      setPenTraceHover(null);
      setClipDesignToTrace(clipDesign);
      toast.success(t(clipDesign ? "toast.engraveAiTraceClipped" : "toast.engraveAiTraceReady"));
    },
    [t]
  );

  const applyDetectedMaskAsDesign = useCallback(
    (dataUrl: string, points?: Pt[]) => {
      const restoreState: SavedDesignState = {
        x: 0,
        y: 0,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        naturalWidth: displayWidth,
        naturalHeight: displayHeight,
        flipH: false,
        flipV: false,
        filters: DEFAULT_FILTERS,
        warpMesh: null,
      };
      loadDesign(dataUrl, restoreState);
      setDesignSrc(dataUrl);
      if (points && points.length >= 3) {
        setPenTracePoints(points);
        setPenTraceClosed(true);
        setPenTraceActive(false);
        setPenTraceHover(null);
        setClipDesignToTrace(false);
      }
      setDesignWidthInput(unit === "in" ? material.widthIn.toFixed(2) : inToMm(material.widthIn).toFixed(1));
      setDesignHeightInput(unit === "in" ? material.heightIn.toFixed(2) : inToMm(material.heightIn).toFixed(1));
      toast.success(t("toast.engraveAiMaskLoaded"));
    },
    [displayHeight, displayWidth, loadDesign, material.heightIn, material.widthIn, t, unit]
  );

  const applyPenTraceAsDesign = useCallback(() => {
    if (penTracePoints.length < 2) {
      toast.error(t("toast.penTraceNeedLine"));
      return;
    }
    const svg = createPenTraceSvg({
      points: penTracePoints,
      closed: penTraceClosed,
      width: displayWidth,
      height: displayHeight,
      strokeWidth: penTraceStyle.strokeWidth,
      strokeColor: penTraceStyle.strokeColor,
      fillEnabled: penTraceStyle.fillEnabled,
      fillColor: penTraceStyle.fillColor,
    });
    loadDesign(svgToDataUrl(svg), {
      x: 0,
      y: 0,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      naturalWidth: displayWidth,
      naturalHeight: displayHeight,
      flipH: false,
      flipV: false,
      filters: { ...DEFAULT_FILTERS },
      warpMesh: null,
    });
    setPenTraceActive(false);
    setPenTraceHover(null);
    toast.success(t("toast.penTraceLoaded"));
  }, [displayWidth, displayHeight, loadDesign, penTraceClosed, penTracePoints, penTraceStyle, t]);

  const downloadPenTraceSvg = useCallback(() => {
    if (penTracePoints.length < 2) {
      toast.error(t("toast.penTraceNeedLine"));
      return;
    }
    dlText(
      createActualSizePenTraceSvg({
        points: penTracePoints,
        closed: penTraceClosed,
        displayWidth,
        displayHeight,
        widthIn: material.widthIn,
        heightIn: material.heightIn,
        style: penTraceStyle,
      }),
      "svg",
      "image/svg+xml;charset=utf-8",
    );
  }, [displayWidth, displayHeight, dlText, material.heightIn, material.widthIn, penTraceClosed, penTracePoints, penTraceStyle, t]);

  const savePenTracePreset = useCallback(() => {
    if (penTracePoints.length < 2) {
      toast.error(t("toast.penTraceNeedLine"));
      return;
    }
    const name = tracePresetName.trim() || t("panel.penTrace.defaultPartName", { count: tracePresets.length + 1 });
    const previewSvg = createPenTraceSvg({
      points: penTracePoints,
      closed: penTraceClosed,
      width: displayWidth,
      height: displayHeight,
      strokeWidth: penTraceStyle.strokeWidth,
      strokeColor: penTraceStyle.strokeColor,
      fillEnabled: penTraceStyle.fillEnabled,
      fillColor: penTraceStyle.fillColor,
    });

    const savedId = addCustomPreset({
      name,
      width: material.widthIn,
      height: material.heightIn,
      unit,
      maskDataUrl: svgToDataUrl(previewSvg),
      tracePoints: normalizeTracePoints(penTracePoints, displayWidth, displayHeight),
      traceClosed: penTraceClosed,
      traceStyle: penTraceStyle,
      createdAt: new Date().toISOString(),
      source: "pen-trace",
    });
    if (!savedId) return;
    setTracePresetName("");
    toast.success(t("toast.penTracePresetSaved", { name }));
  }, [
    addCustomPreset,
    displayHeight,
    displayWidth,
    material.heightIn,
    material.widthIn,
    penTraceClosed,
    penTracePoints,
    penTraceStyle,
    t,
    tracePresetName,
    tracePresets.length,
    unit,
  ]);

  const loadSavedTracePreset = useCallback((preset: CustomPreset) => {
    if (!hasSavedTracePoints(preset)) return;
    setSelectedPresetId("custom");
    setUnit(preset.unit);
    setMaterial({ widthIn: preset.width, heightIn: preset.height });
    setPendingTracePreset(preset);
  }, []);

  const deleteSavedTracePreset = useCallback(
    (preset: CustomPreset) => {
      if (!removeCustomPreset(preset.id)) return;
      toast.success(t("toast.penTracePresetDeleted", { name: preset.name }));
    },
    [removeCustomPreset, t]
  );

  // --- Remove Background ---
  const handleRemoveBackground = useCallback(() => {
    if (!design) return;
    setBgRemoving(true);
    // Run async so React can show the loading state
    setTimeout(() => {
      try {
        const dataUrl = removeBackground(design.element, 35);
        if (!dataUrl) { toast.error(t("toast.processFail")); return; }
        loadDesign(dataUrl);
        setDesignSrc(dataUrl);
        toast.success(t("toast.bgRemoved"));
      } catch {
        toast.error(t("toast.bgRemoveFail"));
      } finally {
        setBgRemoving(false);
      }
    }, 50);
  }, [design, loadDesign, t]);

  // --- Round Corners ---
  const handleRoundCorners = useCallback(() => {
    if (!design) return;
    setRoundingProcessing(true);
    setTimeout(() => {
      try {
        const dataUrl = roundCorners(design.element, cornerRadius);
        if (!dataUrl) { toast.error(t("toast.processFail")); return; }
        loadDesign(dataUrl);
        setDesignSrc(dataUrl);
        toast.success(t("toast.cornersRounded"));
      } catch {
        toast.error(t("toast.roundFail"));
      } finally {
        setRoundingProcessing(false);
      }
    }, 50);
  }, [design, cornerRadius, loadDesign, t]);

  // Gate helper — checks access before running an export
  const gatedExport = useCallback((doExport: () => void) => {
    doExport();
  }, []);

  const handleExportPng = useCallback(() => {
    gatedExport(() => {
      const c = getExportCanvas();
      if (c) dl(setPngDpi(c.toDataURL("image/png")), "png");
    });
  }, [gatedExport, getExportCanvas, dl]);

  const handleExportJpeg = useCallback((bg: "white" | "black") => {
    gatedExport(() => {
      const c = getExportCanvas();
      if (!c) return;
      const flat = document.createElement("canvas");
      flat.width = c.width; flat.height = c.height;
      const ctx = flat.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(c, 0, 0);
      dl(setJpegDpi(flat.toDataURL("image/jpeg", 0.95)), "jpg");
    });
  }, [gatedExport, getExportCanvas, dl]);

  const handleExportSvg = useCallback(() => {
    gatedExport(() => {
      const c = getExportCanvas();
      if (!c) return;
      const pngDataUrl = setPngDpi(c.toDataURL("image/png"));
      dlText(
        createActualSizeSvg({
          pngDataUrl,
          widthIn: material.widthIn,
          heightIn: material.heightIn,
        }),
        "svg",
        "image/svg+xml;charset=utf-8",
      );
    });
  }, [gatedExport, getExportCanvas, dlText, material]);

  const handleExportPdf = useCallback(async () => {
    gatedExport(async () => {
      const { jsPDF } = await import("jspdf");
      const c = getExportCanvas();
      if (!c) return;
      const wMm = material.widthIn * 25.4;
      const hMm = material.heightIn * 25.4;
      const pdf = new jsPDF({
        orientation: wMm > hMm ? "landscape" : "portrait",
        unit: "mm",
        format: [wMm, hMm],
      });
      pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, wMm, hMm);
      pdf.save(`engraving-${Date.now()}.pdf`);
    });
  }, [gatedExport, getExportCanvas, material]);

  const canExport = !!(partPhoto || design || penTracePoints.length > 1);

  // --- Resize handle drag logic ---
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, edge: "right" | "bottom" | "corner") => {
      e.stopPropagation();
      e.preventDefault();
      resizeDragRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        startW: displayWidth,
        startH: displayHeight,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        const drag = resizeDragRef.current;
        if (!drag) return;
        const deltaX = ev.clientX - drag.startX;
        const deltaY = ev.clientY - drag.startY;

        let newW = drag.startW;
        let newH = drag.startH;

        if (drag.edge === "right") {
          newW = drag.startW + deltaX;
        } else if (drag.edge === "bottom") {
          newH = drag.startH + deltaY;
        } else {
          // corner
          newW = drag.startW + deltaX;
          newH = drag.startH + deltaY;
          if (ev.shiftKey) {
            // Preserve aspect ratio
            const aspect = drag.startW / drag.startH;
            const avgDelta = (deltaX + deltaY) / 2;
            newW = drag.startW + avgDelta;
            newH = newW / aspect;
          }
        }

        setManualDisplaySize({
          w: Math.max(newW, 80),
          h: Math.max(newH, 80),
        });
      };

      const handleMouseUp = () => {
        resizeDragRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [displayWidth, displayHeight]
  );

  // --- Design bounding-box drag-to-resize ---
  const handleDesignResizePointerDown = useCallback(
    (e: React.PointerEvent, handle: DesignResizeHandle) => {
      if (!design) return;
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const imgW = design.naturalWidth * design.scale * design.scaleX;
      const imgH = design.naturalHeight * design.scale * design.scaleY;
      designResizeDragRef.current = {
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startScaleX: design.scaleX,
        startScaleY: design.scaleY,
        startX: design.x,
        startY: design.y,
        startImgW: imgW,
        startImgH: imgH,
        shiftKey: e.shiftKey,
      };

      const onMove = (ev: PointerEvent) => {
        const drag = designResizeDragRef.current;
        if (!drag || !design) return;
        const dx = ev.clientX - drag.startMouseX;
        const dy = ev.clientY - drag.startMouseY;
        const h = drag.handle;

        let newImgW = drag.startImgW;
        let newImgH = drag.startImgH;
        let newX = drag.startX;
        let newY = drag.startY;

        // Determine width/height delta per handle
        const stretchesE = h === "e" || h === "ne" || h === "se";
        const stretchesW = h === "w" || h === "nw" || h === "sw";
        const stretchesS = h === "s" || h === "se" || h === "sw";
        const stretchesN = h === "n" || h === "ne" || h === "nw";

        if (stretchesE) newImgW = Math.max(20, drag.startImgW + dx);
        if (stretchesW) { newImgW = Math.max(20, drag.startImgW - dx); newX = drag.startX + drag.startImgW - newImgW; }
        if (stretchesS) newImgH = Math.max(20, drag.startImgH + dy);
        if (stretchesN) { newImgH = Math.max(20, drag.startImgH - dy); newY = drag.startY + drag.startImgH - newImgH; }

        // Shift = proportional (corners only)
        if (ev.shiftKey && (h === "nw" || h === "ne" || h === "sw" || h === "se")) {
          const aspect = drag.startImgW / drag.startImgH;
          if (Math.abs(dx) > Math.abs(dy)) {
            newImgH = newImgW / aspect;
            if (stretchesN) newY = drag.startY + drag.startImgH - newImgH;
          } else {
            newImgW = newImgH * aspect;
            if (stretchesW) newX = drag.startX + drag.startImgW - newImgW;
          }
        }

        updateDesignContinuously((prev) => {
          return {
            ...prev,
            scaleX: newImgW / prev.naturalWidth,
            scaleY: newImgH / prev.naturalHeight,
            scale: 1,
            x: newX,
            y: newY,
          };
        });
      };

      const onUp = () => {
        commitCurrentDesign();
        designResizeDragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [design, updateDesignContinuously, commitCurrentDesign]
  );

  // --- Warp mode helpers ---
  const enableWarpMode = useCallback(() => {
    if (!design) return;
    setPenTraceActive(false);
    setPenTraceHover(null);
    const imgW = design.naturalWidth * design.scale * design.scaleX;
    const imgH = design.naturalHeight * design.scale * design.scaleY;
    const mesh: WarpMesh = design.warpMesh ?? {
      tl: { x: design.x,        y: design.y },
      tr: { x: design.x + imgW, y: design.y },
      bl: { x: design.x,        y: design.y + imgH },
      br: { x: design.x + imgW, y: design.y + imgH },
      top: [], bottom: [], left: [], right: [], interior: [],
    };
    setDesign({ ...design, warpMesh: mesh });
    setWarpMode(true);
  }, [design]);

  const disableWarpMode = useCallback(() => { setWarpMode(false); }, []);

  const resetWarp = useCallback(() => {
    if (!design) return;
    setDesign({ ...design, warpMesh: null });
    setWarpMode(false);
  }, [design]);

  // Drag a corner of the mesh
  const handleWarpCornerMouseDown = useCallback(
    (e: React.MouseEvent, corner: keyof Pick<WarpMesh, "tl"|"tr"|"bl"|"br">) => {
      if (!design?.warpMesh) return;
      e.stopPropagation(); e.preventDefault();
      const onMove = (ev: MouseEvent) => {
        const pos = getPos(ev.clientX, ev.clientY);
        updateDesignContinuously((prev) => {
          if (!prev.warpMesh) return prev;
          return { ...prev, warpMesh: { ...prev.warpMesh, [corner]: pos } };
        });
      };
      const onUp = () => { commitCurrentDesign(); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [design, getPos, updateDesignContinuously, commitCurrentDesign]
  );

  // Drag an existing edge pin
  const handleWarpPinMouseDown = useCallback(
    (e: React.MouseEvent, edge: "top"|"bottom"|"left"|"right", pinId: string) => {
      if (!design?.warpMesh) return;
      e.stopPropagation(); e.preventDefault();
      const mesh = design.warpMesh;
      // Get the two corners for this edge to compute the straight-line base position
      const edgeCorners: Record<"top"|"bottom"|"left"|"right", [keyof Pick<WarpMesh,"tl"|"tr"|"bl"|"br">, keyof Pick<WarpMesh,"tl"|"tr"|"bl"|"br">]> = {
        top:    ["tl","tr"],
        bottom: ["bl","br"],
        left:   ["tl","bl"],
        right:  ["tr","br"],
      };
      const [cA, cB] = edgeCorners[edge];
      const pin = mesh[edge].find(p => p.id === pinId);
      if (!pin) return;
      const onMove = (ev: MouseEvent) => {
        const pos = getPos(ev.clientX, ev.clientY);
        updateDesignContinuously((prev) => {
          if (!prev.warpMesh) return prev;
          const m = prev.warpMesh;
          // Recompute offset from straight-line position
          const a = m[cA]; const b = m[cB];
          const straight = { x: a.x + (b.x - a.x) * pin.t, y: a.y + (b.y - a.y) * pin.t };
          const offset = { x: pos.x - straight.x, y: pos.y - straight.y };
          const newPins = m[edge].map(p => p.id === pinId ? { ...p, offset } : p);
          return { ...prev, warpMesh: { ...m, [edge]: newPins } };
        });
      };
      const onUp = () => { commitCurrentDesign(); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [design, getPos, updateDesignContinuously, commitCurrentDesign]
  );

  // Add a pin by clicking on the edge outline in warp mode
  const handleWarpEdgeClick = useCallback(
    (e: React.MouseEvent, edge: "top"|"bottom"|"left"|"right") => {
      if (!design?.warpMesh) return;
      e.stopPropagation(); e.preventDefault();
      const pos = getPos(e.clientX, e.clientY);
      const mesh = design.warpMesh;
      const edgeCorners: Record<"top"|"bottom"|"left"|"right", [keyof Pick<WarpMesh,"tl"|"tr"|"bl"|"br">, keyof Pick<WarpMesh,"tl"|"tr"|"bl"|"br">]> = {
        top:    ["tl","tr"],
        bottom: ["bl","br"],
        left:   ["tl","bl"],
        right:  ["tr","br"],
      };
      const [cA, cB] = edgeCorners[edge];
      const a = mesh[cA]; const b = mesh[cB];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const len2 = dx*dx + dy*dy;
      const t = len2 < 1 ? 0.5 : Math.max(0.01, Math.min(0.99, ((pos.x - a.x)*dx + (pos.y - a.y)*dy) / len2));
      const newPin: EdgePin = { id: `${Date.now()}`, t, offset: { x: 0, y: 0 } };
      const newPins = [...mesh[edge], newPin].sort((p1, p2) => p1.t - p2.t);
      setDesign({ ...design, warpMesh: { ...mesh, [edge]: newPins } });
    },
    [design, getPos]
  );

  // Remove a pin by right-clicking it
  const handleWarpPinRemove = useCallback(
    (e: React.MouseEvent, edge: "top"|"bottom"|"left"|"right", pinId: string) => {
      e.preventDefault(); e.stopPropagation();
      if (!design?.warpMesh) return;
      const mesh = design.warpMesh;
      setDesign({ ...design, warpMesh: { ...mesh, [edge]: mesh[edge].filter(p => p.id !== pinId) } });
    },
    [design]
  );

  const handleWarpInteriorClick = useCallback(
    (e: React.MouseEvent) => {
      if (!design?.warpMesh) return;
      e.stopPropagation();
      e.preventDefault();
      const imgW = design.naturalWidth * design.scale * design.scaleX;
      const imgH = design.naturalHeight * design.scale * design.scaleY;
      if (imgW <= 0 || imgH <= 0) return;
      const pos = getPos(e.clientX, e.clientY);
      const newPin: InteriorWarpPin = {
        id: `${Date.now()}`,
        s: clamp01((pos.x - design.x) / imgW),
        t: clamp01((pos.y - design.y) / imgH),
        offset: { x: 0, y: 0 },
        radius: DEFAULT_LOCAL_WARP_RADIUS,
      };
      const mesh = design.warpMesh;
      setDesign({
        ...design,
        warpMesh: {
          ...mesh,
          interior: [...(mesh.interior ?? []), newPin],
        },
      });
    },
    [design, getPos]
  );

  const handleWarpInteriorPinMouseDown = useCallback(
    (e: React.MouseEvent, pinId: string) => {
      if (!design?.warpMesh) return;
      e.stopPropagation();
      e.preventDefault();
      const pin = (design.warpMesh.interior ?? []).find((p) => p.id === pinId);
      if (!pin) return;

      const onMove = (ev: MouseEvent) => {
        const pos = getPos(ev.clientX, ev.clientY);
        updateDesignContinuously((prev) => {
          if (!prev.warpMesh) return prev;
          const m = prev.warpMesh;
          const newPins = (m.interior ?? []).map((p) => {
            if (p.id !== pinId) return p;
            const base = boundaryMeshPt(m, p.s, p.t);
            return {
              ...p,
              offset: {
                x: pos.x - base.x,
                y: pos.y - base.y,
              },
            };
          });
          return { ...prev, warpMesh: { ...m, interior: newPins } };
        });
      };

      const onUp = () => {
        commitCurrentDesign();
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [design, getPos, updateDesignContinuously, commitCurrentDesign]
  );

  const handleWarpInteriorPinRemove = useCallback(
    (e: React.MouseEvent, pinId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!design?.warpMesh) return;
      const mesh = design.warpMesh;
      setDesign({
        ...design,
        warpMesh: {
          ...mesh,
          interior: (mesh.interior ?? []).filter((pin) => pin.id !== pinId),
        },
      });
    },
    [design]
  );

  // --- Unit toggle ---
  const formatUnit = (valIn: number) => {
    if (unit === "in") return `${valIn.toFixed(2)}"`;
    return `${inToMm(valIn).toFixed(1)}mm`;
  };

  // Material custom width/height input
  const [matWInput, setMatWInput] = useState("4.00");
  const [matHInput, setMatHInput] = useState("4.00");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const applyCustomMaterial = () => {
    const w = parseFloat(matWInput);
    const h = parseFloat(matHInput);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      const wIn = unit === "in" ? w : mmToIn(w);
      const hIn = unit === "in" ? h : mmToIn(h);
      setMaterial({ widthIn: wIn, heightIn: hIn });
    }
  };

  // Sync matWInput/matHInput when preset changes
  useEffect(() => {
    if (unit === "in") {
      setMatWInput(material.widthIn.toFixed(2));
      setMatHInput(material.heightIn.toFixed(2));
    } else {
      setMatWInput(inToMm(material.widthIn).toFixed(1));
      setMatHInput(inToMm(material.heightIn).toFixed(1));
    }
  }, [material, unit]);

  const updateFilter = useCallback(
    (key: keyof ImageFilters, value: number) => {
      updateDesignContinuously((current) => ({
        ...current,
        filters: { ...current.filters, [key]: value },
      }));
    },
    [updateDesignContinuously]
  );

  const commitFilter = useCallback(
    (key: keyof ImageFilters, value: number) => {
      commitDesignUpdate((current) => ({
        ...current,
        filters: { ...current.filters, [key]: value },
      }));
    },
    [commitDesignUpdate]
  );

  const resetFilters = () => {
    if (!design) return;
    setDesign({ ...design, filters: { ...DEFAULT_FILTERS } });
  };

  const unitLabel = unit === "in" ? t("panel.material.unit.in") : t("panel.material.unit.mm");
  const screenPpiLabel = t("editor.ppiLabel", { ppi: Math.round(screenPpi) });
  const materialDisplaySize = `${formatUnit(material.widthIn)} × ${formatUnit(material.heightIn)}`;
  const selectedPresetName =
    MATERIAL_PRESETS.find((preset) => preset.id === selectedPresetId)?.name ?? "Custom Size";
  const assistantContext = useMemo<CanvasAssistantContext>(
    () => ({
      locale,
      material: {
        presetName: selectedPresetName,
        widthIn: material.widthIn,
        heightIn: material.heightIn,
        displaySize: materialDisplaySize,
      },
      canvas: {
        displayWidthPx: displayWidth,
        displayHeightPx: displayHeight,
        screenPpi: Math.round(screenPpi),
        exportDpi: EXPORT_DPI,
        rulerVisible: showRuler,
      },
      partPhoto: {
        loaded: !!partPhoto,
        rotationDeg: partRotation,
      },
      engraveAi: {
        outlineReady: penTraceClosed && penTracePoints.length >= 3,
        tracePoints: penTracePoints.length,
        designClippedToOutline: clipDesignToTrace && penTraceClosed && penTracePoints.length >= 3,
      },
      design: design
        ? {
            loaded: true,
            size: currentDesignSizeLabel ?? "not measured",
            rotationDeg: design.rotation,
            scalePercent: Math.round(design.scale * ((design.scaleX + design.scaleY) / 2) * 100),
            flipH: design.flipH,
            flipV: design.flipV,
            hasWarp: !!design.warpMesh,
            eraserUsed: !!eraserMaskRef.current,
            filters: design.filters,
          }
        : null,
    }),
    [
      currentDesignSizeLabel,
      design,
      displayHeight,
      displayWidth,
      locale,
      materialDisplaySize,
      material.heightIn,
      material.widthIn,
      partPhoto,
      partRotation,
      penTraceClosed,
      penTracePoints.length,
      clipDesignToTrace,
      screenPpi,
      selectedPresetName,
      showRuler,
    ],
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground flex flex-col">
      {cropOpen && designSrc && (
        <CropModal
          open={cropOpen}
          imageSrc={designSrc}
          locale={locale}
          onClose={() => setCropOpen(false)}
          onCrop={(croppedDataUrl) => {
            setCropOpen(false);
            loadDesign(croppedDataUrl);
            setDesignSrc(croppedDataUrl);
          }}
        />
      )}
      {cropPartOpen && partPhotoSrc && (
        <CropModal
          open={cropPartOpen}
          imageSrc={partPhotoSrc}
          locale={locale}
          isCropPart
          onClose={() => setCropPartOpen(false)}
          onCrop={(croppedDataUrl) => {
            setCropPartOpen(false);
            loadPartPhoto(croppedDataUrl);
            setPartPhotoSrc(croppedDataUrl);
          }}
        />
      )}
      <CanvasAssistant
        context={assistantContext}
        designImageSrc={designSrc}
        partPhotoSrc={partPhotoSrc}
        pendingQuestion={assistantQuestion}
        onPendingQuestionHandled={() => setAssistantQuestion(null)}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card px-4 py-3 shrink-0">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-serif text-base sm:text-lg font-bold truncate">{t("editor.title")}</h1>
            <span className="hidden sm:inline text-[10px] text-muted-foreground">{t("editor.tagline")}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Undo / Redo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("editor.tooltip.undo")}
                  size="sm"
                  variant="ghost"
                  onClick={handleHeaderUndo}
                  disabled={!canUseUndo}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("editor.tooltip.undo")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("editor.tooltip.redo")}
                  size="sm"
                  variant="ghost"
                  onClick={handleRedo}
                  disabled={!canRedo}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("editor.tooltip.redo")}</TooltipContent>
            </Tooltip>
            {/* Unit toggle */}
            <div className="hidden sm:flex items-center rounded-md border border-border overflow-hidden text-xs">
              <button
                className={`px-3 py-1.5 transition-colors ${unit === "in" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
                onClick={() => setUnit("in")}
              >
                {t("panel.material.unit.in")}
              </button>
              <button
                className={`px-3 py-1.5 transition-colors ${unit === "mm" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
                onClick={() => setUnit("mm")}
              >
                {t("panel.material.unit.mm")}
              </button>
            </div>
            {/* Ruler toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={showRuler ? "secondary" : "ghost"}
                  aria-label={t("editor.tooltip.ruler")}
                  className="hidden sm:flex"
                  onClick={() => setShowRuler(!showRuler)}
                >
                  <Ruler className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("editor.tooltip.ruler")}</TooltipContent>
            </Tooltip>
            {/* Workspace resize toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={resizeMode ? "secondary" : "ghost"}
                  aria-label={t("editor.tooltip.workspaceResize")}
                  className="hidden sm:flex"
                  onClick={() => setResizeMode(!resizeMode)}
                >
                  <GripHorizontal className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("editor.tooltip.workspaceResize")}</TooltipContent>
            </Tooltip>
            <div className="hidden sm:flex items-center gap-1 rounded-md border border-border bg-card px-1 py-1 text-xs">
              <Languages className="h-3.5 w-3.5 text-muted-foreground" />
              {(["en", "es"] as const).map((lng) => (
                <button
                  key={lng}
                  className={`rounded px-2 py-0.5 font-medium transition-colors ${
                    locale === lng
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => handleLocaleChange(lng)}
                  type="button"
                >
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label={t("editor.export")} size="sm" disabled={!canExport}>
                  <Download className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">{t("editor.export")}</span>
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportSvg}>{t("editor.export.svgXtool")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportPng}>{t("editor.export.png")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportJpeg("white")}>{t("editor.export.jpegWhite")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportJpeg("black")}>{t("editor.export.jpegBlack")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportPdf}>
                  {t("editor.export.pdf")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex-1 mx-auto max-w-7xl w-full px-3 py-3 sm:px-4 sm:py-6">
        <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[280px_1fr]">

          {/* Canvas — first on mobile */}
          <div ref={canvasContainerRef} className="flex min-w-0 w-full flex-col items-center gap-3 overflow-hidden order-1 lg:order-2">
            {/* Ruler + workspace layout */}
            <div
              className="flex max-w-full flex-col"
              style={{ width: displayWidth + rulerThickness }}
            >
              {/* Top ruler (above canvas) */}
              {showRuler && (
                <div className="flex">
                  {/* Corner spacer */}
                  <div style={{ width: 20, height: 20, flexShrink: 0 }} className="bg-secondary/30 border-b border-r border-border/40" />
                  <canvas
                    ref={topRulerRef}
                    width={displayWidth}
                    height={20}
                    className="block"
                    style={{ width: displayWidth, height: 20 }}
                  />
                </div>
              )}
              {/* Left ruler + canvas row */}
              <div className="flex">
                {showRuler && (
                  <canvas
                    ref={leftRulerRef}
                    width={20}
                    height={displayHeight}
                    className="block"
                    style={{ width: 20, height: displayHeight, flexShrink: 0 }}
                  />
                )}
                <div
                  className={`relative rounded-lg border-2 overflow-hidden transition-colors ${
                    isDropHover ? "border-primary" : "border-border"
                  }`}
                  style={{
                    width: displayWidth,
                    height: displayHeight,
                    touchAction: design || penTraceActive ? "none" : "pan-y",
                  }}
                  onDragOver={(e) => { e.preventDefault(); setIsDropHover(true); }}
                  onDragLeave={() => setIsDropHover(false)}
                  onDrop={handleDrop}
                >
              <canvas
                ref={canvasRef}
                width={displayWidth}
                height={displayHeight}
                className="block"
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  cursor: penTraceActive ? "crosshair" : design ? (eraserActive ? "crosshair" : (isDragging ? "grabbing" : "grab")) : "default",
                  touchAction: design || penTraceActive ? "none" : "pan-y",
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { setPenTraceHover(null); handleMouseUp(); }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />

              {(penTraceActive || penTracePoints.length > 0) && (() => {
                const tracePath = buildTracePath(penTracePoints, penTraceClosed);
                const previewPath =
                  penTraceActive && penTraceHover && !penTraceClosed && penTracePoints.length > 0
                    ? buildTracePath([...penTracePoints, penTraceHover], false)
                    : "";
                return (
                  <svg
                    className="absolute inset-0 z-30 overflow-visible"
                    style={{ width: displayWidth, height: displayHeight, pointerEvents: "none" }}
                    viewBox={`0 0 ${displayWidth} ${displayHeight}`}
                  >
                    {tracePath && (
                      <path
                        d={tracePath}
                        fill={penTraceStyle.fillEnabled && penTraceClosed ? previewTraceFill(penTraceStyle.fillColor) : "none"}
                        stroke={penTraceStyle.strokeColor}
                        strokeWidth={penTraceStyle.strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={penTraceClosed ? undefined : "8 5"}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {previewPath && (
                      <path
                        d={previewPath}
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.75)"
                        strokeWidth={Math.max(1, penTraceStyle.strokeWidth * 0.75)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="4 5"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </svg>
                );
              })()}

              {penTracePoints.length > 0 && penTracePoints.map((point, index) => {
                const handleSize = index === 0 ? 14 : 12;
                return (
                  <button
                    key={`trace-handle-${index}-${point.x}-${point.y}`}
                    type="button"
                    aria-label={`Trace point ${index + 1}`}
                    data-engraving-trace-point={index}
                    className="absolute z-[60] box-border rounded-full border-2 border-slate-950 p-0 shadow-[0_0_0_1px_rgba(255,255,255,0.75),0_2px_8px_rgba(0,0,0,0.55)]"
                    style={{
                      left: point.x - handleSize / 2,
                      top: point.y - handleSize / 2,
                      width: handleSize,
                      height: handleSize,
                      backgroundColor: index === 0 ? "#22c55e" : "#facc15",
                      cursor: "move",
                    }}
                    onMouseDown={(e) => handlePenTracePointMouseDown(e, index)}
                  />
                );
              })}

              {/* Design bounding-box resize handles (normal mode) */}
              {design && !warpMode && !penTraceActive && (() => {
                const imgW = design.naturalWidth * design.scale * design.scaleX;
                const imgH = design.naturalHeight * design.scale * design.scaleY;
                const cx = design.x + imgW / 2;
                const cy = design.y + imgH / 2;
                const HW = 16;
                const halfHandle = HW / 2;
                const rotation = (design.rotation * Math.PI) / 180;
                const cos = Math.cos(rotation);
                const sin = Math.sin(rotation);
                const clampHandleCenter = (value: number, max: number) =>
                  Math.min(Math.max(value, halfHandle), max - halfHandle);
                const rotatePoint = (x: number, y: number) => {
                  const dx = x - cx;
                  const dy = y - cy;
                  return {
                    x: cx + dx * cos - dy * sin,
                    y: cy + dx * sin + dy * cos,
                  };
                };
                const handlePoint = (x: number, y: number) => {
                  const point = rotatePoint(x, y);
                  return {
                    left: clampHandleCenter(point.x, displayWidth) - halfHandle,
                    top: clampHandleCenter(point.y, displayHeight) - halfHandle,
                  };
                };

                const handles: { id: "n"|"s"|"e"|"w"|"nw"|"ne"|"sw"|"se"; left: number; top: number; cursor: string }[] = [
                  { id: "nw", ...handlePoint(design.x,        design.y),        cursor: "nwse-resize" },
                  { id: "n",  ...handlePoint(cx,              design.y),        cursor: "ns-resize" },
                  { id: "ne", ...handlePoint(design.x + imgW, design.y),        cursor: "nesw-resize" },
                  { id: "e",  ...handlePoint(design.x + imgW, cy),              cursor: "ew-resize" },
                  { id: "se", ...handlePoint(design.x + imgW, design.y + imgH), cursor: "nwse-resize" },
                  { id: "s",  ...handlePoint(cx,              design.y + imgH), cursor: "ns-resize" },
                  { id: "sw", ...handlePoint(design.x,        design.y + imgH), cursor: "nesw-resize" },
                  { id: "w",  ...handlePoint(design.x,        cy),              cursor: "ew-resize" },
                ];

                return (
                  <>
                    {/* Dashed border */}
                    <div
                      className="absolute z-40 pointer-events-none"
                      style={{
                        left: design.x, top: design.y,
                        width: imgW, height: imgH,
                        border: "2px dashed rgba(249,115,22,0.95)",
                        boxSizing: "border-box",
                        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.9), 0 0 0 1px rgba(255,255,255,0.65)",
                        transform: `rotate(${design.rotation}deg)`,
                        transformOrigin: "center",
                      }}
                    />
                    {handles.map((h) => (
                      <div
                        key={h.id}
                        data-engraving-design-handle={h.id}
                        aria-label={`Resize design ${h.id}`}
                        className="absolute z-[70] box-border rounded-full border-[3px] border-orange-500 bg-white shadow-[0_0_0_2px_rgba(15,23,42,0.9),0_0_0_4px_rgba(255,255,255,0.65),0_3px_10px_rgba(0,0,0,0.55)]"
                        style={{
                          left: h.left, top: h.top,
                          width: HW, height: HW,
                          cursor: h.cursor,
                          touchAction: "none",
                        }}
                        onPointerDown={(e) => handleDesignResizePointerDown(e, h.id)}
                      />
                    ))}
                    <div className="absolute bottom-2 right-2 pointer-events-none">
                      <span className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                        {t("canvas.resizeHint")}
                      </span>
                    </div>
                  </>
                );
              })()}

              {/* Warp mode — flexible mesh with add/remove pins */}
              {design && warpMode && design.warpMesh && (() => {
                const mesh = design.warpMesh;
                const imgW = design.naturalWidth * design.scale * design.scaleX;
                const imgH = design.naturalHeight * design.scale * design.scaleY;
                const localPins = mesh.interior ?? [];
                const edges: ("top"|"bottom"|"left"|"right")[] = ["top", "bottom", "left", "right"];
                const edgeCorners: Record<"top"|"bottom"|"left"|"right", [keyof Pick<WarpMesh,"tl"|"tr"|"bl"|"br">, keyof Pick<WarpMesh,"tl"|"tr"|"bl"|"br">]> = {
                  top:    ["tl","tr"],
                  bottom: ["bl","br"],
                  left:   ["tl","bl"],
                  right:  ["tr","br"],
                };
                const SAMPLES = 32;
                // Sample points along an edge (canvas positions) for drawing/hit areas
                const sampleEdge = (edge: "top"|"bottom"|"left"|"right"): Pt[] => {
                  const [cA, cB] = edgeCorners[edge];
                  const a = mesh[cA]; const b = mesh[cB];
                  const pins = mesh[edge];
                  const pts: Pt[] = [];
                  for (let i = 0; i <= SAMPLES; i++) {
                    pts.push(edgePt(a, b, pins, i / SAMPLES));
                  }
                  return pts;
                };
                const toPolyline = (pts: Pt[]) => pts.map(p => `${p.x},${p.y}`).join(" ");
                // Canvas position of a specific pin
                const pinPos = (edge: "top"|"bottom"|"left"|"right", pin: EdgePin): Pt => {
                  const [cA, cB] = edgeCorners[edge];
                  const a = mesh[cA]; const b = mesh[cB];
                  return {
                    x: a.x + (b.x - a.x) * pin.t + pin.offset.x,
                    y: a.y + (b.y - a.y) * pin.t + pin.offset.y,
                  };
                };
                const localPinPos = (pin: InteriorWarpPin): Pt => {
                  const base = boundaryMeshPt(mesh, pin.s, pin.t);
                  return {
                    x: base.x + pin.offset.x,
                    y: base.y + pin.offset.y,
                  };
                };
                const corners: { id: keyof Pick<WarpMesh,"tl"|"tr"|"bl"|"br">; pos: Pt; label: string }[] = [
                  { id: "tl", pos: mesh.tl, label: t("editor.warp.cornerTl") },
                  { id: "tr", pos: mesh.tr, label: t("editor.warp.cornerTr") },
                  { id: "bl", pos: mesh.bl, label: t("editor.warp.cornerBl") },
                  { id: "br", pos: mesh.br, label: t("editor.warp.cornerBr") },
                ];
                const CORNER_HW = 12;
                const PIN_HW = 11;
                const LOCAL_PIN_HW = 16;
                return (
                  <>
                    <svg
                      className="absolute inset-0 overflow-visible"
                      style={{ width: displayWidth, height: displayHeight }}
                    >
                      {/* Visible mesh outline through pins */}
                      {edges.map((edge) => (
                        <polyline
                          key={`outline-${edge}`}
                          points={toPolyline(sampleEdge(edge))}
                          fill="none"
                          stroke="rgba(200,160,60,0.85)"
                          strokeWidth="1.5"
                          strokeDasharray="5,3"
                          style={{ pointerEvents: "none" }}
                        />
                      ))}
                      {/* Transparent artwork hit area for adding local warp dots */}
                      <rect
                        data-engraving-warp-interior-hitarea="true"
                        x={design.x}
                        y={design.y}
                        width={imgW}
                        height={imgH}
                        fill="transparent"
                        style={{ pointerEvents: "fill", cursor: "crosshair" }}
                        onClick={handleWarpInteriorClick}
                      />
                      {/* Local warp dot influence preview */}
                      {localPins.map((pin) => {
                        const pos = localPinPos(pin);
                        const radius = Math.max(18, Math.min(imgW, imgH) * (pin.radius || DEFAULT_LOCAL_WARP_RADIUS));
                        return (
                          <circle
                            key={`local-radius-${pin.id}`}
                            cx={pos.x}
                            cy={pos.y}
                            r={radius}
                            fill="rgba(14,165,233,0.07)"
                            stroke="rgba(14,165,233,0.45)"
                            strokeWidth="1.25"
                            strokeDasharray="4,4"
                            style={{ pointerEvents: "none" }}
                          />
                        );
                      })}
                      {/* Invisible thick clickable hit areas for adding pins */}
                      {edges.map((edge) => (
                        <polyline
                          key={`hit-${edge}`}
                          points={toPolyline(sampleEdge(edge))}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="16"
                          style={{ pointerEvents: "stroke", cursor: "copy" }}
                          onClick={(e) => handleWarpEdgeClick(e, edge)}
                        />
                      ))}
                    </svg>
                    {/* Corner handles — round orange dots */}
                    {corners.map((c) => (
                      <div
                        key={c.id}
                        className="absolute z-30 border-2 border-white cursor-move bg-primary rounded-full"
                        style={{
                          left: c.pos.x - CORNER_HW / 2,
                          top: c.pos.y - CORNER_HW / 2,
                          width: CORNER_HW,
                          height: CORNER_HW,
                        }}
                        onMouseDown={(e) => handleWarpCornerMouseDown(e, c.id)}
                        title={c.label}
                      />
                    ))}
                    {/* Pin handles — square amber diamonds */}
                    {edges.map((edge) =>
                      mesh[edge].map((pin) => {
                        const pos = pinPos(edge, pin);
                        return (
                          <div
                            key={`${edge}-${pin.id}`}
                            className="absolute z-30 border-2 border-white cursor-move bg-amber-500 rounded-sm rotate-45"
                            style={{
                              left: pos.x - PIN_HW / 2,
                              top: pos.y - PIN_HW / 2,
                              width: PIN_HW,
                              height: PIN_HW,
                            }}
                            onMouseDown={(e) => handleWarpPinMouseDown(e, edge, pin.id)}
                            onContextMenu={(e) => handleWarpPinRemove(e, edge, pin.id)}
                            title={t("editor.warp.pinTitle")}
                          />
                        );
                      })
                    )}
                    {/* Local interior handles — blue dots for spot warping */}
                    {localPins.map((pin, index) => {
                      const pos = localPinPos(pin);
                      return (
                        <button
                          key={`local-${pin.id}`}
                          type="button"
                          data-engraving-local-warp-pin={pin.id}
                          aria-label={`Local warp dot ${index + 1}`}
                          className="absolute z-40 box-border rounded-full border-[3px] border-white bg-sky-400 p-0 shadow-[0_0_0_2px_rgba(8,47,73,0.9),0_3px_10px_rgba(0,0,0,0.55)]"
                          style={{
                            left: pos.x - LOCAL_PIN_HW / 2,
                            top: pos.y - LOCAL_PIN_HW / 2,
                            width: LOCAL_PIN_HW,
                            height: LOCAL_PIN_HW,
                            cursor: "move",
                          }}
                          onMouseDown={(e) => handleWarpInteriorPinMouseDown(e, pin.id)}
                          onContextMenu={(e) => handleWarpInteriorPinRemove(e, pin.id)}
                          title={t("editor.warp.localPinTitle")}
                        />
                      );
                    })}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-40">
                      <span className="text-[10px] bg-black/70 text-white px-2 py-0.5 rounded whitespace-nowrap">
                        {t("canvas.warpHint")}
                      </span>
                    </div>
                  </>
                );
              })()}

              {!partPhoto && !design && penTracePoints.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                  <ImageIcon className="h-10 w-10 mb-3 opacity-25" />
                  <p className="text-sm font-medium text-center px-4">
                    {isDropHover ? t("canvas.dropActive") : t("canvas.dropHint")}
                  </p>
                  <p className="text-xs mt-1 opacity-50">{t("canvas.addDesignHint")}</p>
                </div>
              )}
              {/* Resize handles (visible when resizeMode is active) */}
              {resizeMode && (
                <>
                  {/* Right edge handle */}
                  <div
                    className="absolute top-0 right-0 w-[6px] h-full cursor-ew-resize z-10 bg-primary/30 hover:bg-primary/60 transition-colors"
                    onMouseDown={(e) => handleResizeMouseDown(e, "right")}
                  />
                  {/* Bottom edge handle */}
                  <div
                    className="absolute bottom-0 left-0 w-full h-[6px] cursor-ns-resize z-10 bg-primary/30 hover:bg-primary/60 transition-colors"
                    onMouseDown={(e) => handleResizeMouseDown(e, "bottom")}
                  />
                  {/* Corner handle */}
                  <div
                    className="absolute bottom-0 right-0 w-[14px] h-[14px] cursor-nwse-resize z-10 bg-primary/30 hover:bg-primary/60 transition-colors"
                    onMouseDown={(e) => handleResizeMouseDown(e, "corner")}
                  />
                </>
              )}
            </div>
              </div>
            </div>

            {/* Real-world size badge */}
            {design && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Ruler className="h-3 w-3 text-primary" />
                <span>{t("editor.designSizeLabel")} <strong className="text-foreground">{currentDesignSizeLabel}</strong></span>
                <span className="opacity-40">|</span>
                <span className="opacity-50">{screenPpiLabel}</span>
              </div>
            )}

            {/* Mobile quick controls */}
            {design && (
              <div className="flex flex-wrap gap-2 justify-center lg:hidden">
                <Button variant="secondary" size="sm" onClick={handleFill}>
                  <Maximize2 className="mr-1 h-3 w-3" /> {t("panel.design.fill")}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleCenter}>
                  <Move className="mr-1 h-3 w-3" /> {t("panel.design.center")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDesign({ ...design, rotation: (design.rotation + 90) % 360 })}>
                  <RotateCw className="mr-1 h-3 w-3" /> 90°
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDesign({ ...design, scale: Math.min(design.scale * 1.1, 10) })}>
                  <ZoomIn className="h-3 w-3" />
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDesign({ ...design, scale: Math.max(design.scale * 0.9, 0.01) })}>
                  <ZoomOut className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-3 order-2 lg:order-1 lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:pr-1">

            {/* Step 1: Material */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</span>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("panel.material")}</Label>
              </div>
              <Select value={selectedPresetId} onValueChange={handlePresetChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("panel.material.pickPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Custom size inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Width ({unit})</Label>
                  <Input
                    value={matWInput}
                    onChange={(e) => setMatWInput(e.target.value)}
                    onBlur={() => { setSelectedPresetId("custom"); applyCustomMaterial(); }}
                    onKeyDown={(e) => e.key === "Enter" && applyCustomMaterial()}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Height ({unit})</Label>
                  <Input
                    value={matHInput}
                    onChange={(e) => setMatHInput(e.target.value)}
                    onBlur={() => { setSelectedPresetId("custom"); applyCustomMaterial(); }}
                    onKeyDown={(e) => e.key === "Enter" && applyCustomMaterial()}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground opacity-60">
                {t("panel.material.canvasRepresents", {
                  w: formatUnit(material.widthIn),
                  h: formatUnit(material.heightIn),
                })}
              </p>
              {/* Unit toggle mobile */}
              <div className="flex sm:hidden items-center rounded-md border border-border overflow-hidden text-xs w-fit">
                <button
                  className={`px-3 py-1.5 transition-colors ${unit === "in" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  onClick={() => setUnit("in")}
                >
                  inches
                </button>
                <button
                  className={`px-3 py-1.5 transition-colors ${unit === "mm" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  onClick={() => setUnit("mm")}
                >
                  mm
                </button>
              </div>
            </div>

            <XtoolSettingsConverterPanel />

            {/* Step 2: Part photo */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">2</span>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {t("panel.partPhoto")} <span className="normal-case font-normal">{t("common.optional")}</span>
                </Label>
              </div>
              <input ref={partInputRef} type="file" accept="image/*,.svg" onChange={handlePartUpload} className="hidden" />
              <Button
                variant={partPhoto ? "ghost" : "secondary"}
                className="w-full"
                onClick={() => partInputRef.current?.click()}
              >
                <ImageIcon className="mr-2 h-4 w-4" />
                {partPhoto ? t("panel.partPhoto.replace") : t("panel.partPhoto.upload")}
              </Button>
              {partPhoto && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => {
                    setPartPhoto(null);
                    setPartPhotoSrc(null);
                    setPenTraceActive(false);
                    clearPenTrace();
                    if (partInputRef.current) partInputRef.current.value = "";
                  }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("panel.partPhoto.removePhoto")}
                </Button>
              )}
              {partPhoto && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-xs"
                  onClick={() => setCropPartOpen(true)}
                >
                  <Crop className="mr-1 h-3 w-3" /> {t("panel.partPhoto.cropPhoto")}
                </Button>
              )}
              {partPhoto && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setAssistantQuestion("Look at this material photo. Identify the material and finish, then suggest cautious starting speed, power, and frequency settings for my laser. Remind me to test on scrap first.")}
                >
                  <Sparkles className="mr-1 h-3 w-3 text-primary" />
                  Identify Material
                </Button>
              )}
              {(partPhoto || penTracePoints.length > 0) && (
                <div className="space-y-2 rounded-md border border-border/60 bg-secondary/30 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <PenTool className="h-3.5 w-3.5 text-primary" />
                      {t("panel.penTrace.title")}
                    </span>
                    {penTraceActive && (
                      <span className="text-[10px] font-medium text-primary">{t("panel.warp.active")}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant={penTraceActive ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={togglePenTrace}
                    >
                      <PenTool className="mr-1 h-3 w-3" />
                      {penTraceActive ? t("panel.penTrace.done") : t("panel.penTrace.start")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={closePenTrace}
                      disabled={penTracePoints.length < 3 || penTraceClosed}
                    >
                      {t("panel.penTrace.close")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={undoPenTracePoint}
                      disabled={penTracePoints.length === 0}
                    >
                      {t("panel.penTrace.undoPoint")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={clearPenTrace}
                      disabled={penTracePoints.length === 0}
                    >
                      {t("panel.penTrace.clear")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={applyPenTraceAsDesign}
                      disabled={penTracePoints.length < 2}
                    >
                      {t("panel.penTrace.useAsDesign")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={downloadPenTraceSvg}
                      disabled={penTracePoints.length < 2}
                    >
                      {t("panel.penTrace.downloadSvg")}
                    </Button>
                  </div>
                  <div className="space-y-2 rounded-md border border-border/60 bg-background/50 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t("panel.penTrace.style")}
                      </span>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-muted-foreground">
                          {t("panel.penTrace.strokeColor")}
                        </Label>
                        <input
                          type="color"
                          value={penTraceStyle.strokeColor}
                          onChange={(event) =>
                            setPenTraceStyle((style) => ({ ...style, strokeColor: event.target.value }))
                          }
                          className="h-6 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                          aria-label={t("panel.penTrace.strokeColor")}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">
                          {t("panel.penTrace.lineWidth")}
                        </Label>
                        <span className="text-[10px] font-mono">{penTraceStyle.strokeWidth}px</span>
                      </div>
                      <Slider
                        value={[penTraceStyle.strokeWidth]}
                        min={0.5}
                        max={10}
                        step={0.5}
                        onValueChange={([value]) =>
                          setPenTraceStyle((style) => ({ ...style, strokeWidth: value }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-[10px] text-muted-foreground" htmlFor="pen-trace-fill">
                        {t("panel.penTrace.fillClosed")}
                      </Label>
                      <Switch
                        id="pen-trace-fill"
                        size="sm"
                        checked={penTraceStyle.fillEnabled}
                        onCheckedChange={(checked) =>
                          setPenTraceStyle((style) => ({ ...style, fillEnabled: checked }))
                        }
                      />
                    </div>
                    {penTraceStyle.fillEnabled && (
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-[10px] text-muted-foreground">
                          {t("panel.penTrace.fillColor")}
                        </Label>
                        <input
                          type="color"
                          value={penTraceStyle.fillColor}
                          onChange={(event) =>
                            setPenTraceStyle((style) => ({ ...style, fillColor: event.target.value }))
                          }
                          className="h-6 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                          aria-label={t("panel.penTrace.fillColor")}
                        />
                      </div>
                    )}
                  </div>
                  {design && penTraceClosed && penTracePoints.length >= 3 && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/50 px-2 py-2">
                      <Label className="text-[10px] text-muted-foreground" htmlFor="pen-trace-clip">
                        {t("panel.penTrace.clipDesign")}
                      </Label>
                      <Switch
                        id="pen-trace-clip"
                        size="sm"
                        checked={clipDesignToTrace}
                        onCheckedChange={setClipDesignToTrace}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Input
                      value={tracePresetName}
                      onChange={(e) => setTracePresetName(e.target.value)}
                      placeholder={t("panel.penTrace.namePlaceholder")}
                      aria-label={t("panel.penTrace.nameLabel")}
                      disabled={penTracePoints.length < 2}
                      className="h-7 text-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 w-full text-xs"
                      onClick={savePenTracePreset}
                      disabled={penTracePoints.length < 2}
                    >
                      <Save className="mr-1 h-3 w-3" />
                      {t("panel.penTrace.savePart")}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {t("panel.penTrace.helper", { count: penTracePoints.length })}
                  </p>
                </div>
              )}
              {tracePresets.length > 0 && (
                <div className="space-y-2 rounded-md border border-border/60 bg-secondary/20 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FolderOpen className="h-3.5 w-3.5 text-primary" />
                      {t("panel.penTrace.savedParts")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{tracePresets.length}</span>
                  </div>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                    {tracePresets.map((preset) => (
                      <div key={preset.id} className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/50 p-1.5">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => loadSavedTracePreset(preset)}
                        >
                          <span className="block truncate text-xs font-medium text-foreground">{preset.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {preset.unit === "in"
                              ? `${preset.width.toFixed(2)}" x ${preset.height.toFixed(2)}"`
                              : `${inToMm(preset.width).toFixed(1)}mm x ${inToMm(preset.height).toFixed(1)}mm`}
                          </span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={t("panel.penTrace.deleteSavedPart", { name: preset.name })}
                          onClick={() => deleteSavedTracePreset(preset)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {partPhoto && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <RotateCw className="h-3 w-3" /> Rotation
                    </span>
                    <span className="text-xs font-mono">{partRotation}°</span>
                  </div>
                  <Slider
                    value={[partRotation]}
                    min={-180}
                    max={180}
                    step={1}
                    onValueChange={([v]) => setPartRotation(v)}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost" size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setPartRotation((r) => r - 90)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" /> -90°
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setPartRotation(0)}
                    >
                      {t("panel.partPhoto.snapStraight")}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setPartRotation((r) => r + 90)}
                    >
                      <RotateCw className="mr-1 h-3 w-3" /> +90°
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground opacity-60">{t("panel.partPhoto.helper")}</p>
            </div>

            <EngraveAiPanel
              partPhoto={partPhoto}
              partRotation={partRotation}
              displayWidth={displayWidth}
              displayHeight={displayHeight}
              locale={locale}
              hasDesign={!!design}
              clipDesignToTrace={clipDesignToTrace}
              onClipDesignChange={setClipDesignToTrace}
              onUseTrace={applyDetectedTrace}
              onApplyFilledMask={applyDetectedMaskAsDesign}
            />

            {/* Step 3: Design */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">3</span>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("panel.design.heading")}</Label>
              </div>
              <input ref={designInputRef} type="file" accept="image/*,.svg" onChange={handleDesignUpload} className="hidden" />
              <Button
                variant={design ? "ghost" : "secondary"}
                className="w-full"
                onClick={() => designInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {design ? t("panel.design.replace") : t("panel.design.uploadImage")}
              </Button>
              {design && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => { setDesign(null); setDesignSrc(null); savedDesignStateRef.current = null; if (designInputRef.current) designInputRef.current.value = ""; }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove Design
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground opacity-60">{t("panel.design.helper")}</p>
            </div>

            {/* Templates — collapsible */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <button
                className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors cursor-pointer"
                onClick={() => setTemplatesOpen((v) => !v)}
              >
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("panel.templates.heading")}</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${templatesOpen ? "rotate-180" : ""}`} />
              </button>
              {templatesOpen && (
                <div className="px-4 pb-4 space-y-1 border-t border-border pt-3">
              {TEMPLATE_CATEGORIES.map((cat) => {
                const catTemplates = ENGRAVING_TEMPLATES.filter((t) => t.category === cat);
                const useGrid = catTemplates.length > 1;
                const catOpen = !!openCategories[cat];
                return (
                  <div key={cat} className="rounded-md border border-border overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors cursor-pointer"
                      onClick={() => setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                    >
                      <span className="text-[10px] uppercase tracking-wider text-primary font-medium">{cat} <span className="text-muted-foreground normal-case">({catTemplates.length})</span></span>
                      <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${catOpen ? "rotate-180" : ""}`} />
                    </button>
                    {catOpen && (
                      <div className="p-2 border-t border-border">
                    {useGrid ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {catTemplates.map((tmpl) => (
                          <button
                            key={tmpl.id}
                            className="group relative rounded-md border border-border overflow-hidden hover:border-primary transition-colors cursor-pointer flex flex-col"
                            onClick={() => loadDesign(tmpl.url)}
                            title={tmpl.name}
                          >
                            <div className="w-full" style={{ aspectRatio: "4/3", backgroundColor: "#ffffff" }}>
                              <TemplateThumbnail url={tmpl.url} name={tmpl.name} />
                            </div>
                            <div className="px-1 py-0.5 bg-secondary text-center">
                              <span className="text-[9px] text-foreground leading-tight line-clamp-2">{tmpl.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {catTemplates.map((tmpl) => (
                          <button
                            key={tmpl.id}
                            className="flex items-center gap-3 w-full rounded-md border border-border bg-secondary hover:border-primary hover:bg-secondary/80 transition-colors cursor-pointer px-3 py-2.5 text-left"
                            onClick={() => loadDesign(tmpl.url)}
                          >
                            <LayoutTemplate className="h-4 w-4 text-primary shrink-0 opacity-70" />
                            <span className="text-xs font-medium text-foreground truncate">{tmpl.name}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{t("panel.templates.load")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground opacity-60 pt-1">{t("panel.templates.helper")}</p>
                </div>
              )}
            </div>

            <AiComposePanel
              currentDesignSrc={designSrc}
              locale={locale}
              onApply={(dataUrl) => loadDesign(dataUrl)}
            />

            {/* Step 4: Adjust */}
            {design && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">4</span>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Adjust Design</Label>
                </div>

                <Tabs defaultValue="size">
                  <TabsList className="w-full h-8 text-xs">
                    <TabsTrigger value="size" className="flex-1 text-xs">Size & Position</TabsTrigger>
                    <TabsTrigger value="image" className="flex-1 text-xs">Image</TabsTrigger>
                  </TabsList>

                  {/* Size & Position tab */}
                  <TabsContent value="size" className="space-y-4 pt-2">
                    {/* Real-world size */}
                    <div className="rounded-md bg-secondary/50 p-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Set Exact Size</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Width ({unit})</Label>
                          <Input
                            value={designWidthInput}
                            onChange={(e) => setDesignWidthInput(e.target.value)}
                            onBlur={() => applyDesignSize(designWidthInput, designHeightInput)}
                            onKeyDown={(e) => e.key === "Enter" && applyDesignSize(designWidthInput, designHeightInput)}
                            className="h-8 text-sm"
                            placeholder={unit === "in" ? "e.g. 2.5" : "e.g. 63.5"}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Height ({unit})</Label>
                          <Input
                            value={designHeightInput}
                            onChange={(e) => setDesignHeightInput(e.target.value)}
                            onBlur={() => applyDesignSize(designWidthInput, designHeightInput)}
                            onKeyDown={(e) => e.key === "Enter" && applyDesignSize(designWidthInput, designHeightInput)}
                            className="h-8 text-sm"
                            placeholder={unit === "in" ? "e.g. 1.5" : "e.g. 38.1"}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground opacity-50">Enter width to scale proportionally, or both to stretch</p>
                    </div>

                    {/* Scale slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <ZoomIn className="h-3 w-3" /> Scale
                        </span>
                        <span className="text-xs font-mono">{Math.round(design.scale * ((design.scaleX + design.scaleY) / 2) * 100)}%</span>
                      </div>
                      <Slider
                        value={[design.scale * 100]}
                        min={1}
                        max={500}
                        step={1}
                        onValueChange={([v]) => updateDesignContinuously((current) => ({ ...current, scale: v / 100 }))}
                        onValueCommit={([v]) => commitDesignUpdate((current) => ({ ...current, scale: v / 100 }))}
                      />
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setDesign({ ...design, scale: Math.max(design.scale * 0.9, 0.01) })}><ZoomOut className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setDesign({ ...design, scale: Math.min(design.scale * 1.1, 10) })}><ZoomIn className="h-3 w-3" /></Button>
                      </div>
                    </div>

                    {/* Rotation */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <RotateCw className="h-3 w-3" /> Rotation
                        </span>
                        <span className="text-xs font-mono">{design.rotation}°</span>
                      </div>
                      <Slider
                        value={[design.rotation]}
                        min={0}
                        max={360}
                        step={1}
                        onValueChange={([v]) => updateDesignContinuously((current) => ({ ...current, rotation: v }))}
                        onValueCommit={([v]) => commitDesignUpdate((current) => ({ ...current, rotation: v }))}
                      />
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setDesign({ ...design, rotation: (design.rotation + 90) % 360 })}>+90°</Button>
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setDesign({ ...design, rotation: 0 })}>Reset</Button>
                      </div>
                    </div>

                    {/* Flip */}
                    <div className="flex gap-2">
                      <Button
                        variant={design.flipH ? "secondary" : "ghost"}
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => setDesign({ ...design, flipH: !design.flipH })}
                      >
                        <FlipHorizontal className="mr-1 h-3 w-3" /> Flip H
                      </Button>
                      <Button
                        variant={design.flipV ? "secondary" : "ghost"}
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => setDesign({ ...design, flipV: !design.flipV })}
                      >
                        <FlipVertical className="mr-1 h-3 w-3" /> Flip V
                      </Button>
                    </div>

                    {/* Crop */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => setCropOpen(true)}
                    >
                      <Crop className="mr-1 h-3 w-3" /> {t("panel.design.crop")}
                    </Button>

                    {/* Free Distort / Warp */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Wand2 className="h-3 w-3" /> {t("panel.warp.title")}
                        </span>
                        {warpMode && <span className="text-[10px] text-primary font-medium">{t("panel.warp.active")}</span>}
                      </div>
                      <div className="flex gap-1.5">
                        {!warpMode ? (
                          <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={enableWarpMode}>
                            <Wand2 className="mr-1 h-3 w-3" /> {t("panel.warp.enable")}
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" className="flex-1 h-7 text-xs" onClick={disableWarpMode}>
                            {t("panel.warp.done")}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={resetWarp} disabled={!design?.warpMesh}>
                          {t("panel.warp.reset")}
                        </Button>
                      </div>
                      {warpMode && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          {t("panel.warp.hint")}
                        </p>
                      )}
                    </div>

                    {/* Eraser Tool */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eraser className="h-3 w-3" /> {t("panel.eraser.title")}
                        </span>
                        {eraserActive && (
                          <span className="text-[10px] text-primary font-medium">{t("panel.warp.active")}</span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          variant={eraserActive ? "secondary" : "ghost"}
                          size="sm"
                          className="flex-1 h-7 text-xs"
                          onClick={() => {
                            setPenTraceActive(false);
                            setPenTraceHover(null);
                            setEraserActive((v) => !v);
                          }}
                        >
                          <Eraser className="mr-1 h-3 w-3" />
                          {eraserActive ? t("panel.eraser.erasing") : t("panel.eraser.eraser")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-7 text-xs"
                          onClick={() => {
                            eraserMaskRef.current = null;
                            draw();
                          }}
                          disabled={!eraserMaskRef.current}
                        >
                          {t("panel.eraser.clear")}
                        </Button>
                      </div>
                      {eraserActive && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{t("panel.eraser.size")}</span>
                            <span className="text-xs font-mono">{eraserSize}px</span>
                          </div>
                          <Slider
                            value={[eraserSize]}
                            min={5}
                            max={100}
                            step={1}
                            onValueChange={([v]) => setEraserSize(v)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Remove Background */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={handleRemoveBackground}
                      disabled={bgRemoving}
                    >
                      {bgRemoving
                        ? <><span className="mr-1 h-3 w-3 animate-spin inline-block border border-current border-t-transparent rounded-full" /> {t("panel.design.removingBackground")}</>
                        : <><Eraser className="mr-1 h-3 w-3" /> {t("panel.design.removeBackground")}</>
                      }
                    </Button>

                    {/* Round Corners */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Frame className="h-3 w-3" /> {t("panel.design.roundCorners")}</span>
                        <span className="text-xs font-mono">{cornerRadius}%</span>
                      </div>
                      <Slider
                        value={[cornerRadius]}
                        min={1}
                        max={50}
                        step={1}
                        onValueChange={([v]) => setCornerRadius(v)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={handleRoundCorners}
                        disabled={roundingProcessing}
                      >
                        {roundingProcessing ? t("panel.design.rounding") : t("panel.design.applyRoundedCorners")}
                      </Button>
                    </div>

                    {/* Opacity */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Opacity</span>
                        <span className="text-xs font-mono">{Math.round(design.opacity * 100)}%</span>
                      </div>
                      <Slider
                        value={[design.opacity * 100]}
                        min={10}
                        max={100}
                        step={1}
                        onValueChange={([v]) => updateDesignContinuously((current) => ({ ...current, opacity: v / 100 }))}
                        onValueCommit={([v]) => commitDesignUpdate((current) => ({ ...current, opacity: v / 100 }))}
                      />
                    </div>

                    {/* Quick position */}
                    <div className="flex gap-2 pt-1">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={handleFill}>
                        <Maximize2 className="mr-1 h-3 w-3" /> Fill
                      </Button>
                      <Button variant="secondary" size="sm" className="flex-1" onClick={handleCenter}>
                        <Move className="mr-1 h-3 w-3" /> Center
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Image adjustments tab */}
                  <TabsContent value="image" className="space-y-4 pt-2">
                    <p className="text-[10px] text-muted-foreground opacity-70">
                      Adjust the design image for better engraving results. High contrast and grayscale work best for most lasers.
                    </p>

                    {/* Quick presets */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setDesign({ ...design, filters: { brightness: 100, contrast: 150, grayscale: 100, invert: 0 } })}
                      >
                        <Palette className="mr-1 h-3 w-3" /> Engrave Ready
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setDesign({ ...design, filters: { brightness: 110, contrast: 130, grayscale: 100, invert: 100 } })}
                      >
                        <Contrast className="mr-1 h-3 w-3" /> Invert Dark
                      </Button>
                    </div>

                    {/* Grayscale */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Palette className="h-3 w-3" /> Grayscale
                        </span>
                        <span className="text-xs font-mono">{design.filters.grayscale}%</span>
                      </div>
                      <Slider
                        value={[design.filters.grayscale]}
                        min={0} max={100} step={1}
                        onValueChange={([v]) => updateFilter("grayscale", v)}
                        onValueCommit={([v]) => commitFilter("grayscale", v)}
                      />
                    </div>

                    {/* Brightness */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Sun className="h-3 w-3" /> Brightness
                        </span>
                        <span className="text-xs font-mono">{design.filters.brightness}%</span>
                      </div>
                      <Slider
                        value={[design.filters.brightness]}
                        min={0} max={200} step={1}
                        onValueChange={([v]) => updateFilter("brightness", v)}
                        onValueCommit={([v]) => commitFilter("brightness", v)}
                      />
                    </div>

                    {/* Contrast */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Contrast className="h-3 w-3" /> Contrast
                        </span>
                        <span className="text-xs font-mono">{design.filters.contrast}%</span>
                      </div>
                      <Slider
                        value={[design.filters.contrast]}
                        min={0} max={200} step={1}
                        onValueChange={([v]) => updateFilter("contrast", v)}
                        onValueCommit={([v]) => commitFilter("contrast", v)}
                      />
                    </div>

                    {/* Invert */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Invert Colors</span>
                        <span className="text-xs font-mono">{design.filters.invert}%</span>
                      </div>
                      <Slider
                        value={[design.filters.invert]}
                        min={0} max={100} step={1}
                        onValueChange={([v]) => updateFilter("invert", v)}
                        onValueCommit={([v]) => commitFilter("invert", v)}
                      />
                    </div>

                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={resetFilters}>
                      <RefreshCw className="mr-1.5 h-3 w-3" /> Reset All Adjustments
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => setAssistantQuestion("Analyze this design for laser engraving. Comment on contrast, fine detail density, edge sharpness, dithering needs, and how it should engrave on the current material.")}
                    >
                      <Sparkles className="mr-1 h-3 w-3 text-primary" />
                      Analyze for Laser
                    </Button>
                  </TabsContent>
                </Tabs>

                {/* Keyboard shortcuts */}
                <div className="rounded-md border border-border/50 p-3 space-y-2 mt-2 hidden lg:block">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Keyboard Shortcuts</p>
                  <ul className="text-[10px] text-muted-foreground space-y-1.5">
                    <li className="flex items-center gap-2"><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono">R</kbd> Rotate 15°</li>
                    <li className="flex items-center gap-2"><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono">+</kbd><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono">-</kbd> Scale</li>
                    <li className="flex items-center gap-2"><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono">Arrows</kbd> Nudge 2px</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Trace & Vectorize — shown when a design is loaded */}
            {design && designSrc && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors cursor-pointer"
                  onClick={() => setTraceOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("panel.trace.title")}</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${traceOpen ? "rotate-180" : ""}`} />
                </button>
                {traceOpen && (
                  <div className="px-4 pb-4 pt-3 border-t border-border">
                    <TraceVectorize
                      designSrc={designSrc}
                      displayWidth={displayWidth}
                      displayHeight={displayHeight}
                      onApply={(dataUrl) => loadDesign(dataUrl)}
                      onApplySvg={(svgDataUrl) => loadDesign(svgDataUrl)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
