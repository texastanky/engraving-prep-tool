/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVATE_TEST_PASSWORD_HASH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_UPDATE_MANIFEST_URL__: string | undefined;
declare const __APP_VERSION__: string | undefined;
