import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Input } from "@/components/ui/input.tsx";
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
  ImageIcon,
  Layers,
  Ruler,
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
import TraceVectorize from "./trace-vectorize.tsx";
import { ScanLine, Crop, Wand2, Eraser, Frame } from "lucide-react";
import { toast } from "sonner";
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

// --- Types ---

type ImageFilters = {
  brightness: number; // 0–200 (100 = normal)
  contrast: number;   // 0–200 (100 = normal)
  grayscale: number;  // 0–100
  invert: number;     // 0–100
};

type Pt = { x: number; y: number };

// A pin on an edge, t=0..1 is position along that edge between its two corners
type EdgePin = { id: string; t: number; offset: Pt }; // offset = how far this pin has been dragged from its natural position on the straight edge

type WarpMesh = {
  tl: Pt; tr: Pt; bl: Pt; br: Pt;         // corners — always present
  top:    EdgePin[];   // pins along top edge (tl→tr), sorted by t
  bottom: EdgePin[];   // pins along bottom edge (bl→br), sorted by t
  left:   EdgePin[];   // pins along left edge (tl→bl), sorted by t
  right:  EdgePin[];   // pins along right edge (tr→br), sorted by t
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
function meshPt(mesh: WarpMesh, s: number, t: number): Pt {
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
    let revoked = false;
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const typed = new Blob([blob], { type: "image/svg+xml" });
        const ou = URL.createObjectURL(typed);
        if (!revoked) setObjectUrl(ou);
      })
      .catch(() => { if (!revoked) setFailed(true); });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const [cropOpen, setCropOpen] = useState(false);
  const [cropPartOpen, setCropPartOpen] = useState(false);
  const [bgRemoving, setBgRemoving] = useState(false);
  const [cornerRadius, setCornerRadius] = useState(10);
  const [roundingProcessing, setRoundingProcessing] = useState(false);
  const [eraserActive, setEraserActive] = useState(false);
  const [eraserSize, setEraserSize] = useState(30); // brush radius in display pixels
  const eraserMaskRef = useRef<HTMLCanvasElement | null>(null);
  const [warpMode, setWarpMode] = useState(false);
  const isErasingRef = useRef(false);
  const [partPhoto, setPartPhoto] = useState<HTMLImageElement | null>(null);
  // Images are NOT restored from localStorage — start fresh each session
  const [partPhotoSrc, setPartPhotoSrc] = useState<string | null>(null);
  const [designSrc, setDesignSrc] = useState<string | null>(null);
  const [partRotation, setPartRotation] = useState(0); // degrees
  const [design, setDesign] = useState<ImageState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDropHover, setIsDropHover] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
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

  const pushHistory = useCallback((state: ImageState) => {
    if (skipHistoryRef.current) return;
    // Drop any future states if we're mid-history
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(state);
    historyIndexRef.current = historyRef.current.length - 1;
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
    setDesign(historyRef.current[historyIndexRef.current]);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    skipHistoryRef.current = true;
    setDesign(historyRef.current[historyIndexRef.current]);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

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
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Storage quota exceeded — silently ignore
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

  // Track design changes into history
  useEffect(() => {
    if (!design) return;
    if (skipHistoryRef.current) {
      // This change came from undo/redo — clear the flag and don't push
      skipHistoryRef.current = false;
      return;
    }
    pushHistory(design);
    updateUndoRedoState();
  }, [design, pushHistory, updateUndoRedoState]);

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
  const maxW = Math.min(containerWidth - 8, 820);
  const maxH = Math.min(window.innerHeight * 0.58, 520);
  const materialRatio = material.widthIn / material.heightIn;

  let displayWidth: number;
  let displayHeight: number;

  if (resizeMode && manualDisplaySize) {
    displayWidth = Math.max(manualDisplaySize.w, 80);
    displayHeight = Math.max(manualDisplaySize.h, 80);
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

      ctx.save();
      ctx.globalAlpha = design.opacity;
      ctx.translate(cx, cy);
      ctx.rotate((design.rotation * Math.PI) / 180);
      if (design.flipH) ctx.scale(-1, 1);
      if (design.flipV) ctx.scale(1, -1);

      // Apply filters via offscreen canvas
      const filtered = applyFiltersToCanvas(design.element, design.filters, imgW, imgH, eraserMaskRef.current);

      if (design.warpMesh) {
        ctx.restore();
        drawWarpedImage(ctx, filtered, design.warpMesh, design.opacity);
      } else {
        ctx.drawImage(filtered, -imgW / 2, -imgH / 2, imgW, imgH);
        ctx.restore();
      }
    }

  }, [partPhoto, partRotation, design, displayWidth, displayHeight, material, unit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    draw();
    drawExternalRulers();
  }, [displayWidth, displayHeight, draw]);

  useEffect(() => {
    draw();
    drawExternalRulers();
  }, [draw]);

  // --- External ruler drawing (drawn on dedicated canvases outside the workspace) ---
  const RULER_THICKNESS = 20;

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



  // --- File loading ---
  const loadPartPhoto = useCallback((src: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPartPhoto(img);
    img.src = src;
    setPartPhotoSrc(src);
  }, []);

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
        img.src = imgSrc;
      };

      if (src.startsWith("data:") || src.startsWith("blob:")) {
        // Local file (drag & drop or file picker) — load directly
        applyImg(src);
      } else {
        // Remote URL (template CDN) — all templates are SVGs
        fetch(src)
          .then((r) => r.blob())
          .then((blob) => {
            const typed = new Blob([blob], { type: "image/svg+xml" });
            const objectUrl = URL.createObjectURL(typed);
            applyImg(objectUrl);
          })
          .catch(() => {});
      }
      setDesignSrc(src);
    },
    [displayWidth, displayHeight, material, unit]
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

  const readFile = (file: File, onLoad: (src: string) => void) => {
    const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
    if (!file.type.startsWith("image/") && !isSvg) return;
    const reader = new FileReader();
    reader.onload = (ev) => onLoad(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePartUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file, loadPartPhoto);
    },
    [loadPartPhoto]
  );

  const handleDesignUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file, loadDesign);
    },
    [loadDesign]
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
    [partPhoto, loadPartPhoto, loadDesign]
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
  const getPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

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
    [design, eraserActive, getEraserPosInDesign, applyEraserStroke, draw]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
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
      setDesign({ ...design, x: pos.x - dragStart.x, y: pos.y - dragStart.y });
    },
    [isDragging, design, dragStart, eraserActive, getEraserPosInDesign, applyEraserStroke, draw]
  );

  const handleMouseUp = useCallback(() => {
    isErasingRef.current = false;
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
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
    [design, eraserActive, getEraserPosInDesign, applyEraserStroke, draw]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
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
      setDesign({ ...design, x: pos.x - dragStart.x, y: pos.y - dragStart.y });
    },
    [isDragging, design, dragStart, eraserActive, getEraserPosInDesign, applyEraserStroke, draw]
  );

  const handleTouchEnd = useCallback(() => {
    isErasingRef.current = false;
    setIsDragging(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!design) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
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
  }, [design]);

  // Quick actions
  const handleFill = useCallback(() => {
    if (!design) return;
    const coverScale = Math.min(
      displayWidth / design.naturalWidth,
      displayHeight / design.naturalHeight
    );
    setDesign({
      ...design,
      scale: coverScale,
      scaleX: 1,
      scaleY: 1,
      x: (displayWidth - design.naturalWidth * coverScale) / 2,
      y: (displayHeight - design.naturalHeight * coverScale) / 2,
      rotation: 0,
    });
  }, [design, displayWidth, displayHeight]);

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
    if (!partPhoto && !design) return null;
    // Export at laser-friendly 300 DPI based on material size
    const exportDpi = 300;
    const expW = Math.round(material.widthIn * exportDpi);
    const expH = Math.round(material.heightIn * exportDpi);
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
    }
    return offscreen;
  }, [partPhoto, partRotation, design, displayWidth, displayHeight, material]);

  const dl = useCallback((dataUrl: string, ext: string) => {
    const a = document.createElement("a");
    a.download = `engraving-${Date.now()}.${ext}`;
    a.href = dataUrl;
    a.click();
  }, []);

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
      if (c) dl(c.toDataURL("image/png"), "png");
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
      dl(flat.toDataURL("image/jpeg", 0.95), "jpg");
    });
  }, [gatedExport, getExportCanvas, dl]);

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

  const canExport = !!(partPhoto || design);

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
  const handleDesignResizeMouseDown = useCallback(
    (e: React.MouseEvent, handle: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se") => {
      if (!design) return;
      e.stopPropagation();
      e.preventDefault();
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

      const onMove = (ev: MouseEvent) => {
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

        setDesign((prev) => {
          if (!prev) return prev;
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
        designResizeDragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [design]
  );

  // --- Warp mode helpers ---
  const enableWarpMode = useCallback(() => {
    if (!design) return;
    const imgW = design.naturalWidth * design.scale * design.scaleX;
    const imgH = design.naturalHeight * design.scale * design.scaleY;
    const mesh: WarpMesh = design.warpMesh ?? {
      tl: { x: design.x,        y: design.y },
      tr: { x: design.x + imgW, y: design.y },
      bl: { x: design.x,        y: design.y + imgH },
      br: { x: design.x + imgW, y: design.y + imgH },
      top: [], bottom: [], left: [], right: [],
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
        setDesign(prev => {
          if (!prev?.warpMesh) return prev;
          return { ...prev, warpMesh: { ...prev.warpMesh, [corner]: pos } };
        });
      };
      const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [design]
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
        setDesign(prev => {
          if (!prev?.warpMesh) return prev;
          const m = prev.warpMesh;
          // Recompute offset from straight-line position
          const a = m[cA]; const b = m[cB];
          const straight = { x: a.x + (b.x - a.x) * pin.t, y: a.y + (b.y - a.y) * pin.t };
          const offset = { x: pos.x - straight.x, y: pos.y - straight.y };
          const newPins = m[edge].map(p => p.id === pinId ? { ...p, offset } : p);
          return { ...prev, warpMesh: { ...m, [edge]: newPins } };
        });
      };
      const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [design]
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
    [design]
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

  const updateFilter = (key: keyof ImageFilters, value: number) => {
    if (!design) return;
    setDesign({ ...design, filters: { ...design.filters, [key]: value } });
  };

  const resetFilters = () => {
    if (!design) return;
    setDesign({ ...design, filters: { ...DEFAULT_FILTERS } });
  };

  const unitLabel = unit === "in" ? t("panel.material.unit.in") : t("panel.material.unit.mm");
  const screenPpiLabel = t("editor.ppiLabel", { ppi: Math.round(screenPpi) });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
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

      {/* Mobile warning banner */}
      <div className="md:hidden bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center gap-2 shrink-0">
        <span className="text-amber-500 text-sm">💻</span>
        <p className="text-xs text-amber-400">{t("editor.mobileWarning")}</p>
      </div>
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 shrink-0">
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
                <Button size="sm" variant="ghost" onClick={handleUndo} disabled={!canUndo}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("editor.tooltip.undo")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleRedo} disabled={!canRedo}>
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
                <Button size="sm" disabled={!canExport}>
                  <Download className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">{t("editor.export")}</span>
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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

      <div className="flex-1 mx-auto max-w-7xl w-full px-4 py-4 sm:py-6">
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[280px_1fr]">

          {/* Canvas — first on mobile */}
          <div ref={canvasContainerRef} className="flex flex-col items-center gap-3 order-1 lg:order-2">
            {/* Ruler + workspace layout */}
            <div className="flex flex-col" style={{ width: displayWidth + (showRuler ? 20 : 0) }}>
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
                  style={{ width: displayWidth, height: displayHeight }}
                  onDragOver={(e) => { e.preventDefault(); setIsDropHover(true); }}
                  onDragLeave={() => setIsDropHover(false)}
                  onDrop={handleDrop}
                >
              <canvas
                ref={canvasRef}
                width={displayWidth}
                height={displayHeight}
                className="block"
                style={{ cursor: design ? (eraserActive ? "crosshair" : (isDragging ? "grabbing" : "grab")) : "default" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />

              {/* Design bounding-box resize handles (normal mode) */}
              {design && !eraserActive && !warpMode && (() => {
                const imgW = design.naturalWidth * design.scale * design.scaleX;
                const imgH = design.naturalHeight * design.scale * design.scaleY;
                const cx = design.x + imgW / 2;
                const cy = design.y + imgH / 2;
                const HW = 8;

                const handles: { id: "n"|"s"|"e"|"w"|"nw"|"ne"|"sw"|"se"; left: number; top: number; cursor: string }[] = [
                  { id: "nw", left: design.x - HW/2,         top: design.y - HW/2,         cursor: "nwse-resize" },
                  { id: "n",  left: cx - HW/2,               top: design.y - HW/2,         cursor: "ns-resize" },
                  { id: "ne", left: design.x + imgW - HW/2,  top: design.y - HW/2,         cursor: "nesw-resize" },
                  { id: "e",  left: design.x + imgW - HW/2,  top: cy - HW/2,               cursor: "ew-resize" },
                  { id: "se", left: design.x + imgW - HW/2,  top: design.y + imgH - HW/2,  cursor: "nwse-resize" },
                  { id: "s",  left: cx - HW/2,               top: design.y + imgH - HW/2,  cursor: "ns-resize" },
                  { id: "sw", left: design.x - HW/2,         top: design.y + imgH - HW/2,  cursor: "nesw-resize" },
                  { id: "w",  left: design.x - HW/2,         top: cy - HW/2,               cursor: "ew-resize" },
                ];

                return (
                  <>
                    {/* Dashed border */}
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: design.x, top: design.y,
                        width: imgW, height: imgH,
                        border: "1.5px dashed rgba(200,160,60,0.7)",
                        boxSizing: "border-box",
                      }}
                    />
                    {handles.map((h) => (
                      <div
                        key={h.id}
                        className="absolute z-20 bg-white border-2 border-primary rounded-sm"
                        style={{
                          left: h.left, top: h.top,
                          width: HW, height: HW,
                          cursor: h.cursor,
                        }}
                        onMouseDown={(e) => handleDesignResizeMouseDown(e, h.id)}
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
                const corners: { id: keyof Pick<WarpMesh,"tl"|"tr"|"bl"|"br">; pos: Pt; label: string }[] = [
                  { id: "tl", pos: mesh.tl, label: t("editor.warp.cornerTl") },
                  { id: "tr", pos: mesh.tr, label: t("editor.warp.cornerTr") },
                  { id: "bl", pos: mesh.bl, label: t("editor.warp.cornerBl") },
                  { id: "br", pos: mesh.br, label: t("editor.warp.cornerBr") },
                ];
                const CORNER_HW = 12;
                const PIN_HW = 11;
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
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-40">
                      <span className="text-[10px] bg-black/70 text-white px-2 py-0.5 rounded whitespace-nowrap">
                        {t("canvas.warpHint")}
                      </span>
                    </div>
                  </>
                );
              })()}

              {!partPhoto && !design && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                  <ImageIcon className="h-10 w-10 mb-3 opacity-25" />
                  <p className="text-sm font-medium text-center px-4">
                    {isDropHover ? t("canvas.dropActive") : t("canvas.dropHint")}
                  </p>
                  <p className="text-xs mt-1 opacity-50">{t("canvas.addDesignHint")}</p>
                </div>
              )}
              {partPhoto && !design && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
                  <div className="bg-black/70 rounded-md px-3 py-2 text-center">
                    <Layers className="h-4 w-4 mx-auto mb-1 text-primary opacity-70" />
                    <p className="text-xs text-white font-medium whitespace-nowrap">{t("canvas.uploadDesignStep2")}</p>
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

            {/* Step 2: Part photo */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">2</span>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {t("panel.partPhoto")} <span className="normal-case font-normal">{t("common.optional")}</span>
                </Label>
              </div>
              <input ref={partInputRef} type="file" accept="image/*" onChange={handlePartUpload} className="hidden" />
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
                  onClick={() => { setPartPhoto(null); setPartPhotoSrc(null); if (partInputRef.current) partInputRef.current.value = ""; }}
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

            {/* Step 3: Design */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">3</span>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("panel.design.heading")}</Label>
              </div>
              <input ref={designInputRef} type="file" accept="image/*" onChange={handleDesignUpload} className="hidden" />
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
                        onValueChange={([v]) => setDesign({ ...design, scale: v / 100 })}
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
                        onValueChange={([v]) => setDesign({ ...design, rotation: v })}
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
                          onClick={() => setEraserActive((v) => !v)}
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
                        onValueChange={([v]) => setDesign({ ...design, opacity: v / 100 })}
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
                      />
                    </div>

                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={resetFilters}>
                      <RefreshCw className="mr-1.5 h-3 w-3" /> Reset All Adjustments
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
