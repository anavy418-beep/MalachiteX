export function friendlyErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();

  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "The demo API is not reachable right now. You can still browse the public preview screens.";
  }
  if (/unauthorized|401|session|token/i.test(message)) {
    return "Your session could not be verified. Please sign in again or use Try Demo.";
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
