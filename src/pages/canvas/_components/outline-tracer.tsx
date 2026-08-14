/**
 * OutlineTracer: Detects the silhouette of a part from a photo using
 * Canvas API threshold-based alpha masking. Works best on contrasting backgrounds.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Check, X, RefreshCw } from "lucide-react";

type OutlineTracerProps = {
  photoSrc: string;
  displayWidth: number;
  displayHeight: number;
  onConfirm: (maskDataUrl: string) => void;
  onCancel: () => void;
};

export default function OutlineTracer({
  photoSrc,
  displayWidth,
  displayHeight,
  onConfirm,
  onCancel,
}: OutlineTracerProps) {
  const [threshold, setThreshold] = useState(128);
  const [invert, setInvert] = useState(false);
  const [blurRadius, setBlurRadius] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);

  const runTrace = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photoRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = photoRef.current;
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Draw the photo scaled to canvas
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

    const imageData = ctx.getImageData(0, 0, displayWidth, displayHeight);
    const data = imageData.data;

    // Convert each pixel: if it's "background" make transparent, otherwise keep it opaque white
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Luminance
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const isBg = invert ? luma <= threshold : luma > threshold;
      if (isBg) {
        data[i + 3] = 0; // transparent
      } else {
        // Part pixel: white solid
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Optional: very light blur to smooth jagged edges
    if (blurRadius > 0) {
      ctx.filter = `blur(${blurRadius}px)`;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = displayWidth;
      tempCanvas.height = displayHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.filter = `blur(${blurRadius}px)`;
        tempCtx.drawImage(canvas, 0, 0);
        ctx.filter = "none";
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        ctx.drawImage(tempCanvas, 0, 0);
      }
    }
  }, [threshold, invert, blurRadius, displayWidth, displayHeight]);

  // Load photo once
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      photoRef.current = img;
      runTrace();
    };
    img.src = photoSrc;
  }, [photoSrc, runTrace]);

  // Re-run when params change
  useEffect(() => {
    if (photoRef.current) runTrace();
  }, [threshold, invert, blurRadius, runTrace]);

  const handleConfirm = useCallback(() => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onConfirm(dataUrl);
  }, [onConfirm]);

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground bg-secondary/40 rounded p-3 border border-border">
        <strong className="text-foreground">Tip:</strong> For best results, photograph the part on a plain white or black background. Adjust the threshold until the part outline looks clean.
      </div>

      {/* Preview */}
      <div className="relative rounded-lg overflow-hidden border border-border bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)_0_0/16px_16px]">
        <canvas
          ref={canvasRef}
          style={{ width: displayWidth, height: displayHeight, display: "block" }}
        />
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Threshold</Label>
            <span className="text-xs font-mono">{threshold}</span>
          </div>
          <Slider
            value={[threshold]}
            min={0}
            max={255}
            step={1}
            onValueChange={([v]) => setThreshold(v)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Edge Smoothing</Label>
            <span className="text-xs font-mono">{blurRadius}px</span>
          </div>
          <Slider
            value={[blurRadius]}
            min={0}
            max={4}
            step={1}
            onValueChange={([v]) => setBlurRadius(v)}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInvert((v) => !v)}
            className="text-xs"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            {invert ? "Dark part on light bg" : "Light part on dark bg"} (flip)
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancel
        </Button>
        <Button size="sm" className="flex-1" onClick={handleConfirm}>
          <Check className="mr-1 h-3 w-3" /> Use This Shape
        </Button>
      </div>
    </div>
  );
}
