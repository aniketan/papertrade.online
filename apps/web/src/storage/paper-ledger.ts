import type { PaperLedger } from "@papertrade/shared";

const STORAGE_KEY = "papertrade.ledger.v1";

const emptyLedger: PaperLedger = {
  walletCapital: 100000,
  trades: []
};

export function loadLedger(): PaperLedger {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyLedger;
  }

  try {
    const parsed = JSON.parse(raw) as PaperLedger;
    return {
      walletCapital: Number.isFinite(parsed.walletCapital) ? parsed.walletCapital : emptyLedger.walletCapital,
      trades: Array.isArray(parsed.trades) ? parsed.trades : []
    };
  } catch {
    return emptyLedger;
  }
}

export function saveLedger(value: PaperLedger): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
