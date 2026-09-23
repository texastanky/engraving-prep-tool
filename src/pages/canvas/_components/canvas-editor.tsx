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
import {
  ScanLine, Crop, Wand2, Eraser, Frame, PenTool, Sparkles,
  MousePointer2, Square, Circle, Hexagon, Star, Minus, Type,
} from "lucide-react";
import { toast } from "sonner";
import CropModal from "./crop-modal.tsx";
import { removeBackground, roundCorners } from "./image-utils.ts";
import {
  MASK_SHAPE_GROUPS,
  applyMaskToCanvas,
  changeMaskShape,
  createDesignMask,
  fitMaskToBox,
  getMaskShape,
  type DesignMask,
  type MaskBox,
} from "./design-mask.ts";
import {
  MODE_INFO,
  cloneSubpaths,
  cloneVectorObject,
  ellipseSubpaths,
  hitTestObject,
  lineSubpaths,
  objectBounds,
  moveAnchor,
  moveHandle,
  nearestPointOnPath,
  objectCenter,
  objectFromSubpaths,
  polygonSubpaths,
  rectSubpaths,
  removeAnchor,
  rotateSubpaths,
  scaleSubpaths,
  splitSegment,
  starSubpaths,
  traceSubpaths,
  translateSubpaths,
  type SubPath,
  type VecPt,
  type VectorMode,
  type VectorObject,
} from "./vector-path.ts";
import { buildVectorSvg, describeVectorExport } from "./vector-export.ts";
import { importSvgAsVectors, multiply } from "./svg-import.ts";
import {
  activateLicense,
  denialMessage,
  entitlementLabel,
  fetchLicenseStatus,
  isEntitlementValid,
  loadEntitlement,
  requestExportPermission,
  requestRenewalChange,
  type Entitlement,
  type LicenseStatus,
} from "@/lib/licensing.ts";
import {
  booleanSubpaths,
  offsetSubpaths,
  type BooleanOp,
} from "./vector-boolean.ts";
import {
  TEXT_FONTS,
  traceTextToSubpaths,
  type TextOutlineResult,
} from "./text-outline.ts";
import {
  applyProfileToFields,
  isProfileComplete,
  loadShopProfile,
  saveShopProfile,
  type ShopProfile,
} from "./shop-profile.ts";
import {
  ONBOARDING_STEPS,
  loadOnboardingState,
  markExported,
  markingBlockedByShop,
  onboardingProgress,
  onboardingStatus,
  saveOnboardingState,
  type OnboardingSignals,
  type OnboardingState,
  type OnboardingStepId,
} from "./onboarding.ts";
import {
  MARKING_LINE_LABELS,
  MARKING_PRESETS,
  TYPICAL_MIN_DEPTH_IN,
  TYPICAL_MIN_TEXT_HEIGHT_IN,
  buildMarkingBlock,
  layoutMarkingLines,
  markingWarnings,
  type MarkingFields,
  type MarkingLineKey,
} from "./marking-block.ts";
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

/** Ceiling on the canvas backing store. Past 2× the memory cost keeps climbing
 *  and the detail stops being visible. */
const MAX_CANVAS_DPR = 2;

/** Longest edge of the offscreen bitmap the design filters are rasterised into. */
const MAX_DESIGN_RASTER_PX = 2048;

/**
 * Device pixel ratio for the canvas bitmaps.
 *
 * The canvases are laid out in CSS pixels, but their backing stores are sized
 * in physical pixels. Without this, a display at 200% scaling makes the browser
 * stretch a 1× bitmap over 2× the pixels, and every part photo and design
 * preview reads as soft and degraded. Re-reads the ratio when the window moves
 * to a display with a different scale factor.
 */
function useCanvasDpr(): number {
  const [dpr, setDpr] = React.useState(() =>
    Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR)
  );
  React.useEffect(() => {
    const read = () => Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
    const update = () => setDpr(read());
    update();
    window.addEventListener("resize", update);
    let query: MediaQueryList | null = null;
    try {
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener("change", update);
    } catch {
      query = null; // Older runtime: the resize listener still covers most cases.
    }
    return () => {
      window.removeEventListener("resize", update);
      query?.removeEventListener("change", update);
    };
  }, [dpr]);
  return dpr;
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
  mask: DesignMask | null;   // null = design is not clipped
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
/**
 * Whether the reference rail starts open.
 *
 * This is only a starting position, not a gate: the rail is toggled by the user
 * from the toolbar. Guessing the viewport proved unreliable — display scaling on
 * large panels made the reported width say nothing useful about how much room
 * there actually was — so the decision moved to the person looking at the screen.
 */
function defaultReferenceRailOpen(): boolean {
  return typeof window === "undefined" ? false : window.innerWidth >= 1180;
}

/**
 * Labels for the account plan.
 *
 * The licence card uses these from the *server* status rather than the cached
 * local entitlement: an account can be licensed server-side while this client
 * holds no key (no key was ever typed in here), and reading the cached token
 * alone labelled a paid account "Free plan" while showing its paid quotas.
 */
const ACCOUNT_PLAN_LABELS: Record<string, string> = {
  free: "Free plan",
  pro: "Pro plan",
  shop: "Shop plan",
};

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
  vectorObjects: VectorObject[];
};

/** Authoring tools for the vector layer. */
type VectorTool = "select" | "pen" | "line" | "rect" | "ellipse" | "polygon" | "star";

/**
 * A point-in-time copy of everything undo/redo restores. Both layers live in one
 * snapshot so history stays consistent no matter which layer you were editing.
 */
type EditorSnapshot = {
  design: ImageState | null;
  vectorObjects: VectorObject[];
};

function editorSignature(snapshot: EditorSnapshot): string {
  return JSON.stringify([
    snapshot.design ? imageStateSignature(snapshot.design) : null,
    snapshot.vectorObjects.map((object) => [
      object.id,
      object.mode,
      object.strokeWidth,
      object.subpaths.map((subpath) => [
        subpath.closed,
        subpath.anchors.map((anchor) => [
          anchor.x,
          anchor.y,
          anchor.in?.x ?? null,
          anchor.in?.y ?? null,
          anchor.out?.x ?? null,
          anchor.out?.y ?? null,
        ]),
      ]),
    ]),
  ]);
}

type VectorIcon = React.ComponentType<{ className?: string }>;

