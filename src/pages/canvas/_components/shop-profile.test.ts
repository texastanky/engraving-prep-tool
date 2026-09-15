import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SHOP_PROFILE,
  applyProfileToFields,
  formatCityState,
  isProfileComplete,
  loadShopProfile,
  normalizeShopProfile,
  saveShopProfile,
} from "./shop-profile.ts";

const STORAGE_KEY = "pgs-shop-profile-v1";

const full = {
  ...DEFAULT_SHOP_PROFILE,
  onboarded: true,
  maker: "Petes Guns and Stuff LLC",
  city: "Henderson",
  state: "tx",
};

describe("normalizeShopProfile", () => {
  it("trims strings and upper-cases the state", () => {
    const profile = normalizeShopProfile({ maker: "  Acme  ", city: " Dallas ", state: "tx" });
    expect(profile.maker).toBe("Acme");
    expect(profile.city).toBe("Dallas");
    expect(profile.state).toBe("TX");
  });

  it("falls back for missing or unusable numbers", () => {
    const profile = normalizeShopProfile({ defaultMarkingHeightIn: "abc", defaultLineGapIn: -1 });
    expect(profile.defaultMarkingHeightIn).toBe(DEFAULT_SHOP_PROFILE.defaultMarkingHeightIn);
    expect(profile.defaultLineGapIn).toBe(DEFAULT_SHOP_PROFILE.defaultLineGapIn);
  });

  it("accepts numeric strings", () => {
    expect(normalizeShopProfile({ defaultMarkingHeightIn: "0.09" }).defaultMarkingHeightIn).toBe(0.09);
  });

  it("defaults the font when blank", () => {
    expect(normalizeShopProfile({ defaultFont: "   " }).defaultFont).toBe("Arial");
  });

  it("only accepts known units", () => {
    expect(normalizeShopProfile({ defaultUnit: "cm" }).defaultUnit).toBe("in");
    expect(normalizeShopProfile({ defaultUnit: "mm" }).defaultUnit).toBe("mm");
  });

  it("survives junk input", () => {
    expect(normalizeShopProfile(null).maker).toBe("");
    expect(normalizeShopProfile(undefined).onboarded).toBe(false);
    expect(normalizeShopProfile("nonsense").maker).toBe("");
  });
});

describe("formatCityState", () => {
  it("joins city and state the way markings normally read", () => {
    expect(formatCityState({ city: "Henderson", state: "TX" })).toBe("HENDERSON, TX");
  });

  it("handles a missing state or city", () => {
    expect(formatCityState({ city: "Henderson", state: "" })).toBe("HENDERSON");
    expect(formatCityState({ city: "", state: "TX" })).toBe("TX");
  });

  it("returns empty when neither is set", () => {
    expect(formatCityState({ city: "  ", state: "" })).toBe("");
  });
});

describe("isProfileComplete", () => {
  it("needs name, city and state", () => {
    expect(isProfileComplete(full)).toBe(true);
    expect(isProfileComplete({ ...full, city: "" })).toBe(false);
    expect(isProfileComplete({ ...full, maker: "   " })).toBe(false);
  });
});

describe("persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a saved profile", () => {
    saveShopProfile(full);
    const loaded = loadShopProfile();
    expect(loaded).toMatchObject({ onboarded: true, state: "TX", maker: "Petes Guns and Stuff LLC" });
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadShopProfile()).toEqual(DEFAULT_SHOP_PROFILE);
  });

  it("returns defaults instead of throwing on corrupt storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadShopProfile()).toEqual(DEFAULT_SHOP_PROFILE);
  });

  it("normalizes on save, so junk never persists", () => {
    const saved = saveShopProfile({ ...full, state: "tx", defaultMarkingHeightIn: -5 } as never);
    expect(saved.state).toBe("TX");
    expect(saved.defaultMarkingHeightIn).toBe(DEFAULT_SHOP_PROFILE.defaultMarkingHeightIn);
  });
});

describe("applyProfileToFields", () => {
  const empty = { maker: "", cityState: "" };

  it("fills blanks from the profile", () => {
    expect(applyProfileToFields(empty, full)).toEqual({
      maker: "PETES GUNS AND STUFF LLC",
      cityState: "HENDERSON, TX",
    });
  });

  it("never clobbers what the operator typed for this job", () => {
    const typed = { maker: "CUSTOMER NAME", cityState: "TYLER, TX" };
    expect(applyProfileToFields(typed, full)).toEqual(typed);
  });

  it("fills only the missing half", () => {
    expect(applyProfileToFields({ maker: "KEEP ME", cityState: "" }, full)).toEqual({
      maker: "KEEP ME",
      cityState: "HENDERSON, TX",
    });
  });

  it("leaves fields empty when the profile is blank", () => {
    expect(applyProfileToFields(empty, DEFAULT_SHOP_PROFILE)).toEqual(empty);
  });
});
