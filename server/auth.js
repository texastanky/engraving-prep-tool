import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SESSION_COOKIE = "pgs_session";
const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 210000;
const PASSWORD_MIN_LENGTH = 8;
const USER_FILE = path.resolve(process.env.AUTH_USER_FILE || ".data/auth-users.json");

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || "local-dev-only-change-before-deploy";
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signPayload(payload) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        if (separator === -1) return [cookie, ""];
        return [
          decodeURIComponent(cookie.slice(0, separator)),
          decodeURIComponent(cookie.slice(separator + 1)),
        ];
      }),
  );
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  const secureCookie =
    process.env.AUTH_COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_SECURE !== "false");
  if (secureCookie) parts.push("Secure");

  return parts.join("; ");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

function staticAdminUser() {
  const email = normalizeEmail(process.env.AUTH_ADMIN_EMAIL);
  const password = process.env.AUTH_ADMIN_PASSWORD || "";
  if (!email || !password) return null;

  return {
    id: "env-admin",
    email,
    name: String(process.env.AUTH_ADMIN_NAME || "Admin").trim() || "Admin",
    password,
    createdAt: "env",
    updatedAt: "env",
  };
}

async function readUsers() {
  try {
    const raw = await fs.readFile(USER_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users) {
  await fs.mkdir(path.dirname(USER_FILE), { recursive: true });
  await fs.writeFile(
    USER_FILE,
    JSON.stringify({ users }, null, 2),
    { mode: 0o600 },
  );
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("base64url")) {
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256")
    .toString("base64url");

  return {
    algorithm: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS,
    salt,
    hash,
  };
}

function verifyPassword(password, stored) {
  if (!stored || stored.algorithm !== "pbkdf2-sha256") return false;
  const next = hashPassword(password, stored.salt);
  return timingSafeEqual(next.hash, stored.hash);
}

export function createSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      iat: now,
      exp: now + SESSION_DAYS * 24 * 60 * 60,
    }),
  );
  return `${payload}.${signPayload(payload)}`;
}

export function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !timingSafeEqual(signPayload(payload), signature)) return null;

  try {
    const session = JSON.parse(fromBase64Url(payload));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      id: String(session.sub || ""),
      email: String(session.email || ""),
      name: String(session.name || ""),
    };
  } catch {
    return null;
  }
}

export function getSessionUser(req) {
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySession(cookies[SESSION_COOKIE]);
}

export function setSessionCookie(res, user) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, createSession(user), {
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    }),
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, "", {
      maxAge: 0,
    }),
  );
}

export async function registerAccount({ email, name, password, signupCode }) {
  if (process.env.AUTH_DISABLE_REGISTRATION === "true") {
    return { ok: false, status: 403, error: "registration_disabled" };
  }

  const normalizedEmail = normalizeEmail(email);
  const displayName = String(name || "").trim().slice(0, 80);
  const requiredSignupCode = process.env.AUTH_SIGNUP_CODE?.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: false, status: 400, error: "invalid_email" };
  }

  if (String(password || "").length < PASSWORD_MIN_LENGTH) {
    return { ok: false, status: 400, error: "weak_password" };
  }

  if (requiredSignupCode && signupCode !== requiredSignupCode) {
    return { ok: false, status: 403, error: "bad_signup_code" };
  }

  const users = await readUsers();
  if (users.some((user) => user.email === normalizedEmail)) {
    return { ok: false, status: 409, error: "account_exists" };
  }

  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    name: displayName || normalizedEmail.split("@")[0],
    password: hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };

  users.push(user);
  await writeUsers(users);

  return { ok: true, user: publicUser(user) };
}

export async function loginAccount({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const adminUser = staticAdminUser();
  if (
    adminUser &&
    normalizedEmail === adminUser.email &&
    timingSafeEqual(String(password || ""), adminUser.password)
  ) {
    return { ok: true, user: publicUser(adminUser) };
  }

  const users = await readUsers();
  const user = users.find((candidate) => candidate.email === normalizedEmail);

  if (!user || !verifyPassword(String(password || ""), user.password)) {
    return { ok: false, status: 401, error: "bad_credentials" };
  }

  return { ok: true, user: publicUser(user) };
}

export function requireAuth(req, res) {
  const user = getSessionUser(req);
  if (user) return user;

  res.status(401).json({ error: "unauthorized" });
  return null;
}
