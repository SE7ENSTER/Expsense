# EXPENSiO workflow audit — 12 November 2026

The tested flow is User creates Draft → Submit → Manager approval → Finance Processing → Reimbursed → owner History. Finance uses Process and Reimbursed rather than a separate “Finance Approved” status. Revision → owner correction → resubmission was also exercised.

## Findings and fixes

| Finding | Resulting behavior |
| --- | --- |
| Submitted reports could omit employee, purpose, destination, dates or individual line details | Submit requires complete metadata, valid date range, dates within the trip, descriptions and positive amounts. Drafts can remain incomplete. |
| Duplicate or stale approval/payment actions could create extra audit entries or surface unhandled errors | Per-report action lock and Firestore transaction check the persisted status; action and audit log commit atomically. Failures produce an error and permit retry. |
| Canonical `Reimbursement Processing` was not consistently included in Finance queues, actions or budget usage | Both processing spellings remain compatible and offer the Reimbursed action. Manager can retain visibility after Finance processing. |
| Pending claims were counted again when checking the same claim against remaining budget | The current claim is excluded before evaluating its effect. |
| Owner could not see the Manager's revision/rejection reason | Editor and review show Manager comment, Finance remark and payment reference. |
| Saving a revised report copied immutable workflow metadata, including serialized timestamps | Owner writes contain editable report fields only; approval and payment metadata remain intact. |
| Receipt numbering changed when earlier items lacked an attachment | Receipt references retain the original expense line number. |
| Report totals could be labeled with a selected currency although conversion was to HKD | Report base currency and totals consistently use HKD; individual expense currencies remain available. |
| New reports had no report number | First Save allocates `EXP-FY2027-000001` from a fiscal-year counter in the same transaction. Existing ER numbers remain unchanged. Existing unnumbered reports can be numbered by their owner or Admin using “Assign missing report numbers”. |
| Requested date display | Review, PDF, report cards and summary exports use `12 May 2026`. Native date inputs retain ISO values and show a formatted date hint. |

The EXP prefix is a new numbering namespace so allocation does not assume a maximum from historical ER numbers. Numbers stay unchanged when a report is edited, resubmitted or approved. Counter writes require the corresponding report write, increment by one, and cannot be deleted through client rules. Dashboard reads do not allocate numbers automatically.

## Validation

- 80 application/dashboard regression and workflow tests pass.
- 58 Firestore security-rule checks pass.
- 13 integrated scenarios run the actual production application modules with the real Firestore SDK against the isolated Firestore Emulator. These include two managers competing for one approval, two users allocating numbers concurrently, legacy numbering, receipts, notices, payment reference validation, ownership restrictions and History.
- Production JavaScript syntax and imported assets are checked before release.
- CI repeats the application, security and integrated emulator tests before publishing.

## Scope and deployment

Test users and expenses are synthetic. Authentication is provided by the Firestore rules test environment; real password login, live production accounts, deployed Firebase Rules, real receipt rendering and manual mobile interactions are not established by these tests. Browser layout checks from the prior branding release do not replace live role testing.

Deploy the updated Firestore Rules together with Hosting: new report numbering requires `/reportCounters`. Firebase Auth accounts are not copied or recreated. Existing reports are not renumbered automatically.

Backup branch: `backup/pre-workflow-audit-20261112` at `52718f84bd16667bb437763ee1860bb4365a08b8`. `backups/firestore-pre-workflow-20261112.rules` preserves the previous repository rule file; it is not an independent export of the deployed production rules.

## Report viewer follow-up

Current Report rows and report-number buttons now open the existing readable review dialog with receipts and Print / Save PDF. Draft and Revision Requested reports offer Edit report to open the same saved document. Submitted and later reports remain view-only. Owner review hides back-office budget calculations when no budget data has been loaded. Three regression scenarios cover the restored viewer, receipts/print, and editing from the viewer.

## Management pages follow-up

Management is split into User Management (Admin only), Budget Management, combined Manager & Finance Review, and All Reports. Only the selected page is displayed. Review and All Reports keep separate filters; navigation preserves user creation input. New expense report and the deadline banner are hidden on Management pages.

Admin can request a Firebase Authentication password reset email for a selected known user, after confirming the recipient. No password is generated or stored by this action. UI handles cancellation, errors and duplicate requests. These tests mock the Auth email call; actual email delivery is not established.

Budget Save All snapshots every entered value before committing and refreshing, so saving one budget cannot discard the following edited amounts. The Close report control has a prominent label, 44px target, visible keyboard focus, and remains in the sticky viewer header. Print output continues to omit controls.
