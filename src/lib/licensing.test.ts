import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LICENSE_PREFIX,
  PLANS,
  aiDecision,
  consumeAiCall,
  consumeExport,
  entitlementExpiry,
  exportDecision,
  getAccountPlan,
  getRenewalState,
  getUsage,
  issueLicenseKey,
  periodKeys,
  setAccountPlan,
  setRenewalCancelled,
  signEntitlement,
  verifyEntitlement,
  verifyLicenseKey,
} from "../../server/licensing.js";
import {
  activateLicense,
  denialMessage,
  entitlementLabel,
  isEntitlementValid,
  fetchLicenseStatus,
  isPaidPlan,
  loadEntitlement,
  requestExportPermission,
  requestRenewalChange,
  saveEntitlement,
  type Entitlement,
} from "./licensing.ts";

const SECRET = "test-license-secret-0123456789abcdef";

/** Narrowing helpers, so assertions can read variant-specific fields. */
function expectOk<T extends { ok: boolean }>(result: T): asserts result is Extract<T, { ok: true }> {
  if (!result.ok) throw new Error("expected a successful result");
}

function reasonOf(result: { ok: boolean; reason?: string }): string {
  return result.reason ?? "";
}

function expectFail<T extends { ok: boolean }>(result: T): asserts result is Extract<T, { ok: false }> {
  if (result.ok) throw new Error("expected a failed result");
}

const paidEntitlement: Entitlement = {
  token: "payload.signature",
  plan: "pro",
  label: "Pro",
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  activatedAt: new Date().toISOString(),
};

describe("licence keys", () => {
  it("issues and verifies a key", () => {
    const key = issueLicenseKey({ sub: "shop@example.com", plan: "shop" }, SECRET);
    expect(key.startsWith(LICENSE_PREFIX + ".")).toBe(true);

    const result = verifyLicenseKey(key, { secret: SECRET });
    expectOk(result);
    expect(result.plan).toBe("shop");
    expect(result.sub).toBe("shop@example.com");
  });

  it("rejects a tampered payload", () => {
    const key = issueLicenseKey({ sub: "a", plan: "pro" }, SECRET);
    const [prefix, , signature] = key.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "a", plan: "shop" }), "utf8").toString("base64url");
    expect(verifyLicenseKey(`${prefix}.${forged}.${signature}`, { secret: SECRET }).ok).toBe(false);
  });

  it("rejects a key signed with a different secret", () => {
    const key = issueLicenseKey({ sub: "a", plan: "pro" }, "another-secret-0123456789abcdef");
    expect(reasonOf(verifyLicenseKey(key, { secret: SECRET }))).toBe("bad_signature");
  });

  it("rejects an expired licence", () => {
    const key = issueLicenseKey(
      { sub: "a", plan: "pro", expiresAt: "2020-01-01T00:00:00.000Z" },
      SECRET
    );
    expect(reasonOf(verifyLicenseKey(key, { secret: SECRET }))).toBe("expired");
  });

  it("rejects malformed keys and unknown plans", () => {
    expect(reasonOf(verifyLicenseKey("nonsense", { secret: SECRET }))).toBe("malformed_key");
    expect(reasonOf(verifyLicenseKey("", { secret: SECRET }))).toBe("malformed_key");
    const freeKey = issueLicenseKey({ sub: "a", plan: "free" }, SECRET);
    expect(reasonOf(verifyLicenseKey(freeKey, { secret: SECRET }))).toBe("unknown_plan");
  });

  it("fails closed when no secret is configured", () => {
    const key = issueLicenseKey({ sub: "a", plan: "pro" }, SECRET);
    const result = verifyLicenseKey(key, { secret: null });
    expectFail(result);
    expect(result.reason).toBe("licensing_not_configured");
  });

  it("never accepts a key the seller did not sign", () => {
    expect(verifyLicenseKey("PGS1.abc.def", { secret: SECRET }).ok).toBe(false);
  });
});