const VECTOR_TOOLS: { id: VectorTool; label: string; hint: string; icon: VectorIcon }[] = [
  { id: "select", label: "Select", hint: "Click an object to select it, then drag to move it.", icon: MousePointer2 },
  { id: "pen", label: "Pen", hint: "Click to add points. Click the first point or press Enter to finish.", icon: PenTool },
  { id: "line", label: "Line", hint: "Click two points to draw a straight line.", icon: Minus },
  { id: "rect", label: "Rect", hint: "Drag to draw a rectangle. Hold Shift for a square.", icon: Square },
  { id: "ellipse", label: "Ellipse", hint: "Drag to draw an ellipse. Hold Shift for a circle.", icon: Circle },
  { id: "polygon", label: "Polygon", hint: "Drag to draw a hexagon.", icon: Hexagon },
  { id: "star", label: "Star", hint: "Drag to draw a five point star.", icon: Star },
];

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
    mask: state.mask ? { ...state.mask } : null,
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
    mask: state.mask
      ? {
          ...state.mask,
          x: roundHistoryNumber(state.mask.x),
          y: roundHistoryNumber(state.mask.y),
          w: roundHistoryNumber(state.mask.w),
          h: roundHistoryNumber(state.mask.h),
          rotation: roundHistoryNumber(state.mask.rotation),
          cornerRadius: roundHistoryNumber(state.mask.cornerRadius),
          feather: roundHistoryNumber(state.mask.feather),
        }
      : null,
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
  // The source is nearly always far larger than the space it occupies on
  // screen, so the downscale has to be a good one — Chromium's default is
  // "low", which leaves fine line art looking chewed up.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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
      // Compose the cell transform onto whatever is already active — the canvas
      // draws in display coordinates on a dpr-scaled context — instead of
      // replacing it, which would drop the device-pixel scale.
      const cell = multiply(ctx.getTransform(), {
        a: (p10.x - p00.x) / cellW,
        b: (p10.y - p00.y) / cellW,
        c: (p01.x - p00.x) / cellH,
        d: (p01.y - p00.y) / cellH,
        e: p00.x,
        f: p00.y,
      });
      ctx.setTransform(cell.a, cell.b, cell.c, cell.d, cell.e, cell.f);
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SavedCanvasState;
  } catch {
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

  // --- Vector object layer ---
  const [vectorObjects, setVectorObjects] = useState<VectorObject[]>(() =>
    (_saved.vectorObjects ?? []).map((object) => cloneVectorObject(object))
  );
  const [vectorTool, setVectorTool] = useState<VectorTool>("select");
  /** Selection is ordered: the last id is the primary one. */
  const [selectedVectorIds, setSelectedVectorIds] = useState<string[]>([]);
  const [offsetAmount, setOffsetAmount] = useState(0.05);
  /** Text authoring: typed strings are converted to outlines. */
  const [textValue, setTextValue] = useState("");
  const [textFont, setTextFont] = useState(TEXT_FONTS[0]);
  const [textSize, setTextSize] = useState(0.4);
  const [textBold, setTextBold] = useState(false);

  /** FFL / NFA marking block. Heights are always in inches, never converted. */
  const [markingPresetId, setMarkingPresetId] = useState(MARKING_PRESETS[0].id);
  // The shop profile supplies the licensed details, so a job starts correct.
  const [shopProfile, setShopProfile] = useState<ShopProfile>(() => loadShopProfile());
  const [shopDraft, setShopDraft] = useState<ShopProfile>(() => loadShopProfile());
  const [shopSetupOpen, setShopSetupOpen] = useState(() => !loadShopProfile().onboarded);
  const [markingFields, setMarkingFields] = useState<MarkingFields>(() =>
    applyProfileToFields({ ...MARKING_PRESETS[0].fields }, loadShopProfile())
  );
  const [markingOrder, setMarkingOrder] = useState<MarkingLineKey[]>(MARKING_PRESETS[0].order);
  const [markingHeightIn, setMarkingHeightIn] = useState(
    () => loadShopProfile().defaultMarkingHeightIn
  );
  const [markingGapIn, setMarkingGapIn] = useState(() => loadShopProfile().defaultLineGapIn);
  const [markingFont, setMarkingFont] = useState(() => loadShopProfile().defaultFont);

  /** First-run guidance, driven by the live editor state. */
  const [onboarding, setOnboarding] = useState<OnboardingState>(() => loadOnboardingState());
  const [guideOpen, setGuideOpen] = useState(() => !loadOnboardingState().dismissed);

  /** Licence state, so exports can ask permission before running. */
  const [entitlement, setEntitlement] = useState<Entitlement | null>(() => loadEntitlement());
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [renewalBusy, setRenewalBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  /** Primary selection, used by node editing and the scale handles. */
  const selectedVectorId =
    selectedVectorIds.length > 0 ? selectedVectorIds[selectedVectorIds.length - 1] : null;

  /** Single-selection shim, so existing call sites keep working. */
  const setSelectedVectorId = useCallback(
    (value: string | null | ((current: string | null) => string | null)) => {
      setSelectedVectorIds((current) => {
        const primary = current.length > 0 ? current[current.length - 1] : null;
        const next = typeof value === "function" ? value(primary) : value;
        return next ? [next] : [];
      });
    },
    []
  );
  /** In-progress pen/line points, in canvas display pixels. */
  const [vectorDraft, setVectorDraft] = useState<VecPt[]>([]);
  const [vectorHover, setVectorHover] = useState<VecPt | null>(null);
  /** Drag-in-progress box while a shape tool is active (state drives the preview). */
  const [vectorShapeDraft, setVectorShapeDraft] = useState<{ start: VecPt; current: VecPt; square: boolean } | null>(null);
  /** Authoritative drag geometry, so a fast drag never reads a stale render. */
  const vectorShapeDraftRef = useRef<{ start: VecPt; current: VecPt; square: boolean } | null>(null);
  const vectorMoveRef = useRef<{ id: string; start: VecPt; origin: SubPath[] } | null>(null);
  /** Mirrors vectorObjects so history snapshots never read a stale render. */
  const latestVectorRef = useRef<VectorObject[]>(vectorObjects);
  /** Node editing: reshape the selected object's anchors and handles. */
  const [vectorNodeMode, setVectorNodeMode] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{ subpath: number; anchor: number } | null>(null);
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
  /**
   * Where the canvas column starts in the window, plus its top edge.
   *
   * The column's own `clientWidth` cannot be used to size the canvas: the canvas
   * is a child of the column, so an oversized canvas widens the column, which
   * then reports a wider width and widens the canvas again. That feedback is why
   * the old code hard-capped the canvas at 820 px. Offsets from the window cannot
   * feed back, because neither the column's left edge nor the window's width
   * depends on how big the canvas is.
   */
  const [canvasLeft, setCanvasLeft] = useState(() =>
    typeof window === "undefined" ? 320 : Math.min(320, window.innerWidth / 4),
  );
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window === "undefined" ? 800 : Math.max(MIN_CANVAS_SIZE, window.innerWidth / 2),
  );
  const [unit, setUnit] = useState<UnitType>(_saved.unit ?? "in");
  // Back to a 4 in square by default, NOT the machine bed. Fill covers the
  // canvas, so making the canvas the whole bed meant Fill covered the entire
  // workspace instead of the part. The F2 Ultra bed presets remain in the list
  // for when the bed is genuinely what you want to work against.
  const [material, setMaterial] = useState<MaterialSize>(
    _saved.material ?? { widthIn: 4.0, heightIn: 4.0 }
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    _saved.selectedPresetId ?? "custom"
  );
  const [showRuler, setShowRuler] = useState(_saved.showRuler ?? true);
  const [resizeMode, setResizeMode] = useState(_saved.resizeMode ?? false);
  const dpr = useCanvasDpr();
  const [manualDisplaySize, setManualDisplaySize] = useState<{ w: number; h: number } | null>(null);
  // Saved design state (position/scale/filters) to restore after image loads — not persisted
  const savedDesignStateRef = useRef<SavedDesignState | null>(null);
  // Design real-world size inputs (in current unit)
  const [designWidthInput, setDesignWidthInput] = useState("");
  const [designHeightInput, setDesignHeightInput] = useState("");

  // Undo/redo history
  const historyRef = useRef<EditorSnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const continuousEditRef = useRef(false);
  const lastHistorySignatureRef = useRef<string | null>(null);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const cloneSnapshot = useCallback(
    (snapshot: EditorSnapshot): EditorSnapshot => ({
      design: snapshot.design ? cloneImageState(snapshot.design) : null,
      vectorObjects: snapshot.vectorObjects.map((object) => cloneVectorObject(object)),
    }),
    []
  );

  /** The live state, ready to be recorded. */
  const currentSnapshot = useCallback(
    (): EditorSnapshot => ({
      design: latestDesignRef.current,
      vectorObjects: latestVectorRef.current,
    }),
    []
  );

  /**
   * Record a state. Duplicate states are dropped by signature, which is what
   * keeps an undo restore from being recorded again as a new edit.
   */
  const pushHistory = useCallback(
    (snapshot: EditorSnapshot) => {
      const clone = cloneSnapshot(snapshot);
      const signature = editorSignature(clone);
      if (signature === lastHistorySignatureRef.current) return;

      // Drop any future states if we're mid-history
      let nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      nextHistory.push(clone);
      if (nextHistory.length > HISTORY_LIMIT) {
        nextHistory = nextHistory.slice(nextHistory.length - HISTORY_LIMIT);
      }
      historyRef.current = nextHistory;
      historyIndexRef.current = historyRef.current.length - 1;
      lastHistorySignatureRef.current = signature;
    },
    [cloneSnapshot]
  );

  const applySnapshot = useCallback(
    (snapshot: EditorSnapshot) => {
      continuousEditRef.current = false;
      const clone = cloneSnapshot(snapshot);
      latestDesignRef.current = clone.design;
      latestVectorRef.current = clone.vectorObjects;
      setDesign(clone.design);
      setVectorObjects(clone.vectorObjects);
      lastHistorySignatureRef.current = editorSignature(clone);
      updateUndoRedoState();
    },
    [cloneSnapshot, updateUndoRedoState]
  );

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    applySnapshot(historyRef.current[historyIndexRef.current]);
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    applySnapshot(historyRef.current[historyIndexRef.current]);
  }, [applySnapshot]);

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
    pushHistory({ design: snapshot, vectorObjects: latestVectorRef.current });
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

  /**
   * Apply a change to the vector layer. `record` is false during a drag so the
   * whole gesture collapses into one undo step once the pointer is released.
   */
  const applyVectorChange = useCallback(
    (next: VectorObject[], record = true) => {
      latestVectorRef.current = next;
      setVectorObjects(next);
      if (record) {
        pushHistory({ design: latestDesignRef.current, vectorObjects: next });
        updateUndoRedoState();
      }
    },
    [pushHistory, updateUndoRedoState]
  );

  /** Record the current vector state — used when a drag finishes. */
  const commitVectorChange = useCallback(() => {
    pushHistory(currentSnapshot());
    updateUndoRedoState();
  }, [pushHistory, currentSnapshot, updateUndoRedoState]);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRulerRef = useRef<HTMLCanvasElement>(null);
  const leftRulerRef = useRef<HTMLCanvasElement>(null);
  const partInputRef = useRef<HTMLInputElement>(null);
  const designInputRef = useRef<HTMLInputElement>(null);
  const vectorImportRef = useRef<HTMLInputElement>(null);
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

  // Auto-save tool settings to localStorage (images are NOT saved — start fresh each session)
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
      // Vector artwork is lightweight path data, so it is safe to persist.
      vectorObjects,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Storage quota exceeded — silently ignore
    }
  }, [unit, material, selectedPresetId, showRuler, resizeMode, vectorObjects]);

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

  useEffect(() => {
    latestVectorRef.current = vectorObjects;
  }, [vectorObjects]);

  // Track design changes into history. Restores from undo/redo are ignored
  // automatically because pushHistory drops duplicate signatures.
  useEffect(() => {
    if (!design) return;
    if (isDragging || continuousEditRef.current) {
      return;
    }
    pushHistory({ design, vectorObjects: latestVectorRef.current });
    updateUndoRedoState();
  }, [design, isDragging, pushHistory, updateUndoRedoState]);

  // Seed history so the very first edit (on either layer) has something to
  // return to.
  useEffect(() => {
    if (historyRef.current.length > 0) return;
    pushHistory({ design: latestDesignRef.current, vectorObjects: latestVectorRef.current });
    updateUndoRedoState();
  }, [pushHistory, updateUndoRedoState]);

  // Responsive sizing.
  //
  // The workspace is meant to fill the window, so both axes are measured from
  // the room actually available. The container's height cannot be measured — the
  // canvas inside it defines that height — so the space below the container's top
  // edge is measured instead, which is stable and does not feed back on itself.
  useEffect(() => {
    const update = () => {
      const el = canvasContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCanvasLeft(rect.left);
      setContainerWidth(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    if (canvasContainerRef.current) ro.observe(canvasContainerRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Canvas display size — driven by material aspect ratio (or manual override)
  const rulerThickness = showRuler ? RULER_THICKNESS : 0;
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const isCompactLayout = containerWidth < 640;
  // The column's own width, bounded by the room left in the window: if the
  // column is ever widened by its contents, the canvas must not follow it off
  // the right-hand edge.
  const availableWorkspaceWidth = Math.max(
    Math.min(containerWidth, viewportWidth - canvasLeft) - CANVAS_MARGIN,
    MIN_CANVAS_SIZE + rulerThickness,
  );
  // Caps restored to their original values.
  //
  // The canvas is the coordinate space for traced templates, masks, design
  // positions, and the Fill maths (which scales art to `displayWidth /
  // naturalWidth`). Removing these caps so the workspace could fill the window
  // silently changed the scale all of that was built against — a template traced
  // against a 520 px canvas no longer landed on the part. A genuinely larger
  // workspace has to rescale that stored geometry with it; it is not something
  // to get as a side effect of deleting two lines.
  const maxW = Math.min(
    Math.max(availableWorkspaceWidth - rulerThickness, MIN_CANVAS_SIZE),
    820,
  );
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
  // --- Vector authoring ---
  /** Draw the vector layer onto any 2D context (preview or export). */
  const paintVectorObjects = useCallback(
    (target: CanvasRenderingContext2D, sx: number, sy: number) => {
      for (const object of vectorObjects) {
        const info = MODE_INFO[object.mode];
        target.save();
        target.beginPath();
        traceSubpaths(target, object.subpaths, sx, sy);
        if (object.mode === "engrave") {
          target.fillStyle = info.fill;
          target.fill("nonzero");
        } else {
          target.strokeStyle = info.stroke;
          target.lineWidth = Math.max(1, object.strokeWidth * Math.min(sx, sy));
          target.lineJoin = "round";
          target.lineCap = "round";
          target.stroke();
        }
        target.restore();
      }
    },
    [vectorObjects]
  );

  const selectedVector = useMemo(
    () => vectorObjects.find((object) => object.id === selectedVectorId) ?? null,
    [vectorObjects, selectedVectorId]
  );

  const vectorExport = useMemo(
    () =>
      buildVectorSvg({
        objects: vectorObjects,
        displayWidth,
        displayHeight,
        materialWidthIn: material.widthIn,
        materialHeightIn: material.heightIn,
      }),
    [vectorObjects, displayWidth, displayHeight, material.widthIn, material.heightIn]
  );

  /** Box defined by a drag, normalised and optionally squared with Shift. */
  const dragBox = useCallback((start: VecPt, current: VecPt, square: boolean) => {
    let w = current.x - start.x;
    let h = current.y - start.y;
    if (square) {
      const size = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * size;
      h = Math.sign(h || 1) * size;
    }
    return {
      x: Math.min(start.x, start.x + w),
      y: Math.min(start.y, start.y + h),
      w: Math.abs(w),
      h: Math.abs(h),
    };
  }, []);

  const subpathsForTool = useCallback(
    (tool: VectorTool, box: { x: number; y: number; w: number; h: number }): SubPath[] => {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      switch (tool) {
        case "rect":
          return rectSubpaths(box.x, box.y, box.w, box.h);
        case "ellipse":
          return ellipseSubpaths(cx, cy, box.w / 2, box.h / 2);
        case "polygon":
          return polygonSubpaths(cx, cy, Math.min(box.w, box.h) / 2, 6);
        case "star":
          return starSubpaths(cx, cy, Math.min(box.w, box.h) / 2, 5);
        default:
          return [];
      }
    },
    []
  );

  const addVectorObject = useCallback(
    (name: string, subpaths: SubPath[], mode: VectorMode) => {
      if (subpaths.length === 0) return;
      const object = objectFromSubpaths(name, subpaths, mode);
      applyVectorChange([...latestVectorRef.current, object]);
      setSelectedVectorId(object.id);
    },
    [applyVectorChange, setSelectedVectorId]
  );

  const deleteVectorObject = useCallback(
    (id: string) => {
      applyVectorChange(latestVectorRef.current.filter((object) => object.id !== id));
      setSelectedVectorId((current) => (current === id ? null : current));
    },
    [applyVectorChange, setSelectedVectorId]
  );

  /** Remove the node currently selected in node-editing mode. */
  const deleteSelectedNode = useCallback(() => {
    const object = latestVectorRef.current.find((item) => item.id === selectedVectorId);
    if (!object || !selectedNode) return;

    applyVectorChange(
      latestVectorRef.current.map((item) =>
        item.id === object.id
          ? {
              ...item,
              subpaths: removeAnchor(item.subpaths, selectedNode.subpath, selectedNode.anchor),
            }
          : item
      )
    );
    setSelectedNode(null);
  }, [selectedVectorId, selectedNode, applyVectorChange]);

  const clearVectorObjects = useCallback(() => {
    applyVectorChange([]);
    setSelectedVectorId(null);
    setVectorDraft([]);
    setVectorHover(null);
  }, [applyVectorChange, setSelectedVectorId]);

  const setVectorMode = useCallback(
    (id: string, mode: VectorMode) => {
      applyVectorChange(
        latestVectorRef.current.map((object) =>
          object.id === id ? { ...object, mode } : object
        )
      );
    },
    [applyVectorChange]
  );

  /** Line weight changes are continuous while dragging the slider. */
  const setVectorStrokeWidth = useCallback(
    (id: string, strokeWidth: number, record = true) => {
      applyVectorChange(
        latestVectorRef.current.map((object) =>
          object.id === id ? { ...object, strokeWidth } : object
        ),
        record
      );
    },
    [applyVectorChange]
  );

  const rotateVectorObject = useCallback(
    (id: string, degrees: number) => {
      applyVectorChange(
        latestVectorRef.current.map((object) =>
          object.id === id
            ? { ...object, subpaths: rotateSubpaths(object.subpaths, objectCenter(object), degrees) }
            : object
        )
      );
    },
    [applyVectorChange]
  );

  /** Finish an in-progress pen/line path. */
  const finishVectorDraft = useCallback(
    (closePath: boolean) => {
      if (vectorDraft.length >= 2) {
        const name = vectorTool === "line" ? "Line" : "Path";
        addVectorObject(
          name,
          [{ closed: closePath, anchors: vectorDraft.map((point) => ({ x: point.x, y: point.y })) }],
          "cut"
        );
      }
      setVectorDraft([]);
      setVectorHover(null);
    },
    [vectorDraft, vectorTool, addVectorObject]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Draw in display coordinates. The bitmap itself is dpr× larger than the
    // CSS box, so this transform is what makes the preview land on physical
    // pixels instead of being stretched across them.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
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

      // A shape mask clips in canvas space, so the design is drawn into its own
      // layer first and clipped before compositing (PowerClip behaviour).
      let maskLayer: HTMLCanvasElement | null = null;
      let maskLayerCtx: CanvasRenderingContext2D | null = null;
      let g: CanvasRenderingContext2D = ctx;
      if (design.mask) {
        maskLayer = document.createElement("canvas");
        maskLayer.width = Math.round(displayWidth * dpr);
        maskLayer.height = Math.round(displayHeight * dpr);
        maskLayerCtx = maskLayer.getContext("2d");
        if (maskLayerCtx) {
          maskLayerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          g = maskLayerCtx;
        } else {
          maskLayer = null;
        }
      }

      g.save();
      if (shouldClipDesign) {
        clipToTracePath(g, penTracePoints);
      }

      // Rasterise the filtered design at device resolution, then draw it back
      // at display size. A design no larger than the canvas gets the full dpr;
      // a design scaled up past the canvas stops at what the screen can show,
      // so dragging one around cannot tank the frame rate.
      const rasterCeiling = Math.min(
        MAX_DESIGN_RASTER_PX,
        Math.round(Math.max(displayWidth, displayHeight) * dpr)
      );
      const rasScale = Math.min(dpr, rasterCeiling / Math.max(imgW, imgH, 1));
      const filtered = applyFiltersToCanvas(
        design.element,
        design.filters,
        Math.max(1, Math.round(imgW * rasScale)),
        Math.max(1, Math.round(imgH * rasScale)),
        eraserMaskRef.current,
      );

      if (design.warpMesh) {
        drawWarpedImage(g, filtered, design.warpMesh, design.opacity);
      } else {
        g.save();
        g.globalAlpha = design.opacity;
        g.translate(cx, cy);
        g.rotate((design.rotation * Math.PI) / 180);
        if (design.flipH) g.scale(-1, 1);
        if (design.flipV) g.scale(1, -1);
        g.drawImage(filtered, -imgW / 2, -imgH / 2, imgW, imgH);
        g.restore();
      }
      g.restore();

      if (maskLayer && design.mask) {
        // The layer is device-sized, so the mask geometry is scaled to match it
        // before being punched in, then composited back at display size. The
        // masking itself runs at 1:1 so the clipped edge stays sharp.
        maskLayerCtx?.setTransform(1, 0, 0, 1, 0, 0);
        applyMaskToCanvas(maskLayer, design.mask, dpr, dpr);
        ctx.drawImage(maskLayer, 0, 0, displayWidth, displayHeight);
      }
    }

    // Vector layer sits above the design so cut lines stay readable.
    paintVectorObjects(ctx, 1, 1);

  }, [partPhoto, partRotation, design, displayWidth, displayHeight, material, unit, clipDesignToTrace, penTraceClosed, penTracePoints, paintVectorObjects, dpr]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Backing store in device pixels — this overrides the CSS-sized width and
    // height the element is rendered with. Layout box stays in CSS pixels.
    canvas.width = Math.round(displayWidth * dpr);
    canvas.height = Math.round(displayHeight * dpr);
    draw();
    drawExternalRulers();
  }, [displayWidth, displayHeight, dpr, draw]);

  useEffect(() => {
    draw();
    drawExternalRulers();
  }, [draw]);

  // --- External ruler drawing (drawn on dedicated canvases outside the workspace) ---
  const drawExternalRulers = useCallback(() => {
    const topCanvas = topRulerRef.current;
    const leftCanvas = leftRulerRef.current;
    if (!topCanvas || !leftCanvas) return;

    const w = displayWidth;
    const h = displayHeight;
    const matW = material.widthIn;
    const matH = material.heightIn;
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
    topCanvas.width = Math.round(w * dpr);
    topCanvas.height = Math.round(rT * dpr);
    const tCtx = topCanvas.getContext("2d");
    if (tCtx) {
      tCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    leftCanvas.width = Math.round(rT * dpr);
    leftCanvas.height = Math.round(h * dpr);
    const lCtx = leftCanvas.getContext("2d");
    if (lCtx) {
      lCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  }, [displayWidth, displayHeight, material, unit, dpr]);



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
            // Restore saved position/scale/filters exactly. Saved state from
            // older versions has no mask, so default it explicitly.
            setDesign({
              ...restoreState,
              naturalWidth: natW,
              naturalHeight: natH,
              element: img,
              mask: restoreState.mask ?? null,
            });
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
            mask: null,
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

      // Vector tools work with or without a design image loaded.
      if (vectorTool !== "select") {
        e.preventDefault();
        const point = getPos(e.clientX, e.clientY);
        if (vectorTool === "pen" || vectorTool === "line") {
          // Clicking back on the first point closes the path.
          if (vectorTool === "pen" && vectorDraft.length >= 3) {
            const first = vectorDraft[0];
            if (Math.hypot(point.x - first.x, point.y - first.y) < 12) {
              finishVectorDraft(true);
              return;
            }
          }
          setVectorDraft((current) => [...current, point]);
          return;
        }
        vectorShapeDraftRef.current = { start: point, current: point, square: e.shiftKey };
        setVectorShapeDraft(vectorShapeDraftRef.current);
        return;
      }

      if (vectorObjects.length > 0) {
        const point = getPos(e.clientX, e.clientY);
        const hit = [...vectorObjects].reverse().find((object) => hitTestObject(object, point));
        if (hit) {
          e.preventDefault();
          setSelectedVectorId(hit.id);
          vectorMoveRef.current = {
            id: hit.id,
            start: point,
            origin: cloneSubpaths(hit.subpaths),
          };
          return;
        }
        setSelectedVectorId(null);
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
    [
      addPenTracePoint, design, eraserActive, getPos, getEraserPosInDesign,
      applyEraserStroke, draw, penTraceActive, vectorTool, vectorDraft,
      vectorObjects, finishVectorDraft, setSelectedVectorId,
    ]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (penTraceActive) {
        setPenTraceHover(clampPointToCanvas(getPos(e.clientX, e.clientY), displayWidth, displayHeight));
        return;
      }

      const shapeDraft = vectorShapeDraftRef.current;
      if (shapeDraft) {
        e.preventDefault();
        const next = {
          start: shapeDraft.start,
          current: getPos(e.clientX, e.clientY),
          square: e.shiftKey,
        };
        vectorShapeDraftRef.current = next;
        setVectorShapeDraft(next);
        return;
      }
      if (vectorTool === "pen" || vectorTool === "line") {
        setVectorHover(getPos(e.clientX, e.clientY));
        return;
      }
      const vectorMove = vectorMoveRef.current;
      if (vectorMove) {
        const point = getPos(e.clientX, e.clientY);
        const dx = point.x - vectorMove.start.x;
        const dy = point.y - vectorMove.start.y;
        // Intermediate drag frames are not recorded; the release records once.
        applyVectorChange(
          latestVectorRef.current.map((object) =>
            object.id === vectorMove.id
              ? { ...object, subpaths: translateSubpaths(vectorMove.origin, dx, dy) }
              : object
          ),
          false
        );
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
    [
      isDragging, design, dragStart, eraserActive, getPos, getEraserPosInDesign,
      applyEraserStroke, draw, updateDesignContinuously, penTraceActive, displayWidth,
      displayHeight, vectorTool, applyVectorChange,
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) commitCurrentDesign();
    isErasingRef.current = false;
    setIsDragging(false);

    // A finished move drag collapses into a single undo entry.
    if (vectorMoveRef.current) {
      vectorMoveRef.current = null;
      commitVectorChange();
    }

    // Commit a shape that was dragged out with a shape tool. The ref is the
    // authority here because the final move may not have re-rendered yet.
    const draft = vectorShapeDraftRef.current;
    vectorShapeDraftRef.current = null;
    setVectorShapeDraft(null);

    if (draft && vectorTool !== "select" && vectorTool !== "pen" && vectorTool !== "line") {
      const box = dragBox(draft.start, draft.current, draft.square);
      if (box.w > 2 && box.h > 2) {
        const subpaths = subpathsForTool(vectorTool, box);
        if (subpaths.length > 0) {
          const object = objectFromSubpaths(
            vectorTool.charAt(0).toUpperCase() + vectorTool.slice(1),
            subpaths,
            "cut"
          );
          applyVectorChange([...latestVectorRef.current, object]);
          setSelectedVectorId(object.id);
        }
      }
    }
  }, [
    isDragging, commitCurrentDesign, vectorTool, dragBox, subpathsForTool,
    applyVectorChange, commitVectorChange, setSelectedVectorId,
  ]);

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

      // Vector layer shortcuts (work without a design loaded).
      if (vectorTool === "pen" || vectorTool === "line") {
        if (e.key === "Enter") { e.preventDefault(); finishVectorDraft(false); return; }
        if (e.key === "Escape") {
          e.preventDefault();
          setVectorDraft([]);
          setVectorHover(null);
          return;
        }
        if ((e.key === "Backspace" || e.key === "Delete") && vectorDraft.length > 0) {
          e.preventDefault();
          setVectorDraft((current) => current.slice(0, -1));
          return;
        }
      } else if (e.key === "Escape") {
        if (vectorNodeMode) {
          setVectorNodeMode(false);
          setSelectedNode(null);
        } else {
          setSelectedVectorId(null);
        }
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        // In node mode the delete applies to the selected node.
        if (vectorNodeMode && selectedNode) {
          e.preventDefault();
          deleteSelectedNode();
          return;
        }
        if (selectedVectorId) {
          e.preventDefault();
          deleteVectorObject(selectedVectorId);
          return;
        }
      }

      // Undo/redo must work on whichever layer is in use, so they are handled
      // before the design-only shortcuts below.
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
  }, [
    design, handleUndo, handleRedo, penTraceActive, penTracePoints.length,
    vectorTool, vectorDraft.length, selectedVectorId, finishVectorDraft, deleteVectorObject,
    vectorNodeMode, selectedNode, deleteSelectedNode, setSelectedVectorId,
  ]);

  // Quick actions
  /**
   * Bounding box of the traced template, when the design is clipped to one.
   *
   * Fill targets this rather than the canvas. The canvas *is* the material, so
   * covering it only looked like "filling the template" while the two happened
   * to be the same size — which is why Fill swallowed the whole workspace the
   * moment the canvas changed size.
   */
  const templateBounds = useMemo(() => {
    if (!clipDesignToTrace || !penTraceClosed || penTracePoints.length < 3) return null;
    const xs = penTracePoints.map((point) => point.x);
    const ys = penTracePoints.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...xs) - x;
    const h = Math.max(...ys) - y;
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  }, [clipDesignToTrace, penTraceClosed, penTracePoints]);

  const handleFill = useCallback(() => {
    if (!design) return;
    // Fit the whole artwork inside the template when there is one; the material
    // otherwise. `min` rather than `max` contains the image: the entire artwork
    // stays visible, letterboxed within the template instead of cropped to it.
    const target = templateBounds ?? { x: 0, y: 0, w: displayWidth, h: displayHeight };
    const fitScale = Math.min(
      target.w / design.naturalWidth,
      target.h / design.naturalHeight
    );
    const filledWidthIn = displayToInches(design.naturalWidth * fitScale, displayWidth, material.widthIn);
    const filledHeightIn = displayToInches(design.naturalHeight * fitScale, displayHeight, material.heightIn);
    setDesign({
      ...design,
      scale: fitScale,
      scaleX: 1,
      scaleY: 1,
      x: target.x + (target.w - design.naturalWidth * fitScale) / 2,
      y: target.y + (target.h - design.naturalHeight * fitScale) / 2,
      rotation: 0,
    });
    if (unit === "in") {
      setDesignWidthInput(filledWidthIn.toFixed(2));
      setDesignHeightInput(filledHeightIn.toFixed(2));
    } else {
      setDesignWidthInput(inToMm(filledWidthIn).toFixed(1));
      setDesignHeightInput(inToMm(filledHeightIn).toFixed(1));
    }
  }, [design, displayWidth, displayHeight, material.heightIn, material.widthIn, templateBounds, unit]);

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
    if (!partPhoto && !design && penTracePoints.length < 2 && vectorObjects.length === 0) return null;
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

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

      // Mask clips at export resolution so the clipped edge stays sharp.
      let maskLayer: HTMLCanvasElement | null = null;
      let g: CanvasRenderingContext2D = ctx;
      if (design.mask) {
        maskLayer = document.createElement("canvas");
        maskLayer.width = expW;
        maskLayer.height = expH;
        const layerCtx = maskLayer.getContext("2d");
        if (layerCtx) {
          g = layerCtx;
        } else {
          maskLayer = null;
        }
      }

      g.save();
      if (shouldClipDesign) {
        clipToTracePath(g, penTracePoints, scaleX, scaleY);
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
        drawWarpedImage(g, filtered, scaledMesh, design.opacity, 96);
      } else {
        g.save();
        g.globalAlpha = design.opacity;
        g.translate(cx, cy);
        g.rotate((design.rotation * Math.PI) / 180);
        if (design.flipH) g.scale(-1, 1);
        if (design.flipV) g.scale(1, -1);
        g.drawImage(filtered, -imgW / 2, -imgH / 2, imgW, imgH);
        g.restore();
      }
      g.restore();

      if (maskLayer && design.mask) {
        applyMaskToCanvas(maskLayer, design.mask, scaleX, scaleY);
        ctx.drawImage(maskLayer, 0, 0);
      }
    }

    // Vector artwork rasterises at export resolution for PNG/JPEG/PDF output;
    // the true-vector copy comes from the SVG export.
    paintVectorObjects(ctx, scaleX, scaleY);

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
  }, [partPhoto, partRotation, design, displayWidth, displayHeight, material, penTracePoints, penTraceClosed, penTraceStyle, clipDesignToTrace, vectorObjects, paintVectorObjects]);

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
        mask: null,
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
      mask: null,
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

    addCustomPreset({
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
      removeCustomPreset(preset.id);
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

  // Keep the card honest about allowances and renewal state by asking the server.
  useEffect(() => {
    let active = true;
    void fetchLicenseStatus(entitlement).then((status) => {
      if (active) setLicenseStatus(status);
    });
    return () => {
      active = false;
    };
  }, [entitlement]);

  const changeRenewal = useCallback(
    async (cancel: boolean) => {
      setRenewalBusy(true);
      const result = await requestRenewalChange(cancel, entitlement);
      setRenewalBusy(false);
      setConfirmingCancel(false);

      if (!result.ok) {
        toast.error(
          result.error === "network"
            ? "Could not reach the licence server. Email support to cancel."
            : "Could not change the renewal setting. Email support to cancel."
        );
        return;
      }

      setLicenseStatus((current) =>
        current ? { ...current, renewalCancelled: result.cancelled } : current
      );
      toast.success(
        result.cancelled
          ? "Renewal cancelled — your licence stays active until it expires"
          : "Renewal resumed"
      );
    },
    [entitlement]
  );

  const activateLicence = useCallback(async () => {
    const key = licenseKeyInput.trim();
    if (!key) return;
    setLicenseBusy(true);
    const result = await activateLicense(key);
    setLicenseBusy(false);

    if (result.ok) {
      setEntitlement(loadEntitlement());
      setLicenseKeyInput("");
      toast.success("Licence activated");
      return;
    }

    const reason = result.error;
    toast.error(
      reason === "network"
        ? "Could not reach the licence server"
        : reason === "licensing_not_configured"
          ? "This build has no licence secret configured, so keys cannot be verified. Set LICENSE_SECRET."
          : reason === "expired"
            ? "That licence has expired"
            : reason === "bad_signature"
              ? "That licence key was not issued by ForgeMark Industries"
              : "That licence key was not accepted"
    );
  }, [licenseKeyInput]);

  /**
   * Gate helper — asks the server for permission before running an export.
   *
   * The count lives on the server, so a normal install cannot reset it. A local
   * app cannot enforce this against someone deliberately patching it; the AI
   * quota and licence validity are the parts that are genuinely enforced.
   */
  const gatedExport = useCallback(
    (doExport: () => void) => {
      void (async () => {
        let permission;
        try {
          permission = await requestExportPermission(entitlement);
        } catch {
          permission = { allowed: false, remaining: null, plan: "free" as const };
        }

        if (!permission.allowed) {
          toast.error(denialMessage(permission), { duration: 9000 });
          return;
        }

        doExport();
        setOnboarding((current) => markExported(current));

        if (permission.remaining === 0) {
          toast.warning("That was the last free export this month.", { duration: 7000 });
        } else if (permission.remaining !== null && permission.remaining <= 2) {
          toast.message(
            `Free plan: ${permission.remaining} export${permission.remaining === 1 ? "" : "s"} left this month.`
          );
        }
      })();
    },
    [entitlement]
  );

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

  // --- Clipping mask (PowerClip) ---
  const designBox = useCallback((): MaskBox | null => {
    if (!design) return null;
    return {
      x: design.x,
      y: design.y,
      w: design.naturalWidth * design.scale * design.scaleX,
      h: design.naturalHeight * design.scale * design.scaleY,
    };
  }, [design]);

  const updateMaskContinuously = useCallback(
    (updater: (mask: DesignMask) => DesignMask) => {
      updateDesignContinuously((prev) =>
        prev.mask ? { ...prev, mask: updater(prev.mask) } : prev
      );
    },
    [updateDesignContinuously]
  );

  const commitMaskUpdate = useCallback(
    (updater: (mask: DesignMask) => DesignMask) => {
      commitDesignUpdate((prev) => (prev.mask ? { ...prev, mask: updater(prev.mask) } : prev));
    },
    [commitDesignUpdate]
  );

  /** Choose the container shape the design is clipped into. */
  const applyMaskShape = useCallback(
    (shapeId: string) => {
      const box = designBox();
      if (!box) return;
      commitDesignUpdate((prev) => {
        // Switching shapes keeps the mask where the user put it.
        if (prev.mask) return { ...prev, mask: changeMaskShape(prev.mask, shapeId) };
        return { ...prev, mask: createDesignMask(shapeId, box) };
      });
    },
    [designBox, commitDesignUpdate]
  );

  const fitMask = useCallback(
    (target: "design" | "material") => {
      const box =
        target === "design"
          ? designBox()
          : { x: 0, y: 0, w: displayWidth, h: displayHeight };
      if (!box) return;
      commitMaskUpdate((mask) => fitMaskToBox(mask, box));
    },
    [designBox, displayWidth, displayHeight, commitMaskUpdate]
  );

  const centerMask = useCallback(() => {
    commitMaskUpdate((mask) => ({
      ...mask,
      x: (displayWidth - mask.w) / 2,
      y: (displayHeight - mask.h) / 2,
    }));
  }, [displayWidth, displayHeight, commitMaskUpdate]);

  const removeMask = useCallback(() => {
    commitDesignUpdate((prev) => ({ ...prev, mask: null }));
  }, [commitDesignUpdate]);

  const handleMaskPointerDown = useCallback(
    (e: React.PointerEvent, mode: "move" | DesignResizeHandle) => {
      if (!design?.mask) return;
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);

      const start: DesignMask = { ...design.mask };
      const shape = getMaskShape(start.shapeId);
      const startX = e.clientX;
      const startY = e.clientY;
      const MIN_SIZE = 16;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        updateMaskContinuously((mask) => {
          if (mode === "move") {
            return { ...mask, x: start.x + dx, y: start.y + dy };
          }

          const stretchesE = mode === "e" || mode === "ne" || mode === "se";
          const stretchesW = mode === "w" || mode === "nw" || mode === "sw";
          const stretchesS = mode === "s" || mode === "se" || mode === "sw";
          const stretchesN = mode === "n" || mode === "ne" || mode === "nw";

          let x1 = start.x;
          let y1 = start.y;
          let x2 = start.x + start.w;
          let y2 = start.y + start.h;

          if (stretchesE) x2 = x1 + Math.max(MIN_SIZE, start.w + dx);
          if (stretchesW) x1 = x2 - Math.max(MIN_SIZE, start.w - dx);
          if (stretchesS) y2 = y1 + Math.max(MIN_SIZE, start.h + dy);
          if (stretchesN) y1 = y2 - Math.max(MIN_SIZE, start.h - dy);

          let w = x2 - x1;
          let h = y2 - y1;

          if (mask.lockAspect) {
            const aspect = shape.aspect > 0 ? shape.aspect : 1;
            if (stretchesE || stretchesW) {
              const centerY = start.y + start.h / 2;
              h = w / aspect;
              y1 = centerY - h / 2;
            } else {
              const centerX = start.x + start.w / 2;
              w = h * aspect;
              x1 = centerX - w / 2;
            }
            if (stretchesW) x1 = x2 - w;
            if (stretchesN) y1 = y2 - h;
          }

          return { ...mask, x: x1, y: y1, w, h };
        });
      };

      const onUp = () => {
        commitCurrentDesign();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [design, updateMaskContinuously, commitCurrentDesign]
  );

  /** Corner-drag scaling for the selected object. */
  const handleVectorScalePointerDown = useCallback(
    (e: React.PointerEvent, corner: "nw" | "ne" | "sw" | "se") => {
      if (!selectedVector) return;
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);

      const bounds = objectBounds(selectedVector);
      const origin = cloneVectorObject(selectedVector).subpaths;
      const id = selectedVector.id;

      // Scale about the opposite corner.
      const anchor: VecPt = {
        x: corner.includes("w") ? bounds.x + bounds.w : bounds.x,
        y: corner.includes("n") ? bounds.y + bounds.h : bounds.y,
      };
      const refX = (corner.includes("w") ? bounds.x : bounds.x + bounds.w) - anchor.x;
      const refY = (corner.includes("n") ? bounds.y : bounds.y + bounds.h) - anchor.y;

      const onMove = (ev: PointerEvent) => {
        const point = getPos(ev.clientX, ev.clientY);
        let sx = refX === 0 ? 1 : (point.x - anchor.x) / refX;
        let sy = refY === 0 ? 1 : (point.y - anchor.y) / refY;
        if (ev.shiftKey) {
          const uniform = Math.abs(sx) > Math.abs(sy) ? sx : sy;
          sx = uniform;
          sy = uniform;
        }
        sx = Math.abs(sx) < 0.02 ? Math.sign(sx || 1) * 0.02 : sx;
        sy = Math.abs(sy) < 0.02 ? Math.sign(sy || 1) * 0.02 : sy;

        const next = scaleSubpaths(origin, anchor, sx, sy);
        applyVectorChange(
          latestVectorRef.current.map((object) =>
            object.id === id ? { ...object, subpaths: next } : object
          ),
          false
        );
      };

      const onUp = () => {
        commitVectorChange();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [selectedVector, getPos, applyVectorChange, commitVectorChange]
  );

  /** Combine the selected shapes with a boolean operation. */
  const applyBoolean = useCallback(
    (op: BooleanOp) => {
      const byId = new Map(latestVectorRef.current.map((object) => [object.id, object]));
      const objects = selectedVectorIds
        .map((id) => byId.get(id))
        .filter((object): object is VectorObject => Boolean(object));
      if (objects.length < 2) return;

      let subpaths: SubPath[] = objects[0].subpaths;
      try {
        for (const object of objects.slice(1)) {
          subpaths = booleanSubpaths(subpaths, object.subpaths, op);
        }
      } catch {
        toast.error("That combination was too complex to compute");
        return;
      }

      const consumed = new Set(objects.slice(1).map((object) => object.id));
      const withoutConsumed = latestVectorRef.current.filter(
        (object) => !consumed.has(object.id)
      );

      if (subpaths.length === 0) {
        // Nothing survived — remove the inputs rather than leaving an empty object.
        applyVectorChange(withoutConsumed.filter((object) => object.id !== objects[0].id));
        setSelectedVectorIds([]);
        toast.warning("The result is empty, so the shapes were removed");
        return;
      }

      const result: VectorObject = { ...objects[0], subpaths };
      applyVectorChange(
        withoutConsumed.map((object) => (object.id === result.id ? result : object))
      );
      setSelectedVectorIds([result.id]);
      toast.success(`${MODE_INFO[result.mode].label} shape updated`);
    },
    [selectedVectorIds, applyVectorChange]
  );

  /** Convert a value in the current display unit into canvas pixels. */
  const unitToDisplayPx = useCallback(
    (value: number) => {
      const materialWidthInUnit = unit === "in" ? material.widthIn : material.widthIn * 25.4;
      return (value / Math.max(materialWidthInUnit, 1e-6)) * displayWidth;
    },
    [unit, material.widthIn, displayWidth]
  );

  /** Grow (positive) or erode (negative) the selected path. */
  const applyOffset = useCallback(
    (amount: number) => {
      const target = latestVectorRef.current.find((object) => object.id === selectedVectorId);
      if (!target) return;

      let subpaths: SubPath[];
      try {
        subpaths = offsetSubpaths(target.subpaths, amount);
      } catch {
        toast.error("Could not offset that path");
        return;
      }

      if (subpaths.length === 0) {
        toast.warning("That offset would erase the shape");
        return;
      }

      applyVectorChange(
        latestVectorRef.current.map((object) =>
          object.id === target.id ? { ...object, subpaths } : object
        )
      );
      toast.success(amount > 0 ? "Path grown" : "Path shrunk");
    },
    [selectedVectorId, applyVectorChange]
  );

  /** Save the shop details and adopt them as the marking defaults. */
  const commitShopProfile = useCallback(
    (profile: ShopProfile, options: { complete?: boolean } = {}) => {
      const saved = saveShopProfile({
        ...profile,
        onboarded: options.complete ? true : profile.onboarded,
      });
      setShopProfile(saved);
      setShopDraft(saved);
      setShopSetupOpen(false);

      // Adopt the defaults for the current job, and fill any blank marking text.
      setMarkingFont(saved.defaultFont);
      setMarkingHeightIn(saved.defaultMarkingHeightIn);
      setMarkingGapIn(saved.defaultLineGapIn);
      setMarkingFields((current) => applyProfileToFields(current, saved));

      toast.success("Shop details saved");
    },
    []
  );

  const applyMarkingPreset = useCallback(
    (presetId: string) => {
      const preset = MARKING_PRESETS.find((item) => item.id === presetId);
      if (!preset) return;
      setMarkingPresetId(presetId);
      setMarkingOrder(preset.order);
      // Keep whatever the operator has typed; fill blanks from the preset, then
      // from the shop profile.
      setMarkingFields((current) => {
        const next: MarkingFields = { ...current };
        for (const key of Object.keys(preset.fields) as MarkingLineKey[]) {
          if (!next[key].trim() && preset.fields[key]) next[key] = preset.fields[key];
        }
        return applyProfileToFields(next, shopProfile);
      });
    },
    [shopProfile]
  );

  const hasMarkingObject = useMemo(
    () => vectorObjects.some((object) => object.name.startsWith("Marking:")),
    [vectorObjects]
  );

  const onboardingSignals: OnboardingSignals = useMemo(
    () => ({
      materialChosen: selectedPresetId !== "custom",
      hasArtwork:
        Boolean(design) ||
        Boolean(partPhoto) ||
        vectorObjects.some((object) => !object.name.startsWith("Marking:")),
      hasMarking: hasMarkingObject,
      hasExported: onboarding.hasExported,
      shopReady: shopProfile.onboarded && isProfileComplete(shopProfile),
    }),
    [selectedPresetId, design, partPhoto, vectorObjects, hasMarkingObject, onboarding.hasExported, shopProfile]
  );

  const onboardingStepStates = useMemo(
    () => onboardingStatus(onboardingSignals),
    [onboardingSignals]
  );
  const onboardingTotals = useMemo(
    () => onboardingProgress(onboardingSignals),
    [onboardingSignals]
  );

  /** Reveal an unfinished step: open shop setup if it blocks marking, else scroll. */
  const focusOnboardingStep = useCallback(
    (id: OnboardingStepId) => {
      if (id === "marking" && markingBlockedByShop(onboardingSignals)) {
        setShopDraft(shopProfile);
        setShopSetupOpen(true);
      }

      const targets: Record<OnboardingStepId, string | null> = {
        material: "onboarding-material",
        artwork: "onboarding-artwork",
        marking: "onboarding-marking",
        export: null,
      };

      const target = targets[id];
      if (!target) {
        toast.message(
          "Export is in the top bar — true-vector SVG for cut work, PNG for raster engraving."
        );
        return;
      }
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [onboardingSignals, shopProfile]
  );

  const dismissGuide = useCallback(() => {
    setGuideOpen(false);
    setOnboarding((current) => saveOnboardingState({ ...current, dismissed: true }));
  }, []);

  const markingLines = useMemo(
    () =>
      layoutMarkingLines({
        fields: markingFields,
        order: markingOrder,
        textHeightIn: markingHeightIn,
        lineGapIn: markingGapIn,
      }),
    [markingFields, markingOrder, markingHeightIn, markingGapIn]
  );

  const markingIssues = useMemo(
    () => markingWarnings({ fields: markingFields, order: markingOrder, textHeightIn: markingHeightIn }),
    [markingFields, markingOrder, markingHeightIn]
  );

  /** Drop the marking block onto the material as editable outlines. */
  const addMarkingBlock = useCallback(() => {
    if (markingLines.length === 0) {
      toast.error("Fill in at least one marking line first");
      return;
    }

    const pxPerInch = displayWidth / Math.max(material.widthIn, 1e-6);
    let built;
    try {
      built = buildMarkingBlock({
        lines: markingLines,
        pxPerInch,
        // A quarter inch in from the top-left corner of the material.
        originPx: { x: pxPerInch * 0.25, y: pxPerInch * 0.25 },
        fontFamily: markingFont,
        lineGapIn: markingGapIn,
      });
    } catch {
      toast.error("Could not build that marking block");
      return;
    }

    if (built.subpaths.length === 0) {
      toast.error("Nothing to mark — check the line text");
      return;
    }

    addVectorObject(`Marking: ${markingLines[0].text}`.slice(0, 32), built.subpaths, "engrave");

    const summary = `${markingLines.length} line${markingLines.length === 1 ? "" : "s"} · ${(
      built.widthPx / pxPerInch
    ).toFixed(2)} × ${(built.heightPx / pxPerInch).toFixed(2)} in`;

    if (markingIssues.length > 0) {
      toast.warning(`${summary}. ${markingIssues[0]}`, { duration: 9000 });
    } else {
      toast.success(`Marking added — ${summary}`);
    }
  }, [
    markingLines, markingIssues, markingFont, markingGapIn, displayWidth,
    material.widthIn, addVectorObject,
  ]);

  /** Convert the typed text into outlines and drop it on the material. */
  const addTextOutlines = useCallback(() => {
    if (!textValue.trim()) {
      toast.error("Type some text first");
      return;
    }

    let traced: TextOutlineResult | null = null;
    try {
      traced = traceTextToSubpaths({
        text: textValue,
        fontFamily: textFont,
        sizePx: Math.max(4, unitToDisplayPx(textSize)),
        bold: textBold,
      });
    } catch {
      traced = null;
    }

    if (!traced || traced.subpaths.length === 0) {
      toast.error("Could not outline that text");
      return;
    }

    // Centre the outlines on the material.
    const offsetX = (displayWidth - traced.width) / 2;
    const offsetY = (displayHeight - traced.height) / 2;
    const placed = traced.subpaths.map((subpath) => ({
      ...subpath,
      anchors: subpath.anchors.map((anchor) => ({
        x: anchor.x + offsetX,
        y: anchor.y + offsetY,
      })),
    }));

    addVectorObject(textValue.trim().slice(0, 24), placed, "engrave");
    toast.success(`Text added as ${placed.length} outline${placed.length === 1 ? "" : "s"}`);
  }, [
    textValue, textFont, textSize, textBold, unitToDisplayPx,
    displayWidth, displayHeight, addVectorObject,
  ]);

  /** Import an SVG (Illustrator, Inkscape, …) as editable paths. */
  const handleVectorImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.currentTarget.value = "";
      if (!file) return;

      try {
        const text = await file.text();
        const startedAt = performance.now();
        const result = importSvgAsVectors(text, {
          targetBox: { x: 0, y: 0, w: displayWidth, h: displayHeight },
        });

        // Refused outright: say why and what to do, rather than importing part of
        // the artwork and leaving a pattern that looks finished but is not.
        if (result.error) {
          toast.error(result.error, { duration: 15000 });
          return;
        }

        if (result.objects.length > 0) {
          applyVectorChange([...latestVectorRef.current, ...result.objects]);
          setSelectedVectorId(result.objects[result.objects.length - 1].id);
        }

        if (result.warnings.length > 0) {
          toast.warning(result.warnings.join(" "), { duration: 7000 });
        } else {
          const seconds = (performance.now() - startedAt) / 1000;
          // Only worth mentioning on imports big enough to have felt slow.
          const timing = result.objects.length > 200 ? ` in ${seconds.toFixed(1)}s` : "";
          toast.success(
            `Imported ${result.objects.length} editable shape${result.objects.length === 1 ? "" : "s"}${timing}`
          );
        }
      } catch {
        toast.error("Could not read that file as SVG");
      }
    },
    [displayWidth, displayHeight, applyVectorChange, setSelectedVectorId]
  );

  /** Node editing: drag an anchor, carrying its handles with it. */
  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, subpathIndex: number, anchorIndex: number) => {
      if (!selectedVector) return;
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setSelectedNode({ subpath: subpathIndex, anchor: anchorIndex });

      const id = selectedVector.id;
      let last = getPos(e.clientX, e.clientY);

      const onMove = (ev: PointerEvent) => {
        const point = getPos(ev.clientX, ev.clientY);
        const dx = point.x - last.x;
        const dy = point.y - last.y;
        last = point;
        applyVectorChange(
          latestVectorRef.current.map((object) =>
            object.id === id
              ? {
                  ...object,
                  subpaths: moveAnchor(object.subpaths, subpathIndex, anchorIndex, dx, dy),
                }
              : object
          ),
          false
        );
      };

      const onUp = () => {
        commitVectorChange();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [selectedVector, getPos, applyVectorChange, commitVectorChange]
  );

  /** Node editing: drag a bezier handle. */
  const handleNodeHandlePointerDown = useCallback(
    (e: React.PointerEvent, subpathIndex: number, anchorIndex: number, which: "in" | "out") => {
      if (!selectedVector) return;
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);

      const id = selectedVector.id;

      const onMove = (ev: PointerEvent) => {
        const point = getPos(ev.clientX, ev.clientY);
        applyVectorChange(
          latestVectorRef.current.map((object) =>
            object.id === id
              ? {
                  ...object,
                  subpaths: moveHandle(object.subpaths, subpathIndex, anchorIndex, which, point),
                }
              : object
          ),
          false
        );
      };

      const onUp = () => {
        commitVectorChange();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [selectedVector, getPos, applyVectorChange, commitVectorChange]
  );

  /** Insert a node where the user double-clicked, when near the path. */
  const insertNodeNear = useCallback(
    (point: VecPt, tolerance = 14) => {
      if (!selectedVector) return false;
      const hit = nearestPointOnPath(selectedVector.subpaths, point, 48);
      if (!hit || hit.distance > tolerance) return false;

      const id = selectedVector.id;
      applyVectorChange(
        latestVectorRef.current.map((object) =>
          object.id === id
            ? {
                ...object,
                subpaths: splitSegment(
                  object.subpaths,
                  hit.subpathIndex,
                  hit.segmentIndex,
                  hit.t
                ),
              }
            : object
        )
      );
      setSelectedNode({ subpath: hit.subpathIndex, anchor: hit.segmentIndex + 1 });
      toast.success("Node added");
      return true;
    },
    [selectedVector, applyVectorChange]
  );

  const handleExportVectorSvg = useCallback(() => {
    gatedExport(() => {
      if (vectorObjects.length === 0) return;
      const result = buildVectorSvg({
        objects: vectorObjects,
        displayWidth,
        displayHeight,
        materialWidthIn: material.widthIn,
        materialHeightIn: material.heightIn,
        title: "Engraving Prep Tool — vector",
      });
      dlText(result.svg, "svg", "image/svg+xml;charset=utf-8");
      toast.success(describeVectorExport(result));
    });
  }, [gatedExport, vectorObjects, displayWidth, displayHeight, material, dlText]);

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

  const [referenceRailOpen, setReferenceRailOpen] = useState(defaultReferenceRailOpen);

  /**
   * Reference tools: things reached for occasionally rather than followed in
   * order, so they live in their own rail when the window is wide enough and
   * fall back into the left column when it is not. Rendered in exactly one of
   * those two places, never both.
   */
  const referencePanels = (
    <>
                  <XtoolSettingsConverterPanel />
                  {/* Templates — hidden entirely while the list is empty.
                      It is now deliberately empty: the previous contents were licensed
                      third-party design files that should not ship inside a product.
                      Add your own to `templates.ts` and this card reappears. */}
                  {ENGRAVING_TEMPLATES.length > 0 && (
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
                  )}

                  <AiComposePanel
                    currentDesignSrc={designSrc}
                    locale={locale}
                    onApply={(dataUrl) => loadDesign(dataUrl)}
                  />
    </>
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
            <Button
              variant="ghost"
              size="sm"
              data-onboarding-open
              aria-label="Show the getting started guide"
              onClick={() => {
                setGuideOpen(true);
                setOnboarding((current) => saveOnboardingState({ ...current, dismissed: false }));
              }}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Guide</span>
            </Button>
            {/* Panels toggle — moves the reference tools (templates, AI compose,
                converter) between the left column and a rail beside the canvas. */}
            <Button
              variant={referenceRailOpen ? "default" : "secondary"}
              size="sm"
              aria-pressed={referenceRailOpen}
              title={
                referenceRailOpen
                  ? "Move the reference panels back into the left column"
                  : "Move the reference panels beside the canvas"
              }
              onClick={() => setReferenceRailOpen((open) => !open)}
            >
              <LayoutTemplate className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Panels</span>
            </Button>

            {/* Import — the always-needed actions sit up here so a job never needs
                a scroll into the sidebar to bring artwork in. The file inputs stay
                where they are; these entries just drive them. */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" aria-label="Import artwork">
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Import</span>
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => vectorImportRef.current?.click()}>
                    SVG — editable paths
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => designInputRef.current?.click()}>
                    Design image
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => partInputRef.current?.click()}>
                    Part photo
                  </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

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
                <DropdownMenuItem onClick={handleExportVectorSvg} disabled={vectorObjects.length === 0}>
                  SVG — true vector (cut + engrave)
                </DropdownMenuItem>
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
        <div className={`grid min-w-0 gap-4 sm:gap-6 ${referenceRailOpen ? "grid-cols-[280px_minmax(0,1fr)_280px]" : "lg:grid-cols-[280px_1fr]"}`}>

          {/* Reference rail — rendered only when there is room for a third column.
              `order-3` places it after the canvas and the left column even though
              it is first in the DOM. */}
          {referenceRailOpen && (
            <div
              data-reference-rail
              className="flex min-w-0 w-[280px] flex-col gap-3 overflow-y-auto lg:max-h-[calc(100vh-100px)] lg:order-3"
            >
              {referencePanels}
            </div>
          )}

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
                onDoubleClick={(e) => {
                  // In node mode a double-click on the path inserts a node.
                  if (vectorNodeMode && selectedVector) {
                    insertNodeNear(getPos(e.clientX, e.clientY));
                  }
                }}
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

              {/* Clipping mask handles — the PowerClip container */}
              {design && design.mask && !warpMode && !penTraceActive && (() => {
                const mask = design.mask;
                const cx = mask.x + mask.w / 2;
                const cy = mask.y + mask.h / 2;
                const HW = 16;
                const halfHandle = HW / 2;
                const rotation = (mask.rotation * Math.PI) / 180;
                const cos = Math.cos(rotation);
                const sin = Math.sin(rotation);
                const clampCenter = (value: number, max: number) =>
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
                    left: clampCenter(point.x, displayWidth) - halfHandle,
                    top: clampCenter(point.y, displayHeight) - halfHandle,
                  };
                };

                const handles: { id: DesignResizeHandle; left: number; top: number; cursor: string }[] = [
                  { id: "nw", ...handlePoint(mask.x,           mask.y),           cursor: "nwse-resize" },
                  { id: "n",  ...handlePoint(cx,               mask.y),           cursor: "ns-resize" },
                  { id: "ne", ...handlePoint(mask.x + mask.w,  mask.y),           cursor: "nesw-resize" },
                  { id: "e",  ...handlePoint(mask.x + mask.w,  cy),               cursor: "ew-resize" },
                  { id: "se", ...handlePoint(mask.x + mask.w,  mask.y + mask.h),  cursor: "nwse-resize" },
                  { id: "s",  ...handlePoint(cx,               mask.y + mask.h),  cursor: "ns-resize" },
                  { id: "sw", ...handlePoint(mask.x,           mask.y + mask.h),  cursor: "nesw-resize" },
                  { id: "w",  ...handlePoint(mask.x,           cy),               cursor: "ew-resize" },
                ];

                return (
                  <>
                    {/* Mask boundary */}
                    <div
                      className="absolute z-40 pointer-events-none"
                      style={{
                        left: mask.x, top: mask.y,
                        width: mask.w, height: mask.h,
                        border: "2px dashed rgba(34,211,238,0.95)",
                        boxSizing: "border-box",
                        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.9), 0 0 0 1px rgba(255,255,255,0.7)",
                        transform: `rotate(${mask.rotation}deg)`,
                        transformOrigin: "center",
                      }}
                    />

                    {/* Drag tag — moving the mask is separate from the design underneath */}
                    <div
                      data-engraving-mask-move
                      aria-label="Move mask"
                      className="absolute z-[75] flex items-center gap-1 rounded-full bg-cyan-400 px-2 py-0.5 text-[10px] font-semibold text-slate-950 shadow-[0_0_0_2px_rgba(15,23,42,0.9),0_2px_8px_rgba(0,0,0,0.5)] whitespace-nowrap"
                      style={{
                        left: Math.max(0, Math.min(mask.x, displayWidth - 90)),
                        top: Math.max(0, mask.y - 22),
                        cursor: "move",
                        touchAction: "none",
                      }}
                      onPointerDown={(e) => handleMaskPointerDown(e, "move")}
                    >
                      <Move className="h-3 w-3" />
                      {getMaskShape(mask.shapeId).name}
                    </div>

                    {handles.map((h) => (
                      <div
                        key={h.id}
                        data-engraving-mask-handle={h.id}
                        aria-label={`Resize mask ${h.id}`}
                        className="absolute z-[70] box-border rounded-full border-[3px] border-cyan-400 bg-white shadow-[0_0_0_2px_rgba(15,23,42,0.9),0_0_0_4px_rgba(255,255,255,0.65),0_3px_10px_rgba(0,0,0,0.55)]"
                        style={{
                          left: h.left, top: h.top,
                          width: HW, height: HW,
                          cursor: h.cursor,
                          touchAction: "none",
                        }}
                        onPointerDown={(e) => handleMaskPointerDown(e, h.id)}
                      />
                    ))}
                  </>
                );
              })()}

              {/* Vector layer — selection box, scale handles and in-progress path */}
              {(() => {
                const draftBox = vectorShapeDraft
                  ? dragBox(vectorShapeDraft.start, vectorShapeDraft.current, vectorShapeDraft.square)
                  : null;
                // Node editing replaces the scale box with its own overlay.
                const bounds = selectedVector && !vectorNodeMode ? objectBounds(selectedVector) : null;
                if (!bounds && vectorDraft.length === 0 && !draftBox) return null;

                const HANDLE = 14;
                const corners = ["nw", "ne", "sw", "se"] as const;

                return (
                  <>
                    {bounds && (
                      <>
                        <div
                          className="absolute z-40 pointer-events-none"
                          style={{
                            left: bounds.x, top: bounds.y,
                            width: bounds.w, height: bounds.h,
                            border: "1.5px dashed rgba(34,197,94,0.95)",
                            boxSizing: "border-box",
                            boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.8), 0 0 0 1px rgba(255,255,255,0.5)",
                          }}
                        />
                        {corners.map((corner) => (
                          <div
                            key={corner}
                            data-engraving-vector-handle={corner}
                            aria-label={`Scale vector object ${corner}`}
                            className="absolute z-[72] box-border rounded-[3px] border-2 border-green-500 bg-white shadow-[0_0_0_2px_rgba(15,23,42,0.85)] cursor-nwse-resize"
                            style={{
                              left: (corner.includes("w") ? bounds.x : bounds.x + bounds.w) - HANDLE / 2,
                              top: (corner.includes("n") ? bounds.y : bounds.y + bounds.h) - HANDLE / 2,
                              width: HANDLE,
                              height: HANDLE,
                              touchAction: "none",
                            }}
                            onPointerDown={(e) => handleVectorScalePointerDown(e, corner)}
                          />
                        ))}
                      </>
                    )}

                    {/* Pen progress: committed points plus a rubber-band preview */}
                    {vectorDraft.length > 0 && (
                      <svg className="absolute inset-0 z-[65] h-full w-full pointer-events-none">
                        <polyline
                          points={[...vectorDraft, ...(vectorHover ? [vectorHover] : [])]
                            .map((point) => `${point.x},${point.y}`)
                            .join(" ")}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                        />
                        {vectorDraft.map((point, index) => (
                          <circle
                            key={index}
                            cx={point.x}
                            cy={point.y}
                            r={4}
                            fill={index === 0 ? "#22c55e" : "#facc15"}
                            stroke="#0f172a"
                            strokeWidth={1.5}
                          />
                        ))}
                      </svg>
                    )}

                    {draftBox && (
                      <div
                        className="absolute z-[65] pointer-events-none border-2 border-dashed border-red-500/90 bg-red-500/10"
                        style={{
                          left: draftBox.x, top: draftBox.y,
                          width: draftBox.w, height: draftBox.h,
                        }}
                      />
                    )}
                  </>
                );
              })()}

              {/* Node editing — anchors and bezier handles */}
              {selectedVector && vectorNodeMode && (
                <>
                  <svg className="absolute inset-0 z-[68] h-full w-full pointer-events-none">
                    {selectedVector.subpaths.flatMap((subpath, subpathIndex) =>
                      subpath.anchors.flatMap((anchor, anchorIndex) => {
                        const isSelected =
                          selectedNode?.subpath === subpathIndex &&
                          selectedNode?.anchor === anchorIndex;
                        if (!isSelected) return [];

                        return (["in", "out"] as const)
                          .filter((which) => anchor[which])
                          .map((which) => {
                            const handle = anchor[which];
                            if (!handle) return null;
                            return (
                              <line
                                key={`${subpathIndex}-${anchorIndex}-${which}`}
                                x1={anchor.x}
                                y1={anchor.y}
                                x2={handle.x}
                                y2={handle.y}
                                stroke="#22d3ee"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                              />
                            );
                          });
                      })
                    )}
                  </svg>

                  {selectedVector.subpaths.map((subpath, subpathIndex) =>
                    subpath.anchors.map((anchor, anchorIndex) => {
                      const isSelected =
                        selectedNode?.subpath === subpathIndex &&
                        selectedNode?.anchor === anchorIndex;
                      const handleKinds = isSelected
                        ? (["in", "out"] as const).filter((which) => anchor[which])
                        : [];

                      return (
                        <div key={`${subpathIndex}-${anchorIndex}`}>
                          <div
                            data-engraving-node={`${subpathIndex}-${anchorIndex}`}
                            aria-label={`Node ${subpathIndex}-${anchorIndex}`}
                            className={`absolute z-[73] box-border rounded-[2px] border-2 ${
                              isSelected ? "border-cyan-400 bg-cyan-200" : "border-sky-500 bg-white"
                            } shadow-[0_0_0_2px_rgba(15,23,42,0.85)]`}
                            style={{
                              left: anchor.x - 5,
                              top: anchor.y - 5,
                              width: 10,
                              height: 10,
                              cursor: "move",
                              touchAction: "none",
                            }}
                            onPointerDown={(e) => handleNodePointerDown(e, subpathIndex, anchorIndex)}
                          />
                          {handleKinds.map((which) => {
                            const handle = anchor[which];
                            if (!handle) return null;
                            return (
                              <div
                                key={which}
                                data-engraving-node-handle={`${subpathIndex}-${anchorIndex}-${which}`}
                                aria-label={`Handle ${which}`}
                                className="absolute z-[74] box-border rounded-full border-2 border-cyan-400 bg-white shadow-[0_0_0_2px_rgba(15,23,42,0.85)]"
                                style={{
                                  left: handle.x - 5,
                                  top: handle.y - 5,
                                  width: 10,
                                  height: 10,
                                  cursor: "crosshair",
                                  touchAction: "none",
                                }}
                                onPointerDown={(e) =>
                                  handleNodeHandlePointerDown(e, subpathIndex, anchorIndex, which)
                                }
                              />
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </>
              )}

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

              {!partPhoto &&
                !design &&
                penTracePoints.length === 0 &&
                vectorObjects.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                    <ImageIcon className="h-10 w-10 mb-3 opacity-25" />
                    <p className="text-sm font-medium text-center px-4">
                      {isDropHover ? t("canvas.dropActive") : t("canvas.dropHint")}
                    </p>
                    <p className="text-xs mt-1 opacity-50">{t("canvas.addDesignHint")}</p>

                    {/* Give a new operator the three usual starting points. */}
                    <div className="pointer-events-auto mt-4 flex flex-wrap items-center justify-center gap-2 px-4">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        data-empty-action="upload"
                        onClick={() => designInputRef.current?.click()}
                      >
                        Upload artwork
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        data-empty-action="template"
                        onClick={() =>
                          document
                            .getElementById("onboarding-artwork")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        Browse templates
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        data-empty-action="marking"
                        onClick={() => focusOnboardingStep("marking")}
                      >
                        Add a marking
                      </Button>
                    </div>
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

          {/* Sidebar.
              `min-w-0` matters: a grid track sized `280px` still has an automatic
              minimum, so a wide descendant (a `<select>` sizes to its longest
              option) silently widens this column past its stated width and starves
              the canvas column beside it. */}
          <div className="space-y-3 min-w-0 order-2 lg:order-1 lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:pr-1">

            {guideOpen && (
              <div
                data-onboarding-guide
                className="rounded-lg border border-primary/40 bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Get started
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {onboardingTotals.complete
                        ? "Every step is done — hide this whenever you like."
                        : `${onboardingTotals.done} of ${onboardingTotals.total} steps done`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    data-onboarding-dismiss
                    onClick={dismissGuide}
                  >
                    Hide
                  </Button>
                </div>

                <div className="space-y-1.5">
                  {onboardingStepStates.map(({ step, done, current }) => (
                    <button
                      key={step.id}
                      type="button"
                      data-onboarding-step={step.id}
                      onClick={() => focusOnboardingStep(step.id)}
                      className={`w-full text-left rounded-md border px-2 py-1.5 transition-colors cursor-pointer ${
                        current ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/60"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold shrink-0 ${
                            done ? "bg-primary/25 text-primary" : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {done ? "✓" : step.number}
                        </span>
                        <span
                          className={`text-[11px] ${
                            done ? "text-muted-foreground" : "font-medium"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                      {current && (
                        <>
                          <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                            {step.hint}
                          </p>
                          {step.id === "marking" && markingBlockedByShop(onboardingSignals) && (
                            <p className="text-[10px] text-amber-200 mt-1 leading-snug">
                              Shop details are needed first — click here to set them.
                            </p>
                          )}
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1: Material */}
            <div
              id="onboarding-material"
              className="rounded-lg border border-border bg-card p-4 space-y-3"
            >
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
            <div
              id="onboarding-artwork"
              className="rounded-lg border border-border bg-card p-4 space-y-3"
            >
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


            {/* Reference tools live in their own rail when there is room; without
                that room they stay here, at the end of the ordered workflow. */}
            {!referenceRailOpen && referencePanels}

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
                    <TabsTrigger value="mask" className="flex-1 text-xs">{t("panel.mask.tab")}</TabsTrigger>
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

                  {/* Clipping mask tab — clip the art into a shape (PowerClip) */}
                  <TabsContent value="mask" className="space-y-4 pt-2">
                    <p className="text-[10px] text-muted-foreground opacity-70">
                      {t("panel.mask.hint")}
                    </p>

                    {MASK_SHAPE_GROUPS.map((group) => (
                      <div key={group.id} className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {group.shapes.map((shape) => {
                            const active = design.mask?.shapeId === shape.id;
                            return (
                              <button
                                key={shape.id}
                                type="button"
                                title={shape.name}
                                aria-label={shape.name}
                                aria-pressed={active}
                                data-mask-shape={shape.id}
                                onClick={() => applyMaskShape(shape.id)}
                                className={`flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors cursor-pointer ${
                                  active
                                    ? "border-primary bg-primary/10"
                                    : "border-border hover:border-primary/60 hover:bg-secondary/60"
                                }`}
                              >
                                <svg
                                  viewBox={`0 0 ${shape.boxW} ${shape.boxH}`}
                                  className="h-5 w-full"
                                  aria-hidden="true"
                                >
                                  <path
                                    d={shape.path}
                                    fillRule={shape.fillRule}
                                    className={active ? "fill-primary" : "fill-muted-foreground"}
                                  />
                                </svg>
                                <span className="text-[8px] leading-tight text-muted-foreground text-center line-clamp-2">
                                  {shape.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {design.mask ? (
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between rounded-md bg-secondary/50 px-2.5 py-2">
                          <span className="text-xs flex items-center gap-1.5">
                            <Frame className="h-3 w-3 text-cyan-400" />
                            {getMaskShape(design.mask.shapeId).name}
                          </span>
                          <span className="text-[10px] text-cyan-400 font-medium">
                            {t("panel.mask.active")}
                          </span>
                        </div>

                        <label className="flex items-center justify-between gap-2 cursor-pointer">
                          <span className="text-xs text-muted-foreground">{t("panel.mask.lockAspect")}</span>
                          <Switch
                            checked={design.mask.lockAspect}
                            onCheckedChange={(checked) =>
                              commitMaskUpdate((mask) => ({ ...mask, lockAspect: checked }))
                            }
                          />
                        </label>

                        {getMaskShape(design.mask.shapeId).supportsCornerRadius && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">{t("panel.mask.cornerRadius")}</span>
                              <span className="text-xs font-mono">{Math.round(design.mask.cornerRadius * 100)}%</span>
                            </div>
                            <Slider
                              value={[design.mask.cornerRadius * 100]}
                              min={0} max={100} step={1}
                              onValueChange={([v]) => updateMaskContinuously((mask) => ({ ...mask, cornerRadius: v / 100 }))}
                              onValueCommit={([v]) => commitMaskUpdate((mask) => ({ ...mask, cornerRadius: v / 100 }))}
                            />
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{t("panel.mask.feather")}</span>
                            <span className="text-xs font-mono">{design.mask.feather}</span>
                          </div>
                          <Slider
                            value={[design.mask.feather]}
                            min={0} max={100} step={1}
                            onValueChange={([v]) => updateMaskContinuously((mask) => ({ ...mask, feather: v }))}
                            onValueCommit={([v]) => commitMaskUpdate((mask) => ({ ...mask, feather: v }))}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{t("panel.mask.rotation")}</span>
                            <span className="text-xs font-mono">{Math.round(design.mask.rotation)}°</span>
                          </div>
                          <Slider
                            value={[design.mask.rotation]}
                            min={0} max={360} step={1}
                            onValueChange={([v]) => updateMaskContinuously((mask) => ({ ...mask, rotation: v }))}
                            onValueCommit={([v]) => commitMaskUpdate((mask) => ({ ...mask, rotation: v }))}
                          />
                        </div>

                        <label className="flex items-center justify-between gap-2 cursor-pointer">
                          <span className="text-xs text-muted-foreground">{t("panel.mask.invert")}</span>
                          <Switch
                            checked={design.mask.invert}
                            onCheckedChange={(checked) =>
                              commitMaskUpdate((mask) => ({ ...mask, invert: checked }))
                            }
                          />
                        </label>

                        <div className="flex gap-1.5">
                          <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => fitMask("design")}>
                            {t("panel.mask.fitDesign")}
                          </Button>
                          <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => fitMask("material")}>
                            {t("panel.mask.fitMaterial")}
                          </Button>
                          <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={centerMask}>
                            {t("panel.mask.center")}
                          </Button>
                        </div>

                        <Button variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={removeMask}>
                          <Trash2 className="mr-1 h-3 w-3" /> {t("panel.mask.remove")}
                        </Button>

                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          {t("panel.mask.dragHint")}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground opacity-70">
                        {t("panel.mask.none")}
                      </p>
                    )}
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

            {/* Licence status — exports ask the server before running */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Licence
                </Label>
                <span className="text-[10px] font-medium" data-license-status>
                  {licenseStatus
                    ? (ACCOUNT_PLAN_LABELS[licenseStatus.plan] ?? entitlementLabel(entitlement))
                    : entitlementLabel(entitlement)}
                </span>
              </div>

              {/* Only offer key entry when the account is genuinely unlicensed.
                  Requiring a key because this client has no cached token made an
                  already-paid account look like it needed activating. */}
              {!isEntitlementValid(entitlement) &&
                (!licenseStatus || licenseStatus.plan === "free") && (
                <div className="space-y-1.5">
                  <Input
                    value={licenseKeyInput}
                    onChange={(event) => setLicenseKeyInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void activateLicence();
                      }
                    }}
                    placeholder="PGS1.…"
                    data-license-input
                    className="h-7 text-xs font-mono"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full h-7 text-xs"
                    data-license-activate
                    disabled={licenseBusy || licenseKeyInput.trim().length === 0}
                    onClick={() => void activateLicence()}
                  >
                    {licenseBusy ? "Activating…" : "Activate licence"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    The free plan includes a monthly export allowance. A licence lifts the export
                    limit and keeps the app working offline.
                  </p>
                </div>
              )}

              {licenseStatus && licenseStatus.plan !== "free" && (
                <div className="space-y-1.5" data-license-details>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Exports</span>
                    <span className="font-mono">
                      {licenseStatus.exportsRemaining === null
                        ? "unlimited"
                        : `${licenseStatus.exportsRemaining} left this month`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">AI requests</span>
                    <span className="font-mono">
                      {licenseStatus.aiRemaining} of {licenseStatus.aiLimit} left today
                    </span>
                  </div>

                  <div
                    className="rounded-md bg-secondary/60 px-2 py-1.5 space-y-1.5"
                    data-license-renewal
                  >
                    <p className="text-[10px] leading-snug">
                      {licenseStatus.renewalCancelled
                        ? "Renewal is cancelled. Your licence stays active until the current term ends."
                        : "This licence renews automatically."}
                    </p>

                    {confirmingCancel ? (
                      <div className="flex gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 h-6 text-[10px]"
                          data-license-cancel-confirm
                          disabled={renewalBusy}
                          onClick={() => void changeRenewal(true)}
                        >
                          {renewalBusy ? "Cancelling…" : "Yes, cancel renewal"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={() => setConfirmingCancel(false)}
                        >
                          Keep it
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-6 text-[10px]"
                        data-license-cancel
                        disabled={renewalBusy}
                        onClick={() =>
                          licenseStatus.renewalCancelled
                            ? void changeRenewal(false)
                            : setConfirmingCancel(true)
                        }
                      >
                        {licenseStatus.renewalCancelled ? "Resume renewal" : "Cancel renewal"}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                <a className="text-primary hover:underline" href="/terms">
                  Terms
                </a>
                {" · "}
                <a className="text-primary hover:underline" href="/privacy">
                  Privacy
                </a>
                {" · "}
                <a className="text-primary hover:underline" href="/refunds">
                  Refunds &amp; support
                </a>
              </p>
            </div>

            {/* Vector authoring — draw artwork from scratch */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Vector Artwork
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {vectorObjects.length} object{vectorObjects.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {VECTOR_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const active = vectorTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      title={tool.hint}
                      aria-label={tool.label}
                      aria-pressed={active}
                      data-vector-tool={tool.id}
                      onClick={() => {
                        setVectorTool(tool.id);
                        setVectorDraft([]);
                        setVectorHover(null);
                      }}
                      className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 transition-colors cursor-pointer ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/60 hover:bg-secondary/60"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[9px] leading-none">{tool.label}</span>
                    </button>
                  );
                })}
              </div>

              {VECTOR_TOOLS.find((tool) => tool.id === vectorTool) && vectorTool !== "select" && (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {VECTOR_TOOLS.find((tool) => tool.id === vectorTool)?.hint}
                </p>
              )}

              {(vectorTool === "pen" || vectorTool === "line") && vectorDraft.length > 0 && (
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" className="flex-1 h-7 text-xs" onClick={() => finishVectorDraft(false)}>
                    Finish path ({vectorDraft.length})
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1 h-7 text-xs" onClick={() => finishVectorDraft(true)} disabled={vectorDraft.length < 3}>
                    Close path
                  </Button>
                </div>
              )}

              <div className="rounded-md bg-secondary/50 px-2.5 py-2">
                <p className="text-[10px] text-muted-foreground">True-vector SVG at actual size</p>
                <p className="text-[11px] font-medium">{describeVectorExport(vectorExport)}</p>
              </div>

              {vectorObjects.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {vectorObjects.map((object) => {
                    const active = selectedVectorIds.includes(object.id);
                    const primary = selectedVectorId === object.id;
                    return (
                      <div
                        key={object.id}
                        data-vector-object={object.id}
                        data-vector-selected={active ? "true" : "false"}
                        className={`rounded-md border px-2 py-1.5 space-y-1.5 cursor-pointer ${
                          active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/50"
                        }`}
                        onClick={(event) => {
                          // Shift (or cmd/ctrl) click adds to the selection so
                          // shapes can be combined.
                          if (event.shiftKey || event.metaKey || event.ctrlKey) {
                            setSelectedVectorIds((current) =>
                              current.includes(object.id)
                                ? current.filter((id) => id !== object.id)
                                : [...current, object.id]
                            );
                            return;
                          }
                          setSelectedVectorId(object.id);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] truncate flex-1">{object.name}</span>
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ color: MODE_INFO[object.mode].stroke, backgroundColor: "rgba(127,127,127,0.15)" }}
                          >
                            {MODE_INFO[object.mode].label}
                          </span>
                          <button
                            type="button"
                            aria-label={`Delete ${object.name}`}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteVectorObject(object.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {primary && (
                          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                            <div className="grid grid-cols-3 gap-1">
                              {(["engrave", "score", "cut"] as VectorMode[]).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  data-vector-mode={mode}
                                  aria-pressed={object.mode === mode}
                                  onClick={() => setVectorMode(object.id, mode)}
                                  className={`rounded border px-1 py-1 text-[9px] cursor-pointer ${
                                    object.mode === mode
                                      ? "border-primary bg-primary/15 text-primary"
                                      : "border-border text-muted-foreground hover:bg-secondary/60"
                                  }`}
                                >
                                  {MODE_INFO[mode].label}
                                </button>
                              ))}
                            </div>

                            {object.mode !== "engrave" && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">Line weight</span>
                                  <span className="text-[10px] font-mono">{object.strokeWidth.toFixed(1)} px</span>
                                </div>
                                <Slider
                                  value={[object.strokeWidth]}
                                  min={0.5}
                                  max={8}
                                  step={0.5}
                                  onValueChange={([value]) => setVectorStrokeWidth(object.id, value, false)}
                                  onValueCommit={() => commitVectorChange()}
                                />
                              </div>
                            )}

                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1 h-6 text-[10px]"
                                onClick={() => rotateVectorObject(object.id, 90)}
                              >
                                <RotateCw className="mr-1 h-3 w-3" /> 90°
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1 h-6 text-[10px]"
                                onClick={() => deleteVectorObject(object.id)}
                              >
                                <Trash2 className="mr-1 h-3 w-3" /> Delete
                              </Button>
                            </div>

                            <div className="flex gap-1">
                              <Button
                                variant={vectorNodeMode ? "secondary" : "ghost"}
                                size="sm"
                                className="flex-1 h-6 text-[10px]"
                                data-vector-node-mode
                                onClick={() => {
                                  setVectorNodeMode((current) => !current);
                                  setSelectedNode(null);
                                }}
                              >
                                <PenTool className="mr-1 h-3 w-3" />
                                {vectorNodeMode ? "Done editing" : "Edit nodes"}
                              </Button>
                            </div>

                            {vectorNodeMode && (
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground leading-relaxed">
                                  Drag the blue squares to reshape. Click a node to reveal its handles.
                                  Double-click the path to add a node, Delete to remove one.
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full h-6 text-[10px]"
                                  onClick={deleteSelectedNode}
                                  disabled={!selectedNode}
                                >
                                  <Trash2 className="mr-1 h-3 w-3" /> Delete selected node
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedVectorIds.length >= 2 && (
                <div className="space-y-1.5 rounded-md border border-primary/40 bg-primary/5 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Combine {selectedVectorIds.length} shapes
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      ["union", "Unite"],
                      ["difference", "Subtract"],
                      ["intersection", "Intersect"],
                      ["exclude", "Exclude"],
                    ] as const).map(([op, label]) => (
                      <Button
                        key={op}
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        data-vector-boolean={op}
                        onClick={() => applyBoolean(op)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Shapes combine in selection order; the first one keeps the result.
                  </p>
                </div>
              )}

              {selectedVectorIds.length === 1 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Offset path
                    </span>
                    <span className="text-[10px] font-mono">
                      {offsetAmount} {unit}
                    </span>
                  </div>
                  <Slider
                    value={[offsetAmount]}
                    min={0.005}
                    max={unit === "in" ? 0.25 : 6}
                    step={unit === "in" ? 0.005 : 0.25}
                    onValueChange={([value]) => setOffsetAmount(value)}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      data-vector-offset="out"
                      onClick={() => applyOffset(unitToDisplayPx(Math.abs(offsetAmount)))}
                    >
                      Grow
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      data-vector-offset="in"
                      onClick={() => applyOffset(-unitToDisplayPx(Math.abs(offsetAmount)))}
                    >
                      Shrink
                    </Button>
                  </div>
                </div>
              )}

              <div id="onboarding-marking" className="space-y-1.5 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                      5
                    </span>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      FFL / NFA Marking
                    </p>
                  </div>
                  <button
                    type="button"
                    data-shop-toggle
                    onClick={() => {
                      setShopDraft(shopProfile);
                      setShopSetupOpen((open) => !open);
                    }}
                    className="text-[10px] text-primary hover:underline cursor-pointer"
                  >
                    {shopSetupOpen ? "Close" : "Shop details"}
                  </button>
                </div>

                {shopSetupOpen && (
                  <div
                    data-shop-setup
                    className="space-y-1.5 rounded-md border border-primary/40 bg-primary/5 p-2"
                  >
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Saved once and reused on every marking, so jobs start with the correct licensed
                      details.
                    </p>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground">Shop / licensed name</span>
                      <Input
                        value={shopDraft.maker}
                        onChange={(event) =>
                          setShopDraft((current) => ({ ...current, maker: event.target.value }))
                        }
                        data-shop-field="maker"
                        className="h-7 text-xs"
                        placeholder="PETES GUNS AND STUFF LLC"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">City</span>
                        <Input
                          value={shopDraft.city}
                          onChange={(event) =>
                            setShopDraft((current) => ({ ...current, city: event.target.value }))
                          }
                          data-shop-field="city"
                          className="h-7 text-xs"
                          placeholder="HENDERSON"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">State</span>
                        <Input
                          value={shopDraft.state}
                          onChange={(event) =>
                            setShopDraft((current) => ({ ...current, state: event.target.value }))
                          }
                          data-shop-field="state"
                          className="h-7 text-xs"
                          placeholder="TX"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Default height</span>
                      <span className="text-[10px] font-mono">
                        {shopDraft.defaultMarkingHeightIn.toFixed(4)} in
                      </span>
                    </div>
                    <Slider
                      value={[shopDraft.defaultMarkingHeightIn]}
                      min={0.02}
                      max={0.25}
                      step={0.0025}
                      onValueChange={([value]) =>
                        setShopDraft((current) => ({ ...current, defaultMarkingHeightIn: value }))
                      }
                    />
                    <div className="flex gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        data-shop-save
                        onClick={() => commitShopProfile(shopDraft, { complete: true })}
                      >
                        Save shop details
                      </Button>
                      {shopProfile.onboarded && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setShopSetupOpen(false)}
                        >
                          Cancel
                        </Button>
                      )}
                      {!shopProfile.onboarded && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          data-shop-skip
                          onClick={() => setShopSetupOpen(false)}
                        >
                          Later
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {!shopProfile.onboarded && !shopSetupOpen && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] leading-snug text-amber-200">
                    Shop details are not set, so the marking tool cannot fill in the licensed name and
                    city/state for you.
                  </p>
                )}
                {shopProfile.onboarded && !isProfileComplete(shopProfile) && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] leading-snug text-amber-200">
                    Shop details are incomplete — add the licensed name, city and state.
                  </p>
                )}
                <select
                  value={markingPresetId}
                  onChange={(event) => applyMarkingPreset(event.target.value)}
                  aria-label="Marking preset"
                  data-marking-preset
                  className="h-8 w-full rounded-md border border-border bg-secondary px-2 text-xs"
                >
                  {MARKING_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {MARKING_PRESETS.find((preset) => preset.id === markingPresetId)?.description}
                </p>

                {(Object.keys(MARKING_LINE_LABELS) as MarkingLineKey[]).map((key) => (
                  <div key={key} className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {MARKING_LINE_LABELS[key]}
                    </span>
                    <Input
                      value={markingFields[key]}
                      onChange={(event) =>
                        setMarkingFields((current) => ({ ...current, [key]: event.target.value }))
                      }
                      data-marking-field={key}
                      className="h-7 text-xs"
                      placeholder={key === "serial" ? "ABC123" : ""}
                    />
                  </div>
                ))}

                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <select
                    value={markingFont}
                    onChange={(event) => setMarkingFont(event.target.value)}
                    aria-label="Marking font"
                    className="h-7 rounded-md border border-border bg-secondary px-2 text-xs"
                  >
                    {TEXT_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted-foreground self-center">
                    {markingLines.length} line{markingLines.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Character height</span>
                  <span className="text-[10px] font-mono">{markingHeightIn.toFixed(4)} in</span>
                </div>
                <Slider
                  value={[markingHeightIn]}
                  min={0.02}
                  max={0.25}
                  step={0.0025}
                  onValueChange={([value]) => setMarkingHeightIn(value)}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Line spacing</span>
                  <span className="text-[10px] font-mono">{markingGapIn.toFixed(3)} in</span>
                </div>
                <Slider
                  value={[markingGapIn]}
                  min={0}
                  max={0.1}
                  step={0.005}
                  onValueChange={([value]) => setMarkingGapIn(value)}
                />

                {markingIssues.length > 0 && (
                  <ul className="space-y-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                    {markingIssues.map((issue) => (
                      <li key={issue} className="text-[10px] leading-snug text-amber-200">
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full h-8 text-xs"
                  data-marking-add
                  onClick={addMarkingBlock}
                >
                  Add marking block
                </Button>

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Layout tool only, not legal advice. Verify the applicable rules (for example
                  27 CFR 478.92 and 479.102) — required text, minimum character height, depth and
                  placement. Defaults assume a minimum of{" "}
                  {TYPICAL_MIN_TEXT_HEIGHT_IN.toFixed(4)} in character height and{" "}
                  {TYPICAL_MIN_DEPTH_IN.toFixed(3)} in depth. Measure a test mark before cutting a
                  finished part.
                </p>
              </div>

              <div className="space-y-1.5 border-t border-border/60 pt-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Text
                </p>
                <Input
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTextOutlines();
                    }
                  }}
                  placeholder="COLORADO"
                  className="h-8 text-sm"
                  data-vector-text
                />
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <select
                    value={textFont}
                    onChange={(e) => setTextFont(e.target.value)}
                    aria-label="Text font"
                    data-vector-text-font
                    className="h-8 rounded-md border border-border bg-secondary px-2 text-xs"
                  >
                    {TEXT_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant={textBold ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 w-9 text-xs font-bold"
                    aria-pressed={textBold}
                    onClick={() => setTextBold((current) => !current)}
                  >
                    B
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Height</span>
                  <span className="text-[10px] font-mono">
                    {textSize} {unit}
                  </span>
                </div>
                <Slider
                  value={[textSize]}
                  min={unit === "in" ? 0.05 : 1}
                  max={unit === "in" ? 2 : 50}
                  step={unit === "in" ? 0.01 : 0.5}
                  onValueChange={([value]) => setTextSize(value)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full h-8 text-xs"
                  data-vector-text-add
                  onClick={addTextOutlines}
                >
                  <Type className="mr-1 h-3 w-3" /> Add as outlines
                </Button>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Type is converted to paths, so the laser never needs the font.
                </p>
              </div>

              <input
                ref={vectorImportRef}
                type="file"
                accept=".svg,image/svg+xml"
                onChange={handleVectorImport}
                className="hidden"
                data-vector-import
              />
              <Button
                variant="secondary"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => vectorImportRef.current?.click()}
              >
                <Upload className="mr-1 h-3 w-3" /> Import SVG as editable paths
              </Button>

              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={clearVectorObjects}
                  disabled={vectorObjects.length === 0}
                >
                  Clear all
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleExportVectorSvg}
                  disabled={vectorObjects.length === 0}
                >
                  <Download className="mr-1 h-3 w-3" /> Vector SVG
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Draw shapes or paths, then choose how the laser treats each one: engrave (filled),
                score or cut (stroked). Shift-click shapes to select several and combine them.
                Vector art exports as real paths at actual size, so the MOPA can vector-mark and
                the diode can cut from one file.
              </p>
            </div>

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
