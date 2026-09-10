import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createSession, verifySession } from "./auth.js";

const originalSecret = process.env.AUTH_SESSION_SECRET;
const user = { id: "test-user", email: "test@example.test", name: "Test" };
afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
  else process.env.AUTH_SESSION_SECRET = originalSecret;
});

test("missing, blank, and old default secrets cannot create or verify sessions", () => {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = crypto.createHmac("sha256", "local-dev-only-change-before-deploy").update(payload).digest("base64url");
  for (const secret of [undefined, "", "  ", "local-dev-only-change-before-deploy"]) {
    if (secret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = secret;
    assert.throws(() => createSession(user), /AUTH_SESSION_SECRET/);
    assert.equal(verifySession(`${payload}.${signature}`), null);
  }
});

test("configured secrets accept valid sessions and reject tampering or a different secret", () => {
  process.env.AUTH_SESSION_SECRET = crypto.randomBytes(48).toString("hex");
  const token = createSession(user);
  assert.deepEqual(verifySession(token), user);
  const [payload, signature] = token.split(".");
  const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), sub: "admin" })).toString("base64url");
  assert.equal(verifySession(`${changed}.${signature}`), null);
  process.env.AUTH_SESSION_SECRET = crypto.randomBytes(48).toString("hex");
  assert.equal(verifySession(token), null);
});

test("expired signed sessions are rejected", () => {
  process.env.AUTH_SESSION_SECRET = crypto.randomBytes(48).toString("hex");
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) - 60 })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET).update(payload).digest("base64url");
  assert.equal(verifySession(`${payload}.${signature}`), null);
});
