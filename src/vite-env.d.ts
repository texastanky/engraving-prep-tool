/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVATE_TEST_PASSWORD_HASH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
