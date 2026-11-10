# SLG Expense — Rules release candidate, 10 November 2026

Status: prepared and tested for deployment. Firebase Console access is available; published Rules were backed up before changes. Publication and post-deploy verification remain next.

## Backup

- Production code snapshot: `backup/pre-rules-release-20261110`, commit `59a8a4659baa6083814645e57c9fd7ed91d63ea6`.
- User-supplied current Rules copy: `backups/firestore-user-provided-20261110.rules`; checksum and provenance in `backups/manifest-20261110.json`.
- Live published Rules copied from Firebase Console before deployment and privately saved in `SLG_Expense_Pre_Deploy_Backup_20261110.zip` (Library ID `libfile_163048069f1c81918b3929e54f8b05cd`), SHA-256 `17255b1b5fde97cf2bab7e1ce6b5ddf09ff62f54eb3b323d425cfcf1588e39be`. It matches the supplied copy after whitespace normalization.
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
- 58 actual Firestore Emulator authorization cases pass, including atomic Manager/Finance writes and rollback on an invalid audit actor.
- Production asset/import graph and JS syntax pass for 30 files.
- Emulator tests use only demo projects at `127.0.0.1:8180`; they do not access production records.

## Live schema compatibility review

The 22 reports listed in Firebase Console were reviewed read-only. All have `meta` and `items`. Nine use the old `{seconds, nanoseconds}` map for `createdAt`; ten Drafts lack a saved total; the remaining three Finance Processing reports have scalar creation dates and totals. The candidate now accepts the immutable legacy timestamp map for existing reports, while every new report still requires `createdAt == request.time`. A Draft save adds its computed total before it can enter approval. No database migration or report renumbering is needed for these observed cases.

The four added Emulator checks cover approving a legacy map without changing it, denying owner changes to that map, denying spoofed map timestamps on creation, and saving/submitting an older Draft with a missing total.

## Publication and verification

Publish the compatible app only after CI passes, then publish `firestore.rules` to **expsense-cf0a5** and confirm the resulting Console Rules release. Verify the exact production assets against the approved source. The management Console session is not an application-user session; authenticated application UAT remains a validation limit. No live report mutation is performed solely to test this deployment. Pages Settings are unavailable to the signed-out browser; verify the actual deployment through its workflow result and served assets.

## Rollback

Restore the independently saved live Rules file from the private backup ZIP if the new Rules must be reverted. Restore Pages source from the exact backup commit and republish using the existing Pages workflow. Keep database records unchanged unless a separately backed-up schema preparation is required.

## Limits

Rules do not sum arbitrary expense lists or independently establish that `totalHkd` equals every item calculation. Trusted backend financial validation is still a separate task. Notifications are written after a successful report action and can fail independently; the workflow and audit log itself are atomic. The Emulator fixture matrix does not replace production schema review or authenticated UAT.
