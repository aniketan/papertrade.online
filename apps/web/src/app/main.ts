import { optionRoundTripCharges } from "@papertrade/core";
import type { LocalCredentialState, PaperTrade } from "@papertrade/shared";
import { generateTotp } from "../groww/totp";
import { clearCredentials, loadCredentials, readCredentials, saveCredentials } from "../storage/credentials";
import { addPaperTrade, closePaperTrade, loadLedger, resetLedger } from "../storage/paper-ledger";
import "../styles/app.css";

interface OptionQuote {
  symbol: string;
  optionType: "CE" | "PE";
  strike: number;
  premium: number;
  requiredCapital: number;
}

interface MarketSnapshot {
  nifty: number | null;
  readAt: string;
  expiry: string;
  calls: OptionQuote[];
  puts: OptionQuote[];
}

let credentialState: LocalCredentialState = loadCredentials();
let marketSnapshot: MarketSnapshot | null = null;
let feedState: "idle" | "loading" | "ready" | "error" = "idle";
let feedMessage = "Feed not connected.";
let accessToken: string | null = null;
let autoRefreshEnabled = false;
let autoRefreshTimer: number | undefined;
let refreshInFlight = false;
let ledger = loadLedger();

const app = document.querySelector<HTMLDivElement>("#app")!;
const AUTO_REFRESH_MS = 5000;
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8787")
  .trim()
  .replace(/\/+$/, "");

function money(value: number): string {
  return `Rs ${value.toFixed(2)}`;
}

function footerLinks(): string {
  return `
    <nav class="bottom-links" aria-label="Page links">
      <a href="/">Desk</a>
      <a href="/groww-setup">Groww setup</a>
      <a href="/terms">Terms</a>
      <a href="https://github.com/aniketan/papertrade.online" target="_blank" rel="noreferrer">GitHub</a>
    </nav>
  `;
}

function renderOptionRows(options: readonly OptionQuote[]): string {
  if (options.length === 0) {
    return `
      <div class="feed-empty">
        <b>${feedState === "loading" ? "Connecting feed" : "No feed connected"}</b>
        <span>${feedState === "error" ? feedMessage : "Option rows appear only after Groww returns live read-only option-chain data."}</span>
      </div>
    `;
  }

  return options
    .map(
      (option) => `
        <div class="option-row">
          <b>${option.strike} ${option.optionType}</b>
          <span>${money(option.premium)}<small>premium</small></span>
          <span>${money(option.requiredCapital)}<small>approx required</small></span>
          <button class="paper-entry" type="button" data-symbol="${option.symbol}" data-option-type="${option.optionType}" data-strike="${option.strike}" data-premium="${option.premium}" data-required="${option.requiredCapital}">Paper entry</button>
        </div>
      `
    )
    .join("");
}

function openTrades() {
  return ledger.trades.filter((trade) => trade.status === "OPEN");
}

function lockedCapital(): number {
  return openTrades().reduce((sum, trade) => sum + trade.entryCost, 0);
}

function availableCapital(): number {
  return Math.max(ledger.walletCapital - lockedCapital(), 0);
}

function latestPremiumFor(trade: PaperTrade): number | null {
  const options = [...(marketSnapshot?.calls ?? []), ...(marketSnapshot?.puts ?? [])];
  return options.find((option) => option.optionType === trade.optionType && option.strike === trade.strike)?.premium ?? null;
}

function markPrice(trade: PaperTrade): number | null {
  return trade.status === "OPEN" ? latestPremiumFor(trade) : trade.exitPrice ?? null;
}

function grossPnl(trade: PaperTrade): number {
  const exitPrice = markPrice(trade);
  if (exitPrice === null) {
    return 0;
  }
  return (exitPrice - trade.entryPrice) * trade.lotSize;
}

function estimatedFees(trade: PaperTrade): number {
  const exitPrice = markPrice(trade);
  if (exitPrice === null) {
    return 0;
  }
  return optionRoundTripCharges(trade.entryPrice, exitPrice, trade.lotSize).total;
}

