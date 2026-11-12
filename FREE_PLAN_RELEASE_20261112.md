# EXPENSiO release without Cloud Functions — 12 November 2026

## Current behavior

- Login uses Firebase Authentication and the existing active-account/profile checks; it no longer calls a Cloud Functions status endpoint.
- Admin uses **Send reset email** to send Firebase's built-in password reset link to the selected user's email. Save role remains enabled only when the role selection changes.
- Temporary-password generation, the forced-change popup and the Server email-branding action are removed from the active app. Their source is recoverable from the pre-change Git branch and standalone backup ZIP.
- My Expenses, independent Management queries, My report badges, private signed Monthly Invoices, timestamps/month filters, report numbering, and the two-receipt-per-page PDF layout are retained.
- Firebase deployment configuration has no functions entry. DEPLOY-WEB.cmd does not install Server dependencies or deploy Functions: it deploys Firestore Rules, then Hosting, stopping on any error. This package does not require a Blaze upgrade or change billing.

## Existing protections

The private accountSecurity/passwordResetAudit collections and password-version business-data gate remain in Firestore Rules. The transition does not clear private security records, remove account locks, grant new roles, or reset real passwords. The user's deployment output shows the Functions stage stopped on Blaze; no temporary-password operations were executed against live accounts by this assistant. If a deployment elsewhere ever created a pending private password operation, it must be recovered by a trusted administrator rather than bypassed by this client.

An unused local variable in signedInvoice was removed to eliminate the compilation warning. No access policy was broadened.

## Email branding

Reset email delivery uses Firebase Authentication directly. Sender display name, subject and body should be checked/edited in Firebase Console → Authentication → Templates → Password reset. Set sender display name to SLG EXPENSiO and visible app name to EXPENSiO while preserving %LINK% and %EMAIL%. Do not change the Firebase project ID or sender domain to achieve a display-name change. See EMAIL-TEMPLATE-SETUP.txt in the package. No live email-template settings were changed by this release.

## Verification and backup

118 application checks pass locally, including normal login for user/manager/finance/admin when no callable service is configured, no active Functions imports, email-only reset, role editing, invoice signatures/privacy, and owner-only exports. The isolated emulator release run passes 69 expense Rules checks, 15 expense workflow scenarios, 39 invoice Rules checks, four invoice workflow scenarios and three real-Rules personal-workspace scenarios. CI also exercises actual Chrome receipt PDF pagination. All test accounts/data are synthetic.

Pre-change source: 90bcff65acec5c006410159986e6575d7e2d79a5. Backup branch: backup/pre-no-functions-20261112. The downloadable package contains the standalone previous release and previous Rules. These are source/configuration backups, not a live database/Auth export.

## Deployment

Extract the entire new ZIP into a new folder. Run DEPLOY-WEB.cmd, not the older Server deployment script. After successful Hosting deployment the script opens the real app with an email-reset release marker. Use Ctrl+F5. No live deployment is claimed from this environment; the authenticated Windows CLI can perform deployment without a billing-plan change.
