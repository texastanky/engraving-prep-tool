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

export type QuotaDecision = {
  allowed: boolean;
  remaining: number;
  limit: number;
};

export type LicenseVerifyResult =
  | { ok: true; sub: string; plan: PlanId; expiresAt: string | null }
  | { ok: false; reason: string };

export type EntitlementVerifyResult =
  | { ok: true; sub: string; plan: PlanId; expiresAt: string | null }
  | { ok: false; reason: string; plan: PlanId };

export type Usage = {
  month: string;
  day: string;
  exportsThisMonth: number;
  aiToday: number;
};

export const LICENSE_PREFIX: string;
export const PLANS: Record<PlanId, PlanLimits>;

export function quotaLimits(plan: string): PlanLimits;
export function periodKeys(now?: Date): { month: string; day: string };
export function exportDecision(input: { plan: string; usedThisMonth: number }): QuotaDecision;
export function aiDecision(input: { plan: string; usedToday: number }): QuotaDecision;

export function issueLicenseKey(
  input: { sub: string; plan?: PlanId; expiresAt?: string | null },
  secret?: string | null
): string;

export function verifyLicenseKey(
  key: unknown,
  options?: { now?: Date; secret?: string | null }
): LicenseVerifyResult;

export function signEntitlement(
  input: { sub: string; plan: PlanId; expiresAt?: string | null; days?: number },
  secret?: string | null
): string;

export function verifyEntitlement(
  token: unknown,
  options?: { now?: Date; secret?: string | null }
): EntitlementVerifyResult;

export function entitlementExpiry(token: unknown): string | null;
export function planFromToken(token: unknown): PlanId;

export type RenewalState = { cancelled: boolean; updatedAt: string | null };

export function setRenewalCancelled(input: {
  userId: string;
  cancelled: boolean;
  now?: Date;
}): Promise<RenewalState>;

export function getRenewalState(userId: string): Promise<RenewalState>;

/** The account's plan, stored server-side and used for quota decisions. */
export function setAccountPlan(userId: string, plan: string): Promise<PlanId>;
export function getAccountPlan(userId: string): Promise<PlanId>;

export function getUsage(userId: string, now?: Date): Promise<Usage>;
export function consumeExport(input: {
  userId: string;
  plan: string;
  now?: Date;
}): Promise<QuotaDecision & { used: number }>;
export function consumeAiCall(input: {
  userId: string;
  plan: string;
  now?: Date;
}): Promise<QuotaDecision & { used: number }>;
