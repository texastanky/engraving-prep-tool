/**
 * Client side of licensing.
 *
 * The client only decides what to *ask* for and how to present it. Enforcement
 * lives on the server (see server/licensing.js): exports are counted there and
 * AI calls are gated there. A patched client can skip the export check, which is
 * unavoidable for a feature that runs entirely on the local machine — so the
 * export counter is a speed bump for normal installs, while AI quota and licence
 * validity are genuinely enforced.
 *
 * Offline behaviour: a valid paid entitlement keeps working without a connection
 * (a shop should not stop working when the internet does), and its exports are
 * not counted while offline. The free tier needs a connection to count.
 */

export type Plan = "free" | "pro" | "shop";

export type Entitlement = {
  token: string;
  plan: Plan;
  label: string;
  expiresAt: string | null;
  activatedAt: string;
};

export type ExportPermission = {
  allowed: boolean;
  /** Null means unlimited (or unknown while offline on a paid plan). */
  remaining: number | null;
  plan: Plan;
  reason?: "quota_exceeded" | "offline_free" | "server_error";
};

const STORAGE_KEY = "pgs-entitlement-v1";

export function isPaidPlan(plan: string): plan is "pro" | "shop" {
  return plan === "pro" || plan === "shop";
}

/** True when a paid entitlement is present and has not expired. */
export function isEntitlementValid(
  entitlement: Entitlement | null,
  now: Date = new Date()
): boolean {
  if (!entitlement || !isPaidPlan(entitlement.plan)) return false;
  if (!entitlement.expiresAt) return true;
  const expiry = new Date(entitlement.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > now.getTime();
}

export function loadEntitlement(): Entitlement | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Entitlement>;
    if (!parsed || typeof parsed.token !== "string") return null;
    const plan: Plan = parsed.plan === "pro" || parsed.plan === "shop" ? parsed.plan : "free";
    return {
      token: parsed.token,
      plan,
      label: typeof parsed.label === "string" ? parsed.label : plan,
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : null,
      activatedAt: typeof parsed.activatedAt === "string" ? parsed.activatedAt : "",
    };
  } catch {
    return null;
  }
}

export function saveEntitlement(entitlement: Entitlement | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!entitlement) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entitlement));
  } catch {
    // Storage blocked: licensing simply is not cached.
  }
}

/** Short status line for the UI. */
export function entitlementLabel(entitlement: Entitlement | null, now: Date = new Date()): string {
  if (!isEntitlementValid(entitlement, now)) {
    if (entitlement && isPaidPlan(entitlement.plan)) return "Licence expired — running on the free plan";
    return "Free plan";
  }
  const plan = entitlement!.label || entitlement!.plan;
  if (!entitlement!.expiresAt) return `${plan} licence`;
  const days = Math.max(
    0,
    Math.ceil((new Date(entitlement!.expiresAt).getTime() - now.getTime()) / 86400000)
  );
  return `${plan} licence · renews in ${days} day${days === 1 ? "" : "s"}`;
}

async function postLicense(payload: Record<string, unknown>, token?: string) {
  const response = await fetch("/api/license", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-entitlement": token } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body } as {
    ok: boolean;
    status: number;
    body: Record<string, unknown>;
  };
}

/** Redeem a licence key and cache the resulting entitlement. */
export async function activateLicense(
  licenseKey: string
): Promise<{ ok: boolean; error?: string; plan?: Plan }> {
  try {
    const { ok, body } = await postLicense({ action: "activate", licenseKey });
    if (!ok) {
      const reason = typeof body.reason === "string" ? body.reason : "invalid_license";
      return { ok: false, error: reason };
    }

    const entitlement: Entitlement = {
      token: String(body.entitlement ?? ""),
      plan: (body.plan === "pro" || body.plan === "shop" ? body.plan : "free") as Plan,
      label: String(body.planLabel ?? body.plan ?? "Licensed"),
      // The cached entitlement's own expiry bounds offline use.
      expiresAt:
        typeof body.entitlementExpiresAt === "string" ? body.entitlementExpiresAt : null,
      activatedAt: new Date().toISOString(),
    };
    saveEntitlement(entitlement);
    return { ok: true, plan: entitlement.plan };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Ask the server for permission to export once.
 *
 * Offline: a valid paid entitlement still exports (uncounted); the free tier
 * cannot be counted offline, so it is asked to reconnect.
 */
export async function requestExportPermission(
  entitlement: Entitlement | null,
  now: Date = new Date()
): Promise<ExportPermission> {
  const plan: Plan = isEntitlementValid(entitlement, now) ? entitlement!.plan : "free";

  try {
    const { ok, body } = await postLicense({ action: "export" }, entitlement?.token);
    if (!ok) {
      return { allowed: false, remaining: null, plan, reason: "server_error" };
    }

    const remaining = typeof body.remaining === "number" ? body.remaining : null;
    return {
      allowed: Boolean(body.allowed),
      remaining,
      plan: (body.plan === "pro" || body.plan === "shop" ? body.plan : "free") as Plan,
      reason: body.allowed ? undefined : "quota_exceeded",
    };
  } catch {
    // Offline.
    if (isEntitlementValid(entitlement, now)) {
      return { allowed: true, remaining: null, plan };
    }
    return { allowed: false, remaining: null, plan: "free", reason: "offline_free" };
  }
}

/** Human-readable explanation for a denied export. */
export function denialMessage(permission: ExportPermission): string {
  switch (permission.reason) {
    case "quota_exceeded":
      return "Free plan export limit reached for this month — activate a licence for unlimited exports.";
    case "offline_free":
      return "Connect to the internet to use free plan exports, or activate a licence to work offline.";
    default:
      return "Export could not be authorised right now. Please try again.";
  }
}

export type LicenseStatus = {
  plan: Plan;
  planLabel: string;
  exportsRemaining: number | null;
  exportsLimit: number | null;
  aiRemaining: number;
  aiLimit: number;
  renewalCancelled: boolean;
};

/** Current plan, allowances and renewal state, straight from the server. */
export async function fetchLicenseStatus(
  entitlement: Entitlement | null
): Promise<LicenseStatus | null> {
  try {
    const response = await fetch("/api/license", {
      credentials: "include",
      headers: entitlement?.token ? { "x-entitlement": entitlement.token } : undefined,
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      plan: (body.plan === "pro" || body.plan === "shop" ? body.plan : "free") as Plan,
      planLabel: String(body.planLabel ?? body.plan ?? "Free"),
      exportsRemaining: typeof body.exportsRemaining === "number" ? body.exportsRemaining : null,
      exportsLimit: typeof body.exportsLimit === "number" ? body.exportsLimit : null,
      aiRemaining: typeof body.aiRemaining === "number" ? body.aiRemaining : 0,
      aiLimit: typeof body.aiLimit === "number" ? body.aiLimit : 0,
      renewalCancelled: Boolean(body.renewalCancelled),
    };
  } catch {
    // Offline: the card falls back to what the cached entitlement says.
    return null;
  }
}

export type RenewalChangeResult = { ok: true; cancelled: boolean } | { ok: false; error: "network" | "server" };

/** Stop (or resume) renewal of the licence. */
export async function requestRenewalChange(
  cancel: boolean,
  entitlement: Entitlement | null
): Promise<RenewalChangeResult> {
  try {
    const { ok, body } = await postLicense({ action: "set-renewal", cancel }, entitlement?.token);
    if (!ok) return { ok: false, error: "server" };
    return { ok: true, cancelled: Boolean(body.renewalCancelled) };
  } catch {
    return { ok: false, error: "network" };
  }
}
