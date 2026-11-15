const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const router = import("./router.js");
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

function licence(expiresAt = "2099-01-01") {
  const payload = Buffer.from(JSON.stringify({
    sub: "migration-test",
    plan: "pro",
    exp: expiresAt,
  })).toString("base64url");
  const signature = crypto.sign(null, Buffer.from(payload), privateKey).toString("base64url");
  return `PGS2.${payload}.${signature}`;
}

async function run(path, init = {}, env = {}) {
  const { handleRequest } = await router;
  return handleRequest(new Request(`https://local.invalid${path}`, init), {
    ASSETS: { fetch: (req) => new Response(new URL(req.url).pathname) },
    ...env,
  }, publicKey);
}

for (const path of ["/canvas", "/es/canvas"]) {
  test(`${path} serves the SPA with noindex`, async () => {
    const response = await run(path);
    assert.equal(await response.text(), path);
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex");
  });
}

for (const path of ["/terms", "/privacy", "/refunds"]) {
  test(`${path} retains its legal-page rewrite`, async () => {
    assert.equal(await (await run(path)).text(), `${path}.html`);
  });
}

test("update metadata stays uncached and readable cross-origin", async () => {
  const response = await run("/update.json");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("browser presets do not adopt a public/shared file store", async () => {
  assert.deepEqual(await (await run("/api/presets")).json(), { presets: null });
  const head = await run("/api/presets", { method: "HEAD" });
  assert.equal(await head.text(), "");
  const write = await run("/api/presets", { method: "PUT", body: "{}" });
  assert.equal(write.status, 405);
  assert.equal(write.headers.get("Cache-Control"), "no-store");
});

for (const path of ["/api/auth", "/api/unknown"]) {
  test(`${path} cannot fall through to SPA HTML`, async () => {
    const response = await run(path);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  });
}

for (const path of ["/api/assistant", "/api/ai-compose"]) {
  test(`${path} retains licence validation and does not use missing AI configuration`, async () => {
    const unlicensed = await run(path, { method: "POST", body: "{}" });
    assert.equal(unlicensed.status, 401);
    const licensed = await run(path, {
      method: "POST",
      headers: { "X-Licence-Key": licence() },
      body: JSON.stringify({ messages: [{ role: "user", content: "Layout help" }] }),
    });
    assert.equal(licensed.status, 503);
    assert.deepEqual(await licensed.json(), { error: "missing_configuration" });
    const expired = await run(path, {
      method: "POST", headers: { "X-Licence-Key": licence("2000-01-01") }, body: "{}",
    });
    assert.equal(expired.status, 401);
  });

  test(`${path} preserves method handling`, async () => {
    assert.equal((await run(path)).status, 405);
    assert.equal((await run(path, { method: "OPTIONS" })).status, 204);
  });
}

test("invalid JSON and oversized streamed bodies are rejected", async () => {
  const invalid = await run("/api/assistant", { method: "POST", body: "{" });
  assert.equal(invalid.status, 400);
  const oversized = await run("/api/assistant", {
    method: "POST", body: "x".repeat(12 * 1024 * 1024 + 1),
  });
  assert.equal(oversized.status, 413);
});

test("AI uses explicit Worker bindings, not global process environment", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let upstream;
  globalThis.fetch = async (_url, init) => {
    upstream = JSON.parse(init.body);
    return Response.json({ choices: [{ message: { content: "Mocked layout advice" } }] });
  };
  const response = await run("/api/assistant", {
    method: "POST",
    headers: { "X-Licence-Key": licence() },
    body: JSON.stringify({ messages: [{ role: "user", content: "Layout help" }] }),
  }, { OPENAI_API_KEY: "unit-test-only-placeholder", OPENAI_ASSISTANT_MODEL: "unit-test-model" });
  assert.equal(response.status, 200);
  assert.equal(upstream.model, "unit-test-model");
  assert.deepEqual(await response.json(), { message: "Mocked layout advice" });
});
