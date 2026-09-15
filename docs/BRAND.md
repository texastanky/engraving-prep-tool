# Brand and entity separation

## The structure, and why

One LLC, two trading names:

| Name                         | Role                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Petes Guns and Stuff LLC** | The legal entity. Holds the FFL, the SOT, the insurance and the assets, and is the contracting party in every customer agreement. |
| **Petes Guns and Stuff**     | The gun shop: FFL transfers, inventory, marking services.                                                                         |
| **ForgeMark Industries**     | The software business: Engraving Prep Tool, and the brand customers buy from.                                                     |

The goal is that a payment processor, marketplace, or software customer sees an
engraving/marking software vendor, while the LLC still owns everything and keeps
the legal protection.

**ForgeMark Industries is a d/b/a, not a separate entity.** That is deliberate:
it keeps the software inside the LLC rather than splitting it into an entity that
would no longer be covered by the LLC's protection. The trade-off is discussed at
the end of this document.

## Which surface shows which name

| Surface                                      | Shows                                                         | Where                                                |
| -------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Installer publisher, app executable metadata | ForgeMark Industries                                          | `package.json` → `author`, `copyright`               |
| App header tagline                           | ForgeMark Industries                                          | `editor.tagline` in `src/locales/*/engraving.json`   |
| App shell title, description, author, icon   | ForgeMark Industries                                          | `index.html`, `public/icon.png`                      |
| Published legal pages                        | ForgeMark Industries, naming the LLC as the contracting party | `legal/*.md` → `public/{terms,privacy,refunds}.html` |
| Licence card links, support address          | ForgeMark Industries, `support@forgemarkindustries.com`       | `src/pages/canvas/_components/canvas-editor.tsx`     |
| Gun shop landing page (`/`) and its footer   | Petes Guns and Stuff                                          | `src/pages/Index.tsx`                                |
| Gun shop contact                             | `support@petesgunsandstuff.com`                               | `src/pages/Index.tsx`                                |

The legal documents name the brand first and the LLC second, for example
"ForgeMark Industries — a d/b/a of Petes Guns and Stuff LLC". That reads as a
software vendor to a customer while keeping the LLC as the party that contracts
and owns the intellectual property. Do not remove the LLC from those documents.

One shell file serves both brands, so `index.html` carries the software values
and the landing page swaps in the gun shop's title and description at runtime
(`useGunShopMetadata` in `src/pages/Index.tsx`).

## The gap that still undermines separation

**Both businesses are currently served from one deployment and one domain.** The
gun shop page, the software, and the published legal pages all live together, and
the landing page advertises FFL transfers, inventory and a Class 2 SOT.

For payment-processor review that matters: the URL you submit is what the
underwriter reads. If they land on FFL transfers and firearm inventory alongside
the software, the separation only exists in the paperwork.

Options, in order of strength:

1. **Separate domain and deployment for the software** (for example
   `forgemarkindustries.com`), with the software, legal pages and support email
   living there and the gun shop staying on its own domain. This is the clean
   answer and the one to aim for before applying to a processor.
2. **Separate routes on one domain** with the software at a clearly branded path.
   Weaker, because the gun shop is still one click away.

Nothing in the code prevents option 1: the app is already a single Vite build
with its own branding, and moving it is a deployment change rather than a rewrite.

## Payment processors: what to expect

Not legal or financial advice — this is what the application process tends to
look like for a business like this.

**Be straight about the entity and the affiliation.** Underwriting asks for the
legal entity name, EIN and often a business website. Applying as "ForgeMark
Industries" while the LLC is a licensed firearms business is normal and fine —
that is what DBAs are for — but concealing the firearms affiliation to get past a
prohibited-business screen is a good way to have funds frozen and the account
terminated later. Being declined is recoverable; misrepresentation is not.

**Describe the product accurately: engraving and marking _software_.** That is a
different category from selling firearms, ammunition or accessories, and many
processors that prohibit the latter still allow software. Some restrict anything
firearm-adjacent, so read each processor's prohibited-business list before
applying, and expect to answer questions.

**Have these ready** (most are already done):

- Legal entity name, EIN, registered address, and the DBA on file
- A public product page and the legal pages: `/terms`, `/privacy`, `/refunds`
- A written refund policy (the 14-day policy is in `legal/REFUNDS-AND-SUPPORT.md`)
- A business bank account in the LLC's name that can receive funds under the DBA
- A short, honest description of what the software does

**On specific channels:**

- **Etsy** is not a realistic channel for this product. Firearm-related items are
  prohibited there, and the software itself is a firearms-adjacent product even
  though it is not a firearm.
- **GunTab** is built for firearm transactions and works on a website, but it is
  not a subscription billing platform. You still need a proper processor for
  recurring software licences.
- **Merchant of record** services (Paddle, Lemon Squeezy) shift VAT/sales tax and
  chargebacks to them, which is attractive, but check their restricted lists too
  — some also exclude firearms-adjacent products.
- **A dedicated software-friendly processor** that has published its stance on
  firearms-adjacent software is usually the fastest path. Ask them directly
  before building an integration, and get the answer in writing.

## Administration and counsel items

Flagged for your attorney and accountant, not settled here:

1. **Assumed name (DBA) filing.** A Texas LLC operating under an assumed name
   generally needs an assumed name certificate — check the current requirement
   with the county clerk and/or the Texas Secretary of State, and make sure the
   name on the merchant account matches what is filed.
