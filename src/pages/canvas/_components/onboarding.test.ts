import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ONBOARDING_STATE,
  ONBOARDING_STEPS,
  currentStepId,
  loadOnboardingState,
  markExported,
  markingBlockedByShop,
  normalizeOnboardingState,
  onboardingProgress,
  onboardingStatus,
  saveOnboardingState,
  type OnboardingSignals,
} from "./onboarding.ts";

const nothing: OnboardingSignals = {
  materialChosen: false,
  hasArtwork: false,
  hasMarking: false,
  hasExported: false,
  shopReady: false,
};

const everything: OnboardingSignals = {
  materialChosen: true,
  hasArtwork: true,
  hasMarking: true,
  hasExported: true,
  shopReady: true,
};

describe("steps", () => {
  it("covers the workflow in order", () => {
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      "material",
      "artwork",
      "marking",
      "export",
    ]);
  });

  it("references the numbers already shown on the cards", () => {
    const numbers = Object.fromEntries(ONBOARDING_STEPS.map((step) => [step.id, step.number]));
    expect(numbers.material).toBe("1");
    expect(numbers.artwork).toBe("3");
    expect(numbers.marking).toBe("5");
  });

  it("every step has a usable hint", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.label.length).toBeGreaterThan(3);
      expect(step.hint.length).toBeGreaterThan(20);
    }
  });
});

describe("onboardingStatus", () => {
  it("marks nothing done and points at the first step on a fresh install", () => {
    const statuses = onboardingStatus(nothing);
    expect(statuses.every((entry) => !entry.done)).toBe(true);
    expect(statuses[0].current).toBe(true);
    expect(statuses.filter((entry) => entry.current)).toHaveLength(1);
  });

  it("advances as work is done", () => {
    const statuses = onboardingStatus({ ...nothing, materialChosen: true });
    const byId = Object.fromEntries(statuses.map((entry) => [entry.step.id, entry]));
    expect(byId.material.done).toBe(true);
    expect(byId.artwork.current).toBe(true);
    expect(byId.marking.done).toBe(false);
  });

  it("skips over completed steps when picking the current one", () => {
    const partial: OnboardingSignals = {
      ...nothing,
      materialChosen: true,
      hasArtwork: true,
    };
    expect(currentStepId(partial)).toBe("marking");
  });

  it("has no current step once everything is done", () => {
    expect(currentStepId(everything)).toBeNull();
    expect(onboardingStatus(everything).every((entry) => entry.done)).toBe(true);
  });
});

describe("onboardingProgress", () => {
  it("counts completed steps", () => {
    expect(onboardingProgress(nothing)).toEqual({ done: 0, total: 4, complete: false });
    expect(onboardingProgress({ ...nothing, materialChosen: true }).done).toBe(1);
  });

  it("reports completion only when every step is done", () => {
    expect(onboardingProgress(everything)).toEqual({ done: 4, total: 4, complete: true });
    expect(onboardingProgress({ ...everything, hasMarking: false }).complete).toBe(false);
  });
});

describe("markingBlockedByShop", () => {
  it("flags the marking step when shop details are missing", () => {
    expect(markingBlockedByShop(nothing)).toBe(true);
  });

  it("does not nag once shop details are saved", () => {
    expect(markingBlockedByShop({ ...nothing, shopReady: true })).toBe(false);
  });

  it("does not nag once a marking exists", () => {
    expect(markingBlockedByShop({ ...nothing, hasMarking: true })).toBe(false);
  });
});

describe("persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts undismissed and unexported", () => {
    expect(loadOnboardingState()).toEqual(DEFAULT_ONBOARDING_STATE);
  });

  it("round-trips", () => {
    saveOnboardingState({ dismissed: true, hasExported: true });
    expect(loadOnboardingState()).toEqual({ dismissed: true, hasExported: true });
  });

  it("remembers an export", () => {
    const next = markExported(loadOnboardingState());
    expect(next.hasExported).toBe(true);
    expect(loadOnboardingState().hasExported).toBe(true);
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem("pgs-onboarding-v1", "not json");
    expect(loadOnboardingState()).toEqual(DEFAULT_ONBOARDING_STATE);
  });

  it("normalises junk input", () => {
    expect(normalizeOnboardingState({ dismissed: "yes", hasExported: 0 })).toEqual({
      dismissed: true,
      hasExported: false,
    });
    expect(normalizeOnboardingState(null)).toEqual(DEFAULT_ONBOARDING_STATE);
  });
});
