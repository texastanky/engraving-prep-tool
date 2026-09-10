const fs = require("node:fs");
const path = require("node:path");

const STORAGE_KEYS = new Set([
  "pgs-canvas-editor-v1",
  "laser-canvas-custom-presets",
  "pgs-xtool-converter-saved-presets-v1",
  "pgs-engraving-locale",
]);
const MAX_STORAGE_BYTES = 32 * 1024 * 1024;

function validKey(key) {
  return typeof key === "string" && (
    STORAGE_KEYS.has(key) || /^engraving-prep-update-dismissed:[\w.-]{1,64}$/.test(key)
  );
}

function createDesktopStorage(userData) {
  const filename = path.join(userData, "engraving-settings.json");

  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (data?.version !== 1 || !data.values || Array.isArray(data.values) ||
          typeof data.values !== "object" ||
          Object.entries(data.values).some(([key, value]) => !validKey(key) || typeof value !== "string")) {
        throw new Error("Invalid desktop settings file");
      }
      return data.values;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      // Never turn an unreadable file into an empty store and overwrite it.
      throw error;
    }
  }

  return {
    getItem(key) {
      if (!validKey(key)) throw new Error("Unsupported settings key");
      return read()[key] ?? null;
    },
    setItem(key, value) {
      if (!validKey(key) || typeof value !== "string") throw new Error("Invalid settings value");
      const values = { ...read(), [key]: value };
      const contents = JSON.stringify({ version: 1, values });
      if (Buffer.byteLength(contents) > MAX_STORAGE_BYTES) throw new Error("Desktop settings are too large");
      fs.mkdirSync(userData, { recursive: true });
      // Replace only after the complete new file has been written successfully.
      const temporary = `${filename}.tmp`;
      fs.writeFileSync(temporary, contents, { mode: 0o600 });
      fs.renameSync(temporary, filename);
    },
  };
}

module.exports = { createDesktopStorage };
