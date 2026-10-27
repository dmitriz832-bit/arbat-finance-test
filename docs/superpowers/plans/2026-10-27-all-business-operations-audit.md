# Complete available business-operation audit

**Goal:** Independently verify financial rules, exact arithmetic and document-to-report propagation for every active operation exposed by ARBAT FINANCE, and fix reproduced errors.

**Baseline:** Local1a48dad / deployed01bfb784bcd9db546d3a276d0ba729c97a0fe31f; exact tree200d5b740962af4484fcf54211afe94ddabec154. Preserve existing workbook/data/roles/closed periods, retired BDDS/BDR/paymentRequests remain inactive. Test fixtures are isolated; live snapshots read-only.

**Method:** Inventory active native forms and workspace commands. Each domain adds independent literal/Decimal controls at document checkpoints rather than comparing two callers of the same helper. Check both organizations, cents/quantities, month/quarter boundaries, partial/repeated/cancelled/edited operations, old and new dates, source IDs, unknown values, role/CAS and deletion constraints. Confirm UI/report/card/drilldown equality on the same sources.

## Domain tasks

- [ ] Cash/wallet opening/bank import/reconciliation/transfer/customer and supplier debt/refunds/liquidity.
- [ ] Warehouse opening/receipt/import/edit/transfer/reserve/crew stock/consumption/return/issue closing/FIFO/source deletion.
- [ ] Payroll manual and approved production accruals/crew allocation/deductions/contributions/cash settlements/profile RPC/organization separation.
- [ ] Deal full plan/remaining forecast/realizations/corrections/project actual/WIP/P&L/directions/report drilldowns.
- [ ] VAT/USN/profit-tax source classification, dates, rates, deductions, advances/refunds, effective threshold policy, quarterly/annual controls against primary official guidance.
- [ ] Loans/principal/interest/partial repayments/assets/purchase/depreciation/disposal/dependencies/balance links.
- [ ] Root: balance and retained-result reconciliation, orphan source scanning, actual read-only state quality, integration and complete existing unit/browser/business/SQL suites.

## Evidence and finish

Every domain writes docs/audits/2026-10-27-*-operations.md (cash-debt short filename permitted) with operation, independently expected result, actual result, destinations, tests and gaps. Reproduced bugs have RED→GREEN evidence. Root reviews and integrates scoped unique patches, runs the full suite and isolated multi-month browser business cycle, requests independent review, applies required tested migrations, publishes and verifies deployed runtime bytes. Final audit report distinguishes supported/tested operations from unsupported registers and incomplete user source data; do not promise exhaustive absence of errors or tax filing certification.
