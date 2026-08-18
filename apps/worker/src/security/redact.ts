const SECRET_KEYS = new Set(["apiKey", "totpSecret", "totp", "accessToken", "authorization"]);

export function redactSecrets(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SECRET_KEYS.has(key) ? "[REDACTED]" : redactSecrets(nested)
    ])
  );
}
