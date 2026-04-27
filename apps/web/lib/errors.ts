export function friendlyErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();

  if (!message) return fallback;
  if (/cannot get\s+\/api|market endpoint not found|upstream .* failed|request failed\s*\(/i.test(message)) {
    return "Live service is temporarily unavailable. Please try again shortly.";
  }
  if (/failed to fetch|networkerror|load failed|cors origin blocked|health check timeout/i.test(message)) {
    return "Could not connect to live services right now. Please try again.";
  }
  if (/unauthorized|401|session|token/i.test(message)) {
    return "Your session has expired. Please sign in again.";
  }
  if (/forbidden|403/i.test(message)) {
    return "This action is limited to the correct trade participant or admin role.";
  }
  if (/not found|404/i.test(message)) {
    return "We could not find that item. It may have been moved or is not part of this demo account.";
  }
  if (/too many|rate limit|429/i.test(message)) {
    return "Too many demo requests at once. Please wait a moment and try again.";
  }

  return message.length > 160 ? fallback : message;
}
