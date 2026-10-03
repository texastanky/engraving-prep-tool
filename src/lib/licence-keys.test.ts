import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyLicenseKey, type LicenseVerifyResult } from "../../server/licensing.js";
import { LICENCE_PUBLIC_KEY_PEM } from "./licence-public-key.ts";

/**
 * Asymmetric (PGS2) licence keys.
 *
 * The property that matters commercially: a key cannot be forged or edited.
 * The app carries only the public half, so a customer cannot mint a key, change
 * their plan, or extend an expiry — however much of their own machine they can
 * see and edit.
 */
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();

function makeKey(claims: Record<string, unknown>, signer = privateKey) {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = crypto.sign(null, Buffer.from(payload), signer).toString("base64url");
  return `PGS2.${payload}.${signature}`;
}

/** Narrow to the failure branch so `reason` is typed. */
function reasonOf(result: LicenseVerifyResult): string {
  if (result.ok) throw new Error("expected the key to be rejected, but it verified");
  return result.reason;
}

function verified(result: LicenseVerifyResult) {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result;
}

describe("PGS2 asymmetric licence keys", () => {
  it("accepts a correctly signed key", () => {
    const result = verified(
      verifyLicenseKey(makeKey({ sub: "buyer@example.com", plan: "pro", exp: null }), {
        publicKey: PUBLIC_PEM,
      })
    );
    expect(result.plan).toBe("pro");
    expect(result.sub).toBe("buyer@example.com");
  });

  it("accepts a shop key", () => {
    const result = verified(
      verifyLicenseKey(makeKey({ sub: "shop@example.com", plan: "shop", exp: null }), {
        publicKey: PUBLIC_PEM,
      })
    );
    expect(result.plan).toBe("shop");
  });

  it("rejects a payload edited after signing — the whole point", () => {
    const original = makeKey({ sub: "buyer@example.com", plan: "pro", exp: null });
    const signature = original.split(".")[2];
    // A customer rewriting their own key to the better plan.
    const forged = Buffer.from(
      JSON.stringify({ sub: "buyer@example.com", plan: "shop", exp: null }),
      "utf8"
    ).toString("base64url");

    const result = verifyLicenseKey(`PGS2.${forged}.${signature}`, { publicKey: PUBLIC_PEM });
    expect(reasonOf(result)).toBe("bad_signature");
  });

  it("rejects a key signed by somebody else's key", () => {
    const otherKey = crypto.generateKeyPairSync("ed25519").privateKey;
    const result = verifyLicenseKey(
      makeKey({ sub: "x@example.com", plan: "shop", exp: null }, otherKey),
      { publicKey: PUBLIC_PEM }
    );
    expect(reasonOf(result)).toBe("bad_signature");
  });

  it("rejects an expiry that has passed", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const result = verifyLicenseKey(makeKey({ sub: "x@example.com", plan: "pro", exp: yesterday }), {
      publicKey: PUBLIC_PEM,
    });
    expect(reasonOf(result)).toBe("expired");
  });

  it("reports licensing as unconfigured when there is no public key", () => {
    const result = verifyLicenseKey(makeKey({ sub: "x@example.com", plan: "pro", exp: null }), {
      publicKey: null,
    });
    expect(reasonOf(result)).toBe("licensing_not_configured");
  });

  it("still rejects malformed keys", () => {
    expect(reasonOf(verifyLicenseKey("not-a-key", { publicKey: PUBLIC_PEM }))).toBe("malformed_key");
    expect(reasonOf(verifyLicenseKey("PGS2.onlytwo", { publicKey: PUBLIC_PEM }))).toBe("malformed_key");
    expect(reasonOf(verifyLicenseKey("PGS9.a.b", { publicKey: PUBLIC_PEM }))).toBe("malformed_key");
  });

  it("does not treat a free plan as a valid licence", () => {
    const result = verifyLicenseKey(makeKey({ sub: "x@example.com", plan: "free", exp: null }), {
      publicKey: PUBLIC_PEM,
    });
    expect(reasonOf(result)).toBe("unknown_plan");
  });
});

describe("the bundled public key", () => {
  it("ships a usable Ed25519 key (the ?raw import in the client works)", () => {
    expect(LICENCE_PUBLIC_KEY_PEM).toContain("BEGIN PUBLIC KEY");

    const der = Buffer.from(
      LICENCE_PUBLIC_KEY_PEM.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
      "base64"
    );
    const key = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
    expect(key.asymmetricKeyType).toBe("ed25519");
  });

  it("is the same PEM the server verifies against", () => {
    // The server reads this file at runtime; the client gets it injected at
    // build time. Both must be the same key.
    // Vitest serves modules over http, so resolve from the project root
    // rather than import.meta.url.
    const fromDisk = readFileSync(
      path.resolve(process.cwd(), "server", "license-public.pem"),
      "utf8"
    );
    expect(LICENCE_PUBLIC_KEY_PEM.trim()).toBe(fromDisk.trim());
  });
});
