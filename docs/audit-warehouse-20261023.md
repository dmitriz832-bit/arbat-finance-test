# Warehouse and material accounting audit — 2026-10-23

Scope: local application code and isolated fixtures. No production database changes, deployment, or real documents were used. Warehouse implementation is inline in `app/index.html`; there is no `app/warehouse.js` in this checkout.

Owned changes: warehouse/FIFO audit adapters and inline warehouse scripts in `app/index.html`, `tests/warehouse-comprehensive-20261023.cjs`, `e2e/warehouse-comprehensive.cjs`, and this report. Finance-core consume eligibility was changed by the finance-methodology agent in response to the independent failing case in this test file.

## Reproduced defects and corrections

| Scenario | Before | Correction / independently asserted result |
| --- | --- | --- |
| Issue materials in project workflow, then create a warehouse receipt | Project workflow wrote storage without refreshing the warehouse closure. A later warehouse save could overwrite the new issue and movements with the older closure. | Project save broadcasts its committed change; warehouse adapter reloads its stored model. Tests assert the issued document and movement become visible to the closure. |
| Direct project consumption without a project issue | Reconciliation and the integrity audit only considered `projectIssueId`. Direct consumption reduced inventory without creating project cost. | Every consumption with a project reference is reconciled. Two units at 10 plus one at 20 produce one expense of 40; repeat reconciliation creates no duplicate. Finance-core also flags a missing linked cost for this movement. |
| Correct the date of a consumption while preserving quantity and cost | Linked expense retained its prior date because only amount, project, note, and valuation status were compared. | Reconciliation compares every generated field, including date and organization. The expense follows the source movement date. |
| Bulk-delete receipt required by a later transfer/consumption | Main cascade and alternate deletion toolbar wrote the deletion without validating the remaining FIFO chain. | Both routes reject a new shortage before writing either store. Tests verify the receipt-dependent transfer remains and storage is unchanged. |
| Delete stock consumption, then save another finance operation | Deletion removed the stored expense but retained it in the active finance model, allowing a later save to resurrect the cost. | Main cascade, alternate deletion commit, and individual movement deletion update the active expense collection as well as stored data. |
| Edit an issue-linked transfer directly in movement journal | Generic editor could change the movement quantity/material without changing its parent issue lines. | Journal directs correction to the source issue instead of opening an independent movement editor. |
| Switch a warehouse document from transfer/return to receipt, or receipt to consumption | Hidden source/recipient fields retained prior values, while validation required those values to be blank. | Operation mode clears the source for receipts, recipient for consumption, and unrelated project reference for other operations. |
| Delete a receipt when the same later movement already has a legacy shortage | Validation compared only warning ID and reason. An existing missing quantity of 1 could grow to 6 without rejection. | Warehouse save/deletion guards also compare missing quantity and reject a worsening shortage. Existing unrelated warnings do not automatically prohibit corrections. |
| Issue five units when two and four units are held at two warehouses of the same organization | Availability showed six units, but issue fulfillment searched only the selected warehouse and warehouses of the other organization; saving failed. | Same-organization warehouse stock is collected first with linked staging transfers. Per-location availability distributes other-project reserves across warehouses once. The exercised issue then closes: consume 3, return 2, FIFO expense 30, no crew stock, no integrity-audit errors. |
| Open warehouse issue commits seven units, then another movement removes two from the crew | The integrity audit checked only `fromCrew` and omitted the warehouse-issued commitment, so it missed the unavailable reserved stock. | Open-issue commitment is checked using the complete issued quantity, consistent with crew free stock and owner warehouse metrics. |

## Verified control scenarios

`node --test tests/warehouse-comprehensive-20261023.cjs` executes production functions extracted from the app, not independently rewritten warehouse formulas. Expected amounts and balances are fixed in the tests.

The 17-case pack covers the reproduced defects plus:

- FIFO cost preservation through receipt → crew issue → partial consumption → return: consumed cost 40, return cost 20, remaining value 40.
- Multiitem receipt correction: total changes from 80 to 110, the payable identity remains the same, an existing payment remains 50, remaining payable becomes 60, quantities recalculate, the original model is unmodified before save, and stale edit baselines are rejected.
- The actual issue and close callbacks, including staging transfers and the real integrity-audit adapter.
- Per-location reserves: six units across three warehouses and another project's reserve of three leave free quantities 0, 1, and 2.

Existing warehouse regression tests additionally exercise exclusion of other crews, cross-organization places belonging to the selected crew, open-issue commitment, closed-issue release, other-project warehouse reservations, and remaining project demand after prior consumption/issues.

## Verification and limits

Latest focused command: `node --test tests/warehouse-comprehensive-20261023.cjs tests/warehouse-regression.cjs tests/two-month-acceptance-seed.test.cjs tests/owner-warehouse-kpis.test.cjs` — 31 tests passed, including the final issue/close callback assertions. All seven inline scripts in the current app HTML also compile with `vm.Script`. The final consolidated repository suite should be rerun after all agents finish.

The latest full `npm test` run during concurrent implementation recorded 390 tests: 387 passed and 3 failed, all in `tests/forecast-routes-comprehensive-model.test.cjs`: `drilldown currency preserves every kopeck above Number safe range`, `dashboard never certifies cash without an actual wallet in selected organization`, and `dashboard certification requires dated opening balance and dated matched bank statement`. These were in progress under the forecast/dashboard owner, not warehouse failures. Exact output is retained at `/tmp/warehouse-comprehensive-suite-final.log`. This remains an intermediate integration result, not a claim that the final full suite is green.

This audit does not establish complete inventory-accounting correctness. The VM tests exercise real callbacks with minimal DOM adapters; they do not substitute for browser interaction, native form validation, keyboard use, or responsive visual checks. Local Playwright browser binaries were unavailable. Added `e2e/warehouse-comprehensive.cjs`: two actual-application flows, each configured for Chromium/WebKit at 390/1440 px. The flows cover multiitem receipt correction with an existing payment, operation-kind switching and successful receipt save, then issue → consume → return → new receipt → reload while preserving the issue and expense. Auth/sync and all non-local requests are blocked. `node --check` passed; the local launch attempt stopped before application execution because the Chromium executable was missing, so these E2E flows still require the parent CI run. Rejected dependent-receipt deletion remains covered by production-function tests.

Unresolved validation areas include multi-tab/concurrent edits, storage quota/failure atomicity across finance and warehouse stores, imported real-world PDF/XLSX parsing, fractional quantity precision over long movement chains, and legacy data reconciliation. Deleting a supplier-paid receipt leaves payment evidence for review rather than silently reallocating the real payment; related payable-review behavior is owned by the finance/payables audit. No production balances were certified or reconciled in this work.
