export interface SuggestionInput {
  candles: unknown[];
  livePrice: number;
  at: Date;
}

export interface Suggestion {
  status: "WAIT" | "CALL_WATCH" | "PUT_WATCH";
  state: string;
  setup: string;
  reason: string;
  livePrice: number;
  at: string;
}

export function evaluateSuggestion(input: SuggestionInput): Suggestion {
  return {
    status: "WAIT",
    state: input.candles.length > 0 ? "NO_CONFIRMED_SWEEP" : "DATA_UNAVAILABLE",
    setup: "No trade suggestion",
    reason: "Suggestion engine scaffold is ready for the Python logic port.",
    livePrice: Number.isFinite(input.livePrice) ? Math.round(input.livePrice * 100) / 100 : 0,
    at: input.at.toISOString()
  };
}
