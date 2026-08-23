import { requireAuth } from "../server/auth.js";

const MAX_REQUEST_CHARS = 11_000_000;
const MAX_IMAGE_DATA_URL_CHARS = 4_000_000;
const DEFAULT_MODEL = "gpt-4o-mini";

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

function cleanDataUrl(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("data:image/")) return null;
  if (value.length > MAX_IMAGE_DATA_URL_CHARS) return null;
  return value;
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

function buildMessagesWithImages(messages, designImageDataUrl, partPhotoDataUrl) {
  if (!designImageDataUrl && !partPhotoDataUrl) return messages;

  const nextMessages = [...messages];
  const lastUserIndex = nextMessages.reduce(
    (currentIndex, message, index) => (message.role === "user" ? index : currentIndex),
    -1,
  );
  if (lastUserIndex < 0) return nextMessages;

  const imageParts = [];
  if (designImageDataUrl) {
    imageParts.push({
      type: "image_url",
      image_url: { url: designImageDataUrl, detail: "low" },
    });
  }
  if (partPhotoDataUrl) {
    imageParts.push({
      type: "image_url",
      image_url: { url: partPhotoDataUrl, detail: "low" },
    });
  }

  nextMessages[lastUserIndex] = {
    role: "user",
    content: [
      { type: "text", text: nextMessages[lastUserIndex].content },
      ...imageParts,
    ],
  };

  return nextMessages;
}

function summarizeContext(context) {
  const material = context?.material ?? {};
  const canvas = context?.canvas ?? {};
  const partPhoto = context?.partPhoto ?? {};
  const engraveAi = context?.engraveAi ?? {};
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
    engraveAi: {
      outlineReady: Boolean(engraveAi.outlineReady),
      tracePoints: Number(engraveAi.tracePoints) || 0,
      designClippedToOutline: Boolean(engraveAi.designClippedToOutline),
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

function systemPrompt(locale, hasDesignImage, hasPartPhoto) {
  const visionNotes = [
    hasDesignImage
      ? "The user shared the current design image; analyze its engraving suitability directly."
      : "",
    hasPartPhoto
      ? "The user shared a material/part photo; identify visible material and finish cautiously before suggesting starting settings."
      : "",
  ].filter(Boolean);

  return [
    "You are the in-app Engraving Assistant for a laser engraving layout tool.",
    ...visionNotes,
    "Help users prepare artwork, size designs, choose export formats, and think through laser setup for stainless steel, anodized aluminum, coated metal, polymer, wood, acrylic, and firearm parts.",
    hasDesignImage || hasPartPhoto
      ? "Use the provided images and canvas context together. If image detail is ambiguous, say what you can and cannot tell from the photo."
      : "Use the provided canvas context when it helps. Do not claim to inspect uploaded images when none were provided.",
    "When analyzing a design image, comment on contrast, fine detail density at the intended size, dithering needs, edge sharpness, and expected engraving result on the selected material.",
    "When analyzing a material photo, identify visible material and finish, then give cautious starting speed/power/frequency guidance and recommend a test grid on scrap.",
    "When the user asks about outline detection, laser-safe areas, or filling art inside a part, explain the Engrave AI flow: crop/rotate part photo, detect outline, tune tolerance/safety inset/points, use Trace + Clip Art, fill the artwork, then export.",
    "For advertising copy around firearm engraving, focus on customization, engraving, personalization, restoration, and business contact information. Do not frame the business as selling firearms unless the user explicitly asks and provides compliant wording.",
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
  const designImageDataUrl = cleanDataUrl(body.designImageDataUrl);
  const partPhotoDataUrl = cleanDataUrl(body.partPhotoDataUrl);
  const requestSize = JSON.stringify({
    messages,
    context,
    designImageDataUrl,
    partPhotoDataUrl,
  }).length;

  if (requestSize > MAX_REQUEST_CHARS || messages.length === 0) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "missing_configuration" });
    return;
  }

  const messagesWithImages = buildMessagesWithImages(messages, designImageDataUrl, partPhotoDataUrl);
  const hasDesignImage = Boolean(designImageDataUrl);
  const hasPartPhoto = Boolean(partPhotoDataUrl);

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
          { role: "system", content: systemPrompt(context.locale, hasDesignImage, hasPartPhoto) },
          {
            role: "user",
            content: `Current canvas context:\n${JSON.stringify(context, null, 2)}`,
          },
          ...messagesWithImages,
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
