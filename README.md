# SLG Expense

The deployed application is the static module application under `docs/`, published with GitHub Pages. `src/App.jsx` is an older React prototype, not the production UI. Experimental staging entry points and historical patches are retained for reference; production loads only the modules listed in `docs/index.html`.

## Develop and verify

```bash
npm install
npm test
node tests/check-production.cjs
npm run dev
```

Open `/docs/` on the development server. The browser app uses the configured Firebase project; automated tests use mocked services and do not change production records.

## Structure

- `docs/firebase-client.js`: shared Firebase initialization.
- `docs/firebase-app.js`: authentication lifecycle, navigation, report editor and persistence.
- `docs/app-events.js`: explicit lifecycle/data notifications between modules.
- `docs/management-v2.js`: management tables, budgets, approval/payment actions and PDF export.
- Registration, receipt, user administration, summary/export, history, sidebar and profile modules own their respective features.

See [cleanup notes](CLEANUP_NOTES.md) for ownership, regression coverage, release checks and remaining backend work. The earlier [code review](CODE_REVIEW_2026-11-10.md) records the findings that led to this refactor.

## Deployment

The custom `.github/workflows/deploy.yml` verifies production imports/assets and runs the regression suite before publishing `docs/`. Pull requests run verification only. Ensure GitHub Pages is configured to use **GitHub Actions** if this workflow is to be the only publication path.

The [Firebase Rules audit](FIREBASE_RULES_AUDIT.md) documents the separate emulator checks, their findings, and the remaining deployed-rules verification step.
