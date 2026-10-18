/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVATE_TEST_PASSWORD_HASH?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_UPDATE_MANIFEST_URL__: string | undefined;
declare const __APP_VERSION__: string | undefined;
declare const __LICENCE_PUBLIC_KEY__: string;
