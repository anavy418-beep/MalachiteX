import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_MARKETS_UPSTREAM_API_BASE_URL = "http://localhost:4000/api";
const SUPPORTED_MARKETS_ENDPOINTS = new Set([
  "overview",
  "pairs",
  "candles",
  "order-book",
  "recent-trades",
]);

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveMarketsUpstreamApiBaseUrl() {
  const explicitProxyBase =
    process.env.MARKETS_UPSTREAM_API_BASE_URL ??
    process.env.INTERNAL_API_BASE_URL ??
    "";

  if (explicitProxyBase.trim().length > 0) {
    return trimTrailingSlash(explicitProxyBase.trim());
  }

  const publicApiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
  if (publicApiBase.startsWith("http://") || publicApiBase.startsWith("https://")) {
    return trimTrailingSlash(publicApiBase);
  }

  return DEFAULT_MARKETS_UPSTREAM_API_BASE_URL;
}

function buildUpstreamUrl(request: NextRequest, path: string[]) {
  const upstreamBase = resolveMarketsUpstreamApiBaseUrl();
  const endpointPath = path.length > 0 ? path.join("/") : "overview";
  const upstreamUrl = new URL(`${upstreamBase}/markets/${endpointPath}`);
  upstreamUrl.search = request.nextUrl.search;
  return upstreamUrl;
}

function buildErrorResponse(status: number, message: string, details: string) {
  return NextResponse.json(
    {
      message,
      details,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

function parseSymbolsQuery(rawSymbols: string | null) {
  if (!rawSymbols) return [];

  return rawSymbols
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter((symbol) => symbol.length >= 6 && symbol.length <= 20);
}

export async function GET(
  request: NextRequest,
  context: { params: { path?: string[] } },
) {
  const routePath = context.params.path ?? [];
  const endpoint = routePath[0] ?? "overview";

  if (!SUPPORTED_MARKETS_ENDPOINTS.has(endpoint)) {
    return buildErrorResponse(404, "Market endpoint not found.", `Unsupported path: /api/markets/${routePath.join("/")}`);
  }

  if (endpoint === "overview") {
    const rawSymbols = request.nextUrl.searchParams.get("symbols");
    if (rawSymbols !== null && parseSymbolsQuery(rawSymbols).length === 0) {
      return buildErrorResponse(
        400,
        "Invalid symbols query parameter.",
        "Provide a comma-separated list such as symbols=BTCUSDT,ETHUSDT.",
      );
    }
  }

  const upstreamUrl = buildUpstreamUrl(request, routePath);
  const incomingPathWithQuery = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const outgoingPathWithQuery = `${upstreamUrl.pathname}${upstreamUrl.search}`;

  if (
    request.nextUrl.origin === upstreamUrl.origin &&
    incomingPathWithQuery === outgoingPathWithQuery
  ) {
    return buildErrorResponse(
      500,
      "Market proxy misconfiguration.",
      "Proxy target resolves back to the same Next.js route. Set NEXT_PUBLIC_API_BASE_URL to an absolute backend API URL or set MARKETS_UPSTREAM_API_BASE_URL.",
    );
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const payloadText = await upstreamResponse.text();
    const parsedPayload = payloadText.length > 0 ? JSON.parse(payloadText) : null;

    if (!upstreamResponse.ok) {
      const details =
        parsedPayload && typeof parsedPayload === "object" && "message" in parsedPayload
          ? String((parsedPayload as { message?: unknown }).message ?? "Unknown upstream error.")
          : `Upstream request failed with status ${upstreamResponse.status}.`;

      return buildErrorResponse(upstreamResponse.status, "Failed to load market overview.", details);
    }

    return NextResponse.json(parsedPayload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown proxy error.";
    return buildErrorResponse(
      502,
      "Failed to reach market data upstream.",
      `${details} (target: ${upstreamUrl.toString()})`,
    );
  }
}
