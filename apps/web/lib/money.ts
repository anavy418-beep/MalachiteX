export function formatMinorUnits(minorUnits: string | number | bigint, currency = "USD"): string {
  const normalized = typeof minorUnits === "bigint" ? minorUnits : BigInt(String(minorUnits || 0));
  const negative = normalized < 0n;
  const absolute = negative ? normalized * -1n : normalized;
  const major = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const sign = negative ? "-" : "";

  return `${currency} ${sign}${major.toLocaleString("en-US")}.${fraction}`;
}

export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
