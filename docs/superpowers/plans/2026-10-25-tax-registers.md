# Tax registers implementation plan

Goal: explicit customer advance VAT and confirmed tax obligation reconciliation in the existing application.
Architecture: pure tax-register-model.js consumes existing cash/realizations and two new event collections; tax-registers.js provides an editor from the tax drilldown. Existing CAS sync, attribution and period locks apply. No financial documents are rewritten.
Constraints: integer kopecks; preserve historical VAT rates; no inferred ENS allocation; test only isolated fixtures; preserve light UI and RLS.
Decision: use explicit event records rather than infer advances from payment order, because existing payments lack enough classification/evidence.

- [ ] Pure advance register: receipt, partial offset, refund; validate references, organization, dates, evidence, duplicate IDs, payment/realization budgets, chronological balances and exact residual rounding. Cross-year rates remain those of the advance.
- [ ] Confirmed obligation register: opening debt/credit, accrual, cash payment/refund, confirmed ENS offset and separate ENS balance. Group by organization/tax/tax period. Unconfirmed records produce issues rather than obligations.
- [ ] Integrate advance VAT into quarter snapshot without duplicate shipment VAT; retain review warnings for unclassified payments.
- [ ] Existing tax drilldown: editable registers with searchable document choices, validation, reload persistence, conflict protection and deletion. Add event collections to author attribution.
- [ ] Server migration: old/new dates and tax periods locked; event changes audited. Preserve grants and RLS. SQL disposable tests.
- [ ] Chromium/WebKit phone/tablet/desktop acceptance; full unit and CI; inspect failures; merge only green. Apply reviewed migration, synchronize its actual version and verify published assets and unchanged production payloads.

Review focus: one payment split across advances; one shipment offsets several advances; penny rounding on partial offsets; deleted referenced documents; simultaneous editing and period closing between preflight and RPC.
Sources: https://www.nalog.gov.ru/rn25/news/activities_fts/16590316/ and https://www.nalog.gov.ru/rn75/news/activities_fts/16594787/ (advance deduction retains original accrued VAT, including transition 20% to 22%).
