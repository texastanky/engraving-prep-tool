# Operations: licensing and shop setup

This covers what a shop owner or the person running your servers needs. It is not
legal advice, and nothing here determines whether a marking is compliant.

## Environment variables

| Variable                  | Purpose                                                             | Required |
| ------------------------- | ------------------------------------------------------------------- | -------- |
| `OPENAI_API_KEY`          | Server-side key for the AI features                                 | Optional |
| `LICENSE_SECRET`          | Verifies legacy `PGS1` development keys only; customer keys are `PGS2` | Optional |
| `LICENSE_PUBLIC_KEY_FILE` | Overrides where the app finds `license-public.pem`                  | Optional |

The shipped app needs no account and no licence server: a customer's key is
verified on their own machine (Ed25519, against `server/license-public.pem`),
the editor opens without a sign-in, and everything keeps working offline.

The account module (`server/auth.js`, `api/auth.js`) is retained for a local or
internal build, but it is no longer served by the desktop app, is not called by
the client, and is excluded from the installer. `AUTH_*` variables have no
effect on the shipped product.

If `LICENSE_SECRET` is unset, legacy PGS1 keys can never verify — but PGS2
customer keys are unaffected, because they verify against the public key that
ships with the app. With no public key, the app reports
`licensing_not_configured` rather than failing open.

## Selling licence keys

Customer keys are **PGS2** — Ed25519-signed. The app carries only the public
half (`server/license-public.pem`), so a key cannot be forged, upgraded, or
edited into existence, however much of their own machine a customer can see.
`PGS1` keys still exist for local development and keep working.

### One-time setup (already done on the build machine — do not repeat)

```bash
node scripts/licence-keys.cjs init
```

Writes `license-private.pem` (**signs every key you will ever sell** — never
commit or ship it; back it up somewhere you will not lose, because losing it
orphans every key already sold) and `server/license-public.pem` (safe to ship;
it goes into the installer with the rest of `server/`).

### Issuing a key for a customer

```bash
node scripts/licence-keys.cjs issue --sub customer@example.com --plan pro
node scripts/licence-keys.cjs issue --sub customer@example.com --plan shop --days 365
```

- `--plan` is `pro` or `shop`.
- `--days` sets a subscription term; leave it off for a perpetual licence.
- Send the printed `PGS2...` line to the customer; they paste it into the
  **Licence** field the app shows on first run (the same field lives in the
  editor's Licence card).
- Every issued key is appended to `license-issued.json` beside the private key
  (gitignored) — your sales ledger, so a "what did I buy?" email can be answered
  in seconds.

### Checking a key before sending it

```bash
node scripts/licence-keys.cjs verify PGS2.xxxxx
```

Runs the app's own verifier and explains any failure (`bad_signature`,
`expired`, `malformed_key`, ...). Use it before delivery, or when a customer
reports their key will not accept.

### If a customer's key will not activate

1. `verify` the key from your side.
2. If it verifies for you but not on their machine, check the build shipped
   `server/license-public.pem` — without it the app reports
   `licensing_not_configured` and stays locked.
3. For an expired subscription, issue a fresh key and send it with a short
   note.

## Plans and terms

| Plan | Exports   | AI features                |
| ---- | --------- | -------------------------- |
| pro  | unlimited | Allowed with a valid key   |
| shop | unlimited | Allowed with a valid key   |

The plan travels inside the signed key (`scripts/licence-keys.cjs issue
--plan pro|shop`, optionally `--days`). Nothing on the customer's machine stores
or counts usage any more: the monthly export counter and the daily AI meter were
removed with the account system, because a key-gated paid app does not need
them. If the hosted AI features open up to buyers, re-add metering on the server
side, keyed by the licence subject (`sub`).

## What is actually enforced, and where

| Check            | Enforced by                                                          | Honest assessment                                               |
| ---------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| Licence validity | The app, offline: Ed25519 against the shipped public key             | Genuinely enforced: a key cannot be forged, edited or extended  |
| Editor access    | The gate — a valid key must be pasted before the app opens           | A patched client can skip it, as with any local app             |
| AI access        | Server, before the provider call: the request must carry a valid key | The provider key is ours; no valid key, no call                 |

A local app can always be patched, so treat the gate as copy protection for
honest installs. The durable protection is that keys cannot be minted: only the
private key (never shipped) can sign one.

## No local store

There is no `.data/licensing.json` any more. The plan and expiry are covered by
the signature that ships inside the key, so the old forgery trick — editing
`"plan": "shop"` in a local file — no longer has a file to edit.

## Shop setup in the app

The FFL/NFA marking tool reads licensed details from a shop profile, stored
locally (`pgs-shop-profile-v1`). On first run the app asks for the licensed name,
city, state and the default character height, and then fills those into every
marking block. There is no account to sync it with — it stays on the machine.

Presets ship with no shop-specific text on purpose, so the app is not
personalised to one business.

## Before selling: remaining work

- **Code signing.** The NSIS installer is unconfigured for a certificate, so
  buyers see an "unknown publisher" warning. Needs an OV or EV certificate.
- **EULA, privacy policy, refund and support terms.** Required for selling, and
  worth having a lawyer review given the compliance-adjacent nature.
- **AI metering, before hosted AI opens to buyers.** The daily counters went
  with the account system; re-add server-side metering keyed by the licence
  subject (`sub`) so a leaked key cannot spend your OpenAI budget unchecked.
- **Export control.** Software aimed at firearms marking may raise ITAR/EAR
  questions if sold outside the US. Worth a lawyer's read before shipping
  internationally.

## Related documents

- `legal/README.md` — start here for the customer-facing legal package, the
  placeholders to complete, the facts verified against the code, and the risk
  areas flagged for an attorney.
- `legal/EULA.md`, `legal/PRIVACY.md`, `legal/REFUNDS-AND-SUPPORT.md` — drafts to
  be reviewed and published.
- `public/THIRD-PARTY-NOTICES.md` — generated with `pnpm notices`; ships inside
  the installer.
- `docs/SIGNING.md` — installer build, code signing and release checklist.

## Related documents

- `docs/BRAND.md` — how ForgeMark Industries and Petes Guns and Stuff LLC relate,
  which surface shows which name, and what to do before applying to a payment
  processor.
