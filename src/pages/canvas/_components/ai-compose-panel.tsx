import React, { useCallback, useRef, useState } from "react";
import { ChevronDown, ImageIcon, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";
import { engravingT, type EngravingLocale } from "./engraving-copy.ts";

type ComposeSlot = "template" | "artwork" | "reference";
type ComposeSize = "1536x1024" | "2048x1152" | "3072x1024";
type ComposeQuality = "low" | "medium" | "high";

type PreparedImage = {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
};

type ApiPayload = {
  image?: string;
  error?: string;
  detail?: string;
};

type AiComposePanelProps = {
  currentDesignSrc: string | null;
  locale: EngravingLocale;
  onApply: (dataUrl: string) => void;
};

const MAX_INPUT_EDGE = 1600;
const MAX_PNG_DATA_URL_LENGTH = 2_500_000;

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  return Math.round((base64.length * 3) / 4);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = src;
  });
}

async function srcToDataUrl(src: string) {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Unable to load current design");
  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read current design"));
    reader.readAsDataURL(blob);
  });
}

async function prepareImage(name: string, sourceDataUrl: string): Promise<PreparedImage> {
  const image = await loadImage(sourceDataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_INPUT_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(16, Math.round(sourceWidth * scale));
  const height = Math.max(16, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > MAX_PNG_DATA_URL_LENGTH) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  }

  return {
    name,
    dataUrl,
    width,
    height,
    bytes: dataUrlBytes(dataUrl),
  };
}

function formatImageMeta(image: PreparedImage) {
  const kb = Math.max(1, Math.round(image.bytes / 1024));
  return `${image.width}x${image.height} px - ${kb} KB`;
}

function humanizeError(payload: ApiPayload | null, fallback: string, apiUnavailable: string) {
  if (payload?.error === "missing_configuration") return "OPENAI_API_KEY is not configured for this app.";
  if (payload?.detail) return payload.detail;
  if (payload?.error) return payload.error.replaceAll("_", " ");
  return apiUnavailable || fallback;
}

function ImageSlot({
  image,
  label,
  optionalLabel,
  clearLabel,
  onClear,
  onPick,
}: {
  image: PreparedImage | null;
  label: string;
  optionalLabel: string;
  clearLabel: string;
  onClear: () => void;
  onPick: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{optionalLabel}</span>
      </div>
      <button
        type="button"
        className={cn(
          "group relative flex h-24 w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-secondary/40 text-left transition-colors hover:border-primary",
          image && "border-solid bg-background",
        )}
        onClick={onPick}
      >
        {image ? (
          <>
            <img src={image.dataUrl} alt="" className="h-full w-full object-contain" />
            <span className="absolute inset-x-0 bottom-0 bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">
              {formatImageMeta(image)}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <Upload className="h-4 w-4" />
            {label}
          </span>
        )}
      </button>
      {image && (
        <Button type="button" variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={onClear}>
          <X className="mr-1 h-3 w-3" />
          {clearLabel}
        </Button>
      )}
    </div>
  );
}

