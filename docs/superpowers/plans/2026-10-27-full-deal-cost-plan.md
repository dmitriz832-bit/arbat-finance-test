# Automatic full deal cost plan implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Automatically populate Plan/Actual income and expenses from the complete goods and work composition, without needing execution documents.

**Architecture:** Add a pure plannedBudget(data, deal, warehouse, fifo) aggregate to the existing project model. It prices full quantities and overrides only categories represented by composition; explicit ancillary budgets remain. All planned displays consume the same calculation. Actual ledger and remaining-cost forecast remain separate.

**Tech stack:** Existing JavaScript UMD model, native forms, node:test and Playwright.

**Spec:** User's clarification of point 13 in this conversation: quantity of every good times warehouse acquisition cost, quantity of every service times current work rate, automatic plan population. Execution is not required.

## Global constraints

- No financial record writes on read, refresh, warehouse movement or cloud notification. Automatic fields are derived; only user-entered fields use the guarded native save.
- Full plan quantities never subtract executed work, consumption or payments. Warehouse FIFO available lots value the full goods requirement; shortage uses latest same-organization receipt price, explicitly labelled as an estimate. Zero acquisition prices remain unpriced.
- Explicit receipt VAT metadata determines deductible input VAT treatment; do not infer it from organization. Missing historical VAT metadata preserves source gross price with a visible source label. Ambiguous or incomplete explicit VAT metadata requires review.
- A position without price/quantity keeps category and total unknown, with priced part and source shown. Never present a partial plan as complete.
- Material requirement from warehouse plan is authoritative; otherwise use deal-plan material rows matched by stable identity or unique name/unit. Services use deal-plan items and current catalog rates (row rate fallback).
- Preserve manual budgets if composition absent, manual ancillary categories if composition present, original-estimate red extra-work markers, actual rates, WIP, tax, CAS, actor and closed-period guards.

## Review focus

- Partial composition / missing prices must not reuse a stale manually saved total to conceal missing automatic costs.
- Repeated materials aggregate quantities; same names across organizations and ambiguous work prices never cross-match.
- A full consumption / approved work act must leave planned quantities unchanged.
- Manual ancillary drafts survive source refresh; automatic values refresh without dirtying a form or silently writing records.
- Unknown plan in dashboard, profitability and expense summary must remain unknown rather than becoming zero.

### Task 1: Pure full plan valuation

Files: app/project-workspace-model.js; tests/project-cost-plan.test.cjs; tests/project-forecast.test.cjs.
Interface: plannedBudget(data, deal, warehouse={}, fifo) returns existing budget shape plus automatic, lines, knownTotal, unknownCount; rows have automatic and unknownCount.

- [x] Write failing tests through snapshot().budget for full quantities (10 work × 100 + 10 materials × 50 = 1500), independence from facts, missing/ambiguous pricing, organization, VAT and ancillary budgets.
- [x] Run node --test tests/project-cost-plan.test.cjs; expect old manual total 900 vs required 1500.
- [x] Implement pure valuation and integrate snapshot budget; keep forecast based on original manual budget to avoid changing forecast semantics.
- [x] Run all model tests and update previous budget expectations to corrected automatic behavior.
- [x] Commit model and tests.

### Task 2: Auto-populated UI and consistent planned views

Files: app/project-workspace.js; app/index.html; app/dashboard.js; e2e/project-feedback-19.cjs.
Consumes plannedBudget from Task 1. Automatic category fields and overall cost show derived values, read-only and excluded from saves; manual supplementary fields retain native save. Add a primary Plan/Actual table with full planned income/cost/result and line quantities/prices/sources; retain forecast in secondary details. Dashboard, profitability and expense summary derive the same total, including nulls.

- [x] Add browser assertions for initial full plan 2100, auto fields, rate refresh 2500, supplementary transport 50, save/reload and no automatic persistence; expect existing manual budget to fail.
- [x] Run targeted browser test and inspect expected failure.
- [x] Implement UI, refresh and consumer changes; bump cache versions and load model before dashboard.
- [x] Run project browser tests, full node suite, syntax, diff check and tax oracle. Review on desktop/mobile screenshot.
- [x] Commit, fresh whole-branch review and fix important findings with regressions.
- [ ] Publish under existing user authorization and verify deployed content.

## Execution evidence

- RED: full-plan unit contract saw old total 90000 kopecks instead of 150000; all ten new cases failed before implementation. UI initially lacked a full-plan summary.
- GREEN: 749/749 unit tests; project composition browser acceptance at 375/1440; existing manual-budget acceptance at 375/768/1440 and actor/stage guards pass in Chromium.
- Existing forecast remains secondary, with its original manual baseline, so its actual-plus-remaining behavior is preserved.
- Automatic category fields and cost are excluded from native form saves; the native parser now respects absent cost, retaining the legacy/manual source value. No schema or database writes are introduced.
- Fresh read-only review found estimated FIFO masking explicit zero acquisition price, contradictory source VAT totals, and automatic refresh dirtying untouched forms. Each reproduced RED, fixed, then GREEN. Source VAT totals now validate before planned net valuation. Derived fields retain stable manual baseline values for discard detection.
- Review transparency finding: priced portions inside a partly unknown material line are retained even when the unpriced lot comes first. Total remains unknown. This implements the specified priced-part contract.
- Full suite after fixes: 752/752. Five targeted Chromium browser suites passed, including source-only price refresh then close without discard at 375/1440, existing manual budgets at 375/768/1440, cloud/identity and stage guards, project overview and owner dashboard.
- Visual QA caught the new primary summary being hidden by legacy global section CSS; visible-browser regression failed before changing its wrapper to a div. Summary now precedes supplementary fields.
- No deferred code findings. Production data/deployment and broad CI are verified separately, no production financial fixture writes.
- Pending full CI/publication verification.
