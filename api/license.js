import { requireAuth } from "../server/auth.js";
import {
  PLANS,
  aiDecision,
  consumeExport,
  entitlementExpiry,
  getAccountPlan,
  getRenewalState,
  getUsage,
  setAccountPlan,
  setRenewalCancelled,
  signEntitlement,
  verifyLicenseKey,
} from "../server/licensing.js";

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function statusPayload(userId, plan, usage, renewal = { cancelled: false, updatedAt: null }) {
  const limits = PLANS[plan] ?? PLANS.free;
  const exportsRemaining =
    limits.exportsPerMonth === Infinity
      ? null
      : Math.max(0, limits.exportsPerMonth - usage.exportsThisMonth);

  return {
    plan,
    planLabel: limits.label,
    exportsThisMonth: usage.exportsThisMonth,
    exportsLimit: limits.exportsPerMonth === Infinity ? null : limits.exportsPerMonth,
    exportsRemaining,
    aiToday: usage.aiToday,
    aiLimit: limits.aiPerDay,
    aiRemaining: aiDecision({ plan, usedToday: usage.aiToday }).remaining,
    renewalCancelled: renewal.cancelled,
    renewalUpdatedAt: renewal.updatedAt,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const user = requireAuth(req, res);
  if (!user) return;

  const body = readBody(req);
  // The plan is server-side truth, set when a licence is activated.
  const storedPlan = await getAccountPlan(user.id);
  const now = new Date();

  if (req.method === "GET") {
    const usage = await getUsage(user.id, now);
    const renewal = await getRenewalState(user.id);
    res.status(200).json(statusPayload(user.id, storedPlan, usage, renewal));
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Activate a licence key and hand back a token the client can cache.
  if (body.action === "activate") {
    const result = verifyLicenseKey(body.licenseKey, { now });
    if (!result.ok) {
      res.status(400).json({ error: "invalid_license", reason: result.reason });
      return;
    }

    // Record the plan on the account as well as in the token: quota checks read
    // the account, so a client cannot influence them.
    await setAccountPlan(user.id, result.plan);

    const entitlement = signEntitlement({
      sub: user.id,
      plan: result.plan,
      expiresAt: result.expiresAt,
    });

    const usage = await getUsage(user.id, now);
    res.status(200).json({
      entitlement,
      // When the licence itself ends, and when the cached entitlement must be
      // refreshed (which also bounds offline use).
      planExpiresAt: result.expiresAt ?? null,
      entitlementExpiresAt: entitlementExpiry(entitlement),
      ...statusPayload(user.id, result.plan, usage),
    });
    return;
  }

  // Ask permission for one export; the server records it when allowed.
  if (body.action === "export") {
    const decision = await consumeExport({ userId: user.id, plan: storedPlan, now });
    const usage = await getUsage(user.id, now);
    const status = statusPayload(user.id, storedPlan, usage);

    // `remaining` comes from the updated usage, so it means "left after this
    // export" and stays consistent with exportsThisMonth in the same payload.
    res.status(200).json({
      allowed: decision.allowed,
      remaining: status.exportsRemaining,
      ...status,
    });
    return;
  }

  // Stop (or resume) renewal of the licence. The customer does this from the
  // app's Licence section; see the note in server/licensing.js about wiring this
  // to a payment processor once billing is integrated.
  if (body.action === "set-renewal") {
    await setRenewalCancelled({ userId: user.id, cancelled: Boolean(body.cancel), now });
    const usage = await getUsage(user.id, now);
    const renewal = await getRenewalState(user.id);
    res.status(200).json(statusPayload(user.id, storedPlan, usage, renewal));
    return;
  }

  res.status(400).json({ error: "bad_action" });
}
