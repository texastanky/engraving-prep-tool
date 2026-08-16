/**
 * Trace & Vectorize panel — three laser-specific processing tools:
 *  1. Bitmap Engrave  — threshold / dither / levels prep for raster engraving
 *  2. Outline Trace   — marching-squares silhouette → clean SVG
 *  3. Edge Detect     — Sobel edge detection → stroke paths for score/cut
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  Check,
  RefreshCw,
  Download,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TraceVectorizeProps = {
  /** The current design image src (data URL, blob URL, or CDN URL) */
  designSrc: string;
  displayWidth: number;
  displayHeight: number;
  /** Called when the user clicks "Use as Design" — receives a PNG data URL */
  onApply: (dataUrl: string) => void;
  /** Called when the user clicks "Use as Design" for vector — receives an SVG data URL */
  onApplySvg?: (svgDataUrl: string) => void;
};

// ─── Dither helpers ───────────────────────────────────────────────────────────

/** Ordered 4×4 Bayer matrix (0-15 values, normalised to 0-255 range used later) */
const BAYER_4: number[][] = [
  [0,   136,  34, 170],
  [204,  68, 238, 102],
  [51,  187,  17, 153],
  [255, 119, 221,  85],
];

function applyBitmapProcess(
  src: HTMLImageElement,
  w: number,
  h: number,
  opts: {
    blackPoint: number;
    whitePoint: number;
    threshold: number;
    dither: "none" | "floyd" | "ordered";
    invert: boolean;
  }
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  // --- Levels pass: remap [blackPoint..whitePoint] → [0..255] ---
  const bp = opts.blackPoint;
  const wp = Math.max(opts.whitePoint, bp + 1);
  const range = wp - bp;

  // Build grayscale + levels array first
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4;
    const luma = 0.299 * d[pi] + 0.587 * d[pi + 1] + 0.114 * d[pi + 2];
    gray[i] = Math.max(0, Math.min(255, ((luma - bp) / range) * 255));
  }

  // --- Dithering / threshold pass ---
  const getThresh = (x: number, y: number): number => {
    if (opts.dither === "ordered") {
      return BAYER_4[y % 4][x % 4];
    }
    return opts.threshold;
  };

  if (opts.dither === "floyd") {
    // Floyd-Steinberg in-place on gray[]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const old = gray[idx];
        const newVal = old < opts.threshold ? 0 : 255;
        gray[idx] = newVal;
        const err = old - newVal;
        if (x + 1 < w)               gray[idx + 1]     += err * 7 / 16;
        if (y + 1 < h && x > 0)      gray[idx + w - 1] += err * 3 / 16;
        if (y + 1 < h)               gray[idx + w]     += err * 5 / 16;
        if (y + 1 < h && x + 1 < w)  gray[idx + w + 1] += err * 1 / 16;
      }
    }
  }

  // Write output pixels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const g = gray[idx];
      let isBlack = opts.dither === "floyd" ? g < 128 : g < getThresh(x, y);
      if (opts.invert) isBlack = !isBlack;
      const val = isBlack ? 0 : 255;
      const pi = idx * 4;
      d[pi] = d[pi + 1] = d[pi + 2] = val;
      d[pi + 3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return canvas;
}

// ─── Outline Trace (marching squares → SVG) ──────────────────────────────────

/**
 * Very lightweight marching-squares implementation.
 * Returns a list of closed polygon point arrays in pixel coords.
 */
function marchingSquares(
  binary: Uint8Array, // 1 = foreground, 0 = background
  w: number,
  h: number
): Array<Array<[number, number]>> {
  const visited = new Uint8Array(w * h);
  const contours: Array<Array<[number, number]>> = [];

  // 4-connected flood tracing
  const dirs: Array<[number, number]> = [[1,0],[0,1],[-1,0],[0,-1]];

  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const sidx = sy * w + sx;
      if (binary[sidx] === 0 || visited[sidx]) continue;
      // Check if it's an edge pixel (has at least one background neighbour)
      let isEdge = false;
      for (const [dx, dy] of dirs) {
        const nx = sx + dx, ny = sy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || binary[ny * w + nx] === 0) {
          isEdge = true; break;
        }
      }
      if (!isEdge) continue;

      // Boundary trace (Moore neighbourhood / radial sweep)
      const poly: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[sx, sy]];
      const seen = new Set<number>();
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const ci = cy * w + cx;
        if (seen.has(ci)) continue;
        seen.add(ci);
        visited[ci] = 1;
        poly.push([cx, cy]);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (binary[ni] === 0 || seen.has(ni)) continue;
          let neighbourIsEdge = false;
          for (const [dx2, dy2] of dirs) {
            const nnx = nx + dx2, nny = ny + dy2;
            if (nnx < 0 || nny < 0 || nnx >= w || nny >= h || binary[nny * w + nnx] === 0) {
              neighbourIsEdge = true; break;
            }
          }
          if (neighbourIsEdge) stack.push([nx, ny]);
        }
      }
      if (poly.length >= 4) contours.push(poly);
    }
  }
  return contours;
}

