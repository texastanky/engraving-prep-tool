/**
 * Licence keys — issuing (seller side) and verification (app side).
 *
 * PGS2 keys are Ed25519-signed. The app verifies them on the customer's machine
 * against the public key that ships beside this module; only the seller holds
 * the private key, so a key cannot be forged, upgraded or extended — including
 * by editing anything on the customer's disk. The plan a key carries lives in
 * its signed payload, which is why there is no local licence store any more.
 *
 * PGS1 (HMAC) keys are kept for local development; they verify with
 * LICENSE_SECRET, which a shipped build deliberately does not carry. If
 * LICENSE_SECRET is unset, PGS1 keys can never verify — the app rejects them
 * rather than failing open.
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory holding this module, which works inside app.asar too. */
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const LICENSE_PREFIX = "PGS1";

/**
 * Asymmetric licence keys.
 *
 * PGS1 is HMAC-signed with a shared secret. Verifying an HMAC requires the same
 * secret that signs it, so a shipped app would have to carry the signing secret
 * — and anyone who unpacked it could mint their own keys. That makes PGS1 fine
 * for development and unusable for customers.
 *
 * PGS2 is signed with a private key that never leaves the issuer, and verified
 * with a public key the app can safely carry. A key cannot then be forged or
 * edited into existence, including by editing files on the customer's machine.
 */
export const LICENSE_PREFIX_V2 = "PGS2";

/** Plan metadata: used to validate keys, and to label plans in the app. */
export const PLANS = {
  free: { label: "Free", exportsPerMonth: 5, aiPerDay: 5 },
  pro: { label: "Pro", exportsPerMonth: Infinity, aiPerDay: 200 },
  shop: { label: "Shop", exportsPerMonth: Infinity, aiPerDay: 1000 },
};

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
 * Returns null when absent, so the app rejects keys rather than failing open.
 */
function getPublicKey() {
  if (cachedPublicKey !== undefined) return cachedPublicKey;
  cachedPublicKey = null;

  // Resolve next to THIS MODULE, not against the working directory. In the
  // packaged app the file ships inside app.asar, so a cwd-relative path would
  // silently never match and every PGS2 key would report "not configured".
  // The cwd candidate is kept as a fallback for unusual layouts.
  const candidates = [];
  if (process.env.LICENSE_PUBLIC_KEY_FILE) candidates.push(process.env.LICENSE_PUBLIC_KEY_FILE);
  candidates.push(path.join(MODULE_DIR, "license-public.pem"));
  candidates.push(path.resolve("server/license-public.pem"));

  for (const file of candidates) {
    try {
      cachedPublicKey = crypto.createPublicKey(readFileSync(file, "utf8"));
      return cachedPublicKey;
    } catch {
      // try the next location
    }
  }

  cachedPublicKey = null;
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
