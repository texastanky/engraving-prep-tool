import { describe, expect, it } from "vitest";
import { createActualSizeSvg, setPngDpi } from "./export-calibration.ts";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(",");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function findPngChunk(bytes: Uint8Array, chunkType: string): number {
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );

    if (type === chunkType) return offset;

    offset += length + 12;
  }

  return -1;
}

describe("export calibration", () => {
  it("tags PNG exports as 300 DPI", () => {
    const bytes = dataUrlToBytes(setPngDpi(onePixelPng, 300));
    const physOffset = findPngChunk(bytes, "pHYs");

    expect(physOffset).toBeGreaterThan(0);
    expect(readUint32(bytes, physOffset + 8)).toBe(11811);
    expect(readUint32(bytes, physOffset + 12)).toBe(11811);
    expect(bytes[physOffset + 16]).toBe(1);
  });

  it("wraps a 6.25 by 0.8 inch export with exact xTool dimensions", () => {
    const svg = createActualSizeSvg({
      pngDataUrl: onePixelPng,
      widthIn: 6.25,
      heightIn: 0.8,
    });

    expect(svg).toContain('width="158.75mm"');
    expect(svg).toContain('height="20.32mm"');
    expect(svg).toContain('viewBox="0 0 158.75 20.32"');
  });
});
