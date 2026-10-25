# Guided tax entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce repeated tax entry in document cards and linked event registers.
**Architecture:** Pure proposal helpers prepare existing fields; explicit UI actions apply them to unsaved forms. Existing persistence, validation and calculation contracts remain unchanged.
**Tech Stack:** JavaScript, Node test runner, Playwright Chromium/WebKit, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-10-25-tax-guided-entry-design.md

## Global Constraints
- Money in integer kopecks; no tests write production documents.
- No implicit confirmation or alteration of historical evidence.
- Preserve CAS, Auth/RLS and closed-period protection.
- Light responsive UI, no colored monetary backgrounds.

## Review Focus
- Edited gross/rate/date must update proposals without silently rewriting evidence.
- Existing partial events and exclusions must reopen intact.
- Cash payment purpose must not become evidence of receipt of goods.
- Selecting another source must refresh only proposed values, with explicit partial overrides preserved.
- Cloned generic forms and keyboard/mobile use must work without duplicated field names.

### Task 1: Guided document confirmation
Files: app/tax-document-fields.js, app/tax-document-fields.css, tests/tax-document-fields.test.cjs, acceptance/tax-audit.cjs.
Interfaces: proposal(row,collection) -> {prefix,date,amount,document}|null, no mutation; existing hydrate/validate remain compatible.
- [ ] Add failing proposal tests for net VAT, payroll, missing/invalid data, cash evidence and immutability.
- [ ] Run focused tests, implement proposal and compact confirmation UI; leave manual overrides in nested details and events in separate details.
- [ ] Update browser scenarios to use explicit advanced/partial controls and add one-action confirmation, no-side-effect preview, persistence and invalidation scenarios.
- [ ] Run unit suite and commit.

### Task 2: Linked register entry
Files: app/tax-register-model.js, app/tax-registers.js, app/tax-document-fields.js, acceptance/tax-registers.cjs, tests/tax-register-model.test.cjs.
Interfaces: sourceProposal(data,mode,event) -> patch for unsaved form, no confirmation. openFromDocument(collection,row) opens linked draft.
- [ ] Add failing model tests for remaining cash/sale/advance budgets, explicit rate only, no guessed evidence or confirmation.
- [ ] Implement source selection proposals and contextual entry from saved cash/realization cards; prevent stale-source saves using existing guards.
- [ ] Add browser source-prefill, override, editing, reload, closed-period and conflict checks.
- [ ] Run unit suite and commit.

### Task 3: Verify and publish
- [ ] Run independent oracle check, full unit/source checks, fresh whole-branch review and address material findings with regression tests.
- [ ] Open PR, run all required CI including Chromium/WebKit phone/tablet/desktop and PostgreSQL. Fix failures until green.
- [ ] Merge under existing user authorization, verify Pages assets against main and report actual outcome.
