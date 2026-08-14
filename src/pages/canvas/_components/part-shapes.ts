/**
 * Accurate SVG silhouettes for common laser engraving surfaces.
 * Each shape is defined as an SVG path in a normalized 1000x1000 viewBox.
 * Holes/cutouts use the evenodd fill rule.
 *
 * Dimensions are the engravable flat surface only (not the whole part).
 */

export type PartShape = {
  id: string;
  name: string;
  /** Engravable surface width in inches */
  width: number;
  /** Engravable surface height in inches */
  height: number;
  /**
   * SVG path data in a normalized coordinate system.
   * viewBox is always "0 0 1000 {1000 * height/width}" so shapes scale correctly.
   * Use evenodd fill for cutouts.
   */
  svgPath: string;
  /** fill-rule for the path */
  fillRule?: "nonzero" | "evenodd";
};

// Helper: aspect ratio height given width=1000
const h = (width: number, height: number) => Math.round((height / width) * 1000);

export const PART_SHAPES: PartShape[] = [
  {
    id: "glock-19-slide",
    name: "Glock 19 Slide",
    width: 6.85,
    height: 1.1,
    fillRule: "evenodd",
    svgPath: (() => {
      const W = 1000;
      const H = h(6.85, 1.1); // ~161
      // Outer slide profile: rectangular with slightly beveled front & rear corners
      const outer = `M 20,0 L ${W - 20},0 L ${W},20 L ${W},${H - 20} L ${W - 20},${H} L 20,${H} L 0,${H - 20} L 0,20 Z`;
      // Ejection port cutout: notch in the top-right area
      // Roughly 25% of width wide, 40% of height tall, positioned ~58% from left
      const epX = Math.round(W * 0.58);
      const epW = Math.round(W * 0.24);
      const epH = Math.round(H * 0.42);
      const cutout = `M ${epX},0 L ${epX + epW},0 L ${epX + epW},${epH} L ${epX},${epH} Z`;
      return `${outer} ${cutout}`;
    })(),
  },
  {
    id: "glock-17-slide",
    name: "Glock 17 Slide",
    width: 7.5,
    height: 1.1,
    fillRule: "evenodd",
    svgPath: (() => {
      const W = 1000;
      const H = h(7.5, 1.1); // ~147
      const outer = `M 20,0 L ${W - 20},0 L ${W},20 L ${W},${H - 20} L ${W - 20},${H} L 20,${H} L 0,${H - 20} L 0,20 Z`;
      const epX = Math.round(W * 0.56);
      const epW = Math.round(W * 0.25);
      const epH = Math.round(H * 0.42);
      const cutout = `M ${epX},0 L ${epX + epW},0 L ${epX + epW},${epH} L ${epX},${epH} Z`;
      return `${outer} ${cutout}`;
    })(),
  },
  {
    id: "sig-p320-slide",
    name: "SIG P320 Slide",
    width: 7.1,
    height: 1.15,
    fillRule: "evenodd",
    svgPath: (() => {
      const W = 1000;
      const H = h(7.1, 1.15); // ~162
      // P320 has a more squared profile and a wider ejection port notch
      const outer = `M 15,0 L ${W - 15},0 L ${W},15 L ${W},${H} L 0,${H} L 0,15 Z`;
      // Ejection port: wider and taller than Glock, ~60-87% from left
      const epX = Math.round(W * 0.60);
      const epW = Math.round(W * 0.27);
      const epH = Math.round(H * 0.48);
      // P320 ep has a slightly stepped bottom-left corner
      const cutout = `M ${epX},0 L ${epX + epW},0 L ${epX + epW},${epH} L ${epX + 20},${epH} L ${epX},${epH - 15} Z`;
      return `${outer} ${cutout}`;
    })(),
  },
  {
    id: "1911-slide",
    name: "1911 Slide",
    width: 6.75,
    height: 1.1,
    fillRule: "evenodd",
    svgPath: (() => {
      const W = 1000;
      const H = h(6.75, 1.1); // ~163
      // 1911 has more pronounced front serrations taper — flat top profile for engraving
      const outer = `M 30,0 L ${W - 40},0 L ${W - 10},30 L ${W},${H * 0.5} L ${W - 10},${H} L 30,${H} L 0,${H} L 0,0 Z`;
      // Ejection port: right side, rectangular
      const epX = Math.round(W * 0.62);
      const epW = Math.round(W * 0.20);
      const epH = Math.round(H * 0.50);
      const cutout = `M ${epX},0 L ${epX + epW},0 L ${epX + epW},${epH} L ${epX},${epH} Z`;
      return `${outer} ${cutout}`;
    })(),
  },
  {
    id: "ar-lower",
    name: "AR-15 Lower (Flat Side)",
    width: 7.0,
    height: 4.8,
    fillRule: "evenodd",
    svgPath: (() => {
      const W = 1000;
      const H = h(7.0, 4.8); // ~686
      // Simplified AR lower profile — engravable left flat panel
      // Main body rectangle with angled bottom
      const outer = `
        M 50,0
        L ${W - 50},0
        L ${W},50
        L ${W},${H * 0.6}
        L ${W - 100},${H - 80}
        L ${W * 0.7},${H}
        L ${W * 0.3},${H}
        L ${W * 0.1},${H - 100}
        L 0,${H * 0.6}
        L 0,50
        Z
      `;
      // Magazine well cutout (center-bottom)
      const mwX = Math.round(W * 0.35);
      const mwW = Math.round(W * 0.30);
      const mwY = Math.round(H * 0.55);
      const mwH = Math.round(H * 0.35);
      const magWell = `M ${mwX},${mwY} L ${mwX + mwW},${mwY} L ${mwX + mwW},${mwY + mwH} L ${mwX},${mwY + mwH} Z`;
      return `${outer} ${magWell}`;
    })(),
  },
  {
    id: "pmag-30-side",
    name: "PMAG 30 (Side Panel)",
    width: 3.0,
    height: 7.5,
    fillRule: "nonzero",
    svgPath: (() => {
      const W = 1000;
      const H = h(3.0, 7.5); // 2500
      // PMAG side — slightly curved taper at base
      return `
        M 50,0
        L ${W - 50},0
        L ${W - 20},20
        L ${W},${H * 0.7}
        L ${W * 0.6},${H}
        L ${W * 0.4},${H}
        L 0,${H * 0.7}
        L 20,20
        Z
      `;
    })(),
  },
  {
    id: "dog-tag",
    name: "Dog Tag",
    width: 2.0,
    height: 1.125,
    fillRule: "evenodd",
    svgPath: (() => {
      const W = 1000;
      const H = h(2.0, 1.125); // ~563
      const r = 60; // corner radius approximated as chamfer
      // Rounded rectangle
      const body = `M ${r},0 L ${W - r},0 L ${W},${r} L ${W},${H - r} L ${W - r},${H} L ${r},${H} L 0,${H - r} L 0,${r} Z`;
      // Chain hole (top center)
      const holeX = Math.round(W * 0.5);
      const holeY = Math.round(H * 0.12);
      const holeR = 28;
      // Approximate circle with octagon
      const hole = `M ${holeX},${holeY - holeR} L ${holeX + 20},${holeY - 20} L ${holeX + holeR},${holeY} L ${holeX + 20},${holeY + 20} L ${holeX},${holeY + holeR} L ${holeX - 20},${holeY + 20} L ${holeX - holeR},${holeY} L ${holeX - 20},${holeY - 20} Z`;
      return `${body} ${hole}`;
    })(),
  },
  {
    id: "knife-blade",
    name: "Knife Blade (Flat)",
    width: 5.5,
    height: 1.25,
    fillRule: "nonzero",
    svgPath: (() => {
      const W = 1000;
      const H = h(5.5, 1.25); // ~227
      // Blade tapers to a point at right, choil notch at left
      return `
        M 80,0
        L ${W - 20},${Math.round(H * 0.35)}
        L ${W},${Math.round(H * 0.5)}
        L ${W - 20},${Math.round(H * 0.65)}
        L 80,${H}
        L 40,${H}
        L 0,${Math.round(H * 0.75)}
        L 0,${Math.round(H * 0.25)}
        L 40,0
        Z
      `;
    })(),
  },
  {
    id: "tumbler-unwrapped",
    name: "Tumbler (Unwrapped Band)",
    width: 9.4,
    height: 3.5,
    fillRule: "nonzero",
    svgPath: (() => {
      const W = 1000;
      const H = h(9.4, 3.5); // ~372
      // Simple rectangle — tumbler band is a flat wrap
      return `M 0,0 L ${W},0 L ${W},${H} L 0,${H} Z`;
    })(),
  },
];

/**
 * Generate a data URL for an SVG mask from a PartShape.
 * Returns a white-on-transparent PNG-like SVG data URL usable as CSS mask-image.
 */
export function partShapeToMaskDataUrl(shape: PartShape, width: number, height: number): string {
  const vbH = Math.round((shape.height / shape.width) * 1000);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1000 ${vbH}">
  <path d="${shape.svgPath}" fill="white" fill-rule="${shape.fillRule ?? "nonzero"}" />
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
