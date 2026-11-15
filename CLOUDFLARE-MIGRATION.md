# Cloudflare migration candidate — not deployed

This branch starts from the tested editor beta in PR 6. It does not replace
that candidate or change its Windows installer.

## Local verification

Use Node 22 and the pinned pnpm dependencies:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm cloudflare:check
pnpm cloudflare:dev
```

`cloudflare:check` compiles the app and bundles the Worker with `--dry-run`.
It does not upload or deploy. `cloudflare:dev` runs the Cloudflare runtime
locally against `dist`. Stop the local server before rebuilding or running
`cloudflare:check`, then restart it so its asset snapshot matches the new build.

The Worker serves the React SPA, the existing legal-page rewrites, `/canvas`
noindex headers, and uncached cross-origin `/update.json`. It adapts the
existing AI endpoints to Worker bindings without changing the desktop routes.
Licence verification uses the bundled verification key; no signing key belongs
in the Worker.

## Data and account behavior

- Portable project JSON, artwork exports and browser-local storage keep their
  existing behavior.
- The desktop `/api/presets` file store is **not** exposed as a shared public
  file. On the Worker, GET reports no file store and writes return 405.
  The existing frontend keeps its browser-local mirror. Desktop file storage
  is unchanged.
- Existing Supabase sign-in and per-user template sync remain with Supabase.
  No legacy file-backed `/api/auth` endpoint is exposed on Cloudflare.
- A new web origin has separate browser storage. Export project/preset backups
  before switching origins; local data will not automatically transfer.

## Before any deployment

1. Obtain explicit deployment approval and confirm the target Cloudflare
   account and permissions. No account IDs, routes or domains are configured.
2. Configure `OPENAI_API_KEY` as a Worker secret if AI will be enabled.
   Optional bindings are `OPENAI_ASSISTANT_MODEL` and `OPENAI_IMAGE_MODEL`.
   Leave the legacy `LICENSE_SECRET` unset unless supporting old PGS1 licences.
   Never upload a licence-signing private key.
3. Verify Supabase project configuration, row-level security, allowed origins
   and account recovery/redirect URLs for the new origin.
4. Decide AI quotas/rate limits and test licensed AI with approved credentials
   and spending limits before a public launch. This branch preserves existing
   licence checks; it does not add billing or usage metering.
5. Approve an isolated Cloudflare test address, then enable only the intended
   test URL. Both `workers_dev` and version-preview URLs are disabled by default.
6. Test Save/Open, SVG/PNG exports, private presets, sign-in and optional AI on
   that address. Configure download storage separately for large Windows
   installers; they are not included in static assets.
7. Switch app DNS only after approval. Keep existing hosting available for
   rollback; do not cancel Vercel or change the main website during preparation.

The migration branch disables Vercel Git auto-deployment **only for this
branch**. Existing Vercel rewrites, other branches, public update metadata and
GitHub release workflows remain unchanged. There is no deploy workflow.
