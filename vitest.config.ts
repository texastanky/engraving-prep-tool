import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

// Unit-test config for the portable React app.
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
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
