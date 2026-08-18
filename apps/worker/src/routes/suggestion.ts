import { evaluateSuggestion } from "@papertrade/core";
import { jsonHeaders } from "../security/headers";

export async function routeSuggestion(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: jsonHeaders()
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    candles?: unknown[];
    livePrice?: number;
  };

  return new Response(
    JSON.stringify({
      ok: true,
      value: evaluateSuggestion({
        candles: body.candles ?? [],
        livePrice: Number(body.livePrice ?? 0),
        at: new Date()
      })
    }),
    { headers: jsonHeaders() }
  );
}
