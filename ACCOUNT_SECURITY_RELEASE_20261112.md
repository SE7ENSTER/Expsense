# EXPENSiO account security release — 12 November 2026

## Behavior

- User Management now says **Save role**, enabled only after a role changes. A self-role change signs the actor out.
- Admin can send the existing Firebase reset email or generate a random 32-character temporary password for another active password-provider user. A confirmation names the account; a one-time dialog provides Copy. Closing or signing out clears the field. No password is stored in localStorage, Firestore or audit logs.
- Temporary credentials expire after 24 hours. They only permit the password-change screen. New passwords require 12–128 characters with upper/lowercase, a number and a symbol, and must differ from the temporary password. A fresh sign-in is required afterwards.
- Server verifies a non-revoked ID token and current active Admin role. Private accountSecurity state plus a required token version blocks old and temporary sessions from business collections. Password operations use transaction locks, a ten-second cooldown, a private audit and fail closed on partial Auth/Firestore failures. Regenerate to recover a failed operation.
- **Apply EXPENSiO email branding** patches only the reset template: sender display name `SLG EXPENSiO`, subject/body `EXPENSiO`. It preserves the existing sender address/domain and Auth providers. The button confirms only after Firebase returns the matching template; insufficient configuration permission has a specific error. This action has not been performed on the live project.

## Admin Reject issue

The release Rules passed a real emulator test for an atomic Admin rejection plus approval log. The live error screenshot alone does not establish its cause: deployed Rules, live account role and report schema have not been verified. Changes address two reproduced edge cases:

- Every review transaction checks the actor's current Firestore role before writing, giving a useful sign-out/sign-in message if access changed.
- Manager/Admin may reject or request revision on an incomplete legacy Submitted report without changing financial/identity fields; approvals still require a valid report. Tests deny using that exception to change amounts.

## Validation

Local: 98 application tests; 3 server/template unit tests; 69 Firestore Rules checks; 15 actual-client workflow scenarios; 34 Auth+Firestore account-security scenarios all pass. Production import graph: 35 files.

The security scenarios cover unauthorized/non-Admin/self/disabled/mismatched-email resets, concurrent resets, cooldown, expiry, weak/reused passwords, forced change, old sessions, private-state denial, no retained plaintext and fail-closed Auth failure. All accounts/data are synthetic in demo projects. No real user password was changed.

Local Functions emulator workers could not open their Unix socket (EPERM). The same scenario script supports a direct service-core mode against real Auth/Firestore emulators, used locally. The added GitHub CI job runs the actual callable wrapper with all three emulators on Node 22/Java 21. Check that job before publishing.

## Deployment and rollback

Backup branch: `backup/pre-account-security-20261112` at `ec8f3390920f8cbf4c7be45dfadfe27b36f160ea`. The download contains a standalone previous-release ZIP and previous Rules. These are source/configuration backups, not a live database/Auth export.

Functions require the Firebase Blaze billing plan and suitable service-account IAM. This release does not change the project's billing plan or grant IAM roles automatically. Use Node 22 LTS on the deployment computer. No account is authorized in this environment, so live Hosting, Rules, Functions and template settings are not claimed deployed.

Extract the ZIP to a new directory and run DEPLOY-WEB.cmd on the Windows computer with Firebase CLI login. The script installs pinned server dependencies and deploys Rules, four named Server functions, then Hosting; each stage stops on failure. Do not deploy Hosting alone: new login depends on the status function. Failure before Hosting leaves the prior frontend in place; the new Rules have no security record for existing users and remain compatible.

After success, sign in as Admin, open User Management and apply email branding. Verify a reset email in Inbox/Spam, selected account name, forced password change, and an Admin Reject against a designated test report. Creating a real reset invalidates that user's credentials; do not reset other users simply to smoke-test.

If rolling back before any temporary reset, use the included prior-release script. After temporary resets exist, do not deploy old Rules that omit the security gate: retain current Rules/Server and restore only the prior frontend until the affected accounts are recovered. No automatic rollback removes account security state.
