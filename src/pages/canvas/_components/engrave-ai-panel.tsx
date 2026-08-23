import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, ScanLine, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { engravingT, type EngravingLocale } from "./engraving-copy.ts";

type Pt = { x: number; y: number };

type EngraveAiPanelProps = {
  partPhoto: HTMLImageElement | null;
  partRotation: number;
  displayWidth: number;
  displayHeight: number;
  locale: EngravingLocale;
  hasDesign: boolean;
  clipDesignToTrace: boolean;
  onClipDesignChange: (checked: boolean) => void;
  onUseTrace: (points: Pt[], clipDesign: boolean) => void;
  onApplyFilledMask: (dataUrl: string, points: Pt[]) => void;
};

type DetectionResult = {
  points: Pt[];
  maskDataUrl: string;
  coveragePct: number;
  confidencePct: number;
};

const DEFAULT_OUTLINE_POINTS = 144;
const MAX_DETECTION_EDGE = 420;

function encodeSvg(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pathFromPoints(points: Pt[]) {
  if (!points.length) return "";
  const [first, ...rest] = points;
  return [
    `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`,
    ...rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`),
    "Z",
  ].join(" ");
}

function buildMaskDataUrl(points: Pt[], width: number, height: number) {
  const path = pathFromPoints(points);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <path d="${path}" fill="#000000" stroke="none" />
</svg>`;
  return encodeSvg(svg);
}

function drawRotatedPhoto(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  rotationDeg: number,
) {
  const radians = (rotationDeg * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(radians));
  const absSin = Math.abs(Math.sin(radians));
  const scale = Math.min(
    width / (width * absCos + height * absSin),
    height / (width * absSin + height * absCos),
  );
  const drawWidth = width / scale;
  const drawHeight = height / scale;

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.scale(scale, scale);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
}

function colorDistance(data: Uint8ClampedArray, pixelIndex: number, rgb: [number, number, number]) {
  const offset = pixelIndex * 4;
  const dr = data[offset] - rgb[0];
  const dg = data[offset + 1] - rgb[1];
  const db = data[offset + 2] - rgb[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function detectMaterialOutline({
  image,
  width,
  height,
  rotationDeg,
  tolerance,
  insetPx,
  outlinePoints,
}: {
  image: HTMLImageElement;
  width: number;
  height: number;
  rotationDeg: number;
  tolerance: number;
  insetPx: number;
  outlinePoints: number;
}): DetectionResult | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  drawRotatedPhoto(context, image, width, height, rotationDeg);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const edgeSamples: number[] = [];
  const sampleStep = Math.max(4, Math.floor(Math.min(width, height) / 18));

  for (let x = 0; x < width; x += sampleStep) {
    edgeSamples.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y += sampleStep) {
    edgeSamples.push(y * width, y * width + width - 1);
  }

  let red = 0;
  let green = 0;
  let blue = 0;
  for (const sample of edgeSamples) {
    const offset = sample * 4;
    red += data[offset];
    green += data[offset + 1];
    blue += data[offset + 2];
  }
  const background: [number, number, number] = [
    red / edgeSamples.length,
    green / edgeSamples.length,
    blue / edgeSamples.length,
  ];
  const maxBackgroundDistance = 18 + tolerance * 2.7;
  const visitedBackground = new Uint8Array(width * height);
  const queue: number[] = [];

  const seedBackground = (pixelIndex: number) => {
    if (!Number.isInteger(pixelIndex) || pixelIndex < 0 || pixelIndex >= width * height) return;
    if (visitedBackground[pixelIndex]) return;
    if (colorDistance(data, pixelIndex, background) > maxBackgroundDistance) return;
    visitedBackground[pixelIndex] = 1;
    queue.push(pixelIndex);
  };

  for (let x = 0; x < width; x++) {
    seedBackground(x);
    seedBackground((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seedBackground(y * width);
    seedBackground(y * width + width - 1);
  }

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const x = current % width;
    const y = Math.floor(current / width);
    if (x > 0) seedBackground(current - 1);
    if (x < width - 1) seedBackground(current + 1);
    if (y > 0) seedBackground(current - width);
    if (y < height - 1) seedBackground(current + width);
  }

  const componentMarks = new Uint8Array(width * height);
  let largestComponent: number[] = [];

  for (let start = 0; start < width * height; start++) {
    if (visitedBackground[start] || componentMarks[start]) continue;
    const offset = start * 4;
    if (data[offset + 3] < 24) continue;

    const component: number[] = [];
    const stack = [start];
    componentMarks[start] = 1;

    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1,
      ];

      for (const neighbor of neighbors) {
        if (neighbor < 0 || componentMarks[neighbor] || visitedBackground[neighbor]) continue;
        if (data[neighbor * 4 + 3] < 24) continue;
        componentMarks[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    if (component.length > largestComponent.length) {
      largestComponent = component;
    }
  }

  if (largestComponent.length < Math.max(80, width * height * 0.002)) return null;

  const mask = new Uint8Array(width * height);
  let centerX = 0;
  let centerY = 0;
  for (const pixel of largestComponent) {
    mask[pixel] = 1;
    centerX += pixel % width;
    centerY += Math.floor(pixel / width);
  }
  centerX /= largestComponent.length;
  centerY /= largestComponent.length;

  const boundary: Pt[] = [];
  for (const pixel of largestComponent) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const touchesBackground =
      x === 0 ||
      y === 0 ||
      x === width - 1 ||
      y === height - 1 ||
      !mask[pixel - 1] ||
      !mask[pixel + 1] ||
      !mask[pixel - width] ||
      !mask[pixel + width];

    if (touchesBackground) boundary.push({ x, y });
  }

  if (boundary.length < 8) return null;

  const bins: Array<Pt | null> = Array.from({ length: outlinePoints }, () => null);
  const distances = new Float32Array(outlinePoints);

  for (const point of boundary) {
    const angle = Math.atan2(point.y - centerY, point.x - centerX);
    const normalized = (angle + Math.PI) / (Math.PI * 2);
    const bin = Math.min(outlinePoints - 1, Math.floor(normalized * outlinePoints));
    const distance = Math.hypot(point.x - centerX, point.y - centerY);
    if (!bins[bin] || distance > distances[bin]) {
      bins[bin] = point;
      distances[bin] = distance;
    }
  }

  const points = bins
    .filter((point): point is Pt => Boolean(point))
    .map((point) => {
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0 || insetPx <= 0) return point;
      const scale = Math.max(0, (distance - insetPx) / distance);
      return {
        x: Math.max(0, Math.min(width, centerX + dx * scale)),
        y: Math.max(0, Math.min(height, centerY + dy * scale)),
      };
    });

  if (points.length < 8) return null;

  const coveragePct = (largestComponent.length / (width * height)) * 100;
  const pointHealth = Math.min(1, points.length / Math.max(1, outlinePoints * 0.72));
  const coverageHealth = Math.min(1, coveragePct / 65);
  const confidencePct = Math.round(100 * Math.min(pointHealth, coverageHealth));

  return {
    points,
    maskDataUrl: buildMaskDataUrl(points, width, height),
    coveragePct,
    confidencePct,
  };
}

function drawPreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  width: number,
  height: number,
  rotationDeg: number,
  result: DetectionResult | null,
) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, width, height);
  drawRotatedPhoto(context, image, width, height, rotationDeg);

  if (!result) return;
  const path = new Path2D(pathFromPoints(result.points));
  context.save();
  context.fillStyle = "rgba(34, 197, 94, 0.28)";
  context.strokeStyle = "#facc15";
  context.lineWidth = 2;
  context.fill(path);
  context.stroke(path);
  context.restore();
}

