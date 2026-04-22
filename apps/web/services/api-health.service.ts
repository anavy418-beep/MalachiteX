import { resolvedPublicApiBaseUrl, resolvedPublicApiSocketUrl } from "@/lib/runtime-config";

const HEALTH_RETRY_DELAY_MS = 900;
const HEALTH_TIMEOUT_MS = 8000;
const DEFAULT_ATTEMPTS = 5;

const shouldDebugLog =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_DEBUG_API_HEALTH === "true";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(input: Promise<Response>, timeoutMs: number) {
  return Promise.race([
    input,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Health check timeout")), timeoutMs);
    }),
  ]);
}

function resolveHealthUrl() {
  const baseCandidate = resolvedPublicApiBaseUrl || resolvedPublicApiSocketUrl;
  try {
    const baseUrl = new URL(baseCandidate);
    const normalizedPath = baseUrl.pathname.replace(/\/+$/, "");
    if (normalizedPath === "/api" || normalizedPath.endsWith("/api")) {
      return `${baseUrl.origin}${normalizedPath}/health`;
    }
    return `${baseUrl.origin}/api/health`;
  } catch {
    if (process.env.NODE_ENV === "production") {
      return "https://api-production-60fa.up.railway.app/api/health";
    }

    return "http://localhost:4000/api/health";
  }
}

function debugLog(message: string, payload?: Record<string, unknown>) {
  if (!shouldDebugLog) return;
  if (payload) {
    console.info(`[api-health] ${message}`, payload);
    return;
  }
  console.info(`[api-health] ${message}`);
}

export type ApiHealthResult = {
  reachable: boolean;
  status?: number;
  url?: string;
  reason?: string;
  attempts?: number;
};

export const apiHealthService = {
  async checkReachability(maxAttempts = DEFAULT_ATTEMPTS): Promise<ApiHealthResult> {
    const healthUrl = resolveHealthUrl();
    let lastReason = "unreachable";

    debugLog("starting reachability check", {
      resolvedApiBaseUrl: resolvedPublicApiBaseUrl,
      healthUrl,
      maxAttempts,
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await withTimeout(
          fetch(healthUrl, {
            method: "GET",
            cache: "no-store",
            credentials: "omit",
            headers: { Accept: "application/json" },
          }),
          HEALTH_TIMEOUT_MS,
        );

        debugLog("health response received", {
          attempt,
          status: response.status,
          url: healthUrl,
        });

        if (response.status === 401 || response.status === 403 || response.status === 429) {
          return {
            reachable: true,
            status: response.status,
            url: healthUrl,
            attempts: attempt,
          };
        }

        let parsedJson: unknown = null;
        try {
          parsedJson = await response.clone().json();
        } catch {
          parsedJson = null;
        }

        if (response.ok || (parsedJson !== null && typeof parsedJson === "object")) {
          return {
            reachable: true,
            status: response.status,
            url: healthUrl,
            attempts: attempt,
          };
        }

        lastReason = `status-${response.status}`;
      } catch (error) {
        lastReason = error instanceof Error ? error.message : "network-error";
        debugLog("health request failed", {
          attempt,
          url: healthUrl,
          reason: lastReason,
        });
      }

      if (attempt < maxAttempts) {
        await sleep(Math.min(HEALTH_RETRY_DELAY_MS * attempt, 4_000));
      }
    }

    debugLog("reachability failed after retries", {
      healthUrl,
      reason: lastReason,
      attempts: maxAttempts,
    });

    return {
      reachable: false,
      url: healthUrl,
      reason: lastReason,
      attempts: maxAttempts,
    };
  },
};
