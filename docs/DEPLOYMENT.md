# Deployment

Target: Cloudflare Workers with static assets for `papertrade.online`.

## Recommended Pipeline

Use one production deployment owner at a time:

- Preferred: Cloudflare Workers Builds deploys `main` after GitHub CI is green.
- Emergency fallback: run the manual GitHub Actions workflow named `Manual Wrangler Deploy`.

GitHub CI should stay as the quality gate for every pull request and `main` push:

```text
install -> safety guard -> typecheck -> tests -> production build -> Wrangler dry-run
```

The manual deploy workflow uses the `production` GitHub environment. Add approval rules there if production should require a human click before deploy.

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

For manual GitHub deploys, add repository or production-environment secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The Cloudflare token should be scoped only to deploy this Worker.
