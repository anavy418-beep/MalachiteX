function requireValue(config: Record<string, string | undefined>, key: string) {
  const value = config[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function validateNumber(config: Record<string, string | undefined>, key: string, fallback: string) {
  const value = config[key]?.trim() || fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive number`);
  }
  config[key] = String(parsed);
}

function validateBooleanLike(config: Record<string, string | undefined>, key: string) {
  const value = config[key]?.trim().toLowerCase();
  if (!value) return;
  if (!["true", "false"].includes(value)) {
    throw new Error(`Environment variable ${key} must be "true" or "false"`);
  }
  config[key] = value;
}

export function validateEnv(
  rawConfig: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const config = { ...rawConfig };
  const accessSecret = config.JWT_ACCESS_SECRET ?? config.JWT_SECRET;
  const refreshSecret = config.JWT_REFRESH_SECRET ?? config.JWT_SECRET;

  requireValue(config, "DATABASE_URL");
  requireValue(config, "REDIS_URL");
  if (!accessSecret) throw new Error("JWT_ACCESS_SECRET or JWT_SECRET must be configured");
  if (!refreshSecret) throw new Error("JWT_REFRESH_SECRET or JWT_SECRET must be configured");

  if ((config.NODE_ENV ?? "development") === "production") {
    if (accessSecret.length < 32) {
      throw new Error("JWT access secret must be at least 32 characters in production");
    }

    if (refreshSecret.length < 32) {
      throw new Error("JWT refresh secret must be at least 32 characters in production");
    }

    if (!(config.CORS_ORIGIN ?? config.FRONTEND_URL)) {
      throw new Error("CORS_ORIGIN or FRONTEND_URL must be configured in production");
    }
  }

  validateNumber(config, "API_PORT", "4000");
  validateNumber(config, "BCRYPT_ROUNDS", "12");
  validateNumber(config, "PASSWORD_RESET_EXPIRES_MINUTES", "15");
  validateBooleanLike(config, "SWAGGER_ENABLED");
  validateBooleanLike(config, "COOKIE_SECURE");

  const cookieSameSite = config.COOKIE_SAME_SITE?.trim().toLowerCase();
  if (cookieSameSite && !["lax", "strict", "none"].includes(cookieSameSite)) {
    throw new Error('COOKIE_SAME_SITE must be one of "lax", "strict", or "none"');
  }

  return config;
}