export default function AiComposePanel({ currentDesignSrc, locale, onApply }: AiComposePanelProps) {
  const [open, setOpen] = useState(false);
  const [templateImage, setTemplateImage] = useState<PreparedImage | null>(null);
  const [artworkImage, setArtworkImage] = useState<PreparedImage | null>(null);
  const [referenceImage, setReferenceImage] = useState<PreparedImage | null>(null);
  const [prompt, setPrompt] = useState(() => engravingT("aiCompose.defaultPrompt", {}, locale));
  const [size, setSize] = useState<ComposeSize>("3072x1024");
  const [quality, setQuality] = useState<ComposeQuality>("medium");
  const [pending, setPending] = useState(false);
  const [slotPending, setSlotPending] = useState<ComposeSlot | "current" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);
  const artworkInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);

  const t = useCallback(
    (key: string) => engravingT(key, {}, locale),
    [locale],
  );

  const setSlotImage = useCallback((slot: ComposeSlot, image: PreparedImage | null) => {
    if (slot === "template") setTemplateImage(image);
    if (slot === "artwork") setArtworkImage(image);
    if (slot === "reference") setReferenceImage(image);
  }, []);

  const handleFile = useCallback(
    async (slot: ComposeSlot, file: File | null) => {
      if (!file) return;
      setError(null);
      setSlotPending(slot);
      try {
        const dataUrl = await fileToDataUrl(file);
        const prepared = await prepareImage(file.name, dataUrl);
        setSlotImage(slot, prepared);
      } catch {
        setError(t("aiCompose.error.badImage"));
      } finally {
        setSlotPending(null);
      }
    },
    [setSlotImage, t],
  );

  const handleUseCurrentDesignAsTemplate = useCallback(async () => {
    if (!currentDesignSrc) return;
    setError(null);
    setSlotPending("current");
    try {
      const dataUrl = await srcToDataUrl(currentDesignSrc);
      setTemplateImage(await prepareImage("current-design-template.png", dataUrl));
    } catch {
      setError(t("aiCompose.error.currentDesign"));
    } finally {
      setSlotPending(null);
    }
  }, [currentDesignSrc, t]);

  const generate = useCallback(async () => {
    if (!templateImage) {
      setError(t("aiCompose.error.noTemplate"));
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/ai-compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          size,
          quality,
          templateImage,
          artworkImage,
          referenceImage,
        }),
      });

      let payload: ApiPayload | null = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload?.image) {
        throw new Error(humanizeError(payload, t("aiCompose.error.generic"), t("aiCompose.error.apiUnavailable")));
      }

      onApply(payload.image);
      toast.success(t("aiCompose.generated"));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : t("aiCompose.error.generic"));
    } finally {
      setPending(false);
    }
  }, [artworkImage, onApply, prompt, quality, referenceImage, size, t, templateImage]);

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
            {t("aiCompose.title")}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
          <input
            ref={templateInputRef}
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              void handleFile("template", event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={artworkInputRef}
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              void handleFile("artwork", event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={referenceInputRef}
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              void handleFile("reference", event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <ImageSlot
              image={templateImage}
              label={t("aiCompose.template")}
              optionalLabel={t("aiCompose.required")}
              clearLabel={t("aiCompose.clear")}
              onClear={() => setTemplateImage(null)}
              onPick={() => templateInputRef.current?.click()}
            />
            <ImageSlot
              image={artworkImage}
              label={t("aiCompose.artwork")}
              optionalLabel={t("common.optional")}
              clearLabel={t("aiCompose.clear")}
              onClear={() => setArtworkImage(null)}
              onPick={() => artworkInputRef.current?.click()}
            />
            <ImageSlot
              image={referenceImage}
              label={t("aiCompose.reference")}
              optionalLabel={t("common.optional")}
              clearLabel={t("aiCompose.clear")}
              onClear={() => setReferenceImage(null)}
              onPick={() => referenceInputRef.current?.click()}
            />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 w-full text-xs"
                  disabled={!currentDesignSrc || slotPending === "current"}
                  onClick={() => void handleUseCurrentDesignAsTemplate()}
                >
                  {slotPending === "current" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t("aiCompose.useCurrent")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("aiCompose.useCurrentTip")}</TooltipContent>
          </Tooltip>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("aiCompose.prompt")}
            </Label>
            <Textarea
              className="min-h-24 resize-none text-xs"
              value={prompt}
              placeholder={t("aiCompose.promptPlaceholder")}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("aiCompose.output")}
              </Label>
              <Select value={size} onValueChange={(value) => setSize(value as ComposeSize)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1536x1024">{t("aiCompose.outputDraft")}</SelectItem>
                  <SelectItem value="2048x1152">{t("aiCompose.outputWide")}</SelectItem>
                  <SelectItem value="3072x1024">{t("aiCompose.outputSlide")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("aiCompose.quality")}
              </Label>
              <Select value={quality} onValueChange={(value) => setQuality(value as ComposeQuality)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("aiCompose.qualityDraft")}</SelectItem>
                  <SelectItem value="medium">{t("aiCompose.qualityShop")}</SelectItem>
                  <SelectItem value="high">{t("aiCompose.qualityFinal")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {slotPending && slotPending !== "current" && (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("aiCompose.preparing")}
            </p>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive">
              {error}
            </p>
          )}

          <Button
            type="button"
            className="h-9 w-full"
            disabled={pending || slotPending !== null || !templateImage}
            onClick={() => void generate()}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {pending ? t("aiCompose.generating") : t("aiCompose.generate")}
          </Button>

          <p className="text-[10px] leading-relaxed text-muted-foreground opacity-70">
            {t("aiCompose.helper")}
          </p>
        </div>
      )}
    </div>
  );
}
