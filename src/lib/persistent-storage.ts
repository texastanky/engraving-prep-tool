import { toast } from "sonner";

function desktopStorage() {
  if (window.engravingStorage) return window.engravingStorage;
  // A broken preload must not silently save desktop data to a temporary origin.
  if (/Electron\//.test(window.navigator.userAgent)) {
    throw new Error("Desktop storage is unavailable");
  }
  return null;
}

export const persistentStorage = {
  getItem(key: string): string | null {
    const desktop = desktopStorage();
    if (!desktop) return window.localStorage.getItem(key);
    const saved = desktop.getItem(key);
    if (saved !== null) return saved;
    // Preserve legacy data that is available at the current browser origin.
    const legacy = window.localStorage.getItem(key);
    if (legacy !== null) desktop.setItem(key, legacy);
    return legacy;
  },
  setItem(key: string, value: string): void {
    (desktopStorage() ?? window.localStorage).setItem(key, value);
  },
};

export function storageError(message: string) {
  toast.error(message, { id: "engraving-storage-error" });
}