describe("entitlement tokens", () => {
  it("round-trips and carries the plan", () => {
    const token = signEntitlement({ sub: "u1", plan: "pro" }, SECRET);
    const result = verifyEntitlement(token, { secret: SECRET });
    expectOk(result);
    expect(result.plan).toBe("pro");
  });

  it("expires, which bounds offline use", () => {
    const token = signEntitlement({ sub: "u1", plan: "pro", days: -1 }, SECRET);
    expect(verifyEntitlement(token, { secret: SECRET }).ok).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = signEntitlement({ sub: "u1", plan: "pro" }, SECRET);
    const [payload] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "u1", plan: "shop", exp: "2999-01-01T00:00:00.000Z" }),
      "utf8"
    ).toString("base64url");
    expect(verifyEntitlement(`${forged}.${token.split(".")[1]}`, { secret: SECRET }).ok).toBe(false);
    expect(verifyEntitlement(`${payload}.deadbeef`, { secret: SECRET }).ok).toBe(false);
  });

  it("rejects a missing token", () => {
    expect(verifyEntitlement(null, { secret: SECRET }).ok).toBe(false);
  });

  it("exposes the expiry for display without trusting it", () => {
    const token = signEntitlement({ sub: "u1", plan: "pro", days: 10 }, SECRET);
    const expiry = entitlementExpiry(token);
    expect(typeof expiry).toBe("string");
    expect(new Date(expiry as string).getTime()).toBeGreaterThan(Date.now());
    expect(entitlementExpiry("garbage")).toBeNull();
  });
});

describe("quota decisions", () => {
  it("uses UTC month and day keys", () => {
    expect(periodKeys(new Date("2026-09-14T23:30:00.000Z"))).toEqual({
      month: "2026-09",
      day: "2026-09-14",
    });
  });

  it("counts free exports against the monthly limit", () => {
    const limit = PLANS.free.exportsPerMonth;
    expect(exportDecision({ plan: "free", usedThisMonth: limit - 1 }).allowed).toBe(true);
    expect(exportDecision({ plan: "free", usedThisMonth: limit }).allowed).toBe(false);
    expect(exportDecision({ plan: "free", usedThisMonth: limit }).remaining).toBe(0);
  });

  it("treats paid plans as unlimited exports", () => {
    const decision = exportDecision({ plan: "pro", usedThisMonth: 500 });
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(Infinity);
  });

  it("limits AI calls per day by plan", () => {
    expect(aiDecision({ plan: "free", usedToday: 0 }).remaining).toBe(PLANS.free.aiPerDay);
    expect(aiDecision({ plan: "pro", usedToday: PLANS.pro.aiPerDay }).allowed).toBe(false);
    expect(aiDecision({ plan: "shop", usedToday: 10 }).allowed).toBe(true);
  });

  it("falls back to the free plan for an unknown plan", () => {
    expect(aiDecision({ plan: "enterprise" as never, usedToday: 0 }).limit).toBe(PLANS.free.aiPerDay);
  });

  it("ignores nonsense usage values", () => {
    expect(exportDecision({ plan: "free", usedThisMonth: -3 }).remaining).toBe(
      PLANS.free.exportsPerMonth
    );
    expect(exportDecision({ plan: "free", usedThisMonth: Number.NaN }).allowed).toBe(true);
  });
});

describe("usage accounting", () => {
  beforeEach(async () => {
    const usage = await getUsage("counted-user");
    void usage;
    // Reset this user's counters between tests by recording against fresh ids.
  });

  it("increments and reports remaining free exports", async () => {
    const user = `user-${Math.random().toString(36).slice(2)}`;
    const first = await consumeExport({ userId: user, plan: "free" });
    expect(first.allowed).toBe(true);
    expect(first.used).toBe(1);

    const usage = await getUsage(user);
    expect(usage.exportsThisMonth).toBe(1);
  });

  it("does not burn quota when a request is denied", async () => {
    const user = `user-${Math.random().toString(36).slice(2)}`;
    const plan = "free";
    // Exhaust the free allowance.
    for (let i = 0; i < PLANS.free.exportsPerMonth; i += 1) {
      await consumeExport({ userId: user, plan });
    }
    const denied = await consumeExport({ userId: user, plan });
    expect(denied.allowed).toBe(false);

    const usage = await getUsage(user);
    expect(usage.exportsThisMonth).toBe(PLANS.free.exportsPerMonth);
  });

  it("counts AI calls per day", async () => {
    const user = `user-${Math.random().toString(36).slice(2)}`;
    const first = await consumeAiCall({ userId: user, plan: "free" });
    expect(first.allowed).toBe(true);
    expect((await getUsage(user)).aiToday).toBe(1);
  });

  it("keeps users separate", async () => {
    const a = `user-a-${Math.random().toString(36).slice(2)}`;
    const b = `user-b-${Math.random().toString(36).slice(2)}`;
    await consumeExport({ userId: a, plan: "free" });
    expect((await getUsage(a)).exportsThisMonth).toBe(1);
    expect((await getUsage(b)).exportsThisMonth).toBe(0);
  });
});

