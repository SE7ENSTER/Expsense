# Firebase Rules audit — 10 November 2026

## What was verified

Both repository rule files were compiled and evaluated by the **real Cloud Firestore Emulator**, using the official Firebase Rules Unit Testing library. The audit performed **42 checks per ruleset, 84 operations in total**, with synthetic owner/other-user/manager/finance/admin/disabled/inactive-admin and unauthenticated contexts. Before every check, fixture data was reset using the emulator-only administrative setup context.

The tests used hard-coded `demo-slg-rules-*` projects and the loopback-only emulator at `127.0.0.1:8180`. No production database records or rules were changed.

| Rules file | Checks matching the intended security/compatibility expectation | Findings |
|---|---:|---:|
| `firestore.rules` | 19 / 42 | 23 |
| `firestore-v282.rules` | 32 / 42 | 10 |

These are counts of test cases, **not counts of independent vulnerabilities**. Several cases cover different consequences of the same permissive rule. A completed audit process is not an all-pass security test: the raw results explicitly mark every mismatch.

## Main findings

| Area | Repository rules | Candidate rules |
|---|---|---|
| Submitted/approved report locking | Owner edits are permitted after submission and approval. | Correctly rejects these tested edits. |
| Ownership, number and workflow integrity | Owner can transfer ownership/change report number/self-approve; Manager and Finance can alter expense data or skip/reverse workflow. | Correctly rejects those tested operations and allows the tested normal approval and canonical processing actions. |
| Disabled accounts | Disabled owners can read/create reports; an admin profile with `active:false` still has admin read access. | Same failures. The rule role lookup does not enforce account activity. |
| Required values | Negative claim totals, rejection without a comment, and reimbursement without a payment reference are accepted. | Same failures. Client-side validation alone does not enforce these conditions at the database boundary. |
| Notification integrity | A normal user can create a manager-approved notification; a recipient can reroute an existing notification to a different user. | Same failures. Creation and update checks are not restricted to the specific workflow/fields. |
| Admin user provisioning | Admin cannot create another user's profile under the root file, conflicting with the app's admin provisioning action. | The tested admin profile creation succeeds. |
| Current Finance UI compatibility | The app's legacy `Finance Processing` write succeeds. | That same write is denied; the candidate accepts `Reimbursement Processing` instead. UI actions, filters, budgets, queries and rules must be aligned before rollout. |

The expanded matrix also tests combined status-and-amount updates, creation-time changes, and owner-forged approval metadata. The candidate still allows owners to inject approval/payment metadata in a Draft.

Both files correctly denied the tested unauthenticated report read, unrelated-user report read, ordinary-user privileged profile creation, ordinary-user audit-log creation, and owner report deletion. The normal own-draft creation/edit and tested allowed back-office operations were also exercised. The complete per-operation results are in `RULES_AUDIT_RESULTS.json`.

## What is still unverified on the real Firebase project

The browser configuration points to **`expsense-cf0a5`**. The Firebase CLI was installed successfully, but listing projects returned **“Failed to authenticate, have you run firebase login?”** There is no authenticated Firebase management session in this workspace. The requested Firebase integration could not be installed by the user, so the audit proceeded locally without it.

As a result, this report does **not** establish which ruleset is currently published, the current Authentication provider/authorized-domain settings, the deployed database indexes, or the effective deployed Storage rules. The web API key does not provide administrative rules access. Do not treat either repository file as a verified copy of deployed rules.

The user has now supplied the current Rules copy. It is stored as `firestore-provided-20261110.rules` and evaluated separately in `RULES_PROVIDED_REVIEW.md` with 42 checks. This resolves the missing source-copy step, but is not an independent API/Console retrieval of the published release timestamp. A separate staging/UAT rollout should verify app and hardened Rules together before publication.

## Reproduce the local audit

Install test tooling separately from the production app:

```bash
npm install --prefix /tmp/slg-firebase-tests --no-save --package-lock=false --ignore-scripts firebase-tools@15.35.0 @firebase/rules-unit-testing@6.0.0 firebase@13.2.0
NODE_PATH=/tmp/slg-firebase-tests/node_modules /tmp/slg-firebase-tests/node_modules/.bin/firebase emulators:exec --only firestore --project demo-slg-rules-audit --config firebase.rules-test.json 'NODE_PATH=/tmp/slg-firebase-tests/node_modules node tests/rules-audit.cjs'
```

The script refuses to run unless `FIRESTORE_EMULATOR_HOST` is exactly `127.0.0.1:8180`. It loads each ruleset explicitly and uses only demo project IDs. `RULES_AUDIT_RESULTS.json` is regenerated on successful completion. An exit code of zero means the audit ran to completion; inspect its `findings` counts before drawing a security conclusion.

Method reference: [Firebase — Test your Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/test-rules-emulator).
