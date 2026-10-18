import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ensureValidSession,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  signUp as supabaseSignUp,
  type SupabaseSession,
  type SupabaseUser,
} from "@/lib/supabase.ts";

type AuthState = {
  user: SupabaseUser | null;
  session: SupabaseSession | null;
  /** True until the stored session (if any) has been checked. */
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const valid = await ensureValidSession();
      if (!cancelled) {
        setSession(valid);
        setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      initializing,
      signIn: async (email, password) => {
        const next = await supabaseSignIn(email, password);
        setSession(next);
      },
      signUp: async (email, password) => {
        const next = await supabaseSignUp(email, password);
        setSession(next);
      },
      signOut: async () => {
        if (session) await supabaseSignOut(session);
        setSession(null);
      },
    }),
    [session, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
