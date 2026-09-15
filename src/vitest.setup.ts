// Frontend test setup (jsdom project only).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import os from "node:os";
import path from "node:path";

// Keep licensing counters out of the repository during tests, and give licence
// signing a deterministic secret.
process.env.LICENSE_STORE_FILE = path.join(os.tmpdir(), "pgs-licensing-test.json");
process.env.LICENSE_SECRET =
  process.env.LICENSE_SECRET || "test-license-secret-0123456789abcdef";

// Vitest globals are disabled, so explicitly unmount trees rendered through
// Testing Library after each test.
afterEach(() => {
  cleanup();
});
