/**
 * Shop profile.
 *
 * The marking tool is only useful if it already knows who you are. The profile
 * holds the licensed shop details that appear in FFL/NFA markings, plus the
 * layout defaults the operator prefers, so a job starts correct rather than
 * being retyped every time.
 *
 * Stored locally (this is a local-first desktop tool). If accounts ever move
 * server-side, this is the object to sync per account.
 */

export type ShopProfile = {
  /** False until the operator has been through first-run setup. */
  onboarded: boolean;
  /** Licensed name as it must appear in the marking. */
  maker: string;
  city: string;
  state: string;
  /** Defaults applied to new marking blocks. */
  defaultMarkingHeightIn: number;
  defaultLineGapIn: number;
  defaultFont: string;
  defaultUnit: "in" | "mm";
};

const STORAGE_KEY = "pgs-shop-profile-v1";

/** Conventional minimum character height, used as the default. */
const DEFAULT_HEIGHT_IN = 0.125;

export const DEFAULT_SHOP_PROFILE: ShopProfile = {
  onboarded: false,
  maker: "",
  city: "",
  state: "",
  defaultMarkingHeightIn: DEFAULT_HEIGHT_IN,
  defaultLineGapIn: 0.02,
  defaultFont: "Arial",
  defaultUnit: "in",
};

function coerceUnit(value: unknown): "in" | "mm" {
  return value === "mm" ? "mm" : "in";
}

function coerceNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Rebuild a profile from untrusted input (storage or a form). */
export function normalizeShopProfile(input: unknown): ShopProfile {
  const raw = (input ?? {}) as Partial<ShopProfile>;
  return {
    onboarded: Boolean(raw.onboarded),
    maker: coerceString(raw.maker),
    city: coerceString(raw.city),
    state: coerceString(raw.state).toUpperCase().slice(0, 8),
    defaultMarkingHeightIn: coerceNumber(
      raw.defaultMarkingHeightIn,
      DEFAULT_SHOP_PROFILE.defaultMarkingHeightIn
    ),
    defaultLineGapIn: coerceNumber(raw.defaultLineGapIn, DEFAULT_SHOP_PROFILE.defaultLineGapIn),
    defaultFont: coerceString(raw.defaultFont) || DEFAULT_SHOP_PROFILE.defaultFont,
    defaultUnit: coerceUnit(raw.defaultUnit),
  };
}

/** "HENDERSON, TX" — the form these markings normally take. */
export function formatCityState(profile: Pick<ShopProfile, "city" | "state">): string {
  const city = profile.city.trim().toUpperCase();
  const state = profile.state.trim().toUpperCase();
  if (!city && !state) return "";
  if (!state) return city;
  if (!city) return state;
  return city + ", " + state;
}

/** True when the profile has enough to fill a marking block's core lines. */
export function isProfileComplete(
  profile: Pick<ShopProfile, "maker" | "city" | "state">
): boolean {
  return (
    profile.maker.trim().length > 0 &&
    profile.city.trim().length > 0 &&
    profile.state.trim().length > 0
  );
}

export function loadShopProfile(): ShopProfile {
  if (typeof window === "undefined") return { ...DEFAULT_SHOP_PROFILE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SHOP_PROFILE };
    return normalizeShopProfile(JSON.parse(raw));
  } catch {
    // Corrupt or unreadable profile: fall back rather than break the editor.
    return { ...DEFAULT_SHOP_PROFILE };
  }
}

export function saveShopProfile(profile: ShopProfile): ShopProfile {
  const normalized = normalizeShopProfile(profile);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage full or blocked: the caller still gets the normalized profile.
    }
  }
  return normalized;
}

/**
 * Fill marking fields from the profile without clobbering anything the operator
 * has already typed for this job.
 */
export function applyProfileToFields<T extends { maker: string; cityState: string }>(
  fields: T,
  profile: ShopProfile
): T {
  const cityState = formatCityState(profile);
  const next = { ...fields };
  if (!next.maker.trim() && profile.maker.trim()) next.maker = profile.maker.trim().toUpperCase();
  if (!next.cityState.trim() && cityState) next.cityState = cityState;
  return next;
}
