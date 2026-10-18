/**
 * Minimal Supabase REST client (auth + database) using fetch only.
 *
 * The desktop build ships without node_modules, so no npm SDK: everything the
 * app needs goes through the platform REST endpoints with the anon key and,
 * once signed in, the user's access token. The session is persisted in
 * localStorage and refreshed with the refresh token when it has expired.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

const SESSION_KEY = "forgemark-auth-session";

export type SupabaseUser = { id: string; email?: string };

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  user: SupabaseUser;
  expires_at?: number;
};

export class SupabaseError extends Error {}

function requireConfig(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new SupabaseError("Cloud services are not configured.");
  }
}

function extractError(payload: unknown, status: number): SupabaseError {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message =
      (typeof record.msg === "string" && record.msg) ||
      (typeof record.message === "string" && record.message) ||
      (typeof record.error_description === "string" && record.error_description) ||
      (typeof record.error === "string" && record.error);
    if (message) return new SupabaseError(message);
  }
  return new SupabaseError(`Request failed (${status}).`);
}

async function requestJson(
  path: string,
  init: RequestInit & { headers?: Record<string, string> }
): Promise<{ status: number; payload: unknown }> {
  requireConfig();
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) throw extractError(payload, response.status);
  return { status: response.status, payload };
}

// --- Session persistence ---

export function loadStoredSession(): SupabaseSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupabaseSession;
    if (!parsed?.access_token || !parsed?.refresh_token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredSession(session: SupabaseSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable; the session lives for this tab only.
  }
}

// --- Auth ---

function sessionFromAuthPayload(payload: unknown): SupabaseSession | null {
  const record = payload as Record<string, unknown> | null;
  if (!record || typeof record !== "object") return null;
  const access = typeof record.access_token === "string" ? record.access_token : null;
  const refresh = typeof record.refresh_token === "string" ? record.refresh_token : null;
  const user = record.user as Record<string, unknown> | undefined;
  const userId = user && typeof user.id === "string" ? user.id : null;
  if (!access || !refresh || !userId) return null;
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: typeof record.expires_at === "number" ? record.expires_at : undefined,
    user: {
      id: userId,
      email: typeof user?.email === "string" ? user.email : undefined,
    },
  };
}

export async function signUp(email: string, password: string): Promise<SupabaseSession | null> {
  const { payload } = await requestJson("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  // Email confirmation is off, so a session comes straight back. Handle both
  // shapes (session at top level, or user-only) defensively.
  const session = sessionFromAuthPayload(payload);
  if (session) saveStoredSession(session);
  return session;
}

export async function signIn(email: string, password: string): Promise<SupabaseSession> {
  const { payload } = await requestJson("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const session = sessionFromAuthPayload(payload);
  if (!session) throw new SupabaseError("Sign-in failed. Please try again.");
  saveStoredSession(session);
  return session;
}

export async function refreshSession(session: SupabaseSession): Promise<SupabaseSession | null> {
  try {
    const { payload } = await requestJson("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const next = sessionFromAuthPayload(payload);
    if (next) saveStoredSession(next);
    else saveStoredSession(null);
    return next;
  } catch {
    saveStoredSession(null);
    return null;
  }
}

export async function signOut(session: SupabaseSession): Promise<void> {
  try {
    await requestJson("/auth/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({}),
    });
  } catch {
    // The local session is cleared regardless.
  }
  saveStoredSession(null);
}

/** A stored session that is still valid, refreshing it if it has expired. */
export async function ensureValidSession(): Promise<SupabaseSession | null> {
  const stored = loadStoredSession();
  if (!stored) return null;
  const expired =
    typeof stored.expires_at === "number" && stored.expires_at * 1000 <= Date.now() + 60_000;
  if (!expired) return stored;
  return refreshSession(stored);
}

// --- Database (part_templates) ---

export type PartTemplateRow = {
  id: string;
  user_id: string;
  name: string;
  width: number;
  height: number;
  unit: "in" | "mm";
  mask_data_url: string;
  trace_points: unknown | null;
  trace_closed: boolean | null;
  trace_style: unknown | null;
  setup: unknown | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

function authHeaders(session: SupabaseSession): Record<string, string> {
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function listPartTemplates(
  session: SupabaseSession
): Promise<PartTemplateRow[] | null> {
  try {
    const { payload } = await requestJson(
      "/rest/v1/part_templates?select=*&order=created_at.desc",
      { method: "GET", headers: authHeaders(session) }
    );
    return Array.isArray(payload) ? (payload as PartTemplateRow[]) : null;
  } catch (error) {
    // An expired token can often be fixed by refreshing once and retrying.
    if (error instanceof SupabaseError && /\(40[13]\)/.test(error.message)) {
      const next = await refreshSession(session);
      if (!next) return null;
      try {
        const { payload } = await requestJson(
          "/rest/v1/part_templates?select=*&order=created_at.desc",
          { method: "GET", headers: authHeaders(next) }
        );
        return Array.isArray(payload) ? (payload as PartTemplateRow[]) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export type NewPartTemplate = {
  name: string;
  width: number;
  height: number;
  unit: "in" | "mm";
  mask_data_url: string;
  trace_points?: unknown | null;
  trace_closed?: boolean | null;
  trace_style?: unknown | null;
  setup?: unknown | null;
  source?: string | null;
};

export async function insertPartTemplate(
  session: SupabaseSession,
  row: NewPartTemplate
): Promise<PartTemplateRow | null> {
  try {
    const { payload } = await requestJson(
      "/rest/v1/part_templates?select=*",
      {
        method: "POST",
        headers: {
          ...authHeaders(session),
          Prefer: "return=representation",
        },
        body: JSON.stringify(row),
      }
    );
    const rows = Array.isArray(payload) ? (payload as PartTemplateRow[]) : null;
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function deletePartTemplate(
  session: SupabaseSession,
  id: string
): Promise<boolean> {
  try {
    await requestJson(`/rest/v1/part_templates?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(session),
    });
    return true;
  } catch {
    return false;
  }
}
