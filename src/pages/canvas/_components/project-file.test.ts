import { describe, expect, it, vi, afterEach } from "vitest";
import { decodeProjectImage, parseProject, portableImage, type EngravingProject } from "./project-file.ts";

const image = "data:image/png;base64,aGVsbG8=";
function project(): EngravingProject {
  return {
    app: "engraving-prep-tool", version: 1, unit: "mm",
    material: { widthIn: 5, heightIn: 3 }, canvas: { width: 612, height: 367 },
    selectedPresetId: "custom", showRuler: true, resizeMode: false,
    partPhotoSrc: image, partRotation: 15, designSrc: image,
    designState: {
      x: 123, y: 41, scale: 0.4, scaleX: 1.2, scaleY: 0.8, rotation: 30,
      opacity: 0.6, naturalWidth: 240, naturalHeight: 160, flipH: true, flipV: false,
      filters: { brightness: 85, contrast: 110, grayscale: 100, invert: 0 },
      warpMesh: {
        tl: { x: 1, y: 2 }, tr: { x: 3, y: 4 }, bl: { x: 5, y: 6 }, br: { x: 7, y: 8 },
        top: [{ id: "pin", t: 0.4, offset: { x: 2, y: -3 } }], left: [], right: [], bottom: [],
        interior: [{ id: "inside", s: 0.4, t: 0.6, offset: { x: -2, y: 3 }, radius: 0.24 }],
      },
      mask: null, keepOuts: [{
        shapeId: "rect", x: 20, y: 30, w: 40, h: 50, rotation: 10,
        cornerRadius: 0, feather: 0, invert: false, lockAspect: true, path: "M0 0h40v50z",
      }],
      partCopies: [{ id: "copy", dx: 30, dy: 50, points: [{ x: 1, y: 2 }], closed: true }],
    },
    eraserMaskSrc: image,
    vectorObjects: [{
      id: "test", name: "Rectangle", mode: "cut", strokeWidth: 1,
      subpaths: [{ closed: false, anchors: [{ x: 15, y: 25, in: { x: 10, y: 20 }, out: { x: 30, y: 40 } }] }],
    }],
    trace: {
      points: [{ x: 3, y: 4 }, { x: 40, y: 50 }], closed: false, clipDesign: true,
      style: { strokeColor: "#ff0000", strokeWidth: 2, fillEnabled: false, fillColor: "#000000" },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("portable engraving projects", () => {
  it("round-trips artwork, exact coordinates, vectors, masks, warp, photos and traces", () => {
    const original = project();
    const restored = parseProject(JSON.stringify(original));
    expect(restored).toEqual(original);
    expect(restored.designState!.x / restored.canvas.width * restored.material.widthIn)
      .toBe(original.designState!.x / original.canvas.width * original.material.widthIn);
  });

  it("supports vector-only and empty projects", () => {
    const value = project();
    value.designState = null;
    value.designSrc = null;
    value.eraserMaskSrc = null;
    value.partPhotoSrc = null;
    expect(parseProject(JSON.stringify(value))).toEqual(value);
    value.vectorObjects = [];
    expect(parseProject(JSON.stringify(value)).vectorObjects).toEqual([]);
  });

  it.each([
    { app: "xtool-color-vectorizer" }, { version: 2 }, { unit: "px" },
    { material: { widthIn: 0, heightIn: 2 } }, { canvas: { width: -1, height: 5 } },
    { designSrc: "https://example.com/image.png" }, { partPhotoSrc: "file:///private/image.png" },
    { eraserMaskSrc: "data:text/html;base64,aGVsbG8=" }, { designState: null },
    { vectorObjects: [{ id: "test", name: "bad", mode: "cut", strokeWidth: 1, subpaths: null }] },
  ])("rejects unsupported or unsafe input without mutating it: %j", (patch) => {
    const value = { ...project(), ...patch };
    const text = JSON.stringify(value);
    expect(() => parseProject(text)).toThrow(/not a supported.*current work was not changed/);
    expect(JSON.stringify(value)).toBe(text);
  });

  it("rejects malformed JSON and non-finite geometry", () => {
    expect(() => parseProject("{broken")).toThrow();
    const value = project();
    value.designState!.x = Infinity;
    expect(() => parseProject(JSON.stringify(value))).toThrow();
  });

  it("keeps account and licence data out of parsed project files", () => {
    expect(parseProject(JSON.stringify({ ...project(), licenseKey: "not-a-key", account: {} })))
      .not.toHaveProperty("licenseKey");
  });

  it("leaves already-embedded images independent of the original file", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await portableImage(image)).toBe(image);
    expect(fetch).not.toHaveBeenCalled();
    expect(await decodeProjectImage(null)).toBeNull();
  });

  it("embeds fetched template/blob images", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, blob: async () => new Blob(["image-bytes"], { type: "image/png" }),
    }));
    expect(await portableImage("blob:original")).toMatch(/^data:image\/png;base64,/);
  });

  it("reports inaccessible sources rather than producing an incomplete file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(portableImage("blob:expired")).rejects.toThrow(/could not be included/);
  });

  it("reports corrupt embedded images before a project can replace the workspace", async () => {
    class FailedImage {
      onerror?: () => void;
      set src(_source: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", FailedImage);
    await expect(decodeProjectImage(image)).rejects.toThrow(/current work was not changed/);
  });
});
