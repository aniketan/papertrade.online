# Papertrade Online

Papertrade Online is a browser-local paper trading simulator for NIFTY-style workflows.

The public app is designed around one hard boundary: it can read market data, but it must not place, modify, or cancel real broker orders.

## Safety Model

- User Groww credentials stay in the user's browser.
- The Worker acts as a stateless, read-only market-data proxy.
- Paper trades, wallet, and rules are stored locally in the browser.
- Real order APIs are forbidden by code review and CI checks.
- The app is educational software, not financial or investment advice.

## Project Layout

```text
apps/web       Browser app
apps/worker    Cloudflare Worker API
packages/core  Pure trading calculations and paper ledger helpers
packages/shared Shared types and schemas
docs           Security, privacy, deployment, and architecture notes
scripts        CI guardrails
```

## Local Development

```bash
pnpm install
pnpm dev
pnpm dev:worker
pnpm check
```

## Deployment

The intended public deployment target is Cloudflare Workers with static assets for `papertrade.online`.
See `docs/DEPLOYMENT.md`.
