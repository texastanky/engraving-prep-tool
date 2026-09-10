import React, { useRef, useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Crop, RotateCcw } from "lucide-react";
import { engravingT, type EngravingCopyValues, type EngravingLocale } from "./engraving-copy.ts";

type CropRect = { x: number; y: number; w: number; h: number };
type Handle = "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r" | "move" | null;

type Props = {
  open: boolean;
  imageSrc: string;       // data URL or blob URL of the current design
  onClose: () => void;
  onCrop: (croppedDataUrl: string) => void;
  isCropPart?: boolean;   // true when cropping the part photo instead of the design
  locale?: EngravingLocale;
};

const HANDLE_SIZE = 10; // px for hit-testing

// --- Handle rects ---
function getHandleRects(cr: CropRect): Record<string, { x: number; y: number; r: number; b: number }> {
  const hs = HANDLE_SIZE;
  const cx = cr.x + cr.w / 2;
  const cy = cr.y + cr.h / 2;
  return {
    tl: { x: cr.x,         y: cr.y,         r: cr.x + hs,       b: cr.y + hs },
    tr: { x: cr.x + cr.w - hs, y: cr.y,         r: cr.x + cr.w,     b: cr.y + hs },
    bl: { x: cr.x,         y: cr.y + cr.h - hs, r: cr.x + hs,       b: cr.y + cr.h },
    br: { x: cr.x + cr.w - hs, y: cr.y + cr.h - hs, r: cr.x + cr.w, b: cr.y + cr.h },
    t:  { x: cx - hs / 2,  y: cr.y,         r: cx + hs / 2,     b: cr.y + hs },
    b:  { x: cx - hs / 2,  y: cr.y + cr.h - hs, r: cx + hs / 2, b: cr.y + cr.h },
    l:  { x: cr.x,         y: cy - hs / 2,  r: cr.x + hs,       b: cy + hs / 2 },
    r:  { x: cr.x + cr.w - hs, y: cy - hs / 2, r: cr.x + cr.w, b: cy + hs / 2 },
  };
}

function hitHandle(px: number, py: number, cr: CropRect): Handle {
  const handles = getHandleRects(cr);
  for (const [key, h] of Object.entries(handles)) {
    const padded = { x: h.x - 4, y: h.y - 4, r: h.r + 4, b: h.b + 4 };
    if (px >= padded.x && px <= padded.r && py >= padded.y && py <= padded.b) {
      return key as Handle;
    }
  }
  // Inside crop body → move
  if (px >= cr.x && px <= cr.x + cr.w && py >= cr.y && py <= cr.y + cr.h) {
    return "move";
  }
  return null;
}

