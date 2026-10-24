# Final tax reconciliation

Scope: verify current main independently; repair demonstrated discrepancies without changing real documents.

- [x] Independent Python Decimal oracle for four quarters, both organizations, prior-year advance 20% and shipment 22%, partial deductions/refund, profit tax and annual minimum USN.
- [ ] Fix three failing controls: VAT on post-shipment AIR customer payments; ambiguous same-day ENS statements; combined cash allocation across tax/advance registers.
- [ ] Regression acceptance: document editor/reload, two clients, closed periods; disposable PostgreSQL budget and audit checks.
- [ ] Verify production guard in temporary Supabase tables inside rollback-only transactions. No paid branch and no real state writes.
- [ ] Run full CI, review fixes, merge only green, compare published files, issue audit/readiness report with remaining data prerequisites.

Initial result: all four quarterly controls match; three boundary scenarios fail. Oracle fixture is tests/fixtures/tax-independent-control.json. Source rules: FNS https://www.nalog.gov.ru/rn77/taxation/taxes/nds_usn/ and https://www.nalog.gov.ru/rn77/taxation/taxes/nds/.
