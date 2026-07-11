# ExpenseFlow v0.28.2 Stabilization UAT

Production remains on v0.28.1. Test UI: `docs/staging-v282.html`. Candidate rules: `firestore-v282.rules`.

## Test accounts
- User
- Manager
- Finance
- Admin

## User tests
- [ ] Save valid Draft
- [ ] Submit valid Draft
- [ ] Required-field validation blocks incomplete submission
- [ ] Item date outside report period is blocked
- [ ] Zero/negative amount or FX is blocked
- [ ] Submitted report opens read-only
- [ ] Revision Requested report can be edited and resubmitted
- [ ] Approved/Processing/Reimbursed/Closed reports remain read-only
- [ ] Total is labelled HKD

## Manager tests
- [ ] Submitted reports load in Management Portal
- [ ] Review and receipt views open
- [ ] Approve works
- [ ] Reject requires comment
- [ ] Revision Requested requires comment
- [ ] Manager cannot alter expense details through rules

## Finance tests
- [ ] Manager Approved reports load
- [ ] Processing action writes canonical `Reimbursement Processing`
- [ ] Reimbursed requires payment reference
- [ ] Finance cannot alter expense details through rules

## Admin tests
- [ ] All reports load
- [ ] User creation profile write is allowed
- [ ] Role changes work
- [ ] Budget save works
- [ ] Used includes Manager Approved, Processing, Reimbursed and Closed
- [ ] Pending includes Submitted only
- [ ] Available equals Budget - Used - Pending

## Data integrity
- [ ] Existing report number cannot be changed by User/Manager/Finance
- [ ] User ID and Created At cannot be changed
- [ ] Legacy Finance Processing remains readable
- [ ] New processing writes use Reimbursement Processing
- [ ] Approval and payment logs are created

## Rollout gate
Do not replace production rules or index until all critical tests pass. Publish `firestore-v282.rules` first only in a staging Firebase project or Rules Playground. After approval, deploy UI and rules together.
