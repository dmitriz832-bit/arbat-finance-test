# Tax document fields implementation plan

> Execute natively in the current repository; the user explicitly authorized implementation and progress reporting.

Goal: accountant can complete tax evidence in existing documents and see updated audit reasons without re-entering the transaction.

Architecture: shared tax-field module adds a collapsible group to existing forms; record editors hydrate only saved values. Existing save, concurrency and sync remain authoritative. Receipt tax metadata is per line. No tax confirmations are inferred.

1. Expand validation tests: context-specific fields, impossible dates, VAT evidence, net profit cap, payroll contributions, zero/partial recognition, clear confirmations, no mutation.
2. Add conditional fields to DDS, project/general expenses, realizations and payroll; hydrate editor, validate before save, check old/new recognition dates against closed periods.
3. Add per-line receipt VAT and evidence using editReceipt's existing concurrency, FIFO and payment guards. Do not change historical FIFO valuation.
4. Add a server guard for changes affecting recognition/deduction months; verify with transactional rollback tests.
5. Extend actual browser acceptance: open issue, correct, save, reopen/reload, verify exact calculation and removed reason; phone/desktop Chromium/WebKit. Check invalid/closed/concurrent edits preserve input.
6. Run full suite, independent review, PR checks, publish and compare live assets.

Constraints: AIR USN 15%, ARBAT profit25/VAT22; no new organization. No automatic evidence or data migration. Missing evidence may remain pending. Multiple recognition events and advance VAT remain separate work.
