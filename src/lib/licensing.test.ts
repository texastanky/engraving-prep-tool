import crypto, { type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LICENSE_PREFIX, issueLicenseKey, verifyLicenseKey } from "../../server/licensing.js";
import {
  activateLicense,
  denialMessage,
  entitlementLabel,
  exportPermission,
  isEntitlementValid,
  licenseErrorMessage,
  loadEntitlement,
  loadVerifiedEntitlement,
  saveEntitlement,
  type Entitlement,
} from "./licensing.ts";
import * as publicKeyModule from "./licence-public-key.ts";

/**
 * The bundled public key is normally read from server/license-public.pem (a
 * ?raw import). Tests sign with a generated keypair instead, so they never
 * depend on the seller's private key.
 */
vi.mock("./licence-public-key.ts", async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    LICENCE_PUBLIC_KEY_PEM: publicKey.export({ type: "spki", format: "pem" }).toString(),
    __testPrivateKey: privateKey,
  };
});

const SIGNING_KEY = (publicKeyModule as unknown as { __testPrivateKey: KeyObject }).__testPrivateKey;

const SECRET = "test-license-secret-0123456789abcdef";

function makeKey(claims: Record<string, unknown>, signer: KeyObject = SIGNING_KEY) {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = crypto.sign(null, Buffer.from(payload), signer).toString("base64url");
  return `PGS2.${payload}.${signature}`;
}

function reasonOf(result: ReturnType<typeof verifyLicenseKey>): string {
  if (result.ok) throw new Error("expected the key to be rejected, but it verified");
  return result.reason;
}

function verified(result: ReturnType<typeof verifyLicenseKey>) {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result;
}

describe("legacy PGS1 keys (local development only)", () => {
  it("issues and verifies a key", () => {
    const key = issueLicenseKey({ sub: "shop@example.com", plan: "shop" }, SECRET);
    expect(key.startsWith(LICENSE_PREFIX + ".")).toBe(true);

    const result = verified(verifyLicenseKey(key, { secret: SECRET }));
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
    const key = issueLicenseKey({ sub: "a", plan: "pro", expiresAt: "2020-01-01T00:00:00.000Z" }, SECRET);
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
    expect(reasonOf(verifyLicenseKey(key, { secret: null }))).toBe("licensing_not_configured");
  });
});

describe("activating a PGS2 licence (offline, no server)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("verifies a correctly signed key and caches it — with no network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const key = makeKey({ sub: "shop@example.com", plan: "shop", exp: null });
    const result = await activateLicense(key);

    expect(result.ok).toBe(true);
    expect(result.plan).toBe("shop");
    expect(fetchSpy).not.toHaveBeenCalled();

    const stored = loadEntitlement();
    expect(stored?.plan).toBe("shop");
    expect(stored?.sub).toBe("shop@example.com");
    expect(stored?.token).toBe(key);
    expect(typeof stored?.activatedAt).toBe("string");
    vi.unstubAllGlobals();
  });

  it("keeps a dated licence working until its expiry", async () => {
    const expiry = new Date(Date.now() + 86400000).toISOString();
    const result = await activateLicense(makeKey({ sub: "a", plan: "pro", exp: expiry }));
    expect(result.ok).toBe(true);
    expect(loadEntitlement()?.expiresAt).toBe(expiry);
  });

  it("rejects a payload edited after signing — the whole point", async () => {
    const original = makeKey({ sub: "buyer@example.com", plan: "pro", exp: null });
    const signature = original.split(".")[2];
    const forged = Buffer.from(
      JSON.stringify({ sub: "buyer@example.com", plan: "shop", exp: null }),
      "utf8"
    ).toString("base64url");

    const result = await activateLicense(`PGS2.${forged}.${signature}`);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("bad_signature");
    expect(loadEntitlement()).toBeNull();
  });

  it("rejects a key signed by somebody else's key", async () => {
    const otherKey = crypto.generateKeyPairSync("ed25519").privateKey;
    const result = await activateLicense(makeKey({ sub: "x@example.com", plan: "shop", exp: null }, otherKey));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("bad_signature");
  });

  it("rejects an expired key", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const result = await activateLicense(makeKey({ sub: "x@example.com", plan: "pro", exp: yesterday }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("expired");
    expect(loadEntitlement()).toBeNull();
  });

  it("rejects malformed keys — including legacy PGS1 keys, which need a secret", async () => {
    expect((await activateLicense("nonsense")).error).toBe("malformed_key");
    expect((await activateLicense("")).error).toBe("malformed_key");
    expect((await activateLicense("PGS2.onlytwo")).error).toBe("malformed_key");
    expect((await activateLicense("PGS1.abc.def")).error).toBe("malformed_key");
  });

  it("does not treat a free plan as a licence", async () => {
    const result = await activateLicense(makeKey({ sub: "x@example.com", plan: "free", exp: null }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("unknown_plan");
  });

  it("checks the cached key's signature again on load", async () => {
    const key = makeKey({ sub: "a", plan: "pro", exp: null });
    await activateLicense(key);
    expect(await loadVerifiedEntitlement()).not.toBeNull();

    // Hand-edit the cached payload — the stored plan field is not trusted, and
    // the signature no longer matches.
    const tampered = key.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "a", plan: "shop", exp: null }), "utf8").toString(
      "base64url"
    );
    window.localStorage.setItem(
      "pgs-licence-v1",
      JSON.stringify({ key: `PGS2.${forged}.${tampered[2]}`, activatedAt: new Date().toISOString(), plan: "shop" })
    );
    expect(await loadVerifiedEntitlement()).toBeNull();
  });
});

