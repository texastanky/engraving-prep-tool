/**
 * Client side of licensing — the licence key is the app's account.
 *
 * A PGS2 key is an Ed25519-signed statement from the seller: `{ sub, plan, exp }`
 * as base64url JSON, plus a signature over that payload. The app verifies it on
 * this machine against the public key shipped in the build
 * (server/license-public.pem), so unlocking needs no account, no server and no
 * internet connection — and a key cannot be forged, upgraded or extended.
 *
 * The verified key is cached in local storage so later launches open straight
 * away. `loadEntitlement` reads that cache and trusts the signed payload for
 * display; the signature is checked by the gate (`loadVerifiedEntitlement`),
 * when a key is activated, and again by every server endpoint that accepts a
 * key — see `licenseKeyHeader`.
 */

import { LICENCE_PUBLIC_KEY_PEM } from "./licence-public-key.ts";

export type Plan = "free" | "pro" | "shop";

export type Entitlement = {
  /** The licence key itself — the credential sent to our API as `x-licence-key`. */
  token: string;
  /** Who the key was issued to (buyer email), from the signed payload. */
  sub: string;
  plan: "pro" | "shop";
  label: string;
  /** Licence term end from the signed payload. Null means it never expires. */
  expiresAt: string | null;
  activatedAt: string;
};

/** Why a key was rejected. Mirrors server/licensing.js; see licenceErrorMessage. */
export type LicenseErrorReason =
  | "malformed_key"
  | "malformed_payload"
  | "bad_signature"
  | "expired"
  | "unknown_plan"
  | "licensing_not_configured";

export type LicenseCheckResult =
  | { ok: true; sub: string; plan: "pro" | "shop"; expiresAt: string | null }
  | { ok: false; reason: LicenseErrorReason };

export type ExportPermission = {
  allowed: boolean;
  plan: Plan;
  reason?: "license_required";
};

const STORAGE_KEY = "pgs-licence-v1";
const PLAN_LABELS: Record<"pro" | "shop", string> = { pro: "Pro", shop: "Shop" };

export function isPaidPlan(plan: string): plan is "pro" | "shop" {
  return plan === "pro" || plan === "shop";
}

/** True when the licence is present, paid, and has not passed its term end. */
export function isEntitlementValid(
  entitlement: Entitlement | null,
  now: Date = new Date()
): boolean {
  if (!entitlement || !isPaidPlan(entitlement.plan)) return false;
  if (!entitlement.expiresAt) return true;
  const expiry = new Date(entitlement.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > now.getTime();
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
}

function base64UrlToText(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

/** The base64 body of a PEM file, decoded to DER. */
function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .split(/\r?\n/)
    .filter((line) => !line.includes("-----"))
    .join("");
  return base64ToBytes(body);
}

/**
 * Verify a licence key offline, exactly as the issuer signed it.
 *
 * Ed25519 over the base64url payload text, with the signature decoded to
 * bytes — the same shape `scripts/licence-keys.cjs verify` and the server use.
 */
export async function verifyLicenseKeyOffline(
  key: unknown,
  publicKeyPem: string = LICENCE_PUBLIC_KEY_PEM
): Promise<LicenseCheckResult> {
  if (typeof key !== "string") return { ok: false, reason: "malformed_key" };

  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "PGS2" || !parts[1] || !parts[2]) {
    return { ok: false, reason: "malformed_key" };
  }

  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlToBytes(parts[2]);
  } catch {
    return { ok: false, reason: "malformed_key" };
  }

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64UrlToText(parts[1])) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "malformed_payload" };
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !publicKeyPem.trim()) return { ok: false, reason: "licensing_not_configured" };

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await subtle.importKey(
      "spki",
      pemToDer(publicKeyPem),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
  } catch {
    return { ok: false, reason: "licensing_not_configured" };
  }

  let verified = false;
  try {
    verified = await subtle.verify(
      "Ed25519",
      cryptoKey,
      signature,
      new TextEncoder().encode(parts[1])
    );
  } catch {
    verified = false;
  }
  if (!verified) return { ok: false, reason: "bad_signature" };

  const plan = isPaidPlan(String(claims.plan)) ? (claims.plan as "pro" | "shop") : null;
  if (!plan) return { ok: false, reason: "unknown_plan" };

  let expiresAt: string | null = null;
  if (typeof claims.exp === "string" && claims.exp) {
    const expiry = new Date(claims.exp).getTime();
    if (!Number.isFinite(expiry)) return { ok: false, reason: "malformed_payload" };
    if (expiry <= Date.now()) return { ok: false, reason: "expired" };
    expiresAt = claims.exp;
  }

  return { ok: true, sub: String(claims.sub ?? ""), plan, expiresAt };
}

