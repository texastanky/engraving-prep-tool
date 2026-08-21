import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

const STORAGE_KEY = "engraving-prep-private-preview";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getStoredUnlock(expectedHash: string) {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === expectedHash;
  } catch {
    return false;
  }
}

function storeUnlock(expectedHash: string) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, expectedHash);
  } catch {
    // Session storage is a convenience only; private mode can still continue.
  }
}

export function PrivatePreviewGate({ children }: { children: ReactNode }) {
  const expectedHash = import.meta.env.VITE_PRIVATE_TEST_PASSWORD_HASH?.trim();
  const [password, setPassword] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(() =>
    expectedHash ? getStoredUnlock(expectedHash) : true,
  );

  const isEnabled = useMemo(() => Boolean(expectedHash), [expectedHash]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!expectedHash) {
      setIsUnlocked(true);
      return;
    }

    setIsChecking(true);
    setError("");

    try {
      const actualHash = await sha256Hex(password);

      if (actualHash === expectedHash) {
        storeUnlock(expectedHash);
        setIsUnlocked(true);
        return;
      }

      setError("That password did not match.");
    } catch {
      setError("This browser could not verify the password.");
    } finally {
      setIsChecking(false);
    }
  }

  if (!isEnabled || isUnlocked) {
    return children;
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-sm items-center justify-center">
        <form
          onSubmit={handleSubmit}
          className="w-full rounded-lg border border-border bg-card p-5 shadow-2xl"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold">Private Preview</h1>
              <p className="text-sm text-muted-foreground">
                Engraving Prep Tool
              </p>
            </div>
          </div>

          <label htmlFor="preview-password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="preview-password"
            autoComplete="current-password"
            autoFocus
            className="mt-2"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />

          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button className="mt-5 w-full" disabled={isChecking} type="submit">
            {isChecking ? "Checking..." : "Open Preview"}
          </Button>
        </form>
      </div>
    </main>
  );
}