describe("cached licence handling", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const paid: Entitlement = {
    token: "PGS2.x.y",
    sub: "buyer@example.com",
    plan: "pro",
    label: "Pro",
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    activatedAt: new Date().toISOString(),
  };

  it("treats expired or missing licences as unpaid", () => {
    const expired = { ...paid, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(isEntitlementValid(expired)).toBe(false);
    expect(isEntitlementValid(paid)).toBe(true);
    expect(isEntitlementValid(null)).toBe(false);
  });

  it("reads the plan from the signed payload, not the fields beside it", () => {
    const key = makeKey({ sub: "a", plan: "pro", exp: null });
    window.localStorage.setItem(
      "pgs-licence-v1",
      JSON.stringify({ key, activatedAt: "2026-01-01T00:00:00.000Z", plan: "shop", label: "Shop" })
    );
    const stored = loadEntitlement();
    expect(stored?.plan).toBe("pro");
    expect(stored?.label).toBe("Pro");
  });

  it("ignores corrupt storage", () => {
    window.localStorage.setItem("pgs-licence-v1", "{oops");
    expect(loadEntitlement()).toBeNull();

    window.localStorage.setItem("pgs-licence-v1", JSON.stringify({ key: 42 }));
    expect(loadEntitlement()).toBeNull();

    const key = makeKey({ sub: "buyer@example.com", plan: "pro", exp: null });
    saveEntitlement({ ...paid, token: key });
    expect(loadEntitlement()?.token).toBe(key);
    saveEntitlement(null);
    expect(loadEntitlement()).toBeNull();
  });

  it("describes the licence state", () => {
    expect(entitlementLabel(null)).toBe("No licence key");
    expect(entitlementLabel(paid)).toContain("Pro licence");
    const expired = { ...paid, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(entitlementLabel(expired)).toContain("expired");
  });

  it("allows exports only under a valid licence", () => {
    expect(exportPermission(paid)).toEqual({ allowed: true, plan: "pro" });
    expect(exportPermission(null)).toEqual({
      allowed: false,
      plan: "free",
      reason: "license_required",
    });
    expect(denialMessage(exportPermission(null))).toContain("licence");
  });

  it("explains rejected keys in plain language", () => {
    expect(licenseErrorMessage("bad_signature")).toContain("ForgeMark");
    expect(licenseErrorMessage("expired")).toContain("expiry");
    expect(licenseErrorMessage("licensing_not_configured")).toContain("public key");
  });
});
