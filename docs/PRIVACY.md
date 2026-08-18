# Privacy Policy Draft

Papertrade Online is designed to avoid server-side storage of user broker credentials.

## Data Stored In The Browser

- Groww API key
- TOTP secret or derived auth state
- Paper trading ledger
- Wallet settings
- Rule drafts

## Data Processed By The Worker

The Worker may receive credentials or access tokens transiently to fetch read-only market data. The Worker should not persist these values.

## Logging

Do not log request bodies containing credentials, TOTP values, access tokens, or authorization headers.

## Real Trading

The public app is paper-only and must not place, modify, or cancel real broker orders.
