import { requireAuth } from "../server/auth.js";

const MAX_REQUEST_CHARS = 12000;
const DEFAULT_MODEL = "gpt-5-mini";

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

function cleanText(value, maxLength = 1200) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-12)
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: cleanText(message?.content),
    }))
    .filter((message) => message.content.length > 0);
}

function summarizeContext(context) {
  const material = context?.material ?? {};
  const canvas = context?.canvas ?? {};
  const partPhoto = context?.partPhoto ?? {};
  const design = context?.design ?? null;

  return {
    locale: context?.locale === "es" ? "es" : "en",
    material: {
      presetName: cleanText(material.presetName, 80),
      displaySize: cleanText(material.displaySize, 80),
      widthIn: Number(material.widthIn) || null,
      heightIn: Number(material.heightIn) || null,
    },
    canvas: {
      displayWidthPx: Number(canvas.displayWidthPx) || null,
      displayHeightPx: Number(canvas.displayHeightPx) || null,
      screenPpi: Number(canvas.screenPpi) || null,
      exportDpi: Number(canvas.exportDpi) || null,
      rulerVisible: Boolean(canvas.rulerVisible),
    },
    partPhoto: {
      loaded: Boolean(partPhoto.loaded),
      rotationDeg: Number(partPhoto.rotationDeg) || 0,
    },
    design: design
      ? {
          loaded: Boolean(design.loaded),
          size: cleanText(design.size, 80),
          rotationDeg: Number(design.rotationDeg) || 0,
          scalePercent: Number(design.scalePercent) || null,
          flipH: Boolean(design.flipH),
          flipV: Boolean(design.flipV),
          hasWarp: Boolean(design.hasWarp),
          eraserUsed: Boolean(design.eraserUsed),
          filters: {
            brightness: Number(design.filters?.brightness) || null,
            contrast: Number(design.filters?.contrast) || null,
            grayscale: Number(design.filters?.grayscale) || null,
            invert: Number(design.filters?.invert) || null,
          },
        }
      : null,
  };
}

function systemPrompt(locale) {
  return [
    "You are the in-app Engraving Assistant for a laser engraving layout tool.",
    "Help users prepare artwork, size designs, choose export formats, and think through laser setup for stainless steel, anodized aluminum, coated metal, polymer, wood, acrylic, and firearm parts.",
    "Use the provided canvas context when it helps. Do not claim to inspect uploaded images; you only receive text state.",
    "For settings, give cautious starting guidance and recommend test grids on scrap because machines, lenses, coatings, and materials vary.",
    "For NFA, ATF, serial number, or other compliance questions, give general orientation only and tell the user to verify current official requirements before engraving.",
    "Do not help evade laws, remove or alter required identifying marks, or present legal guidance as definitive.",
    "Keep responses practical, concise, and under 180 words unless the user asks for detail.",
    locale === "es" ? "Respond in Spanish unless the user asks for English." : "Respond in English unless the user asks for Spanish.",
  ].join(" ");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!requireAuth(req, res)) return;

  const body = readBody(req);
  const messages = normalizeMessages(body.messages);
  const context = summarizeContext(body.context);
  const requestSize = JSON.stringify({ messages, context }).length;

  if (requestSize > MAX_REQUEST_CHARS || messages.length === 0) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "missing_configuration" });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt(context.locale) },
          {
            role: "user",
            content: `Current canvas context:\n${JSON.stringify(context, null, 2)}`,
          },
          ...messages,
        ],
        max_completion_tokens: 700,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      res.status(response.status).json({
        error: "openai_request_failed",
        detail: payload?.error?.message,
      });
      return;
    }

    const message = payload?.choices?.[0]?.message?.content?.trim();
    if (!message) {
      res.status(502).json({ error: "empty_model_response" });
      return;
    }

    res.status(200).json({ message });
  } catch {
    res.status(502).json({ error: "assistant_unavailable" });
  }
}
