import type { PaperLedger, PaperTrade } from "@papertrade/shared";

const STORAGE_KEY = "papertrade.ledger.v1";

const emptyLedger: PaperLedger = {
  walletCapital: 100000,
  trades: []
};

function normalizeTrade(trade: PaperTrade): PaperTrade {
  const fallbackEntryCost = Math.ceil(trade.entryPrice * trade.lotSize);
  return {
    ...trade,
    entryCost: Number.isFinite(trade.entryCost) ? trade.entryCost : fallbackEntryCost
  };
}

export function loadLedger(): PaperLedger {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyLedger;
  }

  try {
    const parsed = JSON.parse(raw) as PaperLedger;
    return {
      walletCapital: Number.isFinite(parsed.walletCapital) ? parsed.walletCapital : emptyLedger.walletCapital,
      trades: Array.isArray(parsed.trades) ? parsed.trades.map(normalizeTrade) : []
    };
  } catch {
    return emptyLedger;
  }
}

export function saveLedger(value: PaperLedger): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function addPaperTrade(trade: PaperTrade): PaperLedger {
  const ledger = loadLedger();
  const nextLedger: PaperLedger = {
    walletCapital: ledger.walletCapital,
    trades: [trade, ...ledger.trades]
  };
  saveLedger(nextLedger);
  return nextLedger;
}

export function closePaperTrade(tradeId: string, exitPrice: number): PaperLedger {
  const ledger = loadLedger();
  const exitTime = new Date().toISOString();
  const nextLedger: PaperLedger = {
    walletCapital: ledger.walletCapital,
    trades: ledger.trades.map((trade) =>
      trade.id === tradeId && trade.status === "OPEN"
        ? {
            ...trade,
            exitPrice,
            exitTime,
            status: "CLOSED"
          }
        : trade
    )
  };
  saveLedger(nextLedger);
  return nextLedger;
}

export function resetLedger(): PaperLedger {
  saveLedger(emptyLedger);
  return emptyLedger;
}
