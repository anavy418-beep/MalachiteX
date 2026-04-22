import { resolvedPublicApiBaseUrl } from "@/lib/runtime-config";

const HEALTH_RETRY_DELAY_MS = 350;
const HEALTH_TIMEOUT_MS = 3500;

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

function buildHealthCandidates() {
  const fallbackBase = "http://localhost:4000/api";
  const apiBase = resolvedPublicApiBaseUrl || fallbackBase;
  const candidates = new Set<string>();

  try {
    const baseUrl = new URL(apiBase);
    const normalizedPath = baseUrl.pathname.replace(/\/+$/, "");
    const isApiPath = normalizedPath === "/api" || normalizedPath.endsWith("/api");

    if (isApiPath) {
      candidates.add(`${baseUrl.origin}${normalizedPath}/health`);
    } else {
      candidates.add(`${baseUrl.origin}${normalizedPath}/health`);
      candidates.add(`${baseUrl.origin}/api/health`);
    }
    candidates.add(`${baseUrl.origin}/health`);
  } catch {
    candidates.add(`${fallbackBase}/health`);
    candidates.add("http://localhost:4000/health");
  }

  return [...candidates];
}

export type ApiHealthResult = {
  reachable: boolean;
  status?: number;
  url?: string;
  reason?: string;
};

export const apiHealthService = {
  async checkReachability(maxAttempts = 2): Promise<ApiHealthResult> {
    const healthUrls = buildHealthCandidates();
    let lastReason = "unreachable";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      for (const url of healthUrls) {
        try {
          const response = await withTimeout(
            fetch(url, {
              method: "GET",
              cache: "no-store",
              credentials: "include",
              headers: { Accept: "application/json" },
            }),
            HEALTH_TIMEOUT_MS,
          );

          // 401/403/429 still prove the API host is reachable.
          if (response.ok || response.status === 401 || response.status === 403 || response.status === 429) {
            return {
              reachable: true,
              status: response.status,
              url,
            };
          }

          lastReason = `status-${response.status}`;
        } catch (error) {
          lastReason = error instanceof Error ? error.message : "network-error";
        }
      }

      if (attempt < maxAttempts) {
        await sleep(HEALTH_RETRY_DELAY_MS * attempt);
      }
    }

    return {
      reachable: false,
      reason: lastReason,
    };
  },
};
