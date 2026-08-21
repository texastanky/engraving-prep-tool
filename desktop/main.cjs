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

async function ensureDesktopAuthEnv() {
  const userData = app.getPath("userData");
  await fsp.mkdir(userData, { recursive: true });

  if (!process.env.AUTH_USER_FILE) {
    process.env.AUTH_USER_FILE = path.join(userData, "auth-users.json");
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

  const routes = new Map([
    ["/api/auth", "auth.js"],
    ["/api/assistant", "assistant.js"],
    ["/api/ai-compose", "ai-compose.js"],
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

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function createWindow(startUrl) {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    title: "Engraving Prep Tool",
    autoHideMenuBar: true,
    backgroundColor: "#0d1117",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadURL(`${startUrl}/canvas#xtool-settings`);

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
