# SLG Expense — Rules release candidate, 10 November 2026

Status: prepared and tested, **not deployed**. Firebase Console is at Google sign-in and the CLI has no management login. Do not merge/deploy this release until the remaining live checks below are complete.

## Backup

- Production code snapshot: `backup/pre-rules-release-20261110`, commit `59a8a4659baa6083814645e57c9fd7ed91d63ea6`.
- User-supplied current Rules copy: `backups/firestore-user-provided-20261110.rules`; checksum and provenance in `backups/manifest-20261110.json`.
- Live published Rules backup is pending Firebase access. The supplied copy is not represented as an independently fetched production backup.
- No production documents have been written. A database export has not been performed.

## Changes

- Active-profile checks and field-level write restrictions from the approved Rules draft.
- Owner save computes `fiscalYear` and `totalHkd`; rejects invalid expenses and submitted-report edits.
- Manager no longer writes expense totals, fiscal year or report-number fields during approval.
- Manager/Finance status and audit logs commit atomically. Log Rules use `getAfter` so the same batch is validated against the resulting report status.
- Batch approval uses the same manager operation and emits the same successful-action notification events.
- Finance cannot skip Processing; Reimbursed/Closed requires a nonblank payment reference. Rejection/revision comments are trimmed and required.
- Remove the presentation override that enabled Finance budget editing; budget writes remain Admin-only as in the approved policy.
- CI checks the production graph, UI/module tests and real Emulator Rules tests before Pages publication. Firebase Rules publication remains separate and explicit.

## Completed local verification

- 39 dashboard/whole-module tests pass with mocked Firebase APIs.
- 54 actual Firestore Emulator authorization cases pass, including atomic Manager/Finance writes and rollback on an invalid audit actor.
- Production asset/import graph and JS syntax pass for 30 files.
- Emulator tests use only demo projects at `127.0.0.1:8180`; they do not access production records.

## Required before production release

1. Sign into Firebase management for project `expsense-cf0a5`; fetch and save the current published Rules and release identity before any Rules change.
2. Read the existing report schema. Records missing `createdAt` timestamp, `meta` map, `items` list or numeric nonnegative `totalHkd` cannot be workflow-updated under these Rules. Prepare and back up only necessary changes; never renumber existing reports. In particular `fiscalYear`/totals must be present before Manager approval.
3. Verify authenticated User/Manager/Finance/Admin flows against representative legacy and new records and confirm the active Pages publication source.
4. Publish the compatible app, then publish `firestore.rules` with the prepared `firebase.json` to **expsense-cf0a5**, confirm the resulting Rules release, and verify production flows.

## Rollback

Restore the independently saved live Rules release if the new Rules must be reverted; the user-provided copy is only a fallback reference until verified. Restore Pages source from the exact backup commit and republish using the existing Pages workflow. Keep database records unchanged unless a separately backed-up schema preparation is required.

## Limits

Rules do not sum arbitrary expense lists or independently establish that `totalHkd` equals every item calculation. Trusted backend financial validation is still a separate task. Notifications are written after a successful report action and can fail independently; the workflow and audit log itself are atomic. The Emulator fixture matrix does not replace production schema review or authenticated UAT.
