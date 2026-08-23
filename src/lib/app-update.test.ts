import { describe, expect, it } from "vitest";
import {
  compareVersions,
  getAvailableUpdate,
  isStandaloneUpdateSurface,
  resolveUpdateManifestUrl,
} from "./app-update.ts";

function makeLocation(url: string) {
  return new URL(url) as unknown as Location;
}

describe("app update helpers", () => {
  it("compares dotted app versions", () => {
    expect(compareVersions("0.1.0", "0.0.0")).toBe(1);
    expect(compareVersions("1.2.0", "1.2")).toBe(0);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("v2.0.0", "1.9.9")).toBe(1);
  });

  it("detects standalone Electron update surfaces", () => {
    expect(isStandaloneUpdateSurface(makeLocation("http://127.0.0.1:5173/canvas?desktop=1"), "Chrome")).toBe(true);
    expect(isStandaloneUpdateSurface(makeLocation("https://example.com/canvas"), "Chrome Electron/43.0.0")).toBe(true);
    expect(isStandaloneUpdateSurface(makeLocation("https://example.com/canvas"), "Chrome")).toBe(false);
  });

  it("resolves a dev manifest override without affecting production checks", () => {
    const location = makeLocation("http://127.0.0.1:5173/canvas?desktop=1&updateManifestUrl=data:application/json,%7B%7D");

    expect(resolveUpdateManifestUrl(location, "https://example.com/update.json", true)).toMatch(/^data:application\/json/);
    expect(resolveUpdateManifestUrl(location, "https://example.com/update.json", false)).toBe("https://example.com/update.json");
  });

  it("returns an available update only when a newer safe installer exists", () => {
    const update = getAvailableUpdate(
      {
        latestVersion: "0.2.0",
        installerUrl: "/downloads/Engraving%20Prep%20Tool%20Setup%200.2.0.exe",
        releaseNotes: "Adds update notifications.",
      },
      "0.1.0",
      "https://engraving-prep-tool.vercel.app/update.json",
    );

    expect(update).toMatchObject({
      currentVersion: "0.1.0",
      installerUrl: "https://engraving-prep-tool.vercel.app/downloads/Engraving%20Prep%20Tool%20Setup%200.2.0.exe",
      latestVersion: "0.2.0",
      releaseNotes: "Adds update notifications.",
    });

    expect(getAvailableUpdate({ latestVersion: "0.1.0", installerUrl: "https://example.com/app.exe" }, "0.1.0")).toBeNull();
    expect(getAvailableUpdate({ latestVersion: "0.2.0", installerUrl: "javascript:alert(1)" }, "0.1.0")).toBeNull();
  });
});
