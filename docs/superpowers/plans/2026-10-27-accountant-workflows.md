# Accountant workflow corrections

> **For agentic workers:** Use systematic-debugging and test-driven-development for each independent correction. Root integrates and requests a fresh read-only whole-branch review.

**Goal:** Allow accountant to pay accrued employee balances, retain and correct receipt project/supplier links, show suppliers in document journals, compact selection columns, and delete mistaken unused assets.

**Architecture:** Extend existing native payment and receipt flows and guarded asset bridge. Keep cents-based ledgers, shared CAS synchronization, source identities and closed-period checks. No replacement registers or production fixture writes.

**Spec:** User feedback in this conversation, 27 October 2026.

## Constraints and review focus

- Payroll payout uses remaining net balance for selected employee and organization, including prior partial/multi-employee allocations and deductions; it is cash settlement, never another expense.
- Receipt import retains selected deal and supplier through preview, save and history. Multi-line receipt edits retain group and row identities, validate touched FIFO dependencies and all affected dates, and reject stale snapshots/roles.
- Accountant may correct permitted legacy receipts without invented ownership restrictions. Existing server RLS and period checks remain.
- Delete unused assets only; posted depreciation or linked payments require correction/disposal or unlinking first. Confirm once, await a verified durable backup before save, preserve guards across awaits.
- Selection columns use a compact 44px track and never inherit generic action-column minimum/stretch or oversized saved selection width; actual data columns retain settings, filters and sticky behavior.

## Tasks

- [x] Payroll: reproduce missing payout action, add contextual payment through existing DDS form, test accountant role, partial/repeated payments and organization scope.
- [x] Receipts: reproduce missing link/edit/supplier, correct shared import/native create and whole-document editor, test project/supplier save and reload, FIFO dependency and stale/closed-period checks.
- [x] Assets: reproduce real backup/guard integration failure, fix owned deletion and model dependencies; add server deletion integrity guard with isolated PostgreSQL regression.
- [x] Tables: measure selection width and saved overrides on phone/tablet/desktop; correct native and enhanced grids.
- [ ] Integration: run full unit suite, targeted browser and PostgreSQL guards, fresh review and broad CI; publish and verify deployed content under user's continuing publication authorization.

## Findings

- Native payroll reconciliation was read-only; generic payment navigation did not populate employee, organization or payable balance.
- Receipt importer wrote dealId as empty; sync rebuilt project options without retaining selection; existing row editor did not edit a grouped receipt's shared metadata.
- Asset bridge used an unrecognized synchronous backup checkpoint and asynchronous delegated deletion outlived its global ticket. The bridge now owns and awaits durable backup for its explicitly marked deletion flow.

## Review and verification evidence

- Fresh independent integration review found three important cases: payouts from uncertain prior allocations, receipt payment-terms bypass, and silent historical supplier clearing. All reproduced with failing regression cases and corrected. Payout rechecks eligibility at open and submit; receipt terms share correction/role/period/stale checks; missing supplier/project options remain explicit and unchanged references survive note edits.
- 764/764 unit tests and 15/15 focused Chromium accountant workflows pass in the integrated working tree. Original warehouse, payroll, asset and table regressions also passed in agent verification. Independent tax Decimal oracle remains green.
- Asset deletion regression runs the real app/confirmation/bridge/backup and checks one verified complete before snapshot, cancel, closed periods, stale actor/data, posted history and both direct/reverse payment references.
- SQL regression reproduced absence of server asset-removal integrity protection, then passed using temporary fixtures and ROLLBACK. No live financial records were written. Migration20261027085319 is prepared and covered by CI.
- Server migration applied successfully with a longer synchronous tool wait (the default yielded request state expired). Deployed version20261027085319 matches the repository filename. Read-only verification confirms one active trigger, security invoker, and no authenticated direct EXECUTE permission. No live financial records changed.
- Broad CI and publication verification pending at this commit.
