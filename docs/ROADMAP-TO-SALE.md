# Roadmap to sale — ForgeMark Engraving Prep Tool

Written 2026-09-22. Three jobs, in the order they should actually be done.

---

## 1. The simple masking tool ← the priority

The ask: **mask a design onto the part or template, with none of the Adobe/Corel complexity.**
Simple enough that it never needs a tutorial.

### The one rule that fixes the bug

**Store the mask in physical units — inches relative to the material — not in canvas pixels.**

This is the root cause of the masking failures. Trace points, masks and design positions are all
currently held in canvas pixels, so when the canvas changed size the whole coordinate space silently
rescaled and everything your template was built against moved. That is what broke it.

A mask expressed in inches cannot be broken by the window resizing, the material changing, or the
machine preset changing. **Get this right and most of the weirdness disappears.**

### Three steps. One panel.

**Step 1 — Choose the shape**

| | |
|---|---|
| **Rectangle** | drag it on the canvas |
| **Ellipse** | drag it on the canvas |
| **Trace** | click around the outline you want (and the last click closes it) |
| **Whole part** | uses the part photo's edge as the boundary |

**Step 2 — Adjust it** — drag the shape, drag the corner handles to resize, rotate handle. Numeric
width/height fields shown underneath for when you want exact.

**Step 3 — Two switches**

- **Mask on / off** — the whole feature, one toggle
- **Soft edge** — optional slider, default **off**

That's the entire interface. Nothing else.

### Deliberately NOT included

These are the things that make Illustrator and CorelDRAW painful, and none of them belong here:

- no clipping mask vs layer mask distinction — there is one mask
- no compound paths or pathfinder
- no anchor-point editing inside the mask
- no blend modes
- no stacking order of multiple masks — one mask at a time
- no "release mask" bookkeeping

### Behaviour rules

- **One undo step** per mask action. Not one per point, not one per drag.
- **The design moves with the mask** when you reposition it.
- **Fill targets the mask**, not the canvas and not the whole workspace.
- **Fill contains** (whole image visible, letterboxed) — with a "cover instead" option if you want
  edge-to-edge, cropping.
- **Nothing is destructive.** Turning the mask off restores the original design untouched.

### Where it lives

A **Mask** tab next to Size & Position on the design panel, so it is one click from the artwork it
affects — not buried in a menu.

---

## 2. Licensing — what I recommended

Today the app runs its own API locally, so "server-side truth" lives on the **customer's machine**.
Anyone can open `.data\licensing.json` in the install folder and set `"plan": "shop"`. And the keys
are HMAC-signed, which is symmetric — a shipped build cannot verify one without carrying the secret.

**Fix: asymmetric signed keys.** You sign with a private key that never leaves your machine; the app
verifies with a public key that is safe to ship. A key then cannot be forged or edited into existence.

### The design

| | |
|---|---|
| **Key format** | `PGS2.<payload>.<signature>` — payload is base64url JSON, signature is Ed25519 |
| **Payload** | `{ "sub": "customer", "plan": "pro", "exp": null, "iat": "..." }` |
| **Signing** | `crypto.sign(null, payloadBuffer, privateKey)` — offline, on your machine |
| **Verifying** | `crypto.verify(null, payloadBuffer, publicKey, sig)` — in the app |
| **Where the public key lives** | an env/config value shipped with the app. Publishing it is safe |

### The work

1. `scripts/licence-keygen.cjs` — run once, generates a keypair. Writes `private.pem`
   (**gitignored, never shipped, back it up**) and prints the public key.
2. `server/licensing.js` — add a `PGS2` branch beside the existing `PGS1` HMAC path. Keep `PGS1`
   working for your own dev build; detect by prefix.
3. Tests for: valid key, tampered payload, wrong key, expired.
4. Document key issuance so you can make a key for a customer in one command.

**This is additive** — it adds a second verification path and leaves the existing one alone, so it
cannot break the running app.

### Still needs your decision

**Do buyers need accounts at all?** Registration is currently disabled and the only account comes
from your `AUTH_ADMIN_*` environment variables, so a paying customer has **no path to a working app**.

My recommendation: **drop accounts entirely for the retail product.** For a desktop tool the licence
key *is* the account. That deletes the server, the store file, and the whole locally-forgeable
problem. Keep the account path for your own build if you like; don't ship it.

---

## 3. Install and uninstall — you're right to care about this

The NSIS installer step has been failing, and the cause is now known.

### Root cause

**Antivirus locking files while Electron extracts them.** Proven: building to a folder *outside*
the project tree succeeded first try, with identical code; building inside it failed every time.
Sophos real-time scanning holds handles on freshly written files, so Electron's extract-then-rename
step fails with `EPERM`/`EBUSY`.

### Fix

1. **Exclude the project folder in Sophos** (or always build to `%TEMP%`). Either works.
2. Then `pnpm build:installer` produces a real **per-user installer** — your config already sets
   Desktop shortcut, Start Menu shortcut and an uninstaller, and needs no admin rights.

### Then verify the uninstall, properly

Install → uninstall → confirm all four are gone:

- `%LOCALAPPDATA%\Programs\Engraving Prep Tool\`
- the Desktop shortcut
- the Start Menu entry
- the registry `Uninstall` key

**Ship nothing until that test passes.** An app that won't uninstall cleanly is the single most
visible defect a small product can have, and it's the one you'll get email about.

---

## 4. The rest, in order

| | Item | Notes |
|---|---|---|
| 5 | **Pricing and purchase path** | Landing page says "Contact us". Needs a price, a buy button, key delivery |
| 6 | **Code signing** | SmartScreen warns on every install and reads as malware. OV ~$200–400/yr, or Azure Trusted Signing ~$10/mo |
| 7 | **Legal** | EULA/privacy/refunds drafted, need counsel review — plus an **in-app acceptance step** with a recorded timestamp |
| 8 | **Your own templates** | The bundled third-party ones are gone. Ship only artwork you own the rights to distribute |
| 9 | **Support** | Selling software means supporting it. support@forgemarkindustries.com and a drafted refund policy already exist |

---

## Recommended order

1. **Masking tool** — your daily-use feature, and the thing that decides whether the app is usable
2. **Licensing (PGS2)** — additive, cannot break the running app
3. **Installer + verified uninstall** — needed before anything ships
4. **Pricing, signing, legal** — packaging
