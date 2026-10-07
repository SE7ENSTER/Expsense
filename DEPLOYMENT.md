# ExpenseFlow deployment environments

## Branches

- `main` — current stable / future PROD branch. Do not use for UAT development.
- `uat` — UAT branch. All new changes must be tested here first.

## Current environment mapping

### UAT
- Branch: `uat`
- App version: `0.30.0-uat.1`
- Firebase project: `expsense-cf0a5` (existing project, now treated as UAT)
- Cloudflare Worker name: `expenseflow-uat`
- Static asset directory: `./docs`

### PROD
- Branch: `main`
- Firebase project: **must be a separate new project before production launch**
- Cloudflare Worker: create separately, e.g. `expenseflow-prod`
- Do not point UAT at the PROD Firebase project.

## Release flow

1. Commit development changes to `uat`.
2. Deploy `uat` to Cloudflare.
3. Complete UAT checklist and sign-off.
4. Promote the exact tested changes to `main`.
5. Deploy `main` to the separate PROD Cloudflare Worker using the PROD Firebase config.

## UAT deploy command

```bash
npx wrangler deploy
```

Cloudflare authentication/account setup is required before the first deploy.

## Production guardrails

- Separate Firebase Auth, Firestore, Storage/R2, rules and indexes.
- Never reuse UAT data in PROD without an explicit migration.
- Never place a production Firebase config into the `uat` branch.
- Keep report workflow/status changes behind UAT sign-off.
- Tag each approved production release, e.g. `v0.30.0`.
