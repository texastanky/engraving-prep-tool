import {
  clearSessionCookie,
  getSessionUser,
  loginAccount,
  registerAccount,
  setSessionCookie,
} from "../server/auth.js";

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

export default async function handler(req, res) {
  noStore(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    const user = getSessionUser(req);
    res.status(200).json({ authenticated: Boolean(user), user });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = readBody(req);
  const action = body.action;

  try {
    if (action === "register") {
      const result = await registerAccount(body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      setSessionCookie(res, result.user);
      res.status(200).json({ authenticated: true, user: result.user });
      return;
    }

    if (action === "login") {
      const result = await loginAccount(body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      setSessionCookie(res, result.user);
      res.status(200).json({ authenticated: true, user: result.user });
      return;
    }

    if (action === "logout") {
      clearSessionCookie(res);
      res.status(200).json({ authenticated: false, user: null });
      return;
    }

    res.status(400).json({ error: "bad_action" });
  } catch {
    res.status(500).json({ error: "auth_unavailable" });
  }
}
