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

// --- Types ---

type ImageFilters = {
  brightness: number; // 0–200 (100 = normal)
  contrast: number;   // 0–200 (100 = normal)
  grayscale: number;  // 0–100
  invert: number;     // 0–100
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
const HISTORY_LIMIT = 80;

// --- Helpers ---

function inchesToDisplay(inches: number, displayPixels: number, materialInches: number): number {
  return (inches / materialInches) * displayPixels;
}

function displayToInches(pixels: number, displayPixels: number, materialInches: number): number {
  return (pixels / displayPixels) * materialInches;
}

function canvasFilterCss(filters: ImageFilters): string {
  return [
    `brightness(${filters.brightness}%)`,
    `contrast(${filters.contrast}%)`,
    `grayscale(${filters.grayscale}%)`,
    `invert(${filters.invert}%)`,
  ].join(" ");
}

function cloneImageState(state: ImageState): ImageState {
  return {
    ...state,
    filters: { ...state.filters },
  };
}

function imageStateSignature(state: ImageState): string {
  const src = state.element.currentSrc || state.element.src || "";
  return JSON.stringify({
    src: `${src.length}:${src.slice(0, 120)}`,
    x: Number(state.x.toFixed(2)),
    y: Number(state.y.toFixed(2)),
    scale: Number(state.scale.toFixed(4)),
    scaleX: Number(state.scaleX.toFixed(4)),
    scaleY: Number(state.scaleY.toFixed(4)),
    rotation: Number(state.rotation.toFixed(2)),
    opacity: Number(state.opacity.toFixed(4)),
    flipH: state.flipH,
    flipV: state.flipV,
    filters: state.filters,
  });
}

// --- Main Component ---

function TemplateThumbnail({ url, name }: { url: string; name: string }) {
  const [previewSrc, setPreviewSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setFailed(false);
    setPreviewSrc(null);

    if (!url.startsWith("http")) {
      setPreviewSrc(url);
      return () => {
        active = false;
      };
    }

    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const typed = new Blob([blob], { type: "image/svg+xml" });
        objectUrl = URL.createObjectURL(typed);
        if (active) {
          setPreviewSrc(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      })
      .catch(() => { if (active) setFailed(true); });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <>
      {previewSrc && (
        <img
          src={previewSrc}
          alt={name}
          className="w-full h-full object-contain"
          onError={() => {
            setPreviewSrc(null);
            setFailed(true);
          }}
        />
      )}
      {!previewSrc && !failed && (
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

export default function CanvasEditor() {
  const [partPhoto, setPartPhoto] = useState<HTMLImageElement | null>(null);
  const [design, setDesign] = useState<ImageState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDropHover, setIsDropHover] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const [unit, setUnit] = useState<UnitType>("in");
  const [material, setMaterial] = useState<MaterialSize>({ widthIn: 4.0, heightIn: 4.0 });
  const [selectedPresetId, setSelectedPresetId] = useState<string>("custom");
  const [showRuler, setShowRuler] = useState(true);
  // Design real-world size inputs (in current unit)
  const [designWidthInput, setDesignWidthInput] = useState("");
  const [designHeightInput, setDesignHeightInput] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > HISTORY_LIMIT) {
      historyRef.current = historyRef.current.slice(-HISTORY_LIMIT);
    }
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
    const restored = cloneImageState(historyRef.current[historyIndexRef.current]);
    lastHistorySignatureRef.current = imageStateSignature(restored);
    setDesign(restored);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    skipHistoryRef.current = true;
    const restored = cloneImageState(historyRef.current[historyIndexRef.current]);
    lastHistorySignatureRef.current = imageStateSignature(restored);
    setDesign(restored);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const partInputRef = useRef<HTMLInputElement>(null);
  const designInputRef = useRef<HTMLInputElement>(null);

  // Track design changes into history
  useEffect(() => {
    if (!design) return;
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      updateUndoRedoState();
      return;
    }
    if (isDragging || continuousEditRef.current) return;
    pushHistory(design);
    updateUndoRedoState();
  }, [design, isDragging, pushHistory, updateUndoRedoState]);

  const updateDesignContinuously = useCallback((next: ImageState) => {
    continuousEditRef.current = true;
    setDesign(next);
  }, []);

  const commitDesignChange = useCallback(
    (next: ImageState) => {
      continuousEditRef.current = false;
      setDesign(next);
      pushHistory(next);
      updateUndoRedoState();
    },
    [pushHistory, updateUndoRedoState]
  );

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

  // Canvas display size — driven by material aspect ratio
  const maxW = Math.min(containerWidth - 8, 820);
  const maxH = Math.min(window.innerHeight * 0.58, 520);
  const materialRatio = material.widthIn / material.heightIn;

  let displayWidth = maxW;
  let displayHeight = Math.round(displayWidth / materialRatio);
  if (displayHeight > maxH) {
    displayHeight = maxH;
    displayWidth = Math.round(displayHeight * materialRatio);
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
      ctx.drawImage(partPhoto, 0, 0, displayWidth, displayHeight);
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

      ctx.filter = canvasFilterCss(design.filters);
      ctx.drawImage(design.element, -imgW / 2, -imgH / 2, imgW, imgH);
      ctx.filter = "none";
      ctx.restore();
    }

    // Ruler overlay
    if (showRuler) {
      drawRuler(ctx, displayWidth, displayHeight, material.widthIn, material.heightIn, unit);
    }
  }, [partPhoto, design, displayWidth, displayHeight, showRuler, material, unit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    draw();
  }, [displayWidth, displayHeight, draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // --- Ruler drawing ---
  function drawRuler(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    matW: number,
    matH: number,
    u: UnitType
  ) {
    const rulerH = 18;
    const rulerW = 14;
    const ppiX = w / matW;
    const ppiY = h / matH;

    // Choose tick interval based on size
    const tickInterval = u === "in" ? 0.5 : 10; // 0.5in or 10mm
    const subTick = u === "in" ? 0.25 : 5;

    ctx.save();
    ctx.font = "9px monospace";
    ctx.fillStyle = "rgba(200,160,60,0.75)";
    ctx.fillRect(0, 0, w, rulerH);
    ctx.fillRect(0, 0, rulerW, h);

    // Horizontal ticks
    const xDim = matW;
    for (let v = 0; v <= xDim; v += subTick) {
      const isMajor = Math.abs(v % tickInterval) < 0.001 || Math.abs(v % tickInterval - tickInterval) < 0.001;
      const px = Math.round(v * ppiX);
      const tickH = isMajor ? rulerH : rulerH * 0.5;
      ctx.fillStyle = "rgba(10,12,20,0.9)";
      ctx.fillRect(px, rulerH - tickH, 1, tickH);
      if (isMajor && v > 0) {
        ctx.fillStyle = "rgba(10,12,20,0.9)";
        const label = u === "in" ? `${v}"` : `${v}`;
        ctx.fillText(label, px + 2, rulerH - 4);
      }
    }

    // Vertical ticks
    const yDim = matH;
    for (let v = 0; v <= yDim; v += subTick) {
      const isMajor = Math.abs(v % tickInterval) < 0.001 || Math.abs(v % tickInterval - tickInterval) < 0.001;
      const py = Math.round(v * ppiY);
      const tW = isMajor ? rulerW : rulerW * 0.5;
      ctx.fillStyle = "rgba(10,12,20,0.9)";
      ctx.fillRect(rulerW - tW, py, tW, 1);
      if (isMajor && v > 0) {
        ctx.save();
        ctx.translate(rulerW - 2, py - 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = "rgba(10,12,20,0.9)";
        const label = u === "in" ? `${v}"` : `${v}`;
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // --- File loading ---
  const loadPartPhoto = useCallback((src: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPartPhoto(img);
    img.src = src;
  }, []);

  const loadDesign = useCallback(
    (src: string) => {
      const applyImg = (imgSrc: string, revokeAfterLoad?: string) => {
        const img = new Image();
        img.onload = () => {
          // SVGs without explicit width/height report 0 — fall back to a sensible default
          const natW = img.naturalWidth || 500;
          const natH = img.naturalHeight || 500;
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
          });
          const widthIn = displayToInches(natW * initScale, displayWidth, material.widthIn);
          const heightIn = displayToInches(natH * initScale, displayHeight, material.heightIn);
          if (unit === "in") {
            setDesignWidthInput(widthIn.toFixed(2));
            setDesignHeightInput(heightIn.toFixed(2));
          } else {
            setDesignWidthInput(inToMm(widthIn).toFixed(1));
            setDesignHeightInput(inToMm(heightIn).toFixed(1));
          }
          if (revokeAfterLoad) URL.revokeObjectURL(revokeAfterLoad);
        };
        img.onerror = () => {
          if (revokeAfterLoad) URL.revokeObjectURL(revokeAfterLoad);
        };
        img.src = imgSrc;
      };

      if (src.startsWith("data:") || src.startsWith("blob:") || !src.startsWith("http")) {
        // Local file (drag & drop or file picker) — load directly
        applyImg(src);
      } else {
        // Remote fallback for older template links.
        fetch(src)
          .then((r) => r.blob())
          .then((blob) => {
            const typed = new Blob([blob], { type: "image/svg+xml" });
            const objectUrl = URL.createObjectURL(typed);
            applyImg(objectUrl, objectUrl);
          })
          .catch(() => {});
      }
    },
    [displayWidth, displayHeight, material, unit]
  );

  const readFile = (file: File, onLoad: (src: string) => void) => {
    const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
    const name = file.name.toLowerCase();
    if (!file.type.startsWith("image/") && !isSvg) {
      setUploadError(
        name.endsWith(".ai") || name.endsWith(".pdf")
          ? "Convert AI or PDF artwork to SVG or PNG before importing."
          : "Upload an image file or SVG artwork."
      );
      return;
    }
    setUploadError(null);
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
      const newX = (displayWidth - design.naturalWidth * newScaleX) / 2;
      const newY = (displayHeight - design.naturalHeight * newScaleY) / 2;
      setDesign({ ...design, scale: 1, scaleX: newScaleX, scaleY: newScaleY, x: newX, y: newY });

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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!design) return;
      e.preventDefault();
      const pos = getPos(e.clientX, e.clientY);
      setIsDragging(true);
      setDragStart({ x: pos.x - design.x, y: pos.y - design.y });
    },
    [design]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !design) return;
      const pos = getPos(e.clientX, e.clientY);
      setDesign({ ...design, x: pos.x - dragStart.x, y: pos.y - dragStart.y });
    },
    [isDragging, design, dragStart]
  );

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!design || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const pos = getPos(touch.clientX, touch.clientY);
      setIsDragging(true);
      setDragStart({ x: pos.x - design.x, y: pos.y - design.y });
    },
    [design]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging || !design || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const pos = getPos(touch.clientX, touch.clientY);
      setDesign({ ...design, x: pos.x - dragStart.x, y: pos.y - dragStart.y });
    },
    [isDragging, design, dragStart]
  );

  const handleTouchEnd = useCallback(() => setIsDragging(false), []);

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
  }, [design, handleUndo, handleRedo]);

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
      ctx.drawImage(partPhoto, 0, 0, expW, expH);
    }

    if (design) {
      const imgW = design.naturalWidth * design.scale * design.scaleX * scaleX;
      const imgH = design.naturalHeight * design.scale * design.scaleY * scaleY;
      const cx = design.x * scaleX + imgW / 2;
      const cy = design.y * scaleY + imgH / 2;
      ctx.save();
      ctx.globalAlpha = design.opacity;
      ctx.translate(cx, cy);
      ctx.rotate((design.rotation * Math.PI) / 180);
      if (design.flipH) ctx.scale(-1, 1);
      if (design.flipV) ctx.scale(1, -1);
      ctx.filter = canvasFilterCss(design.filters);
      ctx.drawImage(design.element, -imgW / 2, -imgH / 2, imgW, imgH);
      ctx.filter = "none";
      ctx.restore();
    }
    return offscreen;
  }, [partPhoto, design, displayWidth, displayHeight, material]);

  const dl = useCallback((dataUrl: string, ext: string) => {
    const a = document.createElement("a");
    a.download = `engraving-${Date.now()}.${ext}`;
    a.href = dataUrl;
    a.click();
  }, []);

  const handleExportPng = useCallback(() => {
    const c = getExportCanvas();
    if (c) dl(c.toDataURL("image/png"), "png");
  }, [getExportCanvas, dl]);

  const handleExportJpeg = useCallback((bg: "white" | "black") => {
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
  }, [getExportCanvas, dl]);

  const handleExportPdf = useCallback(async () => {
    const { jsPDF } = await import("jspdf");
    const c = getExportCanvas();
    if (!c) return;
    // Use actual material dimensions for accurate PDF
    const wMm = material.widthIn * 25.4;
    const hMm = material.heightIn * 25.4;
    const pdf = new jsPDF({
      orientation: wMm > hMm ? "landscape" : "portrait",
      unit: "mm",
      format: [wMm, hMm],
    });
    pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, wMm, hMm);
    pdf.save(`engraving-${Date.now()}.pdf`);
  }, [getExportCanvas, material]);

  const canExport = !!(partPhoto || design);

  // --- Unit toggle ---
  const formatUnit = (valIn: number) => {
    if (unit === "in") return `${valIn.toFixed(2)}"`;
    return `${inToMm(valIn).toFixed(1)}mm`;
  };

  // Material custom width/height input
  const [matWInput, setMatWInput] = useState("4.00");
  const [matHInput, setMatHInput] = useState("4.00");

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
    updateDesignContinuously({ ...design, filters: { ...design.filters, [key]: value } });
  };

  const commitFilter = (key: keyof ImageFilters, value: number) => {
    if (!design) return;
    commitDesignChange({ ...design, filters: { ...design.filters, [key]: value } });
  };

  const resetFilters = () => {
    if (!design) return;
    setDesign({ ...design, filters: { ...DEFAULT_FILTERS } });
  };

  const screenPpiLabel = `${Math.round(screenPpi)} px/in on screen`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 shrink-0">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-serif text-base sm:text-lg font-bold truncate">Engraving Prep Tool</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Undo / Redo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleUndo} disabled={!canUndo}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleRedo} disabled={!canRedo}>
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
            </Tooltip>
            {/* Unit toggle */}
            <div className="hidden sm:flex items-center rounded-md border border-border overflow-hidden text-xs">
              <button
                className={`px-3 py-1.5 transition-colors ${unit === "in" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
                onClick={() => setUnit("in")}
              >
                in
              </button>
              <button
                className={`px-3 py-1.5 transition-colors ${unit === "mm" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
                onClick={() => setUnit("mm")}
              >
                mm
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
              <TooltipContent>Toggle ruler</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={!canExport}>
                  <Download className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportPng}>PNG (transparent)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportJpeg("white")}>JPEG — white background</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportJpeg("black")}>JPEG — black background</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportPdf}>
                  PDF (actual material size)
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
            <div
              className={`relative rounded-lg border-2 overflow-hidden transition-colors ${
                isDropHover ? "border-primary" : "border-border"
              }`}
              style={{ width: displayWidth, height: displayHeight, maxWidth: "100%" }}
              onDragOver={(e) => { e.preventDefault(); setIsDropHover(true); }}
              onDragLeave={() => setIsDropHover(false)}
              onDrop={handleDrop}
            >
              <canvas
                ref={canvasRef}
                width={displayWidth}
                height={displayHeight}
                className="block"
                style={{ cursor: design ? (isDragging ? "grabbing" : "grab") : "default" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />

              {!partPhoto && !design && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                  <ImageIcon className="h-10 w-10 mb-3 opacity-25" />
                  <p className="text-sm font-medium text-center px-4">
                    {isDropHover ? "Drop image here" : "Drop images here or use the sidebar"}
                  </p>
                  <p className="text-xs mt-1 opacity-50">Part photo → then your design</p>
                </div>
              )}
              {partPhoto && !design && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
                  <div className="bg-black/70 rounded-md px-3 py-2 text-center">
                    <Layers className="h-4 w-4 mx-auto mb-1 text-primary opacity-70" />
                    <p className="text-xs text-white font-medium whitespace-nowrap">Upload your design in Step 2</p>
                  </div>
                </div>
              )}
            </div>

            {/* Real-world size badge */}
            {design && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Ruler className="h-3 w-3 text-primary" />
                <span>Design: <strong className="text-foreground">{currentDesignSizeLabel}</strong></span>
                <span className="opacity-40">|</span>
                <span className="opacity-50">{screenPpiLabel}</span>
              </div>
            )}

            {/* Mobile quick controls */}
            {design && (
              <div className="flex flex-wrap gap-2 justify-center lg:hidden">
                <Button variant="secondary" size="sm" onClick={handleFill}>
                  <Maximize2 className="mr-1 h-3 w-3" /> Fill
                </Button>
                <Button variant="secondary" size="sm" onClick={handleCenter}>
                  <Move className="mr-1 h-3 w-3" /> Center
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
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Material Size</Label>
              </div>
              <Select value={selectedPresetId} onValueChange={handlePresetChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a material..." />
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
                Canvas represents: {formatUnit(material.widthIn)} × {formatUnit(material.heightIn)}
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
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Part Photo <span className="normal-case font-normal">(optional)</span></Label>
              </div>
              <input ref={partInputRef} type="file" accept="image/*" onChange={handlePartUpload} className="hidden" />
              <Button
                variant={partPhoto ? "ghost" : "secondary"}
                className="w-full"
                onClick={() => partInputRef.current?.click()}
              >
                <ImageIcon className="mr-2 h-4 w-4" />
                {partPhoto ? "Replace Photo" : "Upload Part Photo"}
              </Button>
              {partPhoto && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => { setPartPhoto(null); if (partInputRef.current) partInputRef.current.value = ""; }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove Photo
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground opacity-60">Photo of the item — becomes the background</p>
            </div>

            {/* Step 3: Design */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">3</span>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Engraving Design</Label>
              </div>
              <input ref={designInputRef} type="file" accept="image/*,.svg" onChange={handleDesignUpload} className="hidden" />
              <Button
                variant={design ? "ghost" : "secondary"}
                className="w-full"
                onClick={() => designInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {design ? "Replace Design" : "Upload Design Image"}
              </Button>
              {design && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => { setDesign(null); if (designInputRef.current) designInputRef.current.value = ""; }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove Design
                </Button>
              )}
              {uploadError && (
                <p className="text-[10px] text-destructive">{uploadError}</p>
              )}
              <p className="text-[10px] text-muted-foreground opacity-60">Your artwork — drag to reposition on the canvas</p>
            </div>

            {/* Templates */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4 text-primary shrink-0" />
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">My Templates</Label>
              </div>
              {TEMPLATE_CATEGORIES.map((cat) => {
                const catTemplates = ENGRAVING_TEMPLATES.filter((t) => t.category === cat);
                const useGrid = catTemplates.length > 1;
                return (
                  <div key={cat} className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-primary font-medium">{cat} <span className="text-muted-foreground normal-case">({catTemplates.length})</span></p>
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
                            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">Load →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground opacity-60">Click a template to load it as your design</p>
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
                        onValueChange={([v]) => updateDesignContinuously({ ...design, scale: v / 100 })}
                        onValueCommit={([v]) => commitDesignChange({ ...design, scale: v / 100 })}
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
                        onValueChange={([v]) => updateDesignContinuously({ ...design, rotation: v })}
                        onValueCommit={([v]) => commitDesignChange({ ...design, rotation: v })}
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
                        onValueChange={([v]) => updateDesignContinuously({ ...design, opacity: v / 100 })}
                        onValueCommit={([v]) => commitDesignChange({ ...design, opacity: v / 100 })}
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
          </div>
        </div>
      </div>
    </div>
  );
}
