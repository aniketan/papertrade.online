# Deployment

Target: Cloudflare Workers with static assets for `papertrade.online`.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Build all packages:

   ```bash
   pnpm build
   ```

3. Run guardrails:

   ```bash
   pnpm check
   ```

4. Deploy Worker:

   ```bash
   pnpm --filter @papertrade/worker deploy
   ```

## Domain

Point `papertrade.online` to Cloudflare and attach the Worker route to:

```text
papertrade.online/*
www.papertrade.online/*
```

## Secrets

Do not add user Groww credentials to Cloudflare secrets. User credentials are browser-owned.
