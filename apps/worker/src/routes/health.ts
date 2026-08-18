import { jsonHeaders } from "../security/headers";

export function routeHealth(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "papertrade-online-worker",
      orderApisEnabled: false
    }),
    { headers: jsonHeaders() }
  );
}
