export type UpdateManifest = {
  latestVersion?: unknown;
  version?: unknown;
  installerUrl?: unknown;
  downloadUrl?: unknown;
  releaseNotes?: unknown;
  releaseDate?: unknown;
};

export type AvailableUpdate = {
  currentVersion: string;
  latestVersion: string;
  installerUrl: string;
  releaseDate?: string;
  releaseNotes?: string;
};

const fallbackVersion = "0.0.0";
const fallbackManifestUrl = "";

export const APP_VERSION =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim()
    ? __APP_VERSION__.trim()
    : fallbackVersion;

export const APP_UPDATE_MANIFEST_URL =
  typeof __APP_UPDATE_MANIFEST_URL__ === "string" && __APP_UPDATE_MANIFEST_URL__.trim()
    ? __APP_UPDATE_MANIFEST_URL__.trim()
    : fallbackManifestUrl;

function versionParts(version: string) {
  const normalized = version.trim().replace(/^v/i, "");
  return normalized
    .split(/[.+-]/)
    .slice(0, 4)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left: string, right: string) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length, 3);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUrl(value: string, baseUrl: string, allowDataUrl = false) {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    if (allowDataUrl && url.protocol === "data:") return url.href;
  } catch {
    return null;
  }

  return null;
}

export function isStandaloneUpdateSurface(location: Location, userAgent: string) {
  const params = new URLSearchParams(location.search);
  return params.get("desktop") === "1" || /\bElectron\//.test(userAgent);
}

export function resolveUpdateManifestUrl(
  location: Location,
  defaultUrl = APP_UPDATE_MANIFEST_URL,
  allowDevOverride = Boolean(import.meta.env.DEV),
) {
  const params = new URLSearchParams(location.search);
  const requestedUrl = allowDevOverride ? params.get("updateManifestUrl") : null;
  const candidate = requestedUrl?.trim() || defaultUrl.trim();

  if (!candidate) return null;
  return normalizeUrl(candidate, location.href, allowDevOverride);
}

export function getAvailableUpdate(
  manifest: UpdateManifest,
  currentVersion = APP_VERSION,
  baseUrl = globalThis.location?.href ?? "https://engraving-prep-tool.vercel.app/",
): AvailableUpdate | null {
  const latestVersion = stringValue(manifest.latestVersion) ?? stringValue(manifest.version);
  if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) return null;

  const installerCandidate = stringValue(manifest.installerUrl) ?? stringValue(manifest.downloadUrl);
  if (!installerCandidate) return null;

  const installerUrl = normalizeUrl(installerCandidate, baseUrl);
  if (!installerUrl) return null;

  return {
    currentVersion,
    installerUrl,
    latestVersion,
    releaseDate: stringValue(manifest.releaseDate) ?? undefined,
    releaseNotes: stringValue(manifest.releaseNotes) ?? undefined,
  };
}

export async function fetchUpdateManifest(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Update manifest request failed with ${response.status}`);
  }

  return (await response.json()) as UpdateManifest;
}
