export type CanonicalTradeStatus =
  | "PAYMENT_PENDING"
  | "PAYMENT_SENT"
  | "RELEASE_PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

export function normalizeTradeStatus(status: string): CanonicalTradeStatus {
  const normalized = status.toUpperCase();

  if (normalized === "OPEN" || normalized === "PAYMENT_PENDING" || normalized === "PENDING_PAYMENT") {
    return "PAYMENT_PENDING";
  }
  if (normalized === "PAYMENT_SENT" || normalized === "PAID") {
    return "PAYMENT_SENT";
  }
  if (normalized === "RELEASE_PENDING") {
    return "RELEASE_PENDING";
  }
  if (normalized === "COMPLETED" || normalized === "RELEASED") {
    return "COMPLETED";
  }
  if (normalized === "CANCELLED" || normalized === "CANCELED") {
    return "CANCELLED";
  }
  if (normalized === "DISPUTED") {
    return "DISPUTED";
  }

  return "PAYMENT_PENDING";
}

export function tradeStatusLabel(status: string) {
  const normalized = normalizeTradeStatus(status);

  if (normalized === "PAYMENT_PENDING") return "Payment Pending";
  if (normalized === "PAYMENT_SENT") return "Payment Sent";
  if (normalized === "RELEASE_PENDING") return "Release Pending";
  if (normalized === "COMPLETED") return "Completed";
  if (normalized === "CANCELLED") return "Cancelled";
  if (normalized === "DISPUTED") return "Disputed";

  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function offerStatusLabel(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE") return "Active";
  if (normalized === "PAUSED") return "Paused";
  if (normalized === "ARCHIVED" || normalized === "CLOSED") return "Archived";
  return tradeStatusLabel(status);
}
