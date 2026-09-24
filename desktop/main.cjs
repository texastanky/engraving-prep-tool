const { app, BrowserWindow, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const LOCAL_API_BODY_LIMIT = 12 * 1024 * 1024;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * In development only, pick up .env.local the way the dev server does, so the
 * owner account, licence secret and API keys set there apply to the desktop app
 * too. Skipped entirely in a packaged build, so nothing sensitive ships.
 */
function loadLocalEnvFile() {
  if (app.isPackaged) return;
  const envPath = path.join(__dirname, "..", ".env.local");
  let raw;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

async function ensureDesktopAuthEnv() {
  loadLocalEnvFile();

  const userData = app.getPath("userData");
  await fsp.mkdir(userData, { recursive: true });

  if (!process.env.AUTH_USER_FILE) {
    process.env.AUTH_USER_FILE = path.join(userData, "auth-users.json");
  }

  if (!process.env.PRESET_STORE_FILE) {
    process.env.PRESET_STORE_FILE = path.join(userData, "parts-presets.json");
  }

  if (!process.env.AUTH_COOKIE_SECURE) {
    process.env.AUTH_COOKIE_SECURE = "false";
  }

  if (!process.env.AUTH_SESSION_SECRET) {
    const secretPath = path.join(userData, "session-secret.txt");
    try {
      process.env.AUTH_SESSION_SECRET = (await fsp.readFile(secretPath, "utf8")).trim();
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const secret = crypto.randomBytes(48).toString("base64url");
      await fsp.writeFile(secretPath, secret, { mode: 0o600 });
      process.env.AUTH_SESSION_SECRET = secret;
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;

    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > LOCAL_API_BODY_LIMIT) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });

    req.on("error", reject);
  });
}

function adaptResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(payload));
  };
  return res;
}

function serveStatic(req, res) {
  const distDir = path.join(__dirname, "..", "dist");
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const hasExtension = Boolean(path.extname(pathname));
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const requestedPath = hasExtension
    ? path.normalize(path.join(distDir, relativePath))
    : path.join(distDir, "index.html");
  const distRoot = path.normalize(distDir + path.sep);

  if (!requestedPath.startsWith(distRoot)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.stat(requestedPath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const contentType = mimeTypes[path.extname(requestedPath).toLowerCase()] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    fs.createReadStream(requestedPath).pipe(res);
  });
}

async function startBundledServer() {
  await ensureDesktopAuthEnv();

  // Keep this in step with the localApiPlugin routes in vite.config.ts: anything
  // missing here silently falls through to the static handler in the packaged
  // app, which looks like the feature doing nothing.
  const routes = new Map([
    ["/api/auth", "auth.js"],
    ["/api/license", "license.js"],
    ["/api/assistant", "assistant.js"],
    ["/api/ai-compose", "ai-compose.js"],
    ["/api/presets", "presets.js"],
  ]);

  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const routeFile = routes.get(pathname);

    if (!routeFile) {
      serveStatic(req, res);
      return;
    }

    try {
      const body = req.method === "GET" || req.method === "HEAD" ? {} : await readJsonBody(req);
      const routeUrl = pathToFileURL(path.join(__dirname, "..", "api", routeFile)).href;
      const route = await import(routeUrl);
      req.body = body;
      await route.default(req, adaptResponse(res));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.statusCode = 502;
      res.end(JSON.stringify({ error: "desktop_api_unavailable" }));
    }
  });

  // Serve from the same port as last time where possible. The renderer's storage
  // (settings, language, the guide state) is keyed to its origin, and the origin
  // includes the port — a new port every launch meant every restart began from
  // nothing. Saved parts no longer depend on this, but the rest still does.
  const portFile = path.join(app.getPath("userData"), "last-port.txt");
  let preferredPort = 0;
  try {
    const stored = Number((await fsp.readFile(portFile, "utf8")).trim());
    if (Number.isInteger(stored) && stored > 1024 && stored < 65536) preferredPort = stored;
  } catch {
    // First run, or the file is unreadable: any free port will do.
  }

  const listen = (port) =>
    new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        if (error && error.code === "EADDRINUSE" && port !== 0) {
          // Something else has the port; take a free one rather than not start.
          listen(0).then(resolve, reject);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(server.address().port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });

  const port = await listen(preferredPort);
  await fsp.writeFile(portFile, String(port), "utf8").catch(() => {});

  return {
    server,
    url: `http://127.0.0.1:${port}`,
  };
}

function createWindow(startUrl) {
  const window = new BrowserWindow({
    // Sized so the app fits a scaled desktop. At 200% display scaling a 1920 px
    // screen is only ~960 CSS px wide, so the old 1280 x 860 default (and its
    // 1000 px minimum) could not fit on screen — the window was clamped and the
    // workspace was left cramped. 720 x 560 minimum still fits that desktop.
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 560,
    title: "Engraving Prep Tool",
    autoHideMenuBar: true,
    backgroundColor: "#0d1117",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // No `#xtool-settings` here: that hash auto-opened the xTool Settings Converter
  // dialog on every launch, in front of the canvas. The converter has its own
  // card in the sidebar, and the hash still works as a deep link when wanted.
  window.loadURL(`${startUrl}/canvas?desktop=1`);

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

let bundledServer;

app.whenReady().then(async () => {
  const bundledIndex = path.join(__dirname, "..", "dist", "index.html");
  let startUrl = "http://localhost:5173";

  if (fs.existsSync(bundledIndex)) {
    const bundled = await startBundledServer();
    bundledServer = bundled.server;
    startUrl = bundled.url;
  }

  createWindow(startUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (bundledServer) bundledServer.close();
});
