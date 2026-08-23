import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageSquare, SendHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";
import { engravingT, type EngravingLocale } from "./engraving-copy.ts";

type AssistantRole = "user" | "assistant";

type AssistantMessage = {
  id: string;
  role: AssistantRole;
  content: string;
  mode?: "ai" | "local";
};

export type CanvasAssistantContext = {
  locale: EngravingLocale;
  material: {
    presetName: string;
    widthIn: number;
    heightIn: number;
    displaySize: string;
  };
  canvas: {
    displayWidthPx: number;
    displayHeightPx: number;
    screenPpi: number;
    exportDpi: number;
    rulerVisible: boolean;
  };
  partPhoto: {
    loaded: boolean;
    rotationDeg: number;
  };
  engraveAi: {
    outlineReady: boolean;
    tracePoints: number;
    designClippedToOutline: boolean;
  };
  design: null | {
    loaded: boolean;
    size: string;
    rotationDeg: number;
    scalePercent: number;
    flipH: boolean;
    flipV: boolean;
    hasWarp: boolean;
    eraserUsed: boolean;
    filters: {
      brightness: number;
      contrast: number;
      grayscale: number;
      invert: number;
    };
  };
};

type CanvasAssistantProps = {
  context: CanvasAssistantContext;
  designImageSrc?: string | null;
  partPhotoSrc?: string | null;
  pendingQuestion?: string | null;
  onPendingQuestionHandled?: () => void;
};

const MESSAGE_LIMIT = 12;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function compactMessages(messages: AssistantMessage[]) {
  return messages.slice(-MESSAGE_LIMIT).map(({ role, content }) => ({ role, content }));
}

function localReply(question: string, context: CanvasAssistantContext) {
  const lower = question.toLowerCase();
  const hasDesign = !!context.design;
  const hasDetectedOutline = context.engraveAi.outlineReady;
  const sizeLine = hasDesign
    ? `Your current design is ${context.design?.size} on a ${context.material.displaySize} canvas.`
    : `Your canvas is set to ${context.material.displaySize}; upload a design before checking exact placement.`;
  const outlineLine = hasDetectedOutline
    ? `A closed outline with ${context.engraveAi.tracePoints} points is ready${context.engraveAi.designClippedToOutline ? ", and the design is clipped to it" : ""}.`
    : "Use Engrave AI to detect the material outline from a part photo, then use Trace + Clip Art before final export.";

  if (lower.includes("outline") || lower.includes("detect") || lower.includes("clip") || lower.includes("fill area") || lower.includes("laser area")) {
    return [
      "AI is not connected yet, so here is local engraving guidance.",
      "",
      `${sizeLine} ${outlineLine} For the cleanest result, crop/rotate the part photo first, run Detect Outline, adjust tolerance and safety inset, then use Trace + Clip Art. After that, use Fill on the design so the art covers the traced area while the clip keeps it inside the laser-safe boundary.`,
    ].join("\n");
  }

  if (lower.includes("stainless") || lower.includes("ss") || lower.includes("steel")) {
    return [
      "AI is not connected yet, so here is local engraving guidance.",
      "",
      `${sizeLine} For stainless, start with a small test grid on scrap using the same finish. If you want a dark mark, use the laser settings recommended for your machine and consider a marking spray/paste when needed. Keep artwork pure black/white, avoid gray fades unless you are intentionally dithering, and export PNG or actual-size SVG before the final run.`,
    ].join("\n");
  }

  if (lower.includes("nfa") || lower.includes("atf") || lower.includes("serial") || lower.includes("legal")) {
    return [
      "AI is not connected yet, so here is local engraving guidance.",
      "",
      "For NFA or serialized firearm work, use this app for layout and proofing only. Confirm the current ATF and state requirements before engraving, including required text, minimum depth, minimum character height, and placement. Run a test mark and measure depth before touching the finished part.",
    ].join("\n");
  }

  if (lower.includes("deep") || lower.includes("depth")) {
    return [
      "AI is not connected yet, so here is local engraving guidance.",
      "",
      "Depth depends on the material, laser type, coating, lens, speed, power, frequency, and passes. Make a test grid, measure the result, then save that recipe with the material. For compliance work, do not rely on appearance alone; measure the cut.",
    ].join("\n");
  }

  if (lower.includes("black") || lower.includes("white") || lower.includes("contrast") || lower.includes("image")) {
    return [
      "AI is not connected yet, so here is local engraving guidance.",
      "",
      `${sizeLine} For clean engraving art, push contrast up, set grayscale to 100% for photos, and use invert only when the laser/software expects white areas to burn. For stainless plates, a crisp two-tone export usually gives a cleaner result than subtle gray shading.`,
    ].join("\n");
  }

  return [
    "AI is not connected yet, so here is local engraving guidance.",
    "",
    `${sizeLine} A good next pass is: set the material size, upload or load the design, center it, set the exact width/height, then export actual-size SVG for layout or PNG for raster engraving. Ask about stainless, NFA, depth, contrast, or sizing and I can narrow it down.`,
  ].join("\n");
}

