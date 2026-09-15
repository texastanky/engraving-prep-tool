// Local dev helper: keeps Vite's dep-optimizer cache outside the project folder.
// The optimizer swaps a temp directory into place, which fails on Windows when a
// file watcher holds a handle on anything inside it.
import base from "./vite.config";
import { defineConfig } from "vite";

export default defineConfig({
  ...base,
  cacheDir: "C:/Users/petet/AppData/Local/Temp/ep-vite-cache-2",
});
