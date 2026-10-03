// Frontend test setup (jsdom project only).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { webcrypto } from "node:crypto";

// jsdom has no SubtleCrypto, and licence keys are verified with Ed25519.
// Node's implementation provides it, so licence tests exercise the real code
// path. Not registered as a stub, so vi.unstubAllGlobals() cannot remove it.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

// Give the legacy PGS1 dev-key path a deterministic secret.
process.env.LICENSE_SECRET =
  process.env.LICENSE_SECRET || "test-license-secret-0123456789abcdef";

// Vitest globals are disabled, so explicitly unmount trees rendered through
// Testing Library after each test.
afterEach(() => {
  cleanup();
});
