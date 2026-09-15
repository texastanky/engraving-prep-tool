/**
 * First-run guidance.
 *
 * The sidebar is a long list of cards, and a new operator has no way to tell
 * what order to work in or whether they have missed a step. This models the
 * workflow as a short list of steps whose status is derived from the live
 * editor state, so the guide can show real progress rather than a static tour.
 */

export type OnboardingStepId = "material" | "artwork" | "marking" | "export";

export type OnboardingStep = {
  id: OnboardingStepId;
  /** Matches the numbered badge on the corresponding card, when it has one. */
  number: string;
  label: string;
  hint: string;
  /** Steps that are not required before exporting. */
  optional?: boolean;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "material",
    number: "1",
    label: "Set the material",
    hint: "Pick a preset or type the real size. Everything else is measured against this.",
  },
  {
    id: "artwork",
    number: "3",
    label: "Bring in the artwork",
    hint: "Place a design, import an Illustrator SVG as editable paths, or draw shapes.",
  },
  {
    id: "marking",
    number: "5",
    label: "Add the marking",
    hint: "Build the FFL/NFA marking block from your saved shop details.",
  },
  {
    id: "export",
    number: "→",
    label: "Export for the laser",
    hint: "Use Export in the top bar: true-vector SVG for cut work, PNG for raster engraving.",
  },
];

export type OnboardingSignals = {
  /** A material preset has been chosen (the default is "custom"). */
  materialChosen: boolean;
  /** A design, part photo or drawn object exists. */
  hasArtwork: boolean;
  /** A marking block has been added. */
  hasMarking: boolean;
  /** At least one export has completed. */
  hasExported: boolean;
  /** Shop details are saved, which the marking step depends on. */
  shopReady: boolean;
};

export type OnboardingStepStatus = {
  step: OnboardingStep;
  done: boolean;
  /** The first unfinished step, i.e. where to look next. */
  current: boolean;
};

function isDone(id: OnboardingStepId, signals: OnboardingSignals): boolean {
  switch (id) {
    case "material":
      return signals.materialChosen;
    case "artwork":
      return signals.hasArtwork;
    case "marking":
      return signals.hasMarking;
    case "export":
      return signals.hasExported;
    default:
      return false;
  }
}

/** Status for every step, in workflow order. */
export function onboardingStatus(signals: OnboardingSignals): OnboardingStepStatus[] {
  let currentAssigned = false;

  return ONBOARDING_STEPS.map((step) => {
    const done = isDone(step.id, signals);
    const current = !done && !currentAssigned;
    if (current) currentAssigned = true;
    return { step, done, current };
  });
}

/** The step to draw attention to, or null when everything is done. */
export function currentStepId(signals: OnboardingSignals): OnboardingStepId | null {
  const found = onboardingStatus(signals).find((entry) => entry.current);
  return found ? found.step.id : null;
}

export function onboardingProgress(signals: OnboardingSignals): {
  done: number;
  total: number;
  complete: boolean;
} {
  const statuses = onboardingStatus(signals);
  const done = statuses.filter((entry) => entry.done).length;
  return { done, total: statuses.length, complete: done === statuses.length };
}

/**
 * Whether the marking step is blocked on missing shop details. Surfacing this
 * matters: an empty marking block looks broken rather than incomplete.
 */
export function markingBlockedByShop(signals: OnboardingSignals): boolean {
  return !signals.shopReady && !signals.hasMarking;
}

export type OnboardingState = {
  /** The operator closed the guide; it stays closed until reopened. */
  dismissed: boolean;
  hasExported: boolean;
};

export const DEFAULT_ONBOARDING_STATE: OnboardingState = { dismissed: false, hasExported: false };

const STORAGE_KEY = "pgs-onboarding-v1";

export function normalizeOnboardingState(input: unknown): OnboardingState {
  const raw = (input ?? {}) as Partial<OnboardingState>;
  return { dismissed: Boolean(raw.dismissed), hasExported: Boolean(raw.hasExported) };
}

export function loadOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return { ...DEFAULT_ONBOARDING_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ONBOARDING_STATE };
    return normalizeOnboardingState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ONBOARDING_STATE };
  }
}

export function saveOnboardingState(state: OnboardingState): OnboardingState {
  const normalized = normalizeOnboardingState(state);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage blocked: guidance simply does not persist.
    }
  }
  return normalized;
}

/** Remember that an export completed, so the guide can mark it done. */
export function markExported(state: OnboardingState): OnboardingState {
  return saveOnboardingState({ ...state, hasExported: true });
}