/**
 * Read the plan and term from a cached key without checking the signature.
 * Only for display and caching — the gate and the server do the real check,
 * and plan/expiry always come from the signed payload, never from the fields
 * stored beside it.
 */
function entitlementFromKey(key: string, activatedAt: string): Entitlement | null {
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "PGS2") return null;

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64UrlToText(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }

  const plan = isPaidPlan(String(claims.plan)) ? (claims.plan as "pro" | "shop") : null;
  if (!plan) return null;

  return {
    token: key.trim(),
    sub: typeof claims.sub === "string" ? claims.sub : "",
    plan,
    label: PLAN_LABELS[plan],
    expiresAt: typeof claims.exp === "string" && claims.exp ? claims.exp : null,
    activatedAt,
  };
}

export function loadEntitlement(): Entitlement | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; activatedAt?: unknown };
    if (!parsed || typeof parsed.key !== "string") return null;
    return entitlementFromKey(
      parsed.key,
      typeof parsed.activatedAt === "string" ? parsed.activatedAt : ""
    );
  } catch {
    return null;
  }
}

export function saveEntitlement(entitlement: Entitlement | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!entitlement) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ key: entitlement.token, activatedAt: entitlement.activatedAt })
    );
  } catch {
    // Storage blocked: the licence simply is not cached.
  }
}

/** The cached licence, with its signature checked. Null when absent or invalid. */
export async function loadVerifiedEntitlement(): Promise<Entitlement | null> {
  const entitlement = loadEntitlement();
  if (!entitlement) return null;
  const result = await verifyLicenseKeyOffline(entitlement.token);
  return result.ok ? entitlement : null;
}

/** Redeem a licence key and cache it. Verification is local — no server call. */
export async function activateLicense(
  licenseKey: string
): Promise<{ ok: boolean; error?: LicenseErrorReason; plan?: "pro" | "shop" }> {
  const result = await verifyLicenseKeyOffline(licenseKey);
  if (!result.ok) return { ok: false, error: result.reason };

  const entitlement: Entitlement = {
    token: licenseKey.trim(),
    sub: result.sub,
    plan: result.plan,
    label: PLAN_LABELS[result.plan],
    expiresAt: result.expiresAt,
    activatedAt: new Date().toISOString(),
  };
  saveEntitlement(entitlement);
  return { ok: true, plan: entitlement.plan };
}

/** Request headers that identify the caller's licence to our own API. */
export function licenseKeyHeader(): Record<string, string> {
  const entitlement = loadEntitlement();
  return entitlement?.token ? { "x-licence-key": entitlement.token } : {};
}

/** Short status line for the UI. */
export function entitlementLabel(entitlement: Entitlement | null, now: Date = new Date()): string {
  if (!isEntitlementValid(entitlement, now)) {
    return entitlement ? "Licence expired — paste a new key" : "No licence key";
  }
  const plan = entitlement!.label || entitlement!.plan;
  if (!entitlement!.expiresAt) return `${plan} licence`;
  const days = Math.max(
    0,
    Math.ceil((new Date(entitlement!.expiresAt).getTime() - now.getTime()) / 86400000)
  );
  return `${plan} licence · expires in ${days} day${days === 1 ? "" : "s"}`;
}

/** Decide whether an export may run. Exports are unlimited under a valid licence. */
export function exportPermission(
  entitlement: Entitlement | null,
  now: Date = new Date()
): ExportPermission {
  if (isEntitlementValid(entitlement, now)) {
    return { allowed: true, plan: entitlement!.plan };
  }
  return { allowed: false, plan: "free", reason: "license_required" };
}

/** Human-readable explanation for a denied export. */
export function denialMessage(permission: ExportPermission): string {
  if (permission.reason === "license_required") {
    return "Activate your licence to export — paste the key you received with your purchase.";
  }
  return "Export could not be authorised right now. Please try again.";
}

/** Human-readable explanation for a rejected key, shared by the gate and the editor. */
export function licenseErrorMessage(reason: LicenseErrorReason): string {
  switch (reason) {
    case "malformed_key":
      return "That key doesn’t look complete — check the whole PGS2.… line was pasted.";
    case "malformed_payload":
      return "That key is damaged. Request a replacement from support.";
    case "bad_signature":
      return "That licence key was not issued by ForgeMark Industries.";
    case "expired":
      return "That licence has passed its expiry date. Email support for a renewal.";
    case "unknown_plan":
      return "That key was not issued for a paid plan.";
    default:
      return "This build has no licence public key configured, so keys cannot be checked.";
  }
}