describe("client entitlement handling", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("recognises paid plans", () => {
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("shop")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("nonsense")).toBe(false);
  });

  it("treats an expired entitlement as unpaid", () => {
    const expired = { ...paidEntitlement, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(isEntitlementValid(expired)).toBe(false);
    expect(isEntitlementValid(paidEntitlement)).toBe(true);
    expect(isEntitlementValid(null)).toBe(false);
  });

  it("treats a free entitlement as unpaid", () => {
    expect(isEntitlementValid({ ...paidEntitlement, plan: "free" })).toBe(false);
  });

  it("round-trips through storage and ignores corruption", () => {
    saveEntitlement(paidEntitlement);
    expect(loadEntitlement()?.plan).toBe("pro");

    window.localStorage.setItem("pgs-entitlement-v1", "{oops");
    expect(loadEntitlement()).toBeNull();

    saveEntitlement(null);
    expect(loadEntitlement()).toBeNull();
  });

  it("describes the licence state", () => {
    expect(entitlementLabel(null)).toBe("Free plan");
    expect(entitlementLabel(paidEntitlement)).toContain("Pro licence");
    const expired = { ...paidEntitlement, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(entitlementLabel(expired)).toContain("expired");
  });
});

describe("requestExportPermission", () => {
  const jsonResponse = (body: unknown, ok = true) =>
    Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) } as Response);

  it("allows the export when the server says yes", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ allowed: true, remaining: 3, plan: "free" })));
    const permission = await requestExportPermission(null);
    expect(permission.allowed).toBe(true);
    expect(permission.remaining).toBe(3);
    vi.unstubAllGlobals();
  });

  it("denies with a quota reason when the server says no", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ allowed: false, remaining: 0, plan: "free" })));
    const permission = await requestExportPermission(null);
    expect(permission.allowed).toBe(false);
    expect(permission.reason).toBe("quota_exceeded");
    expect(denialMessage(permission)).toContain("limit reached");
    vi.unstubAllGlobals();
  });

  it("keeps a paid customer working offline", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const permission = await requestExportPermission(paidEntitlement);
    expect(permission.allowed).toBe(true);
    expect(permission.plan).toBe("pro");
    vi.unstubAllGlobals();
  });

  it("asks a free customer to reconnect when offline", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const permission = await requestExportPermission(null);
    expect(permission.allowed).toBe(false);
    expect(permission.reason).toBe("offline_free");
    expect(denialMessage(permission)).toContain("Connect to the internet");
    vi.unstubAllGlobals();
  });

  it("treats an expired paid entitlement as free when offline", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const expired = { ...paidEntitlement, expiresAt: new Date(Date.now() - 1000).toISOString() };
    const permission = await requestExportPermission(expired);
    expect(permission.allowed).toBe(false);
    expect(permission.plan).toBe("free");
    vi.unstubAllGlobals();
  });
});

describe("activateLicense", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores the entitlement the server returns", async () => {
    const expiry = new Date(Date.now() + 86400000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              entitlement: "token.value",
              plan: "shop",
              planLabel: "Shop",
              entitlementExpiresAt: expiry,
            }),
        } as Response)
      )
    );

    const result = await activateLicense("PGS1.abc.def");
    expect(result.ok).toBe(true);
    const stored = loadEntitlement();
    expect(stored?.plan).toBe("shop");
    expect(stored?.expiresAt).toBe(expiry);
    vi.unstubAllGlobals();
  });

  it("reports an invalid key without storing anything", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "invalid_license", reason: "bad_signature" }),
        } as Response)
      )
    );

    const result = await activateLicense("PGS1.bad.key");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("bad_signature");
    expect(loadEntitlement()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("reports a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const result = await activateLicense("PGS1.abc.def");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network");
    vi.unstubAllGlobals();
  });
});