export default function CropModal({ open, imageSrc, onClose, onCrop, isCropPart = false, locale = "en" }: Props) {
  const t = useCallback(
    (key: string, values?: EngravingCopyValues) => engravingT(key, values, locale),
    [locale]
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  // crop rect in canvas-display coordinates
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  // display offset: where the image is drawn on the canvas (letterboxed)
  const [imgRect, setImgRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<{
    handle: Handle;
    startX: number; startY: number;
    startCrop: CropRect;
  } | null>(null);

  // Load image when modal opens
  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.src = imageSrc;
  }, [open, imageSrc]);

  // Draw everything on the canvas
  const draw = useCallback((c: HTMLCanvasElement, ir: CropRect, cr: CropRect) => {
    const ctx = c.getContext("2d");
    if (!ctx || !imgRef.current) return;

    ctx.clearRect(0, 0, c.width, c.height);
    // Draw image
    ctx.drawImage(imgRef.current, ir.x, ir.y, ir.w, ir.h);

    // Darken outside crop
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.clearRect(cr.x, cr.y, cr.w, cr.h);
    // Redraw image inside crop (so it's not darkened)
    ctx.save();
    ctx.beginPath();
    ctx.rect(cr.x, cr.y, cr.w, cr.h);
    ctx.clip();
    ctx.drawImage(imgRef.current, ir.x, ir.y, ir.w, ir.h);
    ctx.restore();
    ctx.restore();

    // Crop border
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);

    // Rule-of-thirds grid
    ctx.save();
    ctx.strokeStyle = "rgba(249,115,22,0.35)";
    ctx.lineWidth = 0.75;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cr.x + (cr.w / 3) * i, cr.y);
      ctx.lineTo(cr.x + (cr.w / 3) * i, cr.y + cr.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cr.x, cr.y + (cr.h / 3) * i);
      ctx.lineTo(cr.x + cr.w, cr.y + (cr.h / 3) * i);
      ctx.stroke();
    }
    ctx.restore();

    // Corner & edge handles
    const handles = getHandleRects(cr);
    ctx.fillStyle = "#f97316";
    for (const hr of Object.values(handles)) {
      ctx.fillRect(hr.x, hr.y, hr.r - hr.x, hr.b - hr.y);
    }
  }, []);

  // Compute image display rect (letterboxed inside canvas)
  const computeImgRect = useCallback((natW: number, natH: number, cW: number, cH: number): CropRect => {
    const scale = Math.min(cW / natW, cH / natH);
    const w = natW * scale;
    const h = natH * scale;
    return { x: (cW - w) / 2, y: (cH - h) / 2, w, h };
  }, []);

  // Size canvas and init crop when image loads
  useEffect(() => {
    if (!loaded || !canvasRef.current || !imgRef.current) return;
    const c = canvasRef.current;
    const maxW = Math.min(c.parentElement?.clientWidth ?? 700, 700);
    const maxH = Math.min(window.innerHeight * 0.55, 500);
    c.width = maxW;
    c.height = maxH;
    const ir = computeImgRect(imgRef.current.naturalWidth, imgRef.current.naturalHeight, maxW, maxH);
    setImgRect(ir);
    // Default crop = full image
    const initCrop = { x: ir.x, y: ir.y, w: ir.w, h: ir.h };
    setCrop(initCrop);
    draw(c, ir, initCrop);
  }, [loaded, computeImgRect, draw]);

  // Redraw whenever crop changes
  useEffect(() => {
    if (!loaded || !canvasRef.current) return;
    draw(canvasRef.current, imgRect, crop);
  }, [crop, imgRect, loaded, draw]);

  function canvasPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  const MIN_SIZE = 20;

  function clampCrop(cr: CropRect, ir: CropRect): CropRect {
    let { x, y, w, h } = cr;
    w = Math.max(w, MIN_SIZE);
    h = Math.max(h, MIN_SIZE);
    x = Math.max(ir.x, Math.min(x, ir.x + ir.w - w));
    y = Math.max(ir.y, Math.min(y, ir.y + ir.h - h));
    w = Math.min(w, ir.x + ir.w - x);
    h = Math.min(h, ir.y + ir.h - y);
    return { x, y, w, h };
  }

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const { x, y } = canvasPos(e);
    const handle = hitHandle(x, y, crop);
    if (!handle) return;
    dragRef.current = { handle, startX: x, startY: y, startCrop: { ...crop } };
  }, [crop]);

  const handleMouseMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = canvasPos(e);
    const dx = x - d.startX;
    const dy = y - d.startY;
    const sc = d.startCrop;
    let nc: CropRect = { ...sc };

    switch (d.handle) {
      case "move":
        nc.x = sc.x + dx; nc.y = sc.y + dy; break;
      case "tl":
        nc.x = sc.x + dx; nc.y = sc.y + dy; nc.w = sc.w - dx; nc.h = sc.h - dy; break;
      case "tr":
        nc.y = sc.y + dy; nc.w = sc.w + dx; nc.h = sc.h - dy; break;
      case "bl":
        nc.x = sc.x + dx; nc.w = sc.w - dx; nc.h = sc.h + dy; break;
      case "br":
        nc.w = sc.w + dx; nc.h = sc.h + dy; break;
      case "t":
        nc.y = sc.y + dy; nc.h = sc.h - dy; break;
      case "b":
        nc.h = sc.h + dy; break;
      case "l":
        nc.x = sc.x + dx; nc.w = sc.w - dx; break;
      case "r":
        nc.w = sc.w + dx; break;
    }
    setCrop(clampCrop(nc, imgRect));
  }, [imgRect]);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  // Cursor style based on hover
  const [cursor, setCursor] = useState("default");
  const handleMouseMoveForCursor = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return;
    const { x, y } = canvasPos(e);
    const h = hitHandle(x, y, crop);
    const map: Record<string, string> = {
      tl: "nw-resize", tr: "ne-resize", bl: "sw-resize", br: "se-resize",
      t: "n-resize", b: "s-resize", l: "w-resize", r: "e-resize",
      move: "move",
    };
    setCursor(h ? (map[h] ?? "default") : "default");
  }, [crop]);

  const handleReset = useCallback(() => {
    const initCrop = { x: imgRect.x, y: imgRect.y, w: imgRect.w, h: imgRect.h };
    setCrop(initCrop);
  }, [imgRect]);

  const handleConfirm = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const ir = imgRect;
    // Map crop rect in display coords → source image pixel coords
    const scaleX = imgRef.current.naturalWidth / ir.w;
    const scaleY = imgRef.current.naturalHeight / ir.h;
    const srcX = (crop.x - ir.x) * scaleX;
    const srcY = (crop.y - ir.y) * scaleY;
    const srcW = crop.w * scaleX;
    const srcH = crop.h * scaleY;

    const out = document.createElement("canvas");
    out.width = Math.round(srcW);
    out.height = Math.round(srcH);
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(imgRef.current, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);
    onCrop(out.toDataURL("image/png"));
  }, [crop, imgRect, onCrop]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crop className="h-4 w-4 text-primary" /> {isCropPart ? t("crop.partTitle") : t("crop.titleImage")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2 text-xs text-muted-foreground">
          {t("crop.hint")}
        </div>

        <div className="px-4 pb-4">
          {!loaded && (
            <div className="flex items-center justify-center h-64 bg-secondary/30 rounded-xl">
              <span className="text-sm text-muted-foreground animate-pulse">{t("crop.loading")}</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="rounded-xl w-full block"
            style={{ display: loaded ? "block" : "none", cursor, touchAction: "none" }}
            onMouseDown={handleMouseDown}
            onMouseMove={(e) => { handleMouseMove(e); handleMouseMoveForCursor(e); }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> {t("crop.reset")}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>{t("crop.cancel")}</Button>
            <Button size="sm" onClick={handleConfirm} className="gap-1.5">
              <Crop className="h-3.5 w-3.5" /> {t("crop.apply")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
