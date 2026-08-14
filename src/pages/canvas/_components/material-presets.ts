export const MATERIAL_PRESETS = [
  {
    id: "ar-lower",
    name: "AR Lower Receiver",
    width: 8.5,
    height: 5.5,
    unit: "in" as const,
  },
  {
    id: "glock-19-slide",
    name: "Glock 19 Slide",
    width: 6.85,
    height: 1.1,
    unit: "in" as const,
  },
  {
    id: "glock-17-slide",
    name: "Glock 17 Slide",
    width: 7.5,
    height: 1.1,
    unit: "in" as const,
  },
  {
    id: "sig-p320-slide",
    name: "SIG P320 Slide",
    width: 7.1,
    height: 1.15,
    unit: "in" as const,
  },
  {
    id: "1911-slide",
    name: "1911 Slide",
    width: 6.75,
    height: 1.1,
    unit: "in" as const,
  },
  {
    id: "pmag-30",
    name: "PMAG 30 (Side Panel)",
    width: 3.0,
    height: 7.5,
    unit: "in" as const,
  },
  {
    id: "pistol-grip",
    name: "Pistol Grip Panel",
    width: 3.5,
    height: 4.5,
    unit: "in" as const,
  },
  {
    id: "dog-tag",
    name: "Dog Tag",
    width: 2.0,
    height: 1.125,
    unit: "in" as const,
  },
  {
    id: "knife-blade",
    name: "Knife Blade",
    width: 5.5,
    height: 1.25,
    unit: "in" as const,
  },
  {
    id: "tumbler",
    name: "Tumbler (Unwrapped)",
    width: 9.4,
    height: 3.5,
    unit: "in" as const,
  },
  {
    id: "business-card",
    name: "Business Card",
    width: 3.5,
    height: 2.0,
    unit: "in" as const,
  },
  {
    id: "coaster",
    name: "Round Coaster",
    width: 4.0,
    height: 4.0,
    unit: "in" as const,
  },
  {
    id: "wallet",
    name: "Wallet / Card Holder",
    width: 4.25,
    height: 3.5,
    unit: "in" as const,
  },
  {
    id: "patch-morale",
    name: "Morale Patch (3x2)",
    width: 3.0,
    height: 2.0,
    unit: "in" as const,
  },
  {
    id: "custom",
    name: "Custom Size",
    width: 4.0,
    height: 4.0,
    unit: "in" as const,
  },
] as const;

export type MaterialPreset = (typeof MATERIAL_PRESETS)[number];
export type UnitType = "in" | "mm";

export function convertToPixels(value: number, unit: UnitType, dpi: number = 96): number {
  if (unit === "mm") {
    return (value / 25.4) * dpi;
  }
  return value * dpi;
}

export function convertFromPixels(pixels: number, unit: UnitType, dpi: number = 96): number {
  if (unit === "mm") {
    return (pixels / dpi) * 25.4;
  }
  return pixels / dpi;
}

export function inToMm(inches: number): number {
  return inches * 25.4;
}

export function mmToIn(mm: number): number {
  return mm / 25.4;
}
