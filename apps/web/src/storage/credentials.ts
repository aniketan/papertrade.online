import type { LocalCredentialState } from "@papertrade/shared";

const STORAGE_KEY = "papertrade.credentials.v1";

export interface StoredCredentials {
  apiKey: string;
  totpSecret: string;
}

export function loadCredentials(): LocalCredentialState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { hasCredentials: false };
  }

  try {
    const parsed = JSON.parse(raw) as { apiKey?: string; totpSecret?: string };
    const apiKey = parsed.apiKey?.trim() ?? "";
    if (!apiKey || !parsed.totpSecret) {
      return { hasCredentials: false };
    }
    return {
      hasCredentials: true,
      apiKeyHint: `${apiKey.slice(0, 4)}...${apiKey.slice(-3)}`
    };
  } catch {
    return { hasCredentials: false };
  }
}

export function saveCredentials(value: { apiKey: string; totpSecret: string }): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function readCredentials(): StoredCredentials | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredCredentials;
    if (!parsed.apiKey?.trim() || !parsed.totpSecret?.trim()) {
      return null;
    }
    return {
      apiKey: parsed.apiKey.trim(),
      totpSecret: parsed.totpSecret.trim()
    };
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
}
