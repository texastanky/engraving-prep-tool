export const EXPORT_DPI = 300;

type ActualSizeSvgOptions = {
  dpi?: number;
  heightIn: number;
  pngDataUrl: string;
  widthIn: number;
};

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { bytes, mime: match[1] };
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${mime};base64,${btoa(binary)}`;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);

  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);

  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  writeUint32(chunk, 8 + data.length, crc32(crcInput));

  return chunk;
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((value, index) => bytes[index] === value);
}

export function setPngDpi(dataUrl: string, dpi: number = EXPORT_DPI): string {
  const parsed = dataUrlToBytes(dataUrl);
  if (!parsed || parsed.mime !== "image/png" || !isPng(parsed.bytes)) return dataUrl;

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const physData = new Uint8Array(9);
  writeUint32(physData, 0, pixelsPerMeter);
  writeUint32(physData, 4, pixelsPerMeter);
  physData[8] = 1;

  const physChunk = createPngChunk("pHYs", physData);
  const parts: Uint8Array[] = [parsed.bytes.subarray(0, 8)];
  let offset = 8;
  let inserted = false;

  while (offset + 8 <= parsed.bytes.length) {
    const length = readUint32(parsed.bytes, offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > parsed.bytes.length) return dataUrl;

    const type = String.fromCharCode(
      parsed.bytes[offset + 4],
      parsed.bytes[offset + 5],
      parsed.bytes[offset + 6],
      parsed.bytes[offset + 7],
    );

    if (type !== "pHYs") {
      parts.push(parsed.bytes.subarray(offset, chunkEnd));
    }

    if (type === "IHDR" && !inserted) {
      parts.push(physChunk);
      inserted = true;
    }

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  if (!inserted) return dataUrl;

  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let writeOffset = 0;

  for (const part of parts) {
    output.set(part, writeOffset);
    writeOffset += part.length;
  }

  return bytesToDataUrl(output, parsed.mime);
}

export function setJpegDpi(dataUrl: string, dpi: number = EXPORT_DPI): string {
  const parsed = dataUrlToBytes(dataUrl);
  if (!parsed || parsed.mime !== "image/jpeg") return dataUrl;

  const bytes = parsed.bytes;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return dataUrl;

  const density = Math.max(1, Math.min(65535, Math.round(dpi)));
  let offset = 2;

  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const segmentEnd = offset + 2 + length;
    if (segmentEnd > bytes.length) break;

    const isJfif =
      marker === 0xe0 &&
      bytes[offset + 4] === 0x4a &&
      bytes[offset + 5] === 0x46 &&
      bytes[offset + 6] === 0x49 &&
      bytes[offset + 7] === 0x46 &&
      bytes[offset + 8] === 0x00;

    if (isJfif && length >= 16) {
      const output = new Uint8Array(bytes);
      output[offset + 11] = 1;
      output[offset + 12] = (density >>> 8) & 0xff;
      output[offset + 13] = density & 0xff;
      output[offset + 14] = (density >>> 8) & 0xff;
      output[offset + 15] = density & 0xff;
      return bytesToDataUrl(output, parsed.mime);
    }

    offset = segmentEnd;
  }

  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x01,
    (density >>> 8) & 0xff, density & 0xff,
    (density >>> 8) & 0xff, density & 0xff,
    0x00, 0x00,
  ]);
  const output = new Uint8Array(bytes.length + app0.length);
  output.set(bytes.subarray(0, 2), 0);
  output.set(app0, 2);
  output.set(bytes.subarray(2), 2 + app0.length);

  return bytesToDataUrl(output, parsed.mime);
}

function formatMm(inches: number): string {
  return Number(inches * 25.4).toFixed(4).replace(/\.?0+$/, "");
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function createActualSizeSvg({
  dpi = EXPORT_DPI,
  heightIn,
  pngDataUrl,
  widthIn,
}: ActualSizeSvgOptions): string {
  const widthMm = formatMm(widthIn);
  const heightMm = formatMm(heightIn);
  const imageHref = escapeXmlAttribute(pngDataUrl);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
    `  <title>Engraving export ${widthIn.toFixed(3)}in x ${heightIn.toFixed(3)}in</title>`,
    `  <desc>Actual-size xTool import wrapper. Embedded raster is calibrated to ${dpi} DPI.</desc>`,
    `  <image href="${imageHref}" xlink:href="${imageHref}" x="0" y="0" width="${widthMm}" height="${heightMm}" preserveAspectRatio="none" />`,
    `</svg>`,
  ].join("\n");
}