function totalGrossPnl(): number {
  return ledger.trades.reduce((sum, trade) => sum + grossPnl(trade), 0);
}

function totalFees(): number {
  return ledger.trades.reduce((sum, trade) => sum + estimatedFees(trade), 0);
}

function netPnl(trade: PaperTrade): number {
  return grossPnl(trade) - estimatedFees(trade);
}

function totalNetPnl(): number {
  return totalGrossPnl() - totalFees();
}

function pnlClass(value: number): string {
  return value >= 0 ? "good" : "bad";
}

function renderTradeRows(): string {
  if (ledger.trades.length === 0) {
    return '<tr><td colspan="8">No paper trades yet.</td></tr>';
  }

  return ledger.trades
    .map(
      (trade) => {
        const exitPrice = markPrice(trade);
        const net = netPnl(trade);
        const actionCell =
          trade.status === "OPEN"
            ? `<button class="paper-exit" type="button" data-trade-id="${trade.id}" data-exit-price="${exitPrice ?? ""}" ${exitPrice === null ? "disabled" : ""}>Exit</button>`
            : `<span class="exit-time">${trade.exitTime ? new Date(trade.exitTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) : "--"}</span>`;
        return `
        <tr>
          <td>${new Date(trade.entryTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
          <td>${trade.strike} ${trade.optionType}</td>
          <td>Paper</td>
          <td>${trade.status}</td>
          <td>${money(trade.entryPrice)}</td>
          <td>${exitPrice === null ? "No quote" : money(exitPrice)}</td>
          <td class="${pnlClass(net)}">${exitPrice === null ? "No quote" : money(net)}</td>
          <td class="action-cell">${actionCell}</td>
        </tr>
      `;
      }
    )
    .join("");
}

function feedStatusText(): string {
  if (feedState === "loading") return "Connecting read-only feed.";
  if (feedState === "ready") return `Snapshot mode live for expiry ${marketSnapshot?.expiry ?? "--"}.`;
  if (feedState === "error") return feedMessage;
  return "Feed not connected.";
}

function canAutoRefresh(): boolean {
  return credentialState.hasCredentials && feedState === "ready" && marketSnapshot !== null;
}