function resizeForVision(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const maxEdge = 512;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve("");
      }
    };
    img.onerror = () => resolve("");
    img.src = src;
  });
}

export default function CanvasAssistant({
  context,
  designImageSrc,
  partPhotoSrc,
  pendingQuestion,
  onPendingQuestionHandled,
}: CanvasAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    {
      id: createId(),
      role: "assistant",
      content: engravingT("ai.greeting", {}, context.locale),
      mode: "ai",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const t = useCallback(
    (key: string) => engravingT(key, {}, context.locale),
    [context.locale],
  );

  const suggestions = useMemo(
    () => [
      t("ai.suggest.1"),
      t("ai.suggest.2"),
      t("ai.suggest.3"),
      t("ai.suggest.4"),
    ],
    [t],
  );

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open, pending]);

  const submitQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || pending) return;

      const userMessage: AssistantMessage = {
        id: createId(),
        role: "user",
        content: trimmed,
      };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInput("");
      setOpen(true);
      setPending(true);

      try {
        const [designImageDataUrl, partPhotoDataUrl] = await Promise.all([
          designImageSrc ? resizeForVision(designImageSrc) : Promise.resolve(""),
          partPhotoSrc ? resizeForVision(partPhotoSrc) : Promise.resolve(""),
        ]);

        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: compactMessages(nextMessages),
            context,
            ...(designImageDataUrl ? { designImageDataUrl } : {}),
            ...(partPhotoDataUrl ? { partPhotoDataUrl } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error(`Assistant API returned ${response.status}`);
        }

        const payload = (await response.json()) as { message?: string };
        const content = payload.message?.trim();

        if (!content) {
          throw new Error("Assistant API returned an empty message");
        }

        setMessages((current) => [
          ...current,
          {
            id: createId(),
            role: "assistant",
            content,
            mode: "ai",
          },
        ]);
      } catch {
        setMessages((current) => [
          ...current,
          {
            id: createId(),
            role: "assistant",
            content: localReply(trimmed, context),
            mode: "local",
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [context, designImageSrc, messages, partPhotoSrc, pending],
  );

  useEffect(() => {
    if (!pendingQuestion || pending) return;
    void submitQuestion(pendingQuestion);
    onPendingQuestionHandled?.();
  }, [onPendingQuestionHandled, pending, pendingQuestion, submitQuestion]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitQuestion(input);
    },
    [input, submitQuestion],
  );

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-1rem)] flex-col items-end gap-2">
      {open && (
        <section className="flex h-[min(72vh,640px)] w-[min(calc(100vw-1rem),420px)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{t("ai.title")}</h2>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("ai.powered")}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("ai.clear")}
                    size="icon-xs"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setMessages([
                        {
                          id: createId(),
                          role: "assistant",
                          content: engravingT("ai.greeting", {}, context.locale),
                          mode: "ai",
                        },
                      ]);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("ai.clear")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("ai.close")}
                    size="icon-xs"
                    variant="ghost"
                    type="button"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("ai.close")}</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-lg border px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                      message.role === "user"
                        ? "border-primary/50 bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground",
                    )}
                  >
                    {message.content}
                    {message.mode === "local" && (
                      <div className="mt-2">
                        <Badge variant="outline" className="rounded-md text-[10px]">
                          Local
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    {t("ai.thinking")}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border p-3">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  className="h-7 shrink-0 rounded-md px-2 text-xs"
                  variant="secondary"
                  type="button"
                  onClick={() => void submitQuestion(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
            <form className="flex items-end gap-2" onSubmit={handleSubmit}>
              <Textarea
                aria-label={t("ai.placeholder")}
                className="max-h-28 min-h-10 resize-none text-sm"
                placeholder={t("ai.placeholder")}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitQuestion(input);
                  }
                }}
              />
              <Button
                aria-label={t("ai.send")}
                disabled={pending || !input.trim()}
                size="icon-sm"
                type="submit"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </section>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("ai.label")}
            className="h-12 w-12 rounded-lg shadow-xl"
            size="icon"
            type="button"
            onClick={() => setOpen((value) => !value)}
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{t("ai.label")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
