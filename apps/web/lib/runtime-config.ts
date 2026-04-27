function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const DEFAULT_PRODUCTION_API_BASE_URL = "https://api-production-60fa.up.railway.app/api";
const DEFAULT_PRODUCTION_API_SOCKET_URL = "https://api-production-60fa.up.railway.app";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function isAbsoluteHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function normalizeApiPathname(rawPathname: string) {
  const segments = rawPathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const normalizedSegments: string[] = [];
  for (const segment of segments) {
    const canonicalSegment = segment.toLowerCase() === "api" ? "api" : segment;
    const previousSegment = normalizedSegments[normalizedSegments.length - 1];
    if (canonicalSegment === "api" && previousSegment?.toLowerCase() === "api") {
      continue;
    }
    normalizedSegments.push(canonicalSegment);
  }

  const hasApiSegment = normalizedSegments.some((segment) => segment.toLowerCase() === "api");
  if (!hasApiSegment) {
    normalizedSegments.push("api");
  }

  if (normalizedSegments.length === 0) {
    return "/api";
  }

  return `/${normalizedSegments.join("/")}`;
}

function pointsToLocalhost(value: string) {
  if (!isAbsoluteHttpUrl(value)) return false;

  try {
    return LOCAL_HOSTNAMES.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function normalizeApiBaseUrl(rawValue: string) {
  const value = trimTrailingSlash(rawValue.trim());
  if (!value) return "";

  if (!isAbsoluteHttpUrl(value)) {
    if (value.startsWith("/")) {
      return trimTrailingSlash(normalizeApiPathname(value));
    }
    return value;
  }

  try {
    const parsed = new URL(value);
    parsed.pathname = normalizeApiPathname(parsed.pathname);

    return trimTrailingSlash(parsed.toString());
  } catch {
    return value;
  }
}

function resolveApiBaseUrl() {
  const candidateFromEnv =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "";
  const trimmedCandidate = candidateFromEnv.trim();
  const shouldUseProductionDefault =
    process.env.NODE_ENV === "production" &&
    (
      trimmedCandidate.length === 0 ||
      pointsToLocalhost(trimmedCandidate) ||
      !isAbsoluteHttpUrl(trimmedCandidate)
    );

  const candidate =
    shouldUseProductionDefault
      ? DEFAULT_PRODUCTION_API_BASE_URL
      : trimmedCandidate.length > 0
        ? candidateFromEnv
        : "";

  return normalizeApiBaseUrl(candidate);
}

function resolveApiSocketUrl(apiBaseUrl: string) {
  const explicitSocketUrl = (process.env.NEXT_PUBLIC_API_SOCKET_URL ?? "").trim();
  if (
    explicitSocketUrl.length > 0 &&
    !(process.env.NODE_ENV === "production" && pointsToLocalhost(explicitSocketUrl))
  ) {
    return trimTrailingSlash(explicitSocketUrl);
  }

  if (process.env.NODE_ENV === "production") {
    return DEFAULT_PRODUCTION_API_SOCKET_URL;
  }

  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    try {
      return new URL(apiBaseUrl).origin;
    } catch {
      return "";
    }
  }

  return "";
}

export const resolvedPublicApiBaseUrl = resolveApiBaseUrl();
export const resolvedPublicApiSocketUrl = resolveApiSocketUrl(resolvedPublicApiBaseUrl);
