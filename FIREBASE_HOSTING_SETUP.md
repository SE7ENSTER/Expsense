# SLG Expense — Firebase Hosting

Target URL: `https://slg-expense.web.app` (pending successful site reservation).
Project: `expsense-cf0a5`. Hosting site: `slg-expense`. Static source: `docs/`.

The existing Firebase Auth and Firestore configuration stays in place so both hostnames use the same accounts and report records. Do not rename or recreate the database project. The GitHub Pages deployment remains available during verification.

## First publication

1. Authenticate the Firebase CLI with a project-management account.
2. List Hosting sites and confirm ownership if `slg-expense` already exists. If absent, create it using `firebase hosting:sites:create slg-expense --project expsense-cf0a5`. A missing public website is not proof that the name is available. Do not select a different name silently if the requested ID is taken.
3. Run `node tests/check-production.cjs` and the existing test suite before publishing the exact source.
4. Publish only Hosting: `firebase deploy --only hosting --project expsense-cf0a5`. The command deliberately excludes Firestore Rules.
5. Confirm the returned live URL and compare served HTML/JS/CSS to this source. Verify app sign-in and report access. For redirect-based sign-in or email actions, inspect Firebase Authentication authorized domains and authorize the new owned hostname if needed. Keep `firebaseConfig.authDomain` at the existing project domain unless the authentication flow requires a reviewed change.

Firestore Rules have their own approved release and backup; their deployment must be verified separately. Do not report them deployed based on a Hosting success.

## Recovery

The source before Hosting setup is preserved at GitHub branch `backup/pre-firebase-hosting-20261110`, commit `d3355b1da468960837b6892eb43520ffb6e61598`. The independent pre-Rules backup is stored as `SLG_Expense_Pre_Deploy_Backup_20261110.zip`. No database migration is needed for this hostname change.
