import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistentStorage } from "./persistent-storage.ts";

const key = "laser-canvas-custom-presets";
beforeEach(() => window.localStorage.clear());
afterEach(() => { delete window.engravingStorage; vi.restoreAllMocks(); });

describe("persistent storage", () => {
  it("retains browser support without the desktop bridge", () => {
    persistentStorage.setItem(key, "[]");
    expect(persistentStorage.getItem(key)).toBe("[]");
  });

  it("migrates available legacy data once and prefers the durable value", () => {
    const saved = new Map<string, string>();
    window.engravingStorage = {
      getItem: k => saved.get(k) ?? null,
      setItem: (k, value) => { saved.set(k, value); },
    };
    window.localStorage.setItem(key, '[{"name":"Legacy"}]');
    expect(persistentStorage.getItem(key)).toBe('[{"name":"Legacy"}]');
    expect(saved.get(key)).toBe('[{"name":"Legacy"}]');
    persistentStorage.setItem(key, "[]");
    expect(persistentStorage.getItem(key)).toBe("[]");
  });

  it("propagates native failures without saving to temporary browser storage", () => {
    window.engravingStorage = {
      getItem: () => { throw new Error("unreadable"); },
      setItem: () => { throw new Error("disk full"); },
    };
    expect(() => persistentStorage.setItem(key, "[]")).toThrow("disk full");
    expect(() => persistentStorage.getItem(key)).toThrow("unreadable");
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("reports a missing desktop bridge instead of silently using browser storage", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Electron/43.4.0");
    expect(() => persistentStorage.setItem(key, "[]")).toThrow("Desktop storage is unavailable");
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