describe("renewal state", () => {
  it("records and clears a cancellation for one account only", async () => {
    const a = `renew-a-${Math.random().toString(36).slice(2)}`;
    const b = `renew-b-${Math.random().toString(36).slice(2)}`;

    expect((await getRenewalState(a)).cancelled).toBe(false);
    const cancelled = await setRenewalCancelled({ userId: a, cancelled: true });
    expect(cancelled.cancelled).toBe(true);
    expect(typeof cancelled.updatedAt).toBe("string");

    expect((await getRenewalState(a)).cancelled).toBe(true);
    expect((await getRenewalState(b)).cancelled).toBe(false);

    const resumed = await setRenewalCancelled({ userId: a, cancelled: false });
    expect(resumed.cancelled).toBe(false);
  });

  it("does not consume quota when a renewal is cancelled", async () => {
    const user = `renew-quota-${Math.random().toString(36).slice(2)}`;
    await setRenewalCancelled({ userId: user, cancelled: true });
    expect((await getUsage(user)).exportsThisMonth).toBe(0);
  });
});

describe("renewal requests from the client", () => {
  const jsonResponse = (body: unknown, ok = true) =>
    Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) } as Response);

  it("reports the new state after cancelling", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ renewalCancelled: true })));
    const result = await requestRenewalChange(true, paidEntitlement);
    expect(result).toEqual({ ok: true, cancelled: true });
    vi.unstubAllGlobals();
  });

  it("reports the new state after resuming", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ renewalCancelled: false })));
    const result = await requestRenewalChange(false, paidEntitlement);
    expect(result).toEqual({ ok: true, cancelled: false });
    vi.unstubAllGlobals();
  });

  it("surfaces a server refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: "bad_action" }, false)));
    const result = await requestRenewalChange(true, paidEntitlement);
    expect(result.ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it("surfaces a network failure, so the UI can point at support", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const result = await requestRenewalChange(true, paidEntitlement);
    expect(result).toEqual({ ok: false, error: "network" });
    vi.unstubAllGlobals();
  });
});

describe("fetchLicenseStatus", () => {
  it("maps the server payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              plan: "shop",
              planLabel: "Shop",
              exportsRemaining: null,
              exportsLimit: null,
              aiRemaining: 998,
              aiLimit: 1000,
              renewalCancelled: true,
            }),
        } as Response)
      )
    );

    const status = await fetchLicenseStatus(paidEntitlement);
    expect(status).toMatchObject({ plan: "shop", aiRemaining: 998, renewalCancelled: true });
    expect(status?.exportsRemaining).toBeNull();
    vi.unstubAllGlobals();
  });

  it("returns null when offline, so the card can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await fetchLicenseStatus(paidEntitlement)).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("account plan (server-side truth)", () => {
  it("defaults to free for an account with no plan", async () => {
    const user = `plan-none-${Math.random().toString(36).slice(2)}`;
    expect(await getAccountPlan(user)).toBe("free");
  });

  it("records a plan and reads it back", async () => {
    const user = `plan-shop-${Math.random().toString(36).slice(2)}`;
    expect(await setAccountPlan(user, "shop")).toBe("shop");
    expect(await getAccountPlan(user)).toBe("shop");
  });

  it("ignores an unknown plan and keeps the account on free", async () => {
    const user = `plan-junk-${Math.random().toString(36).slice(2)}`;
    expect(await setAccountPlan(user, "enterprise")).toBe("free");
    expect(await getAccountPlan(user)).toBe("free");
  });

  it("keeps accounts separate", async () => {
    const a = `plan-a-${Math.random().toString(36).slice(2)}`;
    const b = `plan-b-${Math.random().toString(36).slice(2)}`;
    await setAccountPlan(a, "pro");
    expect(await getAccountPlan(a)).toBe("pro");
    expect(await getAccountPlan(b)).toBe("free");
  });

  it("drives the AI quota for the stored plan, not the free allowance", async () => {
    const user = `plan-quota-${Math.random().toString(36).slice(2)}`;
    await setAccountPlan(user, "shop");

    // A paid account should get far more than the free daily allowance.
    const plan = await getAccountPlan(user);
    const decision = aiDecision({ plan, usedToday: PLANS.free.aiPerDay });
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(PLANS.shop.aiPerDay);

    const consumed = await consumeAiCall({ userId: user, plan });
    expect(consumed.allowed).toBe(true);
    expect((await getUsage(user)).aiToday).toBe(1);
  });

  it("still limits a free account to the free allowance", async () => {
    const user = `plan-free-${Math.random().toString(36).slice(2)}`;
    const plan = await getAccountPlan(user);
    for (let i = 0; i < PLANS.free.aiPerDay; i += 1) {
      await consumeAiCall({ userId: user, plan });
    }
    const blocked = await consumeAiCall({ userId: user, plan });
    expect(blocked.allowed).toBe(false);
  });
});