function renderDesk(): void {
  app.innerHTML = `
    <main>
      <section class="cards cards-compact" aria-label="Market and paper summary">
        <article class="nifty-card">
          <span>NIFTY</span>
          <b>${marketSnapshot?.nifty == null ? "--" : marketSnapshot.nifty.toFixed(2)}</b>
          <small>${marketSnapshot ? `${new Date(marketSnapshot.readAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST` : "Waiting for read-only feed"}</small>
        </article>
        <article>
          <span>Paper balance</span>
          <b>${money(availableCapital())}</b>
          <small>Locked ${money(lockedCapital())}</small>
        </article>
        <article>
          <span>Paper P&amp;L</span>
          <b class="${pnlClass(totalNetPnl())}">${money(totalNetPnl())}</b>
          <small>Open ${money(totalGrossPnl())} · fees ${money(totalFees())}</small>
        </article>
      </section>

      <section class="setup-strip">
        <div>
          <b>${credentialState.hasCredentials ? "Read-only market setup saved locally" : "Read-only market setup not configured"}</b>
          <span>${credentialState.hasCredentials ? `${feedStatusText()} Local key ${credentialState.apiKeyHint}. No broker account data is displayed in the app.` : "Add TOTP token and secret only for read-only market data. Broker balances and real P&L stay hidden."}</span>
        </div>
        <div class="setup-actions">
          ${credentialState.hasCredentials ? "" : '<a class="secondary-link" href="/groww-setup">How to get credentials</a>'}
          ${credentialState.hasCredentials ? `<button id="refresh-feed" class="secondary" type="button" ${feedState === "loading" ? "disabled" : ""}>Refresh now</button>` : ""}
          ${
            canAutoRefresh()
              ? `<label class="auto-refresh"><input id="auto-refresh" type="checkbox" ${autoRefreshEnabled ? "checked" : ""}><span>Auto refresh 5s</span></label>`
              : ""
          }
          <button id="open-credentials" type="button">${credentialState.hasCredentials ? "Manage" : "Add credentials"}</button>
        </div>
      </section>

      <section class="option-chain">
        <article class="option-column empty-chain">
          <h2>CALLS</h2>
          ${renderOptionRows(marketSnapshot?.calls ?? [])}
        </article>
        <article class="option-column empty-chain">
          <h2>PUTS</h2>
          ${renderOptionRows(marketSnapshot?.puts ?? [])}
        </article>
      </section>

      <section class="ledger">
        <div class="ledger-controls">
          <div class="totals">
            <span>Capital <b>${money(ledger.walletCapital)}</b></span>
            <span>P&amp;L before fees <b class="${pnlClass(totalGrossPnl())}">${money(totalGrossPnl())}</b></span>
            <span>Fees <b>${money(totalFees())}</b></span>
            <span>Closed <b>${ledger.trades.filter((trade) => trade.status === "CLOSED").length}</b></span>
          </div>
          <button class="danger" id="reset-ledger" type="button">Reset ledger</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Entry</th>
              <th>Option</th>
              <th>Origin</th>
              <th>Status</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Net</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${renderTradeRows()}
          </tbody>
        </table>
      </section>

      ${credentialModal()}
      ${footerLinks()}
    </main>
  `;

  bindDeskEvents();
  if (credentialState.hasCredentials && feedState === "idle") {
    void refreshMarket();
  }
}

function credentialModal(): string {
  return `
    <section class="credential-modal" id="credential-modal" ${credentialState.hasCredentials ? "hidden" : ""}>
      <form class="credential-card" id="credential-form">
        <div class="credential-head">
          <div>
            <p class="eyebrow">LOCAL READ-ONLY SETUP</p>
            <h2>Groww TOTP credentials</h2>
          </div>
          <button class="icon-button" id="close-credentials" type="button" aria-label="Close credentials setup">x</button>
        </div>

        <label>
          <span>TOTP token / API key</span>
          <input id="api-key" name="apiKey" type="password" autocomplete="off" placeholder="Paste your Groww TOTP token" required>
        </label>

        <label>
          <span>TOTP secret</span>
          <input id="totp-secret" name="totpSecret" type="password" autocomplete="off" placeholder="Paste your Groww TOTP secret" required>
        </label>

        <p class="privacy-note">TOTP code is generated in this browser. Broker balance, real P&L, positions, and orders are not displayed.</p>

        <div class="credential-actions">
          ${credentialState.hasCredentials ? '<button class="secondary" id="clear-credentials" type="button">Clear saved</button>' : ""}
          <button type="submit">Save locally</button>
        </div>
      </form>
    </section>
  `;
}

async function refreshMarket(options: { silent?: boolean } = {}): Promise<void> {
  const credentials = readCredentials();
  if (!credentials) return;
  if (refreshInFlight) return;

  refreshInFlight = true;

  if (!options.silent) {
    feedState = "loading";
    feedMessage = "Connecting read-only feed.";
    renderDesk();
  }

  try {
    const token = await getAccessToken(credentials);

    const snapshotResponse = await api<{ ok: boolean; snapshot?: MarketSnapshot; error?: string }>("/api/groww/market-snapshot", {
      accessToken: token
    });
    if (!snapshotResponse.ok || !snapshotResponse.snapshot) {
      throw new Error(snapshotResponse.error || "Market snapshot was not returned.");
    }

    marketSnapshot = snapshotResponse.snapshot;
    feedState = "ready";
    feedMessage = "Read-only snapshot connected.";
  } catch (error) {
    accessToken = null;
    autoRefreshEnabled = false;
    marketSnapshot = null;
    feedState = "error";
    feedMessage = error instanceof Error ? error.message : "Unable to connect read-only feed.";
  } finally {
    refreshInFlight = false;
    updateAutoRefreshTimer();
    renderDesk();
  }
}

async function getAccessToken(credentials: { apiKey: string; totpSecret: string }): Promise<string> {
  if (accessToken) {
    return accessToken;
  }

  const totp = await generateTotp(credentials.totpSecret);
  const tokenResponse = await api<{ ok: boolean; accessToken?: string; error?: string }>("/api/groww/access-token", {
    apiKey: credentials.apiKey,
    totp
  });
  if (!tokenResponse.ok || !tokenResponse.accessToken) {
    throw new Error(tokenResponse.error || "Access token was not returned.");
  }

  accessToken = tokenResponse.accessToken;
  return accessToken;
}

function updateAutoRefreshTimer(): void {
  if (!autoRefreshEnabled || !canAutoRefresh()) {
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
    return;
  }

  if (autoRefreshTimer !== undefined) {
    return;
  }

  autoRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void refreshMarket({ silent: true });
    }
  }, AUTO_REFRESH_MS);
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const value = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const maybeError = value as { error?: string; detail?: unknown };
    throw new Error(maybeError.error || JSON.stringify(maybeError.detail || value));
  }
  return value;
}

