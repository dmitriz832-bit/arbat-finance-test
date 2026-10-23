# Payroll, employee and production audit — 2026-10-23

Scope: local source in `arbat-finance-ux-v3`; accountant/payroll and production workflows. No live database writes, cloud publications, bank operations or employee communications were performed.

## Method and evidence

The audit executed the actual inline handlers in isolated Node VM contexts, using explicit document and employee fixtures. Monetary assertions use independent expected amounts in integer kopecks; they do not derive expected values from the implementation under test. DOM substitutes expose only the browser APIs needed to execute each handler. New failing tests were run before the corresponding fixes.

New regressions: `tests/payroll-comprehensive-ui.cjs` (33 cases) and `tests/payroll-comprehensive-core.cjs` (6 cases). The core changes were coordinated with the finance-methodology owner.

## Reproduced defects and corrections

| Severity | Trigger and previous result | Correction |
| --- | --- | --- |
| High | A recovered legacy expense without `projectKey` crashed startup at `expenses.map(e=>[e.date,e.projectKey.split(...)]`. The same unguarded display pattern existed for realizations and production work. | All four project-label rendering paths tolerate an absent key and display “Без проекта · Требует сверки”. Three executable renderer regressions cover the missing-key cases. |
| High | Bulk-delete an employee with salary accruals: both employee and accruals disappeared. Cash, allocation, work-act and settlement links also failed to prevent deletion. | Bulk deletion stops before confirmation, backup and mutation when employee history exists. The notice directs the operator to the inactive employment status. |
| High | Delete an employee referenced only as historical work lead or in leave history: the person disappeared. | Single and bulk deletion protect lead-only work references and leave history as well as existing payroll links. Unused employees remain removable, and their crew references are cleared. |
| High | Change only a work note after crew membership or price changed: historical participants and stored rate were overwritten. | Unchanged crew identity preserves the original member and lead snapshot. Unchanged price identity preserves stored price fields. Explicit selection of another crew or price still works. |
| High | Re-save a production batch after crew/price updates: historical rates and participants changed, notes disappeared, and new work IDs broke existing references. | Batch rows carry their original work IDs. Existing row IDs, notes, participant snapshots and selected stored rates survive edits. New rows use new IDs and current eligible crew data. |
| High | Click an individual production work row: `editWork` was undefined. | Row action opens the existing work editor. |
| High | Pay an installer through an explicit payroll cash allocation: the production settlement report showed zero paid. | Production report uses the shared payroll reconciliation engine, including original cash payroll payments, explicit allocations and legacy settlements with their established precedence. The existing all-dates payment scope is stated in the report. |
| High | Add a legacy settlement to cash that already has explicit payroll allocations, or to a non-salary cash payment: binding was saved but ignored by payroll reconciliation. | Handler rejects these combinations and points to the cash document. Settlement amounts are validated and totaled in integer kopecks. |
| Medium | Save work against inactive/empty crews, missing crew members, a missing date or infinite quantity. | New work validates active production employees, the crew lead, finite positive quantity and a date. Historical edits preserve valid historical snapshots even after employees leave. |
| Medium | Reopen a batch: saved acts have `priceName`, while the label helper read `name`, yielding “undefined”. | Label helper accepts the stored work name. |
| Medium | Reopen a historical work after its catalog price was removed: saving was blocked. | An unchanged historical price label can use the stored price snapshot. |
| Medium | Two lines of quantity 0.005 at 1 ruble: line amounts round to 0.01 each, but the batch footer showed 0.01 instead of 0.02. | Batch and journal totals sum rounded line amounts through the same exact work-amount primitive used by payroll expenses. |
| Medium | Select one organization in the production settlement report: accruals from both organizations remained. | Accrual and cash report data obey the selected organization. |
| High | Price adapter ignored an explicit document date; a stale batch date could select a different price version. A date before the first valid version fell back to the current rate. | Price adapter forwards the document date. Single-work and batch lookup supply their own dates. Missing effective versions return no price. |
| High | Imported malformed salary amount or payroll allocation crashed reconciliation or the payment exception register. | Shared core emits an issue and keeps valid employee data calculable. |
| Medium | Employee terminates Jan 10; a Jan 9–15 leave interval counted seven valid leave days. | Shared core flags leave after termination and excludes the invalid interval from used leave. |

## Validation

- New payroll suite: 39/39 passed.
- Final combined payroll, leave, employee-history and payroll RPC regression run: 69/69 passed.
- `node --check app/business-system.js` passed.
- All seven inline scripts parsed using `vm.Script`.
- Full `npm test` after the first CI feedback corrections: 408/408 passed. Browser CI rerun remains required.

## Limits

This is executable local source validation, not a completed browser acceptance session or a database RPC execution. Browser layout, keyboard interaction, real authenticated employee visibility, live SQL results, and persisted round trips require the parent integration/browser checks. Existing SQL payroll access/remainder regression tests passed, but this audit did not call the live payroll RPC.

Tax/deduction amounts and leave-entitlement rules were checked for arithmetic consistency against the application's current model. This audit does not establish statutory payroll or employment-law compliance. Work-identity preservation prevents future batch edits from orphaning links; previously orphaned production records require an evidence-based reconciliation of actual stored data.


Итог интеграции: 409/409 Node, 20/20 браузерных сценариев и PostgreSQL CI прошли. Подробности и общие ограничения — в [итоговом отчёте](comprehensive-audit-result-20261023.md). Промежуточные числа выше относятся к ходу отдельного направления.
