import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  activateLicense,
  licenseErrorMessage,
  loadEntitlement,
  loadVerifiedEntitlement,
} from "@/lib/licensing.ts";

/**
 * The app gate: a valid licence key opens the editor.
 *
 * There is no account and no server — the key is checked on this machine
 * against the public key bundled in the build, so it works offline and survives
 * restarts. See docs/ROADMAP-TO-SALE.md, section 0.
 */
export function LicenceGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">("checking");
  const [storedKeyStale, setStoredKeyStale] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadVerifiedEntitlement().then((entitlement) => {
      if (cancelled) return;
      if (entitlement) {
        setStatus("unlocked");
        return;
      }
      // A key that is cached but no longer verifies is worth explaining —
      // it most often means the licence expired.
      setStoredKeyStale(loadEntitlement() !== null);
      setStatus("locked");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = licenseKeyInput.trim();
    if (!key) return;

    setIsSubmitting(true);
    setError("");

    const result = await activateLicense(key);
    setIsSubmitting(false);

    if (result.ok) {
      setStatus("unlocked");
      return;
    }

    setError(licenseErrorMessage(result.error ?? "malformed_key"));
  }

  if (status === "checking") {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border border-current border-t-transparent" />
          Checking licence...
        </div>
      </main>
    );
  }

  if (status === "unlocked") {
    return <>{children}</>;
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
              <h1 className="font-serif text-xl font-bold">Engraving Prep Tool</h1>
              <p className="text-sm text-muted-foreground">Enter your licence key to continue</p>
            </div>
          </div>

          {storedKeyStale ? (
            <p className="mb-3 rounded-md bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              The licence saved on this machine is no longer valid — it may have expired. Paste a
              current key to keep working.
            </p>
          ) : null}

          <label className="mb-3 block text-sm font-medium">
            Licence key
            <Input
              autoComplete="off"
              autoFocus
              className="mt-2 font-mono text-xs"
              onChange={(event) => setLicenseKeyInput(event.target.value)}
              placeholder="PGS2.…"
              spellCheck={false}
              value={licenseKeyInput}
            />
          </label>

          {error ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button className="w-full" disabled={isSubmitting || licenseKeyInput.trim().length === 0} type="submit">
            {isSubmitting ? "Checking..." : "Activate licence"}
          </Button>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            <KeyRound className="mr-1 inline size-3" />
            Your key is verified on this machine — no account needed, and the app keeps working
            offline. Need a key? Email{" "}
            <a className="text-primary hover:underline" href="mailto:support@forgemarkindustries.com">
              support@forgemarkindustries.com
            </a>
            .
          </p>
        </form>
      </div>
    </main>
  );
}
