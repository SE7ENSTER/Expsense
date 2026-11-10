# Production module cleanup — 10 November 2026

This change removes overlapping runtime ownership from the production entry point. It preserves the existing Firebase project and saved report numbers. It does not deploy Firestore rules or migrate report data.

## Ownership

| Component | Sole responsibility |
|---|---|
| `firebase-client.js` | Initialize Firebase once and expose the shared client/configuration. |
| `firebase-app.js` | Own authentication lifecycle, navigation, report reads, current editor state, report opening and saving. |
| `app-events.js` | Notify modules of lifecycle/data changes; replay session/report state to late subscribers, but never replay old mutation events. |
| `management-v2.js` | Own management tables, budgets, approval/finance actions and report PDF export. Consume the core report list rather than drawing or independently loading the dashboard. |
| `register-profile.js` / `user-registration.js` | Own registration UI and profile provisioning; the auth lifecycle waits for profile creation. |
| `receipt-files.js` | Decode/validate receipt files; the report owner persists original PDF metadata and preview together. |
| `admin-user-management.js` | Own the admin user form and its actions; no periodic replacement of typed input. |
| Summary, export and history modules | Consume authorized report state and render their own sections only. Manager History retains the separate own-report query required by its existing scope. |
| Sidebar/profile modules | React to session and view events without redefining navigation. |
| `notifications-v23.js` | React to successful report/management events; poll notification data with one timer that is cancelled on session changes. |

Public inline-HTML actions remain compatible. Each of `showView`, `openReport`, `saveReport`, `refreshAdmin`, `signUp`, and `exportPdf` now has one production owner. The former interval interceptor and duplicate Review click interceptor are no longer loaded. Historical staging files remain available; they are not part of the production module graph.

## Lifecycle and correctness changes

- Removed chained global function replacements and arbitrary delays used to coordinate modules.
- Removed broad body observers and repeated presentation timers. The table's narrow observer remains because it adapts its single owner's report-list DOM; a notification timer fetches data rather than rebuilding forms.
- A stable report document ID is chosen before the first save. Concurrent save clicks are ignored, creation time is preserved, totals are recomputed, and pending receipt processing blocks an incomplete save.
- Receipt upload results are ignored if the editor moved to another report or a newer upload replaced them. Original PDF and preview are saved in one report write.
- Read/session versions prevent stale report requests from overwriting a newer edit or restoring another account's data.
- Notifications use the exact successful report/action. Failed or cancelled operations emit no success event.
- New-report actions clear the prior PDF identity. History/notification opens use the central protected Firestore read when the report is outside the active cache.
- Frontend approval/finance entry points check role before mutating; backend authorization remains the responsibility of deployed Firestore rules.
- Reformatted active modules so the control flow can be reviewed without minified one-line functions.

## Verification

`npm test` runs 35 dashboard and whole-production-module tests. The integration harness evaluates the real module graph with a DOM and mocked Firebase/receipt APIs. It covers user, manager, finance and admin behavior; save failures and concurrency; exact-report notifications; registration timing; logout/account switching; old reads; receipt validation/persistence; action ownership; and repeated navigation.

`node tests/check-production.cjs` verifies the production import graph, local assets and JavaScript syntax. `git diff --check` also passes.

The custom deployment workflow now runs those checks before its deploy job and verifies pull requests without deploying them. Before relying on that workflow as the sole publication gate, verify **Settings → Pages → Source = GitHub Actions**: earlier repository activity included both a dynamic Pages deployment and the custom deployment workflow. The current connector does not expose the Pages administration settings, so the active publication source has not been verified or changed here.

## Remaining release checks and known limitations

- These tests do not verify the rules currently deployed in Firebase or replace authenticated browser/UAT tests against the real backend. Test create/edit/submit, manager review, finance payment, user provisioning, PDF export and a real mobile viewport before a broad rollout.
- Backend field/transition restrictions, canonical Finance statuses, trusted admin account provisioning and atomic status/audit-log writes from `CODE_REVIEW_2026-11-10.md` remain separate work.
- Binary receipts are still stored inside report documents; this cleanup removes the delayed metadata write but does not implement object storage or eliminate the document size limit.
- Transactional report-number allocation/backfill is not introduced. Existing saved numbers remain unchanged; missing numbers still show `Not assigned`.

## Follow-up: real Rules engine verification

`FIREBASE_RULES_AUDIT.md` and `RULES_AUDIT_RESULTS.json` now record 76 operations evaluated by the actual Firestore Emulator against both repository rulesets. This is stronger than the mocked UI suite, but it still does not establish which rules are deployed. The repository file had 19 expectation mismatches; the candidate had 9. No replacement rules were published. Read that report before releasing the app/rules together.
