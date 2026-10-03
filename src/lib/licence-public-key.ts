/**
 * The public key PGS2 licence keys are verified against.
 *
 * Injected at build time from server/license-public.pem — the same file the
 * server reads — by the `define` entry in vite.config.ts and vitest.config.ts.
 * It is public by design: only the private half (which never ships) can sign a
 * key.
 */

export const LICENCE_PUBLIC_KEY_PEM: string = __LICENCE_PUBLIC_KEY__;
