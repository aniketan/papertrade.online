export interface LocalCredentialState {
  hasCredentials: boolean;
  apiKeyHint?: string;
}

export interface PaperTrade {
  id: string;
  symbol: string;
  optionType: "CE" | "PE";
  strike: number;
  lotSize: number;
  entryPrice: number;
  entryTime: string;
  exitPrice?: number;
  exitTime?: string;
  status: "OPEN" | "CLOSED";
  fees?: number;
}

export interface PaperLedger {
  walletCapital: number;
  trades: PaperTrade[];
}
