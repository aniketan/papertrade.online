import { jsonHeaders, securityHeaders } from "./security/headers";
import { routeGrowwMarket } from "./routes/groww-market";
import { routeHealth } from "./routes/health";
import { routeSuggestion } from "./routes/suggestion";

export interface Env {
  ASSETS: Fetcher;
  APP_ENV: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: jsonHeaders() });
    }

    if (url.pathname === "/api/health") {
      return routeHealth();
    }

    if (url.pathname.startsWith("/api/groww/")) {
      return routeGrowwMarket(request);
    }

    if (url.pathname === "/api/suggestion") {
      return routeSuggestion(request);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      headers: securityHeaders(assetResponse.headers)
    });
  }
};

export function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
    status: 405,
    headers: jsonHeaders()
  });
}
