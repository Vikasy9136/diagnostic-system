/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_ADMIN_EMAIL?: string;
  readonly VITE_PORTAL_URL?: string;
  readonly VITE_ADMIN_PORTAL_URL?: string;
  readonly VITE_SMALL_LAB_PORTAL_URL?: string;
  readonly VITE_LARGE_LAB_PORTAL_URL?: string;
  readonly VITE_USE_FIREBASE_EMULATOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