/**
 * Simplify a polygon using Ramer-Douglas-Peucker.
 */
function rdpSimplify(
  pts: Array<[number, number]>,
  epsilon: number
): Array<[number, number]> {
  if (pts.length <= 2) return pts;
  let maxDist = 0;
  let maxIdx = 0;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const dist = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist <= epsilon) return [pts[0], pts[pts.length - 1]];
  const left = rdpSimplify(pts.slice(0, maxIdx + 1), epsilon);
  const right = rdpSimplify(pts.slice(maxIdx), epsilon);
  return [...left.slice(0, -1), ...right];
}

function buildSvg(
  contours: Array<Array<[number, number]>>,
  svgW: number,
  svgH: number,
  strokeColor: string,
  fillMode: "filled" | "stroke"
): string {
  const paths = contours.map((pts) => {
    if (pts.length < 2) return "";
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ") + " Z";
    return `<path d="${d}" />`;
  }).join("\n  ");

  const fillAttr  = fillMode === "filled" ? strokeColor : "none";
  const strokeAttr = fillMode === "stroke" ? strokeColor : "none";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <g fill="${fillAttr}" stroke="${strokeAttr}" stroke-width="1" fill-rule="evenodd">
  ${paths}
  </g>
</svg>`;
}

// ─── Sobel edge detection ─────────────────────────────────────────────────────

function applySobel(
  src: HTMLImageElement,
  w: number,
  h: number,
  opts: { threshold: number; lineWeight: number; invert: boolean; blur: number }
): HTMLCanvasElement {
  const offscreen = document.createElement("canvas");
  offscreen.width = w; offscreen.height = h;
  const ctx = offscreen.getContext("2d")!;
  if (opts.blur > 0) {
    ctx.filter = `blur(${opts.blur}px)`;
  }
  ctx.drawImage(src, 0, 0, w, h);
  ctx.filter = "none";
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  // Build grayscale buffer
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = Math.round(0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2]);
  }

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const outCtx = out.getContext("2d")!;
  const outId = outCtx.createImageData(w, h);
  const od = outId.data;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y-1)*w+(x-1)], tc = gray[(y-1)*w+x], tr = gray[(y-1)*w+(x+1)];
      const ml = gray[y*w+(x-1)],                              mr = gray[y*w+(x+1)];
      const bl = gray[(y+1)*w+(x-1)], bc = gray[(y+1)*w+x], br = gray[(y+1)*w+(x+1)];
      const gx = -tl - 2*ml - bl + tr + 2*mr + br;
      const gy = -tl - 2*tc - tr + bl + 2*bc + br;
      const mag = Math.min(255, Math.sqrt(gx*gx + gy*gy));

      const isEdge = mag > opts.threshold;
      let val = isEdge ? 0 : 255;
      if (opts.invert) val = 255 - val;

      const pi = (y * w + x) * 4;
      od[pi] = od[pi+1] = od[pi+2] = val;
      od[pi+3] = 255;
    }
  }
  outCtx.putImageData(outId, 0, 0);

  // Optional: dilate edges by lineWeight
  if (opts.lineWeight > 1) {
    const final = document.createElement("canvas");
    final.width = w; final.height = h;
    const fCtx = final.getContext("2d")!;
    fCtx.fillStyle = opts.invert ? "#000" : "#fff";
    fCtx.fillRect(0, 0, w, h);
    fCtx.globalCompositeOperation = "multiply";
    // Simple dilation: draw at fractional offsets
    const lw = opts.lineWeight - 1;
    for (let dy = -lw; dy <= lw; dy++) {
      for (let dx = -lw; dx <= lw; dx++) {
        fCtx.drawImage(out, dx, dy);
      }
    }
    fCtx.globalCompositeOperation = "source-over";
    return final;
  }
  return out;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// --- Bitmap Engrave Tab ---
function BitmapTab({
  img,
  displayWidth,
  displayHeight,
  onApply,
}: {
  img: HTMLImageElement;
  displayWidth: number;
  displayHeight: number;
  onApply: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [threshold, setThreshold] = useState(128);
  const [dither, setDither] = useState<"none" | "floyd" | "ordered">("none");
  const [blackPoint, setBlackPoint] = useState(0);
  const [whitePoint, setWhitePoint] = useState(255);
  const [invert, setInvert] = useState(false);

  const render = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const result = applyBitmapProcess(img, displayWidth, displayHeight, {
      threshold, dither, blackPoint, whitePoint, invert,
    });
    c.width = displayWidth;
    c.height = displayHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(result, 0, 0);
  }, [img, displayWidth, displayHeight, threshold, dither, blackPoint, whitePoint, invert]);

  useEffect(() => { render(); }, [render]);

  const handleApply = () => {
    const c = canvasRef.current;
    if (!c) return;
    onApply(c.toDataURL("image/png"));
  };

  const handleDownload = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.download = `bitmap-engrave-${Date.now()}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground bg-secondary/40 rounded p-2.5 border border-border flex gap-2">
        <Info className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
        <span>Converts your design to pure black & white for raster laser engraving. Dithering simulates gray tones via dot patterns.</span>
      </div>

      {/* Preview */}
      <div className="rounded-lg overflow-hidden border border-border bg-white" style={{ maxHeight: 220 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "auto", display: "block", imageRendering: "pixelated" }}
        />
      </div>

      {/* Dither mode */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Dither Mode</Label>
        <div className="flex gap-1">
          {(["none", "floyd", "ordered"] as const).map((m) => (
            <button
              key={m}
              className={`flex-1 text-[10px] py-1.5 rounded border transition-colors cursor-pointer ${dither === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              onClick={() => setDither(m)}
            >
              {m === "none" ? "Threshold" : m === "floyd" ? "Floyd-Steinberg" : "Bayer Halftone"}
            </button>
          ))}
        </div>
      </div>

      {/* Threshold (hidden for ordered) */}
      {dither !== "ordered" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Threshold</Label>
            <span className="text-xs font-mono">{threshold}</span>
          </div>
          <Slider value={[threshold]} min={0} max={255} step={1} onValueChange={([v]) => setThreshold(v)} />
        </div>
      )}

      {/* Levels */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Black Point</Label>
          <span className="text-xs font-mono">{blackPoint}</span>
        </div>
        <Slider value={[blackPoint]} min={0} max={200} step={1} onValueChange={([v]) => setBlackPoint(Math.min(v, whitePoint - 1))} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">White Point</Label>
          <span className="text-xs font-mono">{whitePoint}</span>
        </div>
        <Slider value={[whitePoint]} min={55} max={255} step={1} onValueChange={([v]) => setWhitePoint(Math.max(v, blackPoint + 1))} />
      </div>

      {/* Invert */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Invert (white on black)</Label>
        <button
          onClick={() => setInvert(v => !v)}
          className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${invert ? "bg-primary" : "bg-secondary"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${invert ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download PNG</TooltipContent>
        </Tooltip>
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleApply}>
          <Check className="mr-1.5 h-3.5 w-3.5" /> Use as Design
        </Button>
      </div>
    </div>
  );
}

// --- Outline Trace Tab ---
function OutlineTab({
  img,
  displayWidth,
  displayHeight,
  onApply,
  onApplySvg,
}: {
  img: HTMLImageElement;
  displayWidth: number;
  displayHeight: number;
  onApply: (dataUrl: string) => void;
  onApplySvg?: (svgDataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [threshold, setThreshold] = useState(128);
  const [simplify, setSimplify] = useState(2);
  const [invert, setInvert] = useState(false);
  const [fillMode, setFillMode] = useState<"filled" | "stroke">("filled");
  const [outputColor, setOutputColor] = useState<"black" | "white">("black");
  const svgRef = useRef<string>("");

  const render = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = displayWidth;
    c.height = displayHeight;

    // Build grayscale + threshold from img
    const tmp = document.createElement("canvas");
    tmp.width = displayWidth; tmp.height = displayHeight;
    const tCtx = tmp.getContext("2d")!;
    tCtx.drawImage(img, 0, 0, displayWidth, displayHeight);
    const id = tCtx.getImageData(0, 0, displayWidth, displayHeight);
    const d = id.data;

    const binary = new Uint8Array(displayWidth * displayHeight);
    for (let i = 0; i < displayWidth * displayHeight; i++) {
      const luma = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2];
      binary[i] = invert ? (luma > threshold ? 1 : 0) : (luma <= threshold ? 1 : 0);
    }

    // Trace contours
    let contours = marchingSquares(binary, displayWidth, displayHeight);

    // Simplify
    if (simplify > 0) {
      contours = contours.map(p => rdpSimplify(p, simplify));
    }

    // Filter tiny noise
    contours = contours.filter(p => p.length >= 6);

    // Build SVG
    const color = outputColor === "black" ? "#000000" : "#ffffff";
    const svg = buildSvg(contours, displayWidth, displayHeight, color, fillMode);
    svgRef.current = svg;

    // Render preview on canvas
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = outputColor === "black" ? "#ffffff" : "#000000";
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const svgImg = new Image();
    svgImg.onload = () => {
      ctx.drawImage(svgImg, 0, 0, displayWidth, displayHeight);
      URL.revokeObjectURL(url);
    };
    svgImg.src = url;
  }, [img, displayWidth, displayHeight, threshold, simplify, invert, fillMode, outputColor]);

  useEffect(() => { render(); }, [render]);

  const handleApplyRaster = () => {
    const c = canvasRef.current;
    if (!c) return;
    onApply(c.toDataURL("image/png"));
  };

  const handleApplySvg = () => {
    if (!svgRef.current || !onApplySvg) return;
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgRef.current)}`;
    onApplySvg(dataUrl);
  };

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    const blob = new Blob([svgRef.current], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `outline-trace-${Date.now()}.svg`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground bg-secondary/40 rounded p-2.5 border border-border flex gap-2">
        <Info className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
        <span>Extracts the silhouette of your design as a clean vector SVG — ideal for cut outlines and fill engrave paths.</span>
      </div>

      {/* Preview */}
      <div className="rounded-lg overflow-hidden border border-border" style={{ maxHeight: 220, background: outputColor === "black" ? "#fff" : "#000" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Threshold</Label>
          <span className="text-xs font-mono">{threshold}</span>
        </div>
        <Slider value={[threshold]} min={0} max={255} step={1} onValueChange={([v]) => setThreshold(v)} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Path Simplify</Label>
          <span className="text-xs font-mono">{simplify}px</span>
        </div>
        <Slider value={[simplify]} min={0} max={10} step={0.5} onValueChange={([v]) => setSimplify(v)} />
      </div>

      {/* Fill mode */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Output Style</Label>
        <div className="flex gap-1">
          {(["filled", "stroke"] as const).map((m) => (
            <button
              key={m}
              className={`flex-1 text-[10px] py-1.5 rounded border transition-colors cursor-pointer ${fillMode === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              onClick={() => setFillMode(m)}
            >
              {m === "filled" ? "Filled (Engrave)" : "Stroke (Cut/Score)"}
            </button>
          ))}
        </div>
      </div>

      {/* Output color */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Output Color</Label>
        <div className="flex rounded border border-border overflow-hidden text-[10px]">
          <button className={`px-2.5 py-1 cursor-pointer transition-colors ${outputColor === "black" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setOutputColor("black")}>Black</button>
          <button className={`px-2.5 py-1 cursor-pointer transition-colors ${outputColor === "white" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setOutputColor("white")}>White</button>
        </div>
      </div>

      {/* Invert */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Invert Selection</Label>
        <button
          onClick={() => setInvert(v => !v)}
          className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${invert ? "bg-primary" : "bg-secondary"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${invert ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8" onClick={handleDownloadSvg}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download SVG</TooltipContent>
        </Tooltip>
        <Button variant="secondary" size="sm" className="flex-1 h-8 text-xs" onClick={handleApplyRaster}>
          Use PNG
        </Button>
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleApplySvg} disabled={!onApplySvg}>
          <Check className="mr-1.5 h-3.5 w-3.5" /> Use SVG
        </Button>
      </div>
    </div>
  );
}

// --- Edge Detect Tab ---
function EdgeTab({
  img,
  displayWidth,
  displayHeight,
  onApply,
}: {
  img: HTMLImageElement;
  displayWidth: number;
  displayHeight: number;
  onApply: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [threshold, setThreshold] = useState(30);
  const [lineWeight, setLineWeight] = useState(1);
  const [invert, setInvert] = useState(false);
  const [blur, setBlur] = useState(1);

  const render = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const result = applySobel(img, displayWidth, displayHeight, { threshold, lineWeight, invert, blur });
    c.width = displayWidth;
    c.height = displayHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(result, 0, 0);
  }, [img, displayWidth, displayHeight, threshold, lineWeight, invert, blur]);

  useEffect(() => { render(); }, [render]);

  const handleApply = () => {
    const c = canvasRef.current;
    if (!c) return;
    onApply(c.toDataURL("image/png"));
  };

  const handleDownload = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.download = `edge-detect-${Date.now()}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground bg-secondary/40 rounded p-2.5 border border-border flex gap-2">
        <Info className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
        <span>Sobel edge detection finds outlines and contour lines — great for extracting stroke/score paths from logos and photos.</span>
      </div>

      {/* Preview */}
      <div className="rounded-lg overflow-hidden border border-border bg-white" style={{ maxHeight: 220 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Edge Sensitivity</Label>
          <span className="text-xs font-mono">{threshold}</span>
        </div>
        <Slider value={[threshold]} min={5} max={200} step={1} onValueChange={([v]) => setThreshold(v)} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Pre-blur (noise reduction)</Label>
          <span className="text-xs font-mono">{blur}px</span>
        </div>
        <Slider value={[blur]} min={0} max={5} step={1} onValueChange={([v]) => setBlur(v)} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Line Weight</Label>
          <span className="text-xs font-mono">{lineWeight}px</span>
        </div>
        <Slider value={[lineWeight]} min={1} max={4} step={1} onValueChange={([v]) => setLineWeight(v)} />
      </div>

      {/* Invert */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Invert (white lines on black)</Label>
        <button
          onClick={() => setInvert(v => !v)}
          className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${invert ? "bg-primary" : "bg-secondary"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${invert ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download PNG</TooltipContent>
        </Tooltip>
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleApply}>
          <Check className="mr-1.5 h-3.5 w-3.5" /> Use as Design
        </Button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function TraceVectorize({
  designSrc,
  displayWidth,
  displayHeight,
  onApply,
  onApplySvg,
}: TraceVectorizeProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Reload image whenever designSrc changes
  useEffect(() => {
    setImg(null);
    setLoadError(false);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setImg(image);
    image.onerror = () => setLoadError(true);

    // Remote CDN URLs: proxy through fetch to avoid CORS taint
    if (designSrc.startsWith("data:") || designSrc.startsWith("blob:")) {
      image.src = designSrc;
    } else {
      fetch(designSrc)
        .then(r => r.blob())
        .then(blob => {
          const typed = new Blob([blob], { type: "image/svg+xml" });
          image.src = URL.createObjectURL(typed);
        })
        .catch(() => setLoadError(true));
    }
  }, [designSrc]);

  if (loadError) {
    return (
      <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
        Could not load the design image for processing. Try re-uploading it.
      </div>
    );
  }

  if (!img) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Loading design…
      </div>
    );
  }

  // Scale preview down to fit sidebar
  const previewW = Math.min(displayWidth, 240);
  const previewH = Math.round((previewW / displayWidth) * displayHeight);

  return (
    <Tabs defaultValue="bitmap">
      <TabsList className="w-full h-8 text-[10px] mb-3">
        <TabsTrigger value="bitmap" className="flex-1 text-[10px]">Bitmap</TabsTrigger>
        <TabsTrigger value="outline" className="flex-1 text-[10px]">Outline</TabsTrigger>
        <TabsTrigger value="edge" className="flex-1 text-[10px]">Edge Detect</TabsTrigger>
      </TabsList>
      <TabsContent value="bitmap">
        <BitmapTab
          img={img}
          displayWidth={previewW}
          displayHeight={previewH}
          onApply={onApply}
        />
      </TabsContent>
      <TabsContent value="outline">
        <OutlineTab
          img={img}
          displayWidth={previewW}
          displayHeight={previewH}
          onApply={onApply}
          onApplySvg={onApplySvg}
        />
      </TabsContent>
      <TabsContent value="edge">
        <EdgeTab
          img={img}
          displayWidth={previewW}
          displayHeight={previewH}
          onApply={onApply}
        />
      </TabsContent>
    </Tabs>
  );
}
