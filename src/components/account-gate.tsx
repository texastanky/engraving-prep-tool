import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { LockKeyhole, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type AuthState =
  | { status: "loading"; user: null }
  | { status: "guest"; user: null }
  | { status: "ready"; user: AuthUser };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Use a valid email address.",
  weak_password: "Password needs to be at least 8 characters.",
  bad_signup_code: "That access code did not match.",
  registration_disabled: "New accounts are disabled right now. Sign in with the owner account.",
  account_exists: "That email already has an account. Sign in instead.",
  bad_credentials: "Email or password did not match.",
  auth_unavailable: "Account service is unavailable right now.",
};

const LOGIN_DISABLED_TEMPORARILY = false;
const REGISTRATION_DISABLED = import.meta.env.VITE_AUTH_REGISTRATION_DISABLED === "true";

async function authRequest(payload?: Record<string, unknown>) {
  const response = await fetch("/api/auth", {
    method: payload ? "POST" : "GET",
    credentials: "include",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES[body.error] || "Could not complete that account request.");
  }

  return body as { authenticated: boolean; user: AuthUser | null };
}

export function AccountGate({ children }: { children: ReactNode }) {
  if (LOGIN_DISABLED_TEMPORARILY) {
    return <>{children}</>;
  }

  return <AuthenticatedAccountGate>{children}</AuthenticatedAccountGate>;
}

function AuthenticatedAccountGate({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading", user: null });
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    authRequest()
      .then((result) => {
        if (cancelled) return;
        setAuth(result.authenticated && result.user ? { status: "ready", user: result.user } : { status: "guest", user: null });
      })
      .catch(() => {
        if (!cancelled) setAuth({ status: "guest", user: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const result = await authRequest({
        action: REGISTRATION_DISABLED ? "login" : mode,
        name,
        email,
        password,
        signupCode,
      });

      if (result.authenticated && result.user) {
        setAuth({ status: "ready", user: result.user });
        setPassword("");
        return;
      }

      setError("Account was not signed in.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await authRequest({ action: "logout" }).catch(() => null);
    setAuth({ status: "guest", user: null });
    setPassword("");
  }

  if (auth.status === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border border-current border-t-transparent" />
          Checking account...
        </div>
      </main>
    );
  }

  if (auth.status === "ready") {
    return (
      <>
        {children}
        <div className="fixed right-4 top-16 z-[70] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-xl backdrop-blur">
          <ShieldCheck className="size-3.5 text-primary" />
          <span className="truncate">{auth.user.email}</span>
          <Button className="h-6 px-2 text-[10px]" size="xs" variant="secondary" onClick={handleLogout}>
            <LogOut className="size-3" />
            Sign out
          </Button>
        </div>
      </>
    );
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
              {mode === "register" ? <UserPlus className="size-5" /> : <LockKeyhole className="size-5" />}
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold">Engraving Prep Tool</h1>
              <p className="text-sm text-muted-foreground">
                {mode === "register" ? "Create a free beta account" : "Sign in to continue"}
              </p>
            </div>
          </div>

          <div className={`mb-4 grid rounded-md border border-border p-1 text-sm ${REGISTRATION_DISABLED ? "grid-cols-1" : "grid-cols-2"}`}>
            <button
              className={`rounded px-3 py-1.5 font-medium ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign in
            </button>
            {!REGISTRATION_DISABLED && (
              <button
                className={`rounded px-3 py-1.5 font-medium ${mode === "register" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Free account
              </button>
            )}
          </div>

          {mode === "register" && (
            <label className="mb-3 block text-sm font-medium">
              Name
              <Input
                autoComplete="name"
                className="mt-2"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
          )}

          <label className="mb-3 block text-sm font-medium">
            Email
            <Input
              autoComplete="email"
              className="mt-2"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="mb-3 block text-sm font-medium">
            Password
            <Input
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="mt-2"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {mode === "register" && (
            <label className="mb-3 block text-sm font-medium">
              Access code <span className="font-normal text-muted-foreground">(if required)</span>
              <Input
                autoComplete="off"
                className="mt-2"
                onChange={(event) => setSignupCode(event.target.value)}
                value={signupCode}
              />
            </label>
          )}

          {error ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Working..."
              : mode === "register"
                ? "Create free account"
                : "Sign in"}
          </Button>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Accounts are stored server-side. Saved laser presets still stay local to your browser unless you export them.
          </p>
        </form>
      </div>
    </main>
  );
}
