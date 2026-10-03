import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Same build-time injection as vite.config.ts, so licence tests can use the
// real bundled public key where they are not mocking it with a test keypair.
const licencePublicKey = fs.readFileSync(
  path.join(fileURLToPath(new URL(".", import.meta.url)), "server", "license-public.pem"),
  "utf8"
);

// Unit-test config for the portable React app.
export default defineConfig({
  define: {
    __LICENCE_PUBLIC_KEY__: JSON.stringify(licencePublicKey),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    passWithNoTests: true,
    // Restore Vitest mocks before each test to reduce state leakage.
    restoreMocks: true,
    projects: [
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/vitest.setup.ts"],
        },
      },
    ],
  },
});