2. **One entity means shared liability.** Because the software sits inside the
   same LLC as the FFL, a software claim can reach LLC assets the gun business
   relies on. A separate entity would isolate that, but would also move the
   software outside the protection you want it inside. That trade-off is a
   decision for counsel and your CPA.
3. **Insurance.** Confirm the policy covers software you sell: a technology
   errors and omissions line, not only firearms and gunsmithing.
4. **Banking and taxes.** Software revenue and firearm revenue in one LLC may
   need clear bookkeeping separation, even though they are one taxpayer.

## Checklist before applying to a processor

- [ ] Software reachable on its own domain, separate from the gun shop site
- [ ] Legal pages published on that domain and linked at checkout
- [ ] DBA filed, and matched on the bank account and the processor application
- [ ] Support address that does not mention firearms
- [ ] Product described as engraving and marking software
- [ ] Refund policy visible before purchase
- [ ] Insurance confirmed to cover software

## The two domains

| Domain | Serves | Repository |
| --- | --- | --- |
| `petesgunsandstuff.com` | The gun shop site: transfers, inventory, services, its own legal pages | `petes-guns-site` |
| `forgemarkindustries.com` | The software: public product page, the editor, and the software's legal pages | this repository |

The app no longer carries gun shop marketing. Before this change the same
deployment served an FFL landing page (transfers, inventory, SOT) and the
software, which is exactly what would have undermined the separation during
processor review. That page was removed here because the gun shop site in
`petes-guns-site` supersedes it.

### What is public on the software domain

| Route | Access |
| --- | --- |
| `/` | Public product page (ForgeMark Industries) |
| `/terms`, `/privacy`, `/refunds` | Public static pages, generated from `legal/*.md` |
| `/canvas` | Requires an account (`AccountGate`) |

All routes used to sit behind the account gate, which meant the software had no
public page at all. The gate now wraps only the editor routes, so the product
page and the legal pages are reachable by anyone — required for underwriting and
for customers deciding whether to buy.

### Setting up forgemarkindustries.com

1. In Vercel, add `forgemarkindustries.com` (and `www`) as domains on the project
   that deploys this repository.
2. At the registrar, point the domain at Vercel's nameservers or add the A/CNAME
   records Vercel shows.
3. Confirm all four public URLs resolve on the new domain: `/`, `/terms`,
   `/privacy`, `/refunds`.
4. Confirm the update manifest is served from it:
   `https://forgemarkindustries.com/update.json`. The app defaults to that URL
   (`VITE_UPDATE_MANIFEST_URL` overrides it), so publish the manifest there when
   you release an update.
5. Keep `petesgunsandstuff.com` on its own project. Linking *from* the gun shop
   *to* the software is fine; the software site deliberately does not link to the
   gun shop, so an underwriter reviewing the software domain sees only the
   software.

### Cross-linking rule

- Gun shop → software: acceptable, and useful for customers who want the tool.
- Software → gun shop: avoid on marketing pages. The LLC is named in the legal
  documents, which is where the connection belongs.

## Contact details: no street address

This is a home-based business. The street address is deliberately **not**
published anywhere customer-facing, so nobody is invited to turn up at the house.

| Surface | Contact shown |
| --- | --- |
| Product page footer | Company name, email, phone |
| Legal pages (`/terms`, `/privacy`, `/refunds`) | Company name, email, phone |
| EULA notices clause | Email only |
| Gun shop site | City and state only (verified: its schema has locality, region and postcode, no street address) |

**A build guard enforces it.** `scripts/generate-legal-pages.cjs` fails the build
if a customer-facing legal page contains something that looks like a street
address, with an error pointing at the offending string. So an address cannot
creep back into the published documents unnoticed.

If you later take a PO Box or registered-agent address, put it in `ADDRESS` at
the top of that script and it will appear in the page footer automatically. The
EULA's notices clause currently routes legal notices to email, which is the
simplest arrangement while there is no business mailing address.

### Flagged for your attorney and CPA

1. **Registered agent and registered office.** Texas filings for an LLC include a
   registered agent and office, which is public record. A commercial registered
   agent service (or an address you are willing to publish) keeps the home out of
   that record. Worth confirming what your current filing shows.
2. **Assumed name certificate.** The ForgeMark Industries DBA filing may also
   include an address and is public at the county clerk. Same consideration.
3. **FFL premises address.** The licensed premises address appears in ATF's
   public FFL listing regardless of what any website shows. That is separate from
   publishing it prominently, but it is worth knowing it is out there.
4. **Shipping instructions.** Customers sending firearms for transfer need the
   delivery address. Keep that in the order/transfer correspondence rather than
   on indexable pages.

## Other domains

- `petesgunsandstuff.com` — the gun shop site (`petes-guns-site`).
- `forgemarkindustries.com` — the software (this repository).
- `chromaafterdark.com` — owned, not in use. If the software ever needs a
  distinct consumer-facing brand (for example a design or retail line), that is
  the obvious home for it; nothing here depends on it.

### Where the gun shop site links to the software

`petes-guns-site` now links to `https://forgemarkindustries.com` from the footer
of all 16 pages that have a footer, plus a short "Prepared with our own software"
section on `/laser-services` explaining that project artwork and marking blocks
are prepared with Engraving Prep Tool, with a link for shops that do their own
marking.

The link is deliberately one-way. The software site does not link back to the gun
shop, so an underwriter reviewing `forgemarkindustries.com` sees only the
software. The LLC connection lives in the legal documents, which is where it
belongs.
