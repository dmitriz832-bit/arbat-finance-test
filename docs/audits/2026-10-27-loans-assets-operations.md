# Loans and fixed assets operation audit — 2026-10-27

Scope: received loans, explicit repayment reconciliation, monthly interest posting,
fixed asset acquisition settlements, management depreciation, disposal, source
integrity, P&L/dashboard, balance and obligations integration. Baseline supplied
by coordinator: `1a48dad`, tree `200d5b740962af4484fcf54211afe94ddabec154`
(same tree as production main `01bfb784`). Work is local; no production financial
operation, commit or branch movement was performed by this audit worker.

## Findings reproduced and corrected

| Finding | Evidence before correction | Correction |
|---|---|---|
| Future actual loan repayments reduced earlier debt and liquidity | At 2026-01-31, a 2026-02-01 payment of 24 principal + 1 interest incorrectly reduced principal 100.01 to 76.01 | `snapshot(today)` now applies payment reductions only through the selected date; schedule/cash allocation limits still validate all links, including future links |
| Disposal could append an expense with an existing generated identity | Existing unrelated expense `_id=asset-disposal:asset` did not block `postDisposal`; state was mutated into duplicate identity | Reject the collision before expense or posting history mutation |
| Duplicate imported asset identities could be posted, overwritten or removed | `postingIssues` reported no issue; save/post/disposal/remove selected or removed ambiguous cards | Report duplicate identity and reject all four mutation paths atomically |
| Duplicate source cash identity could settle an acquisition | `purchasePosition` selected the first duplicate cash row | Require exactly one cash source |
| Undated acquisition cash could be persisted as settlement | `purchasePosition(data, asset)` without an as-of date reported a known reduced payable and `save` succeeded | Validate cash date independently of optional historical cutoff |
| Scheduled but unposted depreciation silently reduced balance assets without a P&L expense | Asset 100.01 with two elapsed 30.00 months and no costs appeared at 40.01 | Balance now uses cost minus validated actual posted depreciation/disposal; missing months preserve known registered amount but make the position incomplete |
| Future posting corruption poisoned earlier positions | Invalid March asset/loan expense caused February/January balances to become unknown | Cut off both posting manifests and cost sources at the requested date before auditing historical positions |
| Imported orphan generated costs escaped balance review | Costs with missing, duplicate or foreign loan/asset source cards left source positions complete | Exported generatedExpenseSourceIssues adds source drilldowns and marks affected balance components incomplete |
| Disposal could permanently skip prior depreciation expenses | Disposal expensed scheduled remainder even with no prior monthly cost postings | Require each positive prior depreciation month before disposal; fully depreciated zero-value disposal needs no invented zero expense |
| Due interest without monthly P&L posting appeared complete | Due loan schedule interest with no registered interest expense produced a certified interest balance | Keep known schedule remainder visible but mark loanInterest incomplete until the month is posted; explicit opening interest remains exempt |

Each correction was preceded by a failing behavioral test in
`tests/all-operations-loans-assets.test.cjs`. Initial new audit run: 7 pass / 4
fail; extended run exposed the undated-cash issue: 12 pass / 1 fail. Final scoped
run: 91 pass / 0 fail, including 21 new audit cases. Follow-up RED runs exposed five
registered-position failures, two zero-value/duplicate payable boundary failures, and
one missing-interest-posting failure before their corresponding fixes.

## Independent expected amounts

All expectations are literal integer kopecks, not calculated by the production
functions under test. For the fractional-rate fixture, a separate Python
`Decimal` calculation with `ROUND_HALF_UP` produced:

| Payment | Date | Opening principal, RUB | Principal, RUB | Interest, RUB |
|---|---|---:|---:|---:|
| 1 | 2027-12-31 | 123456.78 | 30864.19 | 1782.50 |
| 2 | 2028-01-31 | 92592.59 | 30864.19 | 1336.87 |
| 3 | 2028-02-29 | 61728.40 | 30864.19 | 891.25 |
| 4 | 2028-03-31 | 30864.21 | 30864.21 | 445.63 |

Nominal annual rate is 17.3259%; monthly interest convention is opening
principal × annual percent / 1200. Regular principal is floored to kopecks;
remaining principal cents go into the last payment. Month-end anchor survives
February, including leap February.

For a loan with principal 100.01, opening unpaid interest 4.50 and future schedule
interest 1.00 + 0.67 + 0.33, a real payment of 24 principal + 1 interest leaves
76.01 principal and 5.50 total schedule interest. At January month-end, balance
interest is 4.50 because later scheduled interest is excluded. Explicit January
interest posting adds only 1.00 below EBITDA to P&L. Principal and opening
interest create no P&L expense. Actual cash outflow remains exactly 25.00.
Obligations include 81.51 once; generated interest expense creates no supplier
liability.

For an asset costing 100.01 with residual 10.00 and life 3 months, depreciation is
30.00, 30.00, 30.01; closing carrying value is 10.00 and expense is 90.01. An
explicit supplier amount 120.01 less cash allocation 40.00 leaves payable 80.01,
independent of depreciable cost. Disposal on March 5 after February depreciation
expends 70.01, giving total depreciation + disposal expense 100.01 and balance
asset zero. Actual acquisition cash is not posted again by either operation.

Other tested paths include partial allocations of one payment across two schedule
rows, advance payment of a later interest row, two interest rows in one monthly
accrual, immutable posted interest amounts, missing original payment, cross-register
cash over-allocation, disposal repeated post rejection and preserved deletion
restrictions/history.

