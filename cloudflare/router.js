import assistant from "../api/assistant.js";
import compose from "../api/ai-compose.js";

const MAX_BODY_BYTES = 12 * 1024 * 1024;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBody(request) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw json({ error: "request_too_large" }, 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw json({ error: "invalid_json" }, 400);
  }
}

async function runApi(handler, request, env, publicKey) {
  try {
    const body = request.method === "POST" ? await readBody(request) : undefined;
    const headers = new Headers();
    let status = 200;
    let response;
    const res = {
      setHeader(name, value) {
        headers.set(name, value);
      },
      status(code) {
        status = code;
        return res;
      },
      json(payload) {
        headers.set("Content-Type", "application/json; charset=utf-8");
        response = new Response(JSON.stringify(payload), { status, headers });
      },
      end() {
        response = new Response(null, { status, headers });
      },
    };
    await handler(
      { method: request.method, headers: Object.fromEntries(request.headers), body },
      res,
      {
        env,
        licenseOptions: {
          publicKey,
          secret: typeof env.LICENSE_SECRET === "string" && env.LICENSE_SECRET.length >= 16
            ? env.LICENSE_SECRET
            : null,
        },
      },
    );
    return response ?? json({ error: "api_unavailable" }, 502);
  } catch (error) {
    return error instanceof Response ? error : json({ error: "api_unavailable" }, 500);
  }
}

export async function handleRequest(request, env, publicKey) {
  const url = new URL(request.url);
  if (url.pathname === "/api/assistant") return runApi(assistant, request, env, publicKey);
  if (url.pathname === "/api/ai-compose") return runApi(compose, request, env, publicKey);
  if (url.pathname === "/api/presets") {
    // The desktop file store is per device, not a public, shared preset library.
    if (request.method === "GET") return json({ presets: null });
    if (request.method === "HEAD") {
      return new Response(null, { headers: { "Cache-Control": "no-store" } });
    }
    return json({ error: "browser_storage_only" }, 405);
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return json({ error: "not_found" }, 404);
  }
  if (["/terms", "/privacy", "/refunds"].includes(url.pathname)) {
    url.pathname += ".html";
  }
  const asset = await env.ASSETS.fetch(new Request(url, request));
  const response = new Response(asset.body, asset);
  if (/^\/(?:[a-z]{2}\/)?canvas(?:\/|$)/.test(url.pathname)) {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  if (url.pathname === "/update.json") {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Access-Control-Allow-Origin", "*");
  }
  return response;
}
