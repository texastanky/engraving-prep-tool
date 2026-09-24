import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Saved parts live in a file, not in browser storage.
 *
 * The renderer is served from a local port, and browser storage is keyed to that
 * exact origin — so anything saved in the workspace went with the port, and
 * every launch used a new one. A file beside the licence survives restarts,
 * reinstalls and port changes alike.
 */

function storeFile() {
  if (process.env.PRESET_STORE_FILE) return process.env.PRESET_STORE_FILE;
  if (process.env.AUTH_USER_FILE) {
    return path.join(path.dirname(process.env.AUTH_USER_FILE), "parts-presets.json");
  }
  return path.join(process.cwd(), ".data", "parts-presets.json");
}

const MAX_BYTES = 8 * 1024 * 1024;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const file = storeFile();

  if (req.method === "GET" || req.method === "HEAD") {
    try {
      const raw = await fsp.readFile(file, "utf8");
      const presets = JSON.parse(raw);
      res.status(200).json({ presets: Array.isArray(presets) ? presets : [] });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        // No file yet: the caller keeps whatever it already had.
        res.status(200).json({ presets: null });
        return;
      }
      res.status(500).json({ error: "preset_store_unreadable" });
    }
    return;
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }
    const presets = Array.isArray(body) ? body : body && body.presets;
    if (!Array.isArray(presets)) {
      res.status(400).json({ error: "expected_an_array_of_presets" });
      return;
    }

    const payload = JSON.stringify(presets, null, 2);
    if (payload.length > MAX_BYTES) {
      res.status(413).json({ error: "preset_store_too_large" });
      return;
    }

    try {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(file, payload, "utf8");
      res.status(200).json({ ok: true, count: presets.length });
    } catch {
      res.status(500).json({ error: "preset_store_unwritable" });
    }
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