## Capability inventory and material limits

| Operation | Supported behavior / limitation |
|---|---|
| Received loans | Manual principal/opening-interest register, manual remaining schedule, optional equal-principal generator, explicit outgoing payment reconciliation |
| Loan funding receipt | Contract save does not create or reconcile an incoming funding receipt; entered principal is a manual liability source |
| Issued loans / interest income | No dedicated lending/receivable register or incoming repayment route; received-loan register must not be used as certification of issued loans |
| Bank schedule conventions | No annuity solver, daily day-count, automatic rate reset, fees, penalty or refinancing register; a user may explicitly enter the contractual schedule and separate appropriate expenses |
| Early or partial payment | Explicit principal/interest allocations reduce only those schedule rows; future interest is not automatically recalculated or cancelled |
| Loan cancel/delete | Editor cancellation discards unsaved changes; no dedicated posted-loan cancellation/deletion API exists in the loan model |
| Asset depreciation | Management straight-line schedule, next-month default, optional explicit start month, residual value and last-cent conservation; tax depreciation is separate |
| Asset acquisition | Manual supplier amount and cash links; commissioning is not proof of acquisition date or pre-service capital investment recognition |
| Asset disposal | Explicit remaining-value expense, disposal month excluded from depreciation; model rejects disposal until prior positive depreciation months are posted |
| Asset carrying value versus P&L | Balance uses cost minus validated posted depreciation/disposal through the cutoff. Missing elapsed schedule months make the position incomplete; asset card retains the separate schedule |
| Sale proceeds / capital improvements | No dedicated disposal-sale income, asset revaluation or improvement/capitalization register |
| Owners | No dedicated contribution, withdrawal, dividend declaration/payment or equity register; balance correctly leaves capital unconfirmed |
| Historical edits | Current contract/cards and current links are used; historic revisions are not reconstructed, as balance discloses |
| Imported orphan expenses | Balance scans generated costs for missing, duplicate and foreign source cards with date/org cutoff. Coordinator can reuse exported `generatedExpenseSourceIssues` in the global scanner; normal guarded deletion protects history |
| Tax flags on generated costs | Initial posts explicitly set tax deductibility false. Tax-recognition updates are not frozen by these source posting audits; validity of explicit tax events is owned by tax audit |

This does not certify production input completeness, independent bank statements,
database authorization enforcement or migration state. Coordinator owns overall
database/live read-only checks and whole-suite verification. No live financial
mutations were performed. Local browser verification used Chromium; WebKit is an
actual CI requirement and was not represented as locally exercised.

## Commands and observations

Baseline:

```sh
node --test tests/finance-core.test.cjs tests/accounting-audit-regressions.test.cjs tests/finance-liquidity.test.cjs
# 64 passed, 0 failed
node --test tests/loan-workspace.cjs tests/asset-workspace.cjs tests/financial-payment-links.cjs tests/financial-register-integration.cjs
# 43 passed, 0 failed
```

Final scoped integration:

```sh
node --test tests/all-operations-loans-assets.test.cjs tests/loan-workspace.cjs tests/asset-workspace.cjs tests/financial-register-integration.cjs tests/financial-payment-links.cjs tests/balance-workspace.cjs tests/finance-liquidity.test.cjs
# 91 passed, 0 failed
```

Browser:

```sh
NODE_OPTIONS='--require=/workspace/scratch/b72655be7787/browser-runtime/preload.cjs' ARBAT_BROWSER=chromium node --test e2e/loan-workspace.cjs e2e/asset-workspace.cjs e2e/asset-deletion.cjs
# 3 passed, 0 failed (13.2 seconds)
NODE_OPTIONS='--require=/workspace/scratch/b72655be7787/browser-runtime/preload.cjs' ARBAT_BROWSER=chromium node --test e2e/loan-workspace.cjs e2e/asset-workspace.cjs
# Rerun after final undated-cash correction: 2 passed, 0 failed (3.4 seconds)
node --check app/loan-workspace-model.js
node --check app/asset-workspace-model.js
git diff --check
# All exited 0
```

Browser paths exercised cancel/save, reload, explicit partial repayment, creating
and linking existing monthly interest, stale revisions and cash fingerprints,
asset confirmed posting, permission/closed-period bridge rejection, mobile
layout, and real asset deletion through the guarded bridge with durable backup.


Follow-up browser verification of registered balances and source review:

```sh
NODE_OPTIONS='--require=/workspace/scratch/b72655be7787/browser-runtime/preload.cjs' ARBAT_BROWSER=chromium node --test e2e/all-operations-loans-assets.cjs e2e/balance-workspace.cjs e2e/asset-workspace.cjs e2e/loan-workspace.cjs
# 4 passed, 0 failed (3.9 seconds)
```

New reusable interfaces:

- `asset.registeredPosition(data, asset, asOf)` returns registered carrying value,
  posted depreciation/disposal, separate scheduled depreciation, missing months,
  and integrity issues. Corrupt posted sources return unknown carrying value.
- `balance.generatedExpenseSourceIssues(data, {org, today})` returns source-cost
  issues with `{message, collection, id, sourceId, sourceCollection, components}`
  for overall scanner reuse. It does not mutate input.

Baseline expectations which treated scheduled depreciation as posted financial
fact were updated to assert registered amounts and incomplete positions. Disposal
fixtures now explicitly post prior monthly expenses before testing disposal.
