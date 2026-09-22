/**
 * Licensing, entitlements and usage quotas.
 *
 * The important design point: anything enforced only in the client can be
 * bypassed by patching a local app, so the checks that matter live here. AI
 * calls are genuinely protected (the provider key is server-side and every call
 * is counted); export counting is recorded server-side so a normal install
 * cannot simply reset its own counter.
 *
 * Secrets come from the environment. If LICENSE_SECRET is unset, licence keys
 * can never be forged as valid and the app falls back to the free tier rather
 * than failing open.
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const STORE_FILE = path.resolve(process.env.LICENSE_STORE_FILE || ".data/licensing.json");

export const LICENSE_PREFIX = "PGS1";

/**
 * Asymmetric licence keys.
 *
 * PGS1 (above) is HMAC-signed with a shared secret. Verifying an HMAC requires
 * the same secret that signs it, so a shipped app would have to carry the
 * signing secret — and anyone who unpacked it could mint their own keys. That
 * makes PGS1 fine for development and unusable for customers.
 *
 * PGS2 is signed with a private key that never leaves the issuer, and verified
 * with a public key the app can safely carry. A key cannot then be forged or
 * edited into existence, including by editing the local licence store.
 */
export const LICENSE_PREFIX_V2 = "PGS2";

export const PLANS = {
  free: { label: "Free", exportsPerMonth: 5, aiPerDay: 5 },
  pro: { label: "Pro", exportsPerMonth: Infinity, aiPerDay: 200 },
  shop: { label: "Shop", exportsPerMonth: Infinity, aiPerDay: 1000 },
};

export function quotaLimits(plan) {
  return PLANS[plan] ?? PLANS.free;
}

/** Period keys used for counters: calendar month and calendar day, UTC. */
export function periodKeys(now = new Date()) {
  const iso = new Date(now).toISOString();
  return { month: iso.slice(0, 7), day: iso.slice(0, 10) };
}

/** Decide whether an export is allowed under the plan. */
export function exportDecision({ plan, usedThisMonth }) {
  const { exportsPerMonth } = quotaLimits(plan);
  const used = Math.max(0, Math.floor(usedThisMonth || 0));
  if (exportsPerMonth === Infinity) return { allowed: true, remaining: Infinity, limit: Infinity };
  const remaining = Math.max(0, exportsPerMonth - used);
  return { allowed: remaining > 0, remaining, limit: exportsPerMonth };
}

/** Decide whether an AI request is allowed under the plan. */
export function aiDecision({ plan, usedToday }) {
  const { aiPerDay } = quotaLimits(plan);
  const used = Math.max(0, Math.floor(usedToday || 0));
  const remaining = Math.max(0, aiPerDay - used);
  return { allowed: remaining > 0, remaining, limit: aiPerDay };
}

