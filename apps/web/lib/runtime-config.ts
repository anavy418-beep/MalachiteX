function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeApiBaseUrl(rawValue: string) {
  const value = trimTrailingSlash(rawValue.trim());
  if (!value) return "";

  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/api";
    }

    return trimTrailingSlash(parsed.toString());
  } catch {
    return value;
  }
}

function resolveApiBaseUrl() {
  const candidate =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "";

  return normalizeApiBaseUrl(candidate);
}

function resolveApiSocketUrl(apiBaseUrl: string) {
  const explicitSocketUrl = (process.env.NEXT_PUBLIC_API_SOCKET_URL ?? "").trim();
  if (explicitSocketUrl.length > 0) {
    return trimTrailingSlash(explicitSocketUrl);
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
