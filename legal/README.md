# Legal package — read this first

> **These documents are drafts, not legal advice.** They were written by a
> software engineer to be _factually accurate_ about what this software does, so
> that a licensed attorney can review and finish them quickly. Have counsel
> review them before you publish or rely on them. Legal requirements vary by
> jurisdiction and change over time.
>
> **Status note (2026-10-03):** the account system has been removed from the
> product — the licence key now gates the app, it is verified offline, and the
> usage counters no longer exist. Parts of `EULA.md`, `PRIVACY.md` and
> `REFUNDS-AND-SUPPORT.md` still describe accounts, quotas and a licence server;
> update them during the counsel review before publishing.

## What is in here

| File                               | What it is                                                           | Who sees it                                          |
| ---------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `EULA.md`                          | Licence terms, prohibited uses, warranties, liability, indemnity     | Every customer, at install or first run              |
| `PRIVACY.md`                       | What is collected, what stays local, AI data flow, retention, rights | Every customer; also linked from the website         |
| `REFUNDS-AND-SUPPORT.md`           | Refund policy, renewals, support scope and targets                   | Linked at checkout and in support replies            |
| `../public/THIRD-PARTY-NOTICES.md` | Required attributions for bundled open-source components             | Ships inside the app; regenerate with `pnpm notices` |

These four documents reference each other, so publish them together.

## Entity: read this before anything else

The customer-facing brand is **ForgeMark Industries**, but **a DBA is not a
separate legal entity**. The contracting party in every document is therefore:

> Petes Guns and Stuff LLC, a Texas limited liability company, doing business as
> ForgeMark Industries

That is deliberate. If the documents named only "ForgeMark Industries", it would
be unclear what the customer actually contracted with and what owns the
intellectual property. Have counsel confirm the LLC's exact registered name and
that it is in good standing with the Texas Secretary of State.

The software, the account service, and the payment flow should all sit under this
same LLC, because that is the entity your FFL and business insurance cover.

## What is already filled in

- Entity, DBA, address, state and county (Rusk), and effective dates
- One contact address for everything: `support@forgemarkindustries.com`
- Phone: 903-998-0262
- Hosting provider: Vercel
- Retention periods and support windows, as defaults (see the next section)

**Email aliases worth creating.** Privacy, security and legal notices currently
all point at `support@forgemarkindustries.com` so nothing bounces. If you create
dedicated aliases later (`privacy@`, `security@`, `legal@`), update them in
EULA section 19, Privacy section 14, and Support section 3.5.

**Still outstanding:**

- `[PAYMENT PROCESSOR]` — name your processor once chosen (Stripe, Paddle,
  Lemon Squeezy). Using a merchant of record also shifts VAT/sales-tax handling
  to them, which is worth pricing before you decide.
- `[PRIVACY POLICY URL]` — publish these documents on your domain (for example
  `/terms`, `/privacy`, `/refunds`) and link them at checkout and in the app.
- `[IF AVAILABLE]` — decide whether customers can cancel a subscription from
  inside the app, or only by emailing support.
- Confirm the AI-provider retention and training statements in Privacy section 4
  against your current OpenAI agreement.
- The arbitration choice in EULA section 16.

## Decisions embedded as defaults — confirm or change

These were filled with sensible values so the documents read as finished drafts.
They are business decisions, not legal requirements:

| Where                            | Default chosen                                       | Confirm                                |
| -------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Privacy: account deletion        | 30 days after a verified request                     | Ops capacity                           |
| Privacy: licence records         | Licence term plus 4 years                            | Your accountant                        |
| Privacy: usage counts            | Current period plus 12 months                        | Ops                                    |
| Privacy: payment and tax records | 7 years                                              | Your accountant                        |
| Privacy: support correspondence  | 2 years after the matter closes                      | Ops                                    |
| Privacy: security logs           | Hosting provider's plan retention                    | Check Vercel's policy for your plan    |
| Refunds: processing time         | 5 business days                                      | Your processor                         |
| Refunds: annual plans            | No pro-rating                                        | Whether you want to offer it           |
| Refunds: fees                    | No restocking or cancellation fee                    | Whether the processor refunds its fees |
| Support: hours                   | 9am–5pm Central, Mon–Fri, excluding federal holidays | You                                    |
| Support: response targets        | 1 business day for blockers, 2 for questions         | You                                    |

## Facts already verified against the code

Your attorney should not have to reverse-engineer the software. These statements
were checked against the source at the time of writing:

**Data locations**

- Artwork, designs, imported SVGs, part photographs, shop details, presets, and
  the cached licence entitlement are stored **locally on the user's device**
  (browser/Electron local storage). They are not uploaded to us.
- Exports are generated **on the device**; we never receive the exported file.
- The server stores: account email, display name, a PBKDF2-SHA256 password hash
  (210,000 iterations, per-account random salt), licence records, and usage
  counters. The account store is a local JSON file in this codebase and should be
  replaced with a proper database before selling at volume.

**Session handling**