function renderTerms(): void {
  app.innerHTML = `
    <main>
      <article class="doc-page">
        <p class="eyebrow">PUBLIC TERMS</p>
        <h1>Terms &amp; Conditions</h1>
        <p>Papertrade Online is an educational paper-trading simulator. It is not investment advice, research advice, or a recommendation to buy or sell securities.</p>
        <h2>Paper-only use</h2>
        <p>The app is designed for simulated trades only. It must not place, modify, or cancel real broker orders.</p>
        <h2>No broker account display</h2>
        <p>The app should not show the user's real Groww balance, real F&amp;O P&amp;L, holdings, positions, or order book.</p>
        <h2>User credentials</h2>
        <p>If a user saves a Groww TOTP token and secret, those values are stored locally in that user's browser. The browser generates a current TOTP code, and the Worker processes read-only market-data requests transiently.</p>
        <h2>User responsibility</h2>
        <p>Users are responsible for their own broker account, Groww API access or subscription costs, credentials, and any trading decisions taken outside this app.</p>
        <h2>Data quality</h2>
        <p>Market data may be delayed, stale, incorrect, unavailable, or different from broker-side execution data. The app uses periodic snapshot refreshes, not tick-by-tick streaming.</p>
        <h2>No warranty</h2>
        <p>The software is provided as-is, without warranties. Use it at your own risk.</p>
      </article>
      ${footerLinks()}
    </main>
  `;
}

function renderGrowwSetup(): void {
  app.innerHTML = `
    <main>
      <article class="doc-page">
        <p class="eyebrow">GROWW READ-ONLY SETUP</p>
        <h1>Where to get TOTP token and secret</h1>
        <p>Use Groww's official Trade API dashboard/docs to create or view API credentials for your own account. The token/API key and TOTP secret belong to the user, not to Papertrade Online.</p>
        <h2>Setup steps</h2>
        <ol>
          <li>Open Groww Trade API in your Groww account.</li>
          <li>Enable or subscribe to Trade API access if Groww requires it for your account.</li>
          <li>Create a TOTP API credential from the Groww Trade API area.</li>
          <li>Copy the TOTP token/API key and TOTP secret.</li>
          <li>Return to Desk and save them locally in this browser.</li>
        </ol>
        <h2>What the app uses it for</h2>
        <p>Only read-only market-data calls: access token exchange, NIFTY quote, expiries, and NIFTY option chain.</p>
        <h2>What the app must not use it for</h2>
        <p>No real order placement, modification, cancellation, broker balance display, real P&amp;L display, positions, or order book display.</p>
        <div class="doc-actions">
          <a class="button-link" href="/">Back to Desk</a>
          <button id="open-credentials-page" type="button">Save credentials</button>
        </div>
      </article>
      ${credentialModal()}
      ${footerLinks()}
    </main>
  `;

  bindCredentialEvents();
  document.querySelector<HTMLButtonElement>("#open-credentials-page")!.addEventListener("click", () => {
    document.querySelector<HTMLElement>("#credential-modal")!.hidden = false;
  });
}

