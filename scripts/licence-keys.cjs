#!/usr/bin/env node
/**
 * Licence key tooling — ForgeMark Industries
 *
 *   node scripts/licence-keys.cjs init
 *       Creates the Ed25519 keypair. Run ONCE, ever.
 *       Writes  license-private.pem        (NEVER ship, NEVER commit — back it up)
 *       Writes  server/license-public.pem  (safe to ship; goes in the bundle)
 *
 *   node scripts/licence-keys.cjs issue --sub buyer@example.com --plan pro [--days 365]
 *       Prints a PGS2 licence key to send to that buyer.
 *
 * Why asymmetric rather than HMAC: the app must be able to VERIFY a key, but not
 * CREATE one. A symmetric secret would have to ship inside the app in order to
 * verify anything, and anyone who unpacked it could then mint their own keys.
 * With Ed25519 the app carries only the public half, so a key cannot be forged
 * or edited into existence — including by editing the local licence store.
 *
 * See docs/ROADMAP-TO-SALE.md, section 2.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PRIVATE_PATH = path.join(ROOT, "license-private.pem");
const PUBLIC_PATH = path.join(ROOT, "server", "license-public.pem");
const PREFIX = "PGS2";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function init() {
  if (fs.existsSync(PRIVATE_PATH) && !process.argv.includes("--force")) {
    fail(
      `Refusing to overwrite ${PRIVATE_PATH}.\n` +
        "That file signs every licence you will ever issue — overwriting it orphans\n" +
        "every key already sold. Pass --force only if you truly mean to start over."
    );
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

  fs.writeFileSync(PRIVATE_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.mkdirSync(path.dirname(PUBLIC_PATH), { recursive: true });
  fs.writeFileSync(PUBLIC_PATH, publicKey.export({ type: "spki", format: "pem" }));

  console.log("Keypair created.\n");
  console.log(`  private : ${PRIVATE_PATH}`);
  console.log("            NEVER commit or ship this. Back it up somewhere safe —");
  console.log("            lose it and you cannot issue new keys for existing orders.");
  console.log(`  public  : ${PUBLIC_PATH}`);
  console.log("            Safe to publish; this is what the app verifies against.\n");
  console.log("Next: add license-private.pem to .gitignore (it already is), then issue a key.");
}

function issue() {
  const sub = flag("sub");
  const plan = flag("plan", "pro");
  const days = flag("days");

  if (!sub) fail("Usage: licence-keys.cjs issue --sub buyer@example.com [--plan pro|shop] [--days 365]");
  if (!["pro", "shop"].includes(plan)) fail(`Unknown plan "${plan}". Use pro or shop.`);
  if (!fs.existsSync(PRIVATE_PATH)) fail(`No private key at ${PRIVATE_PATH}. Run: licence-keys.cjs init`);

  const privateKey = crypto.createPrivateKey(fs.readFileSync(PRIVATE_PATH, "utf8"));

  const exp = days ? new Date(Date.now() + Number(days) * 86400000).toISOString() : null;
  const payload = Buffer.from(
    JSON.stringify({ sub, plan, exp, iat: new Date().toISOString() }),
    "utf8"
  ).toString("base64url");

  const signature = crypto.sign(null, Buffer.from(payload), privateKey).toString("base64url");

  console.log(`${PREFIX}.${payload}.${signature}`);
  console.log("");
  console.error(`  for : ${sub}`);
  console.error(`  plan: ${plan}`);
  console.error(`  exp : ${exp ?? "never expires"}`);
}

const command = process.argv[2];
if (command === "init") init();
else if (command === "issue") issue();
else {
  console.log("Usage:");
  console.log("  node scripts/licence-keys.cjs init");
  console.log("  node scripts/licence-keys.cjs issue --sub buyer@example.com --plan pro [--days 365]");
  process.exit(1);
}