export default function EngraveAiPanel({
  partPhoto,
  partRotation,
  displayWidth,
  displayHeight,
  locale,
  hasDesign,
  clipDesignToTrace,
  onClipDesignChange,
  onUseTrace,
  onApplyFilledMask,
}: EngraveAiPanelProps) {
  const [open, setOpen] = useState(false);
  const [tolerance, setTolerance] = useState(34);
  const [insetPx, setInsetPx] = useState(5);
  const [outlinePoints, setOutlinePoints] = useState(DEFAULT_OUTLINE_POINTS);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const t = useCallback(
    (key: string, values?: Record<string, string | number>) => engravingT(key, values, locale),
    [locale],
  );

  const runDetection = useCallback(() => {
    if (!partPhoto) {
      setResult(null);
      return;
    }

    setPending(true);
    window.setTimeout(() => {
      const detectionScale = Math.min(1, MAX_DETECTION_EDGE / Math.max(displayWidth, displayHeight));
      const detectionWidth = Math.max(24, Math.round(displayWidth * detectionScale));
      const detectionHeight = Math.max(24, Math.round(displayHeight * detectionScale));
      const nextResult = detectMaterialOutline({
        image: partPhoto,
        width: detectionWidth,
        height: detectionHeight,
        rotationDeg: partRotation,
        tolerance,
        insetPx: insetPx * detectionScale,
        outlinePoints,
      });
      setResult(
        nextResult
          ? {
              ...nextResult,
              points: nextResult.points.map((point) => ({
                x: point.x / detectionScale,
                y: point.y / detectionScale,
              })),
              maskDataUrl: buildMaskDataUrl(
                nextResult.points.map((point) => ({
                  x: point.x / detectionScale,
                  y: point.y / detectionScale,
                })),
                displayWidth,
                displayHeight,
              ),
            }
          : null
      );
      setPending(false);
    }, 25);
  }, [displayHeight, displayWidth, insetPx, outlinePoints, partPhoto, partRotation, tolerance]);

  useEffect(() => {
    if (open && partPhoto) runDetection();
  }, [open, partPhoto, runDetection]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !partPhoto || !open) return;
    drawPreview(canvas, partPhoto, displayWidth, displayHeight, partRotation, result);
  }, [displayHeight, displayWidth, open, partPhoto, partRotation, result]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-secondary/50"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("engraveAi.title")}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
          <div className="relative overflow-hidden rounded-md border border-border bg-secondary/30">
            {partPhoto ? (
              <canvas ref={canvasRef} className="block h-auto w-full" />
            ) : (
              <div className="grid h-28 place-items-center px-3 text-center text-xs text-muted-foreground">
                {t("engraveAi.noPhoto")}
              </div>
            )}
            {pending && (
              <div className="absolute inset-0 grid place-items-center bg-background/60">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <span className="rounded-md border border-border bg-background px-2 py-1 text-muted-foreground">
              {t("engraveAi.confidence", { value: result ? result.confidencePct : 0 })}
            </span>
            <span className="rounded-md border border-border bg-background px-2 py-1 text-muted-foreground">
              {t("engraveAi.coverage", { value: result ? result.coveragePct.toFixed(1) : "0.0" })}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">{t("engraveAi.tolerance")}</Label>
              <span className="text-xs font-mono">{tolerance}</span>
            </div>
            <Slider
              value={[tolerance]}
              min={5}
              max={90}
              step={1}
              disabled={!partPhoto}
              onValueChange={([value]) => setTolerance(value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">{t("engraveAi.inset")}</Label>
              <span className="text-xs font-mono">{insetPx}px</span>
            </div>
            <Slider
              value={[insetPx]}
              min={0}
              max={32}
              step={1}
              disabled={!partPhoto}
              onValueChange={([value]) => setInsetPx(value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">{t("engraveAi.points")}</Label>
              <span className="text-xs font-mono">{outlinePoints}</span>
            </div>
            <Slider
              value={[outlinePoints]}
              min={48}
              max={220}
              step={4}
              disabled={!partPhoto}
              onValueChange={([value]) => setOutlinePoints(value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-2">
            <Label className="text-xs text-muted-foreground">{t("engraveAi.clipDesign")}</Label>
            <Switch
              checked={clipDesignToTrace}
              disabled={!hasDesign}
              onCheckedChange={onClipDesignChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 text-xs"
              disabled={!partPhoto || pending}
              onClick={runDetection}
            >
              {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ScanLine className="mr-1 h-3.5 w-3.5" />}
              {t("engraveAi.detect")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 text-xs"
              disabled={!result}
              onClick={() => result && onUseTrace(result.points, hasDesign)}
            >
              <Wand2 className="mr-1 h-3.5 w-3.5" />
              {hasDesign ? t("engraveAi.useAndClip") : t("engraveAi.useTrace")}
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full text-xs"
            disabled={!result}
            onClick={() => result && onApplyFilledMask(result.maskDataUrl, result.points)}
          >
            {t("engraveAi.useFilledMask")}
          </Button>

          {!result && partPhoto && !pending && (
            <p className="text-[10px] leading-relaxed text-muted-foreground opacity-70">
              {t("engraveAi.noResult")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
