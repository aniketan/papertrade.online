# Architecture

Papertrade Online is built as a public-safe application:

- The browser owns credentials, wallet settings, paper trades, and rule drafts.
- The Worker is stateless and read-only.
- There is no server-side user database.
- Real broker order APIs are forbidden.

## Request Flow

```text
Browser
  local credentials + paper ledger
  |
  | POST read-only market-data request
  v
Cloudflare Worker
  validates route against read-only allowlist
  calls Groww REST API transiently
  returns market data
```

## State Ownership

| State | Owner | Notes |
| --- | --- | --- |
| Groww API key | Browser | Never stored by Worker |
| TOTP secret | Browser | Prefer IndexedDB or localStorage with explicit consent |
| Paper ledger | Browser | No shared SQLite or server DB |
| Market snapshot | Worker response | Not persisted |
| Suggestions | Core package | Deterministic calculation from supplied market data |

## Non-Goals

- Real order placement
- Real order modification
- Real order cancellation
- Personalized financial advice
- Server-side broker account storage
