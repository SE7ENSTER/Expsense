# Review of the Rules supplied on 10 November 2026

Source: the Rules text supplied by the user after requesting the current Firebase Console copy. Stored without changing its logic as `firestore-provided-20261110.rules`. This file is distinct from both previously audited repository files. No production Rules were changed or published.

## Emulator result

The actual Cloud Firestore Emulator evaluated **42 checks** against this exact logic: **27 matched the intended security/app-compatibility expectation; 15 did not**. The 15 mismatches are test cases grouped below, not 15 independent vulnerabilities. See `RULES_PROVIDED_AUDIT_RESULTS.json` for all operations.

### Confirmed protections

- Unauthenticated and unrelated ordinary users cannot read the tested report.
- Owners cannot edit Submitted/Manager Approved reports or directly self-approve.
- New own reports are limited to Draft/Submitted.
- Managers cannot skip from Submitted to Reimbursed, and Finance cannot reverse a Processing report to Manager Approved.
- The current app's legacy `Finance Processing` write and the canonical `Reimbursement Processing` write both succeed. This supplied ruleset does not have the legacy-write incompatibility found in the older candidate.
- The tested ordinary-user admin-role creation/update and owner report deletion are denied.

## Findings requiring changes

| Priority | Finding confirmed by the emulator | Recommended boundary |
|---|---|---|
| P1 | Manager can approve **and change expense items/total in the same update**. Finance can start processing **and change expense items/total in the same update**. Updating only the items is denied, so a single-field test would miss these combined-operation bypasses. | Limit changed fields separately for Manager and Finance. Preserve report identity and expense content while changing workflow fields. Validate actor UID against `request.auth.uid`. |
| P1 | Owner can change `userId`, `reportNo` and `createdAt` while the report is Draft, and can inject approval/payment metadata. | Make ownership, saved report numbers and creation time immutable; allow owners to change only report input fields and permitted submission fields. |
| P1 | Disabled owner can read/create reports. An admin with `active:false` still has admin read privileges. | Check account activity in database authorization, not only the UI. Handle missing `active` fields in older profiles deliberately to avoid an unintended lockout. |
| P2 | Negative claim total, rejection with an empty comment, and Reimbursed with an empty payment reference are accepted. | Validate required types/values and mandatory workflow fields at the database boundary. Keep UI validation as an additional aid, not the enforcement point. |
| P2 | A normal user can create a manager-approved notification, and an existing notification recipient can reroute it to someone else. | Restrict notification types to the triggering actor/action; allow recipients to update read-state fields only. Consider a trusted server-side notification producer. |
| Compatibility | Admin creation of another user's profile is denied because profile creation only permits `userId == request.auth.uid`. | Align the rule with the app's authorized provisioning path. The admin UI creates the Authentication account first, so this denial can leave an account without its intended profile. |

## Consequence for PR #5

The supplied Rules are more restrictive than the old root `firestore.rules`, and their Finance status writes are compatible with the current UI. However, they still do not enforce field-level immutability, disabled-account restrictions or several required workflow values. Frontend role checks and the cleanup tests cannot replace these backend restrictions.

Keep this supplied source separate from any proposed hardened replacement. Prepare changes to app and Rules together, retest normal User/Manager/Finance/Admin operations and denied operations, then publish only after checking that existing profiles and report schemas remain compatible. No replacement is published by this review.

## Reproduce

Using the same isolated tooling and emulator configuration from `FIREBASE_RULES_AUDIT.md`:

```bash
NODE_PATH=/tmp/slg-firebase-tests/node_modules /tmp/slg-firebase-tests/node_modules/.bin/firebase emulators:exec --only firestore --project demo-slg-rules-audit --config firebase.rules-test.json 'NODE_PATH=/tmp/slg-firebase-tests/node_modules node tests/rules-audit.cjs firestore-provided-20261110.rules'
```

The script writes `RULES_PROVIDED_AUDIT_RESULTS.json`. It refuses any emulator endpoint other than `127.0.0.1:8180` and uses only demo project IDs. The CLI still has no management login, so this evaluation is of the user's supplied copy, not an independent retrieval of a published release or its timestamp. Authentication-provider configuration, authorized domains, indexes and deployed Storage rules have not been independently inspected.
