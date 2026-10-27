# General stock operations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Support direct project consumption and standalone material sales for all deals without a compulsory crew.

**Architecture:** Existing receipt/consume movements and finance realizations/expenses share stable document IDs. Pure preparation precedes guarded atomic mutation. Procurement views read existing source documents.

**Tech Stack:** Vanilla JavaScript, BigInt cents, native FIFO, Supabase PostgreSQL, node:test, Playwright.

**Spec:** docs/superpowers/specs/2026-10-27-general-stock-operations-design.md

## Global constraints
- Preserve existing legacy operations and live records; use isolated fixtures.
- Cash, procurement gross, expense net and revenue remain distinct.
- Keep mobile forms usable at 375px and preserve drafts on failures.

## Review focus
- Duplicate items or repeated submits cannot spend a lot twice.
- Historic dates cannot consume future receipts or change already-used FIFO sources.
- Identity/period changes during asynchronous validation leave both stores untouched.
- Partial/mixed sales cannot falsely confirm proportional material cost.
- A generic edit/deletion cannot orphan one linked sale leg.

## Tasks
- [x] Add failing literal controls for `ArbatStockOperations.prepare({finance,warehouse},command,{fifo,actor,now})`, then implement pure multi-line `sale`, `consume`, `receipt-consume` in app/stock-operations-model.js. Verify exact fractional money, validation and immutable input.
- [x] Add sale graph validation and exact sale cost recognition to app/finance-core.js; prove matched partial sales and review for incomplete mixed allocation without changing legacy WIP.
- [x] Add procurementSnapshot to app/project-workspace-model.js and display read-only procurement/source details in app/project-workspace.js; test source tracing across transfers and partial payments.
- [x] Implement app/stock-operations.js/.css and `arbatApplyStockOperation` native bridge, preserve roles/periods/identity/stale baselines and rollback local writes. Keep native generated expense metadata in sync and block unilateral edits.
- [x] Add PostgreSQL final-batch source graph guards and disposable SQL controls, preserving session/CAS/period protections.
- [ ] Run targeted and complete unit suites, native Chromium/WebKit workflows, SQL guards, independent review, publication and exact deployed-file verification.