- Cookie name `pgs_session`, HttpOnly, SameSite=Lax, 14-day expiry, HMAC-signed
  with `AUTH_SESSION_SECRET`. `Secure` is set when `AUTH_COOKIE_SECURE=true` or
  `NODE_ENV=production`.

**Usage counting**

- Exports are counted per calendar month (UTC) and AI requests per calendar day
  (UTC), keyed to the account. Contents are not stored — only counts.

**AI data flow**

- AI requests go from the device to our API (`api/assistant.js`,
  `api/ai-compose.js`), which calls OpenAI with a **server-side** API key
  (`OPENAI_API_KEY`). The user's browser never sees that key.
- The assistant can include a design image and/or a part photograph when the
  feature attaches them, so **photographs of parts can leave the device** if the
  user chooses an AI feature. This is disclosed in `PRIVACY.md` section 4 and is
  the most privacy-sensitive behaviour in the product.
- Registration is open by default. Set `AUTH_DISABLE_REGISTRATION=true` once you
  have customers, or strangers can create accounts and spend your AI budget.

**Licensing**

- Licence keys are HMAC-signed (`PGS1.<payload>.<signature>`) and typically embed
  the customer's email as the subject identifier. Entitlement tokens are cached
  locally with a 30-day expiry, which is what allows offline use.
- Export counting is a client-requested, server-recorded check. It is a speed
  bump, not copy protection — the EULA should not promise more than that.

**Update checks**

- The app fetches a version manifest (default
  `https://engraving-prep-tool.vercel.app/update.json`, overridable with
  `VITE_UPDATE_MANIFEST_URL`). That reveals an IP address and version number.

**Uninstall behaviour**

- `deleteAppDataOnUninstall: false`, so local data survives uninstall by design.
  Disclosed in `PRIVACY.md` section 9 with instructions to remove it manually.

## Risk areas flagged for counsel

These are the points that most need a lawyer's judgement. They are listed in
rough order of how much they could cost you.

1. **Serial-number alteration.** The tool can draw arbitrary text and shapes on
   firearm parts, including over existing markings. 18 U.S.C. § 922(k) and
   26 U.S.C. § 5861 make it a crime to remove, obliterate, or alter serial
   numbers and required markings. EULA section 3.1 prohibits this use, but
   counsel should confirm that the wording, the in-app warnings, and your
   ability to show you did not intend or facilitate that use are adequate. This
   is the single most important clause in the package.

2. **Compliance disclaimers.** You are selling to licensed businesses that will
   rely on output for regulated markings. Confirm that the disclaimers in EULA
   section 5 (not legal advice, verify requirements, measure test marks, no
   agency approval) are strong enough and visible enough — including whether
   they should be shown in the app at the point of marking, not only in a
   document.

3. **Export control.** Software specifically for firearm marking may attract
   ITAR/EAR scrutiny when sold or transferred outside the United States. EULA
   section 15 addresses sanctions and restricted parties, but counsel should
   advise whether you can sell internationally at all, and whether a
   self-classification or an export authorisation is needed.

4. **Refunds and consumer law.** The 14-day policy must not fall below statutory
   minimums. For UK/EEA consumers this means handling the digital-content
   withdrawal waiver correctly; in Texas and other US states, check automatic
   renewal disclosure rules if you sell subscriptions.

5. **Arbitration versus courts.** EULA section 16 currently sets Texas courts and
   venue. Arbitration with a class-action waiver is often preferred by software
   sellers but has downsides (cost, fairness optics) and may be unenforceable in
   some states. This is a business decision, not a drafting detail.

6. **Privacy compliance.** Confirm your obligations under the CCPA/CPRA, and
   under GDPR/UK GDPR if you sell abroad. Check that your OpenAI agreement covers
   the processor relationship and state retention accurately. Review whether your
   hosting provider retains access logs, and for how long, because the policy
   currently leaves that as a bracketed item.

7. **Payments and tax.** Consider a merchant-of-record (for example Paddle or
   Lemon Squeezy) so VAT/sales-tax handling and chargebacks are not yours. If you
   take payments directly, confirm your Texas sales-tax obligations for software.

8. **Insurance.** Given the domain, ask your broker about technology errors and
   omissions coverage, and whether your existing firearms business policy covers
   software you sell. Your liability cap and indemnity clauses are only useful if
   they are enforceable where your customers are.

9. **Acceptance mechanics.** For the licence to be an agreement rather than a
   claim, the customer should positively accept it. There is currently no
   in-app acceptance step; adding one at first run (with links to the EULA and
   Privacy Policy, and a record of acceptance) is recommended so you can show
   assent.

## Before publishing

- [ ] Counsel has reviewed and edited all three documents
- [ ] The remaining items in "Still outstanding" above are resolved
- [ ] Entity name, address, and contacts are consistent across all documents
- [ ] Documents are published on the website and linked at checkout
- [ ] An in-app acceptance step records assent
- [ ] `pnpm notices` has been run and `THIRD-PARTY-NOTICES.md` ships in the build
- [ ] Your registered address and business name match your FFL records
