# User feedback implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the assigned task with regression checks.

**Goal:** Complete all 19 requested corrections without changing the meaning of actual accounting.

**Architecture:** Extend existing native editors and pure models. Independent work is partitioned by files/functions; shared index edits use exact scoped anchors. Root integrates and reviews.

**Tech Stack:** Native JavaScript, HTML/CSS, Node tests, Playwright, existing Supabase guards.

**Spec:** `docs/superpowers/specs/2026-10-27-user-feedback-19-design.md`

## Global Constraints

- Preserve precision, source identity, authorization, closed periods, backups and CAS.
- No production financial record modifications during tests.
- Stored disabled budgets/requests remain intact but contribute no calculation effect.
- No invented zero for missing cost/price/opening context.
- Do not modify another worker's code or revert unrelated changes.

## Review Focus

- Filtered editable/source tables retain source IDs; row positions never remap records.
- Price changes/extra work/returns update forecasts without posting extra actual expense.
- Multi-material topup is all-or-nothing and protects reserves and old periods.
- Threshold effective dates preserve prior periods and cross-year defaults.
- Opening positions and disabled request aliases do not create phantom flow or debt.

## Tasks

- [x] Tables and general UI (1,3,4,10,12,16,17): inspect enhancement lifecycle and delegates; reproduce browser cases; implement ellipsis, funnel filters/chips, header alignment, expense containment, brand home and tooltip pruning. Verify tables rerender/filter/reset, mobile widths and source opening.
- [x] Warehouse workflow (9,11,15, warehouse part19): inspect reservation/topup/picking and guards; reproduce; implement grouping and compact multi-item workflows with atomic availability validation. Verify aggregate stock and partial failure unchanged.
- [x] Taxes and openings (8, tax/cash/loan/assets part19): inspect threshold and opening date logic; failing date/organization/precision cases; implement effective policy configuration and justified corrections; verify historic/current calculations and opening non-flow semantics.
- [x] Projects (5,13,14): trace identity and plan/actual sources; failing realization title/remaining forecast/extra-work cases; implement pure forecast and project display, preserving explicit baseline and actual ledger. Verify rate/receipt/work/return changes and missing-price state.
- [x] Production (6,7, production part19): reproduce batch creation and price checkbox injection; remove unnecessary row/selection without removing actual work controls; verify batch save/edit and payroll balances.
- [x] Root integration (2,18): preview amount classes/control alignment; remove budget/request surfaces and all request-derived computation. Regression tests for old stored requests/aliases and source integrity.
- [ ] Independent review, complete suites, browser responsive QA, migrations if required, commit/PR/publish, verify deployed files.

## Integration evidence

739/739 full unit tests and independent Decimal controls pass. Final targeted Chromium run12/12 passes. Independent review findings fixed with RED→GREEN tests: stale plan IDs, unverified wallet initial classification, missing reverse request alias ownership. Server policy/opening guard verified on real PostgreSQL using temporary isolated tables/functions and ROLLBACK; no production records changed. Full CI remains publication gate.