function getSecret() {
  const secret = process.env.LICENSE_SECRET;
  return typeof secret === "string" && secret.length >= 16 ? secret : null;
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

let cachedPublicKey;

/**
 * The public key PGS2 licences are verified against.
 *
 * Read from LICENSE_PUBLIC_KEY_FILE, or from server/license-public.pem shipped
 * beside the app. It is public by design — publishing it is safe, which is the
 * entire reason for using asymmetric keys.
 *
 * Returns null when absent, so the app falls back to the free tier rather than
 * failing open.
 */
function getPublicKey() {
  if (cachedPublicKey !== undefined) return cachedPublicKey;
  cachedPublicKey = null;
  const file = process.env.LICENSE_PUBLIC_KEY_FILE || path.resolve("server/license-public.pem");
  try {
    cachedPublicKey = crypto.createPublicKey(readFileSync(file, "utf8"));
  } catch {
    cachedPublicKey = null;
  }
  return cachedPublicKey;
}

function verifyAsymmetric(payload, signature, publicKey) {
  try {
    const key = typeof publicKey === "string" ? crypto.createPublicKey(publicKey) : publicKey;
    return crypto.verify(
      null,
      Buffer.from(payload),
      key,
      Buffer.from(String(signature), "base64url")
    );
  } catch {
    return false;
  }
}

/**
 * Issue a licence key. Format: PGS1.<payload>.<signature>, where payload is
 * base64url JSON. Only the seller needs this; it runs with LICENSE_SECRET set.
 */
export function issueLicenseKey({ sub, plan = "pro", expiresAt = null }, secret = getSecret()) {
  if (!secret) throw new Error("LICENSE_SECRET is not configured");
  const payload = Buffer.from(
    JSON.stringify({ sub, plan, exp: expiresAt }),
    "utf8"
  ).toString("base64url");
  return `${LICENSE_PREFIX}.${payload}.${sign(payload, secret)}`;
}

/** Verify a licence key. Never throws: returns { ok: false, reason }. */
export function verifyLicenseKey(key, { now = new Date(), secret = getSecret(), publicKey } = {}) {
  if (typeof key !== "string") return { ok: false, reason: "missing_key" };

  const parts = key.trim().split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed_key" };

  const [prefix, payload, signature] = parts;

  if (prefix === LICENSE_PREFIX_V2) {
    // Asymmetric: needs only the public key, so this works in a shipped build
    // with no secret configured. `publicKey: null` means "deliberately none".
    const resolved = publicKey === undefined ? getPublicKey() : publicKey;
    if (!resolved) return { ok: false, reason: "licensing_not_configured" };
    if (!verifyAsymmetric(payload, signature, resolved)) {
      return { ok: false, reason: "bad_signature" };
    }
  } else if (prefix === LICENSE_PREFIX) {
    // Legacy symmetric path, kept so existing local development keys still work.
    if (!secret) return { ok: false, reason: "licensing_not_configured" };
    if (!timingSafeEqual(sign(payload, secret), signature)) {
      return { ok: false, reason: "bad_signature" };
    }
  } else {
    return { ok: false, reason: "malformed_key" };
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed_payload" };
  }

  const plan = PLANS[claims.plan] ? claims.plan : "free";
  if (plan === "free") return { ok: false, reason: "unknown_plan" };

  if (claims.exp) {
    const expiry = new Date(claims.exp);
    if (Number.isNaN(expiry.getTime())) return { ok: false, reason: "malformed_expiry" };
    if (expiry.getTime() < new Date(now).getTime()) return { ok: false, reason: "expired" };
  }

  return { ok: true, sub: String(claims.sub || ""), plan, expiresAt: claims.exp ?? null };
}

/** Entitlement token the client caches so the app can run offline for a while. */
export function signEntitlement({ sub, plan, expiresAt, days = 30 }, secret = getSecret()) {
  if (!secret) throw new Error("LICENSE_SECRET is not configured");
  const now = new Date();
  const exp = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const payload = Buffer.from(
    JSON.stringify({ sub, plan, lic: expiresAt ?? null, iat: now.toISOString(), exp }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyEntitlement(token, { now = new Date(), secret = getSecret() } = {}) {
  if (!secret) return { ok: false, reason: "licensing_not_configured", plan: "free" };
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "missing_token", plan: "free" };

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !timingSafeEqual(sign(payload, secret), signature)) {
    return { ok: false, reason: "bad_signature", plan: "free" };
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed_payload", plan: "free" };
  }

  if (!claims.exp || new Date(claims.exp).getTime() < new Date(now).getTime()) {
    return { ok: false, reason: "expired", plan: "free" };
  }

  const plan = PLANS[claims.plan] ? claims.plan : "free";
  return { ok: true, sub: String(claims.sub || ""), plan, expiresAt: claims.exp };
}

/** Plan for a request, from the entitlement token sent by the client. */
export function planFromToken(token) {
  const result = verifyEntitlement(token);
  return result.ok ? result.plan : "free";
}

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.users ? parsed : { users: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { users: {} };
    // A corrupt counter file must not lock anyone out of the app.
    return { users: {} };
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function userBucket(store, userId) {
  const key = String(userId || "anonymous");
  if (!store.users[key]) store.users[key] = { exports: {}, ai: {} };
  const bucket = store.users[key];
  if (!bucket.exports) bucket.exports = {};
  if (!bucket.ai) bucket.ai = {};
  return bucket;
}

/** Current usage for a user, for the given period. */
export async function getUsage(userId, now = new Date()) {
  const { month, day } = periodKeys(now);
  const store = await readStore();
  const bucket = userBucket(store, userId);
  return {
    month,
    day,
    exportsThisMonth: Math.max(0, Math.floor(bucket.exports[month] || 0)),
    aiToday: Math.max(0, Math.floor(bucket.ai[day] || 0)),
  };
}

/**
 * Decide and record an export in one step. Recording happens only when the
 * export is allowed, so a denied attempt does not burn quota.
 */
export async function consumeExport({ userId, plan, now = new Date() }) {
  const { month } = periodKeys(now);
  const store = await readStore();
  const bucket = userBucket(store, userId);
  const used = Math.max(0, Math.floor(bucket.exports[month] || 0));
  const decision = exportDecision({ plan, usedThisMonth: used });

  if (decision.allowed) {
    bucket.exports[month] = used + 1;
    await writeStore(store);
  }

  return {
    ...decision,
    used: decision.allowed ? used + 1 : used,
  };
}

/** Decide and record an AI request. */
export async function consumeAiCall({ userId, plan, now = new Date() }) {
  const { day } = periodKeys(now);
  const store = await readStore();
  const bucket = userBucket(store, userId);
  const used = Math.max(0, Math.floor(bucket.ai[day] || 0));
  const decision = aiDecision({ plan, usedToday: used });

  if (decision.allowed) {
    bucket.ai[day] = used + 1;
    await writeStore(store);
  }

  return { ...decision, used: decision.allowed ? used + 1 : used };
}

/**
 * Read the expiry from a token without verifying it. Used for responses and UI
 * text only — never for an access decision, which always verifies the signature.
 */
export function entitlementExpiry(token) {
  try {
    const [payload] = String(token).split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims.exp === "string" ? claims.exp : null;
  } catch {
    return null;
  }
}

/**
 * Renewal state for an account.
 *
 * Until a payment processor is connected, cancelling a renewal records the
 * request on the account: no new licence term or entitlement is issued after the
 * current one ends. When billing is integrated, wire this to the processor's
 * cancel API so the subscription itself stops.
 */
export async function setRenewalCancelled({ userId, cancelled, now = new Date() }) {
  const store = await readStore();
  const bucket = userBucket(store, userId);
  bucket.renewal = { cancelled: Boolean(cancelled), updatedAt: new Date(now).toISOString() };
  await writeStore(store);
  return { ...bucket.renewal };
}

export async function getRenewalState(userId) {
  const store = await readStore();
  const bucket = userBucket(store, userId);
  return {
    cancelled: Boolean(bucket.renewal?.cancelled),
    updatedAt: typeof bucket.renewal?.updatedAt === "string" ? bucket.renewal.updatedAt : null,
  };
}

/**
 * The account's plan, stored server-side.
 *
 * Quota decisions read this rather than a client-supplied header, so a caller
 * cannot end up limited to the free tier (or claim a plan it does not hold) by
 * sending or omitting a header.
 */
export async function setAccountPlan(userId, plan) {
  const store = await readStore();
  const bucket = userBucket(store, userId);
  const id = PLANS[plan] ? plan : "free";
  bucket.plan = { id, updatedAt: new Date().toISOString() };
  await writeStore(store);
  return id;
}

export async function getAccountPlan(userId) {
  const store = await readStore();
  const bucket = userBucket(store, userId);
  const stored = bucket.plan?.id;
  return PLANS[stored] ? stored : "free";
}
