import type { LocalCredentialState } from "@papertrade/shared";
import { generateTotp } from "../groww/totp";
import { clearCredentials, loadCredentials, readCredentials, saveCredentials } from "../storage/credentials";
import { loadLedger } from "../storage/paper-ledger";
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

const ledger = loadLedger();
const app = document.querySelector<HTMLDivElement>("#app")!;
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
          <button type="button">Paper entry</button>
        </div>
      `
    )
    .join("");
}

function feedStatusText(): string {
  if (feedState === "loading") return "Connecting read-only feed.";
  if (feedState === "ready") return `Feed live for expiry ${marketSnapshot?.expiry ?? "--"}.`;
  if (feedState === "error") return feedMessage;
  return "Feed not connected.";
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
          <b>${money(ledger.walletCapital)}</b>
          <small>Locked Rs 0.00</small>
        </article>
        <article>
          <span>Paper P&amp;L</span>
          <b class="good">Rs 0.00</b>
          <small>Open Rs 0.00 · fees Rs 0.00</small>
        </article>
      </section>

      <section class="setup-strip">
        <div>
          <b>${credentialState.hasCredentials ? "Read-only market setup saved locally" : "Read-only market setup not configured"}</b>
          <span>${credentialState.hasCredentials ? `${feedStatusText()} Local key ${credentialState.apiKeyHint}. No broker account data is displayed in the app.` : "Add TOTP token and secret only for read-only market data. Broker balances and real P&L stay hidden."}</span>
        </div>
        <div class="setup-actions">
          ${credentialState.hasCredentials ? "" : '<a class="secondary-link" href="/groww-setup">How to get credentials</a>'}
          ${credentialState.hasCredentials ? '<button id="refresh-feed" class="secondary" type="button">Refresh feed</button>' : ""}
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
            <span>P&amp;L before fees <b>Rs 0.00</b></span>
            <span>Fees <b>Rs 0.00</b></span>
            <span>Closed <b>${ledger.trades.filter((trade) => trade.status === "CLOSED").length}</b></span>
          </div>
          <button class="danger" type="button">Reset ledger</button>
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
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="7">No paper trades yet.</td></tr>
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

async function refreshMarket(): Promise<void> {
  const credentials = readCredentials();
  if (!credentials) return;

  feedState = "loading";
  feedMessage = "Connecting read-only feed.";
  renderDesk();

  try {
    const totp = await generateTotp(credentials.totpSecret);
    const tokenResponse = await api<{ ok: boolean; accessToken?: string; error?: string }>("/api/groww/access-token", {
      apiKey: credentials.apiKey,
      totp
    });
    if (!tokenResponse.ok || !tokenResponse.accessToken) {
      throw new Error(tokenResponse.error || "Access token was not returned.");
    }

    const snapshotResponse = await api<{ ok: boolean; snapshot?: MarketSnapshot; error?: string }>("/api/groww/market-snapshot", {
      accessToken: tokenResponse.accessToken
    });
    if (!snapshotResponse.ok || !snapshotResponse.snapshot) {
      throw new Error(snapshotResponse.error || "Market snapshot was not returned.");
    }

    marketSnapshot = snapshotResponse.snapshot;
    feedState = "ready";
    feedMessage = "Read-only feed connected.";
  } catch (error) {
    marketSnapshot = null;
    feedState = "error";
    feedMessage = error instanceof Error ? error.message : "Unable to connect read-only feed.";
  }

  renderDesk();
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
        <p>Market data may be delayed, stale, incorrect, unavailable, or different from broker-side execution data.</p>
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
}

function bindCredentialEvents(): void {
  document.querySelector<HTMLButtonElement>("#close-credentials")?.addEventListener("click", () => {
    document.querySelector<HTMLElement>("#credential-modal")!.hidden = true;
  });
  document.querySelector<HTMLButtonElement>("#clear-credentials")?.addEventListener("click", () => {
    clearCredentials();
    credentialState = loadCredentials();
    marketSnapshot = null;
    feedState = "idle";
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
    feedState = "idle";
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
