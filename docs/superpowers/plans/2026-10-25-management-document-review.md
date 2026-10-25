# Management accounting with pending documentation

User approved the transparent alternative: actual organization ownership, cash wallet 0000, full management reports, pending tax review and documented intercompany stock movements. No fictional tax-free entity, no automatic exclusions or rate changes.

- [ ] Reuse deal taxMode=review as documentation status; add pure review/link validation helpers and tests proving management amounts and tax amounts never change merely because of this marker.
- [ ] Surface pending documentation in deals and existing tax review, including both parties of intercompany stock movements. Preserve all current tax arithmetic and recognition evidence.
- [ ] Add project selection during cash creation (reuse it in generic editing without duplicate field names), and a wallet 0000 form shortcut requiring actual owner and opening balance.
- [ ] Show stock-owner availability during project issue, require an explicit reference for actual intercompany movements, and retain that reference on linked movements and issue document. Never create movements to an internal/tax-free organization.
- [ ] Test full cash/project/expense/realization/payroll/FIFO activity on isolated fixtures, pending/complete toggle, reload, wrong-owner validation and intercompany basis; Chromium/WebKit phone/tablet/desktop.
- [ ] Independent review, all CI green, merge and deployed-file hash verification. No production financial documents changed for tests.
