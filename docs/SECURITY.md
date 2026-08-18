# Security Policy

## Real-Order Ban

This project must not include broker order placement, modification, or cancellation.

Forbidden examples:

- `place_order`
- `modify_order`
- `cancel_order`
- `/order/create`
- `/order/modify`
- `/order/cancel`
- smart order APIs

The CI guard in `scripts/forbid-real-orders.mjs` fails when these strings appear outside approved documentation or the guard itself.

## Credential Handling

- User credentials are browser-owned.
- The Worker is stateless and should not persist request bodies.
- Never print secrets, TOTP codes, access tokens, or authorization headers.
- Keep Content Security Policy strict.
- Avoid injecting untrusted values through `innerHTML`.

## Reporting

Open a private security report with reproduction steps and affected files.
