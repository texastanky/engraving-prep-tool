# Operations: licensing, quotas and shop setup

This covers what a shop owner or the person running your servers needs. It is not
legal advice, and nothing here determines whether a marking is compliant.

## Environment variables

| Variable                                   | Purpose                                                    | Required                         |
| ------------------------------------------ | ---------------------------------------------------------- | -------------------------------- |
| `AUTH_SESSION_SECRET`                      | Signs login sessions                                       | Recommended in production        |
| `AUTH_ADMIN_EMAIL` / `AUTH_ADMIN_PASSWORD` | Static owner account, no registration needed               | Optional                         |
| `AUTH_DISABLE_REGISTRATION`                | Set to `true` to stop strangers creating accounts          | Recommended once customers exist |
| `AUTH_SIGNUP_CODE`                         | Required code for registration                             | Optional                         |
| `LICENSE_SECRET`                           | Signs licence keys and entitlements (16+ chars)            | Required to sell licences        |
| `LICENSE_STORE_FILE`                       | Where usage counters live (default `.data/licensing.json`) | Optional                         |
| `OPENAI_API_KEY`                           | Server-side key for the AI features                        | Optional                         |

If `LICENSE_SECRET` is unset, no licence key can ever verify and the app runs on
the free tier. It fails closed rather than open.

## Issuing a licence key

Keys are `PGS1.<payload>.<signature>`, signed with `LICENSE_SECRET`. Issue them
from any machine that has the secret:

```bash
node --input-type=module -e "
  const { issueLicenseKey } = await import('./server/licensing.js');
  console.log(issueLicenseKey({ sub: 'customer@example.com', plan: 'shop' }));
"
```

Add `expiresAt: '2027-01-01T00:00:00.000Z'` for a subscription term; leave it off
for a perpetual licence. The customer pastes the key into the app's Licence card.

## Plans and limits

| Plan | Exports per month | AI calls per day |
| ---- | ----------------- | ---------------- |
| free | 5                 | 5                |
| pro  | unlimited         | 200              |
| shop | unlimited         | 1000             |

Change these in `PLANS` in `server/licensing.js`. They are the single source of
truth for both the server checks and the numbers shown in the app.

## What is actually enforced, and where

| Check            | Enforced by                         | Honest assessment                                                           |
| ---------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| AI call quota    | Server, before the provider call    | Genuinely enforced: the provider key is server-side                         |
| Licence validity | Server, signature checked           | Genuinely enforced: keys cannot be forged without the secret                |
| Export allowance | Server counter, asked by the client | A speed bump. Exports run locally, so a patched client can skip the request |

Because of that last row, do not treat export counting as copy protection. The
durable protections are licence validity and the fact that the AI features need
your server. Anything else can be worked around by someone determined enough to
patch a local app.

## Usage counters

Counters live in `LICENSE_STORE_FILE` as:

```json
{
  "users": {
    "<user id>": { "exports": { "2026-09": 5 }, "ai": { "2026-09-14": 12 } }
  }
}
```

Exports are counted per calendar month and AI calls per day, both UTC. A denied
request does not consume quota. Deleting the file resets all counters — it is a
plain file, so back it up alongside the account store if you care about it.

## Shop setup in the app

The FFL/NFA marking tool reads licensed details from a shop profile, stored
locally (`pgs-shop-profile-v1`). On first run the app asks for the licensed name,
city, state and the default character height, and then fills those into every
marking block. If accounts move server-side, this is the object to sync.

Presets ship with no shop-specific text on purpose, so the app is not
personalised to one business.

## Before selling: remaining work

- **Code signing.** The NSIS installer is unconfigured for a certificate, so
  buyers see an "unknown publisher" warning. Needs an OV or EV certificate.
- **EULA, privacy policy, refund and support terms.** Required for selling, and
  worth having a lawyer review given the compliance-adjacent nature.
- **Registration policy.** Set `AUTH_DISABLE_REGISTRATION=true` once you have
  customers, or strangers can create accounts and spend your AI budget.
- **Accounts.** `server/auth.js` writes to a local JSON file. That works for a
  single shop; a customer base needs a real backend with password reset.
- **Refill the licence store.** Consider whether monthly counters should reset
  on a billing anniversary rather than the calendar month.
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
