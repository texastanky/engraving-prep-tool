import { useState, type FormEvent } from "react";
import { LogIn, LogOut, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useAuth } from "@/components/providers/auth.tsx";
import { SupabaseError } from "@/lib/supabase.ts";

function friendlyError(error: unknown): string {
  if (error instanceof SupabaseError) {
    const message = error.message.toLowerCase();
    if (message.includes("already registered") || message.includes("already exists")) {
      return "That email already has an account. Try signing in instead.";
    }
    if (message.includes("invalid login credentials")) {
      return "Wrong email or password. Please try again.";
    }
    if (message.includes("password") && message.includes("at least")) {
      return "Passwords need at least 6 characters.";
    }
    if (message.includes("failed to fetch") || message.includes("not configured")) {
      return "Could not reach the cloud service. Check your internet connection.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/**
 * Sign-in / sign-up dialog plus the header account button, in one component:
 * signed out it offers the dialog, signed in it shows the email and sign-out.
 */
export function AccountButton() {
  const { user, initializing, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signIn") await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (initializing) {
    return (
      <Button variant="ghost" size="sm" disabled>
        Account
      </Button>
    );
  }

  if (user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        title={`Signed in as ${user.email ?? "account"}. Click to sign out.`}
        onClick={() => void signOut()}
      >
        <LogOut className="mr-1.5 h-3.5 w-3.5" />
        <span className="hidden sm:inline max-w-[160px] truncate">{user.email}</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <LogIn className="mr-1.5 h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign in</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">
            {mode === "signIn" ? "Sign in" : "Create an account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signIn"
              ? "Sign in to save your part templates to your private cloud library."
              : "Create a free account with your email and a password to keep your part templates private to your shop."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourshop.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-password">Password</Label>
            <Input
              id="account-password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode(mode === "signIn" ? "signUp" : "signIn");
                setError(null);
              }}
            >
              {mode === "signIn" ? (
                <>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Need an account?
                </>
              ) : (
                "Already have an account?"
              )}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : mode === "signIn" ? "Sign in" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
