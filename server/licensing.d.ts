/**
 * Types for server/licensing.js, so the client and tests can use it with type
 * checking and the contract stays explicit.
 */

export type PlanId = "free" | "pro" | "shop";

export type PlanLimits = {
  label: string;
  exportsPerMonth: number;
  aiPerDay: number;
};

export type LicenseVerifyResult =
  | { ok: true; sub: string; plan: PlanId; expiresAt: string | null }
  | { ok: false; reason: string };

export const LICENSE_PREFIX: string;
export const LICENSE_PREFIX_V2: string;
export const PLANS: Record<PlanId, PlanLimits>;

export function issueLicenseKey(
  input: { sub: string; plan?: PlanId; expiresAt?: string | null },
  secret?: string | null
): string;

export function verifyLicenseKey(
  key: unknown,
  options?: { now?: Date; secret?: string | null; publicKey?: unknown | null }
): LicenseVerifyResult;
