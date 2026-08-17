/**
 * Client-side image processing utilities for the engraving tool.
 * Pure canvas operations — no API keys needed.
 */

/**
 * Remove background from an image using flood-fill from corners + edges.
 * Works well on solid/near-solid backgrounds (white, black, light gray).
 * tolerance: 0-100, higher = removes more (default 30)
 */
export function removeBackground(
  img: HTMLImageElement,
  tolerance = 30
): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  // Sample background color from multiple corner/edge points
  const samplePoints = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0], [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)], [Math.floor(width / 2), height - 1],
  ];

  // Average the sampled bg colors
  let totalR = 0, totalG = 0, totalB = 0;
  for (const [x, y] of samplePoints) {
    const idx = (y * width + x) * 4;
    totalR += data[idx];
    totalG += data[idx + 1];
    totalB += data[idx + 2];
  }
  const bgR = totalR / samplePoints.length;
  const bgG = totalG / samplePoints.length;
  const bgB = totalB / samplePoints.length;

  // Flood-fill BFS from all corner seeds
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  function pixelIdx(x: number, y: number) { return y * width + x; }
  function colorDiff(idx: number): number {
    const r = data[idx * 4] - bgR;
    const g = data[idx * 4 + 1] - bgG;
    const b = data[idx * 4 + 2] - bgB;
    return Math.sqrt(r * r + g * g + b * b);
  }
  function isBackground(idx: number): boolean {
    // scale tolerance: 0-100 → 0-441 (max color distance)
    return colorDiff(idx) < (tolerance / 100) * 441;
  }

  // Seed from all corners
  for (const [sx, sy] of samplePoints) {
    const idx = pixelIdx(sx, sy);
    if (!visited[idx] && isBackground(idx)) {
      visited[idx] = 1;
      queue.push(idx);
    }
  }

  // BFS
  const neighbors = [-1, 1, -width, width];
  let qi = 0;
  while (qi < queue.length) {
    const curr = queue[qi++];
    const x = curr % width;
    const y = Math.floor(curr / width);

    for (const d of neighbors) {
      const nx = d === -1 ? x - 1 : d === 1 ? x + 1 : x;
      const ny = d === -width ? y - 1 : d === width ? y + 1 : y;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nidx = pixelIdx(nx, ny);
      if (!visited[nidx] && isBackground(nidx)) {
        visited[nidx] = 1;
        queue.push(nidx);
      }
    }
  }

  // Make visited (background) pixels transparent
  for (let i = 0; i < width * height; i++) {
    if (visited[i]) {
      data[i * 4 + 3] = 0; // alpha = 0
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Apply rounded corners to an image.
 * radius: 0-50 (percentage of shortest side), default 10
 */
export function roundCorners(
  img: HTMLImageElement,
  radiusPct = 10
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const r = Math.min(w, h) * (radiusPct / 100);

  // Clip to rounded rect
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r);
  ctx.lineTo(r, h);
  ctx.arcTo(0, h, 0, h - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}