function bindDeskEvents(): void {
  bindCredentialEvents();
  document.querySelector<HTMLButtonElement>("#open-credentials")!.addEventListener("click", () => {
    document.querySelector<HTMLElement>("#credential-modal")!.hidden = false;
  });
  document.querySelector<HTMLButtonElement>("#refresh-feed")?.addEventListener("click", () => {
    void refreshMarket();
  });
  document.querySelector<HTMLInputElement>("#auto-refresh")?.addEventListener("change", (event) => {
    autoRefreshEnabled = (event.currentTarget as HTMLInputElement).checked;
    updateAutoRefreshTimer();
  });
  document.querySelectorAll<HTMLButtonElement>(".paper-entry").forEach((button) => {
    button.addEventListener("click", () => {
      enterPaperTrade(button);
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".paper-exit").forEach((button) => {
    button.addEventListener("click", () => {
      exitPaperTrade(button);
    });
  });
  document.querySelector<HTMLButtonElement>("#reset-ledger")?.addEventListener("click", () => {
    ledger = resetLedger();
    renderDesk();
  });
}

function enterPaperTrade(button: HTMLButtonElement): void {
  const premium = Number(button.dataset.premium);
  const required = Number(button.dataset.required);
  const strike = Number(button.dataset.strike);
  const optionType = button.dataset.optionType;
  const symbol = button.dataset.symbol;

  if (!symbol || (optionType !== "CE" && optionType !== "PE") || !Number.isFinite(premium) || !Number.isFinite(required) || !Number.isFinite(strike)) {
    return;
  }

  if (required > availableCapital()) {
    feedState = "error";
    feedMessage = `Paper balance is short by ${money(required - availableCapital())}.`;
    renderDesk();
    return;
  }

  ledger = addPaperTrade({
    id: crypto.randomUUID(),
    symbol,
    optionType,
    strike,
    lotSize: 65,
    entryPrice: premium,
    entryCost: required,
    entryTime: new Date().toISOString(),
    status: "OPEN"
  });
  renderDesk();
}

function exitPaperTrade(button: HTMLButtonElement): void {
  const tradeId = button.dataset.tradeId;
  const exitPrice = Number(button.dataset.exitPrice);

  if (!tradeId || !Number.isFinite(exitPrice)) {
    return;
  }

  ledger = closePaperTrade(tradeId, exitPrice);
  renderDesk();
}

function bindCredentialEvents(): void {
  document.querySelector<HTMLButtonElement>("#close-credentials")?.addEventListener("click", () => {
    document.querySelector<HTMLElement>("#credential-modal")!.hidden = true;
  });
  document.querySelector<HTMLButtonElement>("#clear-credentials")?.addEventListener("click", () => {
    clearCredentials();
    credentialState = loadCredentials();
    marketSnapshot = null;
    accessToken = null;
    autoRefreshEnabled = false;
    feedState = "idle";
    updateAutoRefreshTimer();
    route();
  });
  document.querySelector<HTMLFormElement>("#credential-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    saveCredentials({
      apiKey: String(form.get("apiKey") ?? "").trim(),
      totpSecret: String(form.get("totpSecret") ?? "").trim()
    });
    credentialState = loadCredentials();
    accessToken = null;
    autoRefreshEnabled = false;
    feedState = "idle";
    updateAutoRefreshTimer();
    route();
  });
}

function route(): void {
  if (location.pathname === "/terms") {
    renderTerms();
  } else if (location.pathname === "/groww-setup") {
    renderGrowwSetup();
  } else {
    renderDesk();
  }
}

route();
