# EXPENSiO Monthly Invoice — 12 November 2026

## Template mapping

Source: uploaded **SLG Invoice Template.xlsx**, Invoice sheet B2:F40 and hidden Lists sheet. The workbook was read only; its original file is unchanged.

- From: full name, address lines, country, phone and email.
- Invoice details: invoice number uses the template formula (first four characters of the name, spaces removed, uppercase + invoice-date YYYYMM); invoice date, service month, 20 original currencies, four original payment terms and calculated due date.
- Bill to: Suisseland Group Hong Kong Limited; the Hong Kong address and Finance attention line are retained verbatim.
- Ten invoice lines preserve Description, Period / Reference, and Amount. Consultancy fee / Reimbursement default descriptions are retained. Exact integer minor units drive totals; amount in words and currency names are calculated from that same total.
- Bank fields and the template's declaration are preserved. Reimbursement lines require a supporting file in the UI. One PDF/PNG/JPEG up to 400 KB can be stored with the invoice and downloaded separately from the invoice PDF.

## Submission and signature

The new Monthly Invoice menu is available to signed-in users on desktop and mobile. One document per authenticated user and service month supports Save draft → Sign & Submit. Drafts may be incomplete and retain no drawn signature. A readable, signed invoice can be printed/saved as PDF.

A pointer-event canvas accepts mouse, touch or pen. Taps alone do not count as ink. Clear signature removes the drawing. Changing any invoice field or signer name clears the drawing. Submit requires a drawn PNG signature, signer name, checked declaration, valid required fields, and a positive amount. Identity and server signedAt/submittedAt timestamps are persisted atomically with the submitted values. The submitted invoice cannot be edited or deleted by client users, including Admin.

Transactions compare revisions and use a deterministic user-month ID to prevent duplicate/overwriting saves from stale tabs. Month loading blocks save actions; session changes clear invoice state and close private viewers. No bank details or signatures are put in localStorage.

## Access and review

Firestore monthlyInvoices is separate from expenseReports. Active owners read their own drafts/submissions. Finance/Admin can query submitted invoices across users and filter by service month. Managers and other users cannot read another user's bank details/signature; Finance/Admin cannot read others' Drafts. The existing temporary-password gate applies. Server rules validate identity, month key, totals, nonnegative integer lines, required submission information, signature presence, consent and server timestamps. Supporting file type/size is validated when present; receipt necessity is a UI rule based on the free-text reimbursement description.

This is a monthly submission and Finance viewing flow; no additional approval statuses, email messages or payment automation were added.

## Verification

107 application tests pass, including nine monthly-invoice tests. 39 invoice Rules scenarios and four actual-production-module/real-Firestore scenarios pass. Tests include full ten-line submission (including a password-ready session and attachment), no signature/consent, stale revision, exact total, private bank data, immutable submission, required receipts in UI and Finance viewing. The existing 69 Rules checks and 15 expense workflow scenarios also pass. All test data/accounts are synthetic; no live database records were created.

## Release

Backup branch: backup/pre-monthly-invoice-20261112 at d9b6a31b6f89cb4a6568bd934ec35edfb63e784e. The deployment ZIP includes a standalone prior release backup, previous Rules, and the corrected Windows deployment script that checks extraction and enters functions directly before npm ci.

No live deployment is claimed. The existing account-security Functions dependency still requires Blaze and an authorized deployment computer. Use the included DEPLOY-WEB.cmd after extracting the entire ZIP. The script deploys Rules before Hosting; do not publish only the UI, because monthlyInvoices needs the new Rules. Source/configuration backups are not a database/Auth export. Retain the account-security gate during any rollback after password resets.

## Dedicated Management review page

Management → Monthly Invoices is visible and routable only to Finance/Admin. The personal Monthly Invoice page always queries the current user's invoices and no longer offers an all-users selector. Management queries only Submitted invoices, displays the submission time, offers independent month filtering and ten-per-page controls, and opens the same signed read-only viewer. Manager/User navigation to admin-invoices falls back to an allowed page. Private review records and open viewers clear on sign-out. The unchanged Rules enforce the role restriction even when bypassing the UI; explicit query-denial tests were added.

Backup for this UI change: backup/pre-invoice-management-20261112 at 59b39ccd862c2302189a5a48ac9814217671bb24. Previous standalone package and Rules are included in the ZIP. No live deployment was performed.
