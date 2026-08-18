import { optionEntryRequirement } from "@papertrade/core";
import { assertReadOnlyGrowwPath } from "../groww/allowlist";
import { jsonHeaders } from "../security/headers";

const GROWW_BASE_URL = "https://api.groww.in/v1";

interface OptionQuote {
  symbol: string;
  optionType: "CE" | "PE";
  strike: number;
  premium: number;
  requiredCapital: number;
}

export async function routeGrowwMarket(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: jsonHeaders() });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const path = new URL(request.url).pathname.replace("/api/groww", "");
  assertReadOnlyGrowwPath(path);

  if (path === "/access-token") {
    return safe(() => createAccessToken(request));
  }

  if (path === "/market-snapshot") {
    return safe(() => marketSnapshot(request));
  }

  return json({ ok: false, error: "GROWW_ROUTE_NOT_IMPLEMENTED" }, 501);
}

async function createAccessToken(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { apiKey?: string; totp?: string };
  if (!body.apiKey || !body.totp) {
    return json({ ok: false, error: "MISSING_API_KEY_OR_TOTP" }, 422);
  }

  const payload = await growwFetch("/token/api/access", body.apiKey, {
    method: "POST",
    body: JSON.stringify({ key_type: "totp", totp: body.totp })
  });

  const token = parseToken(payload);
  if (!token) {
    return json({ ok: false, error: "ACCESS_TOKEN_NOT_FOUND", detail: payload }, 502);
  }

  return json({ ok: true, accessToken: token });
}

async function marketSnapshot(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { accessToken?: string };
  if (!body.accessToken) {
    return json({ ok: false, error: "MISSING_ACCESS_TOKEN" }, 422);
  }

  const now = new Date();
  const quote = await growwFetch(
    "/live-data/quote?exchange=NSE&segment=CASH&trading_symbol=NIFTY",
    body.accessToken
  );
  const nifty = readNumber((quote as Record<string, unknown>).last_price);
  const expiries = await growwFetch(
    `/historical/expiries?exchange=NSE&underlying_symbol=NIFTY&year=${now.getUTCFullYear()}`,
    body.accessToken
  );
  const expiry = pickExpiry(expiries, now);
  if (!expiry) {
    return json({ ok: false, error: "NO_CURRENT_NIFTY_EXPIRY", quote }, 502);
  }

  const chain = await growwFetch(
    `/option-chain/exchange/NSE/underlying/NIFTY?expiry_date=${encodeURIComponent(expiry)}`,
    body.accessToken
  );
  const options = parseOptionChain(chain);

  return json({
    ok: true,
    snapshot: {
      nifty,
      readAt: now.toISOString(),
      expiry,
      calls: selectNearSpotOptions(options, "CE", nifty),
      puts: selectNearSpotOptions(options, "PE", nifty)
    }
  });
}

async function growwFetch(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${GROWW_BASE_URL}${path}`, {
    ...init,
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "x-client-id": "papertrade-online",
      "x-client-platform": "papertrade-online-worker",
      "x-api-version": "1.0"
    }
  });

  const value = (await response.json().catch(() => ({}))) as {
    status?: string;
    payload?: unknown;
    error?: unknown;
  };
  if (!response.ok || value.status === "FAILURE") {
    throw {
      error: "GROWW_API_ERROR",
      status: response.status,
      detail: value.error ?? value
    };
  }

  return value.payload ?? value;
}

function parseToken(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  return typeof record.access_token === "string"
    ? record.access_token
    : typeof record.accessToken === "string"
      ? record.accessToken
      : typeof record.token === "string"
        ? record.token
        : null;
}

function pickExpiry(value: unknown, now: Date): string | null {
  const today = now.toISOString().slice(0, 10);
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray((value as { expiries?: unknown[] })?.expiries)
      ? (value as { expiries: unknown[] }).expiries
      : [];
  return candidates.map(String).map((item) => item.slice(0, 10)).filter((item) => item >= today).sort()[0] ?? null;
}

function parseOptionChain(value: unknown): OptionQuote[] {
  const rows: OptionQuote[] = [];
  const record = value as Record<string, unknown>;
  const strikes = record?.strikes;

  if (strikes && typeof strikes === "object" && !Array.isArray(strikes)) {
    for (const [strikeText, sides] of Object.entries(strikes as Record<string, unknown>)) {
      const strike = Number(strikeText);
      if (!Number.isFinite(strike) || !sides || typeof sides !== "object") {
        continue;
      }
      for (const optionType of ["CE", "PE"] as const) {
        const side = (sides as Record<string, unknown>)[optionType] as Record<string, unknown> | undefined;
        const premium = readNumber(side?.ltp ?? side?.last_price);
        const symbol = String(side?.trading_symbol ?? side?.tradingSymbol ?? "");
        if (symbol && premium && premium > 0) {
          rows.push({ symbol, optionType, strike, premium, requiredCapital: optionEntryRequirement(premium, 65).required });
        }
      }
    }
  }

  return rows.sort((left, right) => left.strike - right.strike);
}

function selectNearSpotOptions(options: readonly OptionQuote[], optionType: "CE" | "PE", spot: number | null): OptionQuote[] {
  const side = options.filter((option) => option.optionType === optionType);
  if (spot === null) {
    return side.slice(0, 5);
  }

  return [...side]
    .sort((left, right) => Math.abs(left.strike - spot) - Math.abs(right.strike - spot) || left.strike - right.strike)
    .slice(0, 5)
    .sort((left, right) => left.strike - right.strike);
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: jsonHeaders() });
}

async function safe(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    const value = error as { error?: string; status?: number; detail?: unknown; message?: string };
    return json(
      {
        ok: false,
        error: value.error || value.message || "READ_ONLY_FEED_FAILED",
        detail: value.detail
      },
      value.status && value.status >= 400 ? value.status : 502
    );
  }
}
