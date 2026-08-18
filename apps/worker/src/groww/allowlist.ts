const READ_ONLY_PATHS = new Set([
  "/access-token",
  "/market-snapshot",
  "/quote",
  "/ltp",
  "/option-chain",
  "/expiries",
  "/historical-candles",
  "/margin"
]);

export function assertReadOnlyGrowwPath(path: string): void {
  if (!READ_ONLY_PATHS.has(path)) {
    throw new Response(JSON.stringify({ ok: false, error: "GROWW_ROUTE_NOT_ALLOWED" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
}
