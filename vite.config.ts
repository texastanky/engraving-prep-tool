import path from "node:path";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const LOCAL_API_BODY_LIMIT = 12 * 1024 * 1024;

type LocalApiResponse = ServerResponse & {
  status: (code: number) => LocalApiResponse;
  json: (payload: unknown) => void;
};
type LocalApiRequest = IncomingMessage & {
  body?: unknown;
  method?: string;
};
type LocalApiHandler = (req: LocalApiRequest, res: LocalApiResponse) => Promise<void> | void;
type LocalApiRouteModule = {
  default: LocalApiHandler;
};

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadLocalServerEnv(root: string) {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const [, key, value] = match;
    if (!process.env[key]) process.env[key] = unquoteEnvValue(value);
  }
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;

    req.on("data", (chunk: Buffer) => {
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

function adaptResponse(res: ServerResponse): LocalApiResponse {
  const apiRes = res as LocalApiResponse;
  apiRes.status = (code: number) => {
    res.statusCode = code;
    return apiRes;
  };
  apiRes.json = (payload: unknown) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  };
  return apiRes;
}

function localApiPlugin(): Plugin {
  const routes = new Map([
    ["/api/auth", "auth.js"],
    ["/api/assistant", "assistant.js"],
    ["/api/ai-compose", "ai-compose.js"],
  ]);

  return {
    name: "local-api-routes",
    configureServer(server: ViteDevServer) {
      loadLocalServerEnv(server.config.root);
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        const routeFile = routes.get(pathname);
        if (!routeFile) {
          next();
          return;
        }

        try {
          const body = req.method === "GET" || req.method === "HEAD" ? {} : await readJsonBody(req);
          const routeUrl = pathToFileURL(path.join(server.config.root, "api", routeFile)).href;
          const route = await import(/* @vite-ignore */ routeUrl) as LocalApiRouteModule;
          const apiReq = req as LocalApiRequest;
          apiReq.body = body;
          await route.default(apiReq, adaptResponse(res));
        } catch {
          if (!res.headersSent) res.statusCode = 502;
          res.end(JSON.stringify({ error: "local_api_unavailable" }));
        }
      });
    },
  };
}

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
) as { version?: string };

const appVersion = packageJson.version ?? "0.0.0";
const updateManifestUrl =
  process.env.VITE_UPDATE_MANIFEST_URL?.trim() || "https://engraving-prep-tool.vercel.app/update.json";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  define: {
    __APP_UPDATE_MANIFEST_URL__: JSON.stringify(updateManifestUrl),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [localApiPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
