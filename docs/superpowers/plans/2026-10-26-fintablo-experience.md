# Fintablo-inspired experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переработать действующий ARBAT FINANCE по выбранному примеру Финтабло, включая карточку сделки и детальный план-факт.
**Architecture:** Существующие документы и финансовое ядро остаются источником истины. Новая чистая модель агрегирует проект, новый UI организует существующие DOM-панели и формы; конечный CSS задаёт общий визуальный язык.
**Tech Stack:** Vanilla JS, CSS, Node test runner, Playwright.
**Spec:** docs/superpowers/specs/2026-10-26-fintablo-experience-design.md

## Global Constraints
- Денежные суммы модели — BigInt в копейках.
- Нет изменений финансовых документов при просмотре.
- Изменения плана сохраняются только штатной формой сделки с защитой версий и отмены.
- 375–1920 px; клавиатура, фокус, touch targets; приватные данные не отправлять в демо.

## Review Focus
- Распределённые платежи и трансферы не удваивают поступления и списания.
- Пустой и нулевой бюджет имеют разный смысл; неполные данные не подменяются нулями.
- Отмена и переход к связанному документу не теряют несохранённые изменения.
- Синхронизация не затирает открытый ввод и не создаёт циклы MutationObserver.
- Все вкладки и старые функции доступны на телефоне.

### Task 1: Project workspace model
**Files:** app/project-workspace-model.js; tests/project-workspace.test.cjs.
**Interfaces:** snapshot(data, deal, warehouse, fifo), budget(deal), exported categories.
- [x] Write behavior tests, run and confirm RED.
- [x] Aggregate core project/WIP, allocation-aware cash and valid payables, detailed budget rows.
- [x] Run tests and full unit suite, confirm GREEN.

### Task 2: Shared visual system and deal workspace
**Files:** app/fintablo-experience.css; app/project-workspace.js; app/index.html.
**Interfaces:** consumes model + existing showDealModal/render/save and arbat:open-document; exposes no alternative accounting storage.
- [x] Write browser scenario for tabs, budget save/cancel, linked forms and device containment, confirm RED.
- [x] Implement shared chrome and tab layout, plan fields and linked actions, context headers.
- [x] Run new browser tests, inspect rendered screenshots and correct visual defects.

### Task 3: Regression and publication
**Files:** existing workflows if new suite requires coverage; docs plan.
- [x] Full local unit suite, syntax checks, Chromium browser and acceptance scenarios. WebKit remains pending remote CI.
- [x] Fresh code review, address important findings.
- [ ] Commit, push, PR, CI; publish only green code and verify production assets.

## Interface ledger
Task 2 consumes categories and snapshot from Task 1. Budget fields are raw decimal strings; display uses core.rubles; all source collections stay intact.

## Verification and review record
- Baseline: 531/531 unit tests.
- Final model: 9 focused tests, amounts in integer cents; full suite 540/540.
- Independent Decimal tax oracle: four quarters, 84 VAT cases match.
- New Chromium workflow: 375/768/1440 px, estimate persistence/cancel, invalid/negative/exponent amounts, clearing detail restores legacy plan, linked forms, cloud updates retain draft and refresh history.
- Fresh reviewer found seven Important issues; all addressed with targeted regression evidence: invalid hidden fields, exponent strings, derived total, clearing all details, overallocated cash, uncertain supplier debt, stale cloud summaries/history. Also fixed administrative payroll categorization and context-tab synchronization.
- Navigation width contract updated from 260 to 230px to match the chosen compact menu; containment assertions remain.
- Local Chromium runtime is version 153 from the npm browser package; repository CI uses Playwright 1.62.1's pinned Chromium/WebKit. Local Chromium-only runner copies are temporary under test-results and do not change browser selection in the committed suites.
- Acceptance financial assertions passed for both organizations across two months. The local screenshot capture required a 30-second allowance; this change exists only in the temporary runner, not committed acceptance tests.
- Publication blocked: automatic approval review rejected feature-branch push, including after verifying the repository is public and user-owned. No remote code writes succeeded. User approval is required before public code disclosure and deployment. WebKit and remote CI remain to run after authorized push.

## Final local results
- 540 unit tests passed; all app JS and inline scripts parse.
- 21 Chromium regression scenarios passed (all existing operational routes, reports, documents, security gates, warehouse and payroll).
- 8 Chromium acceptance scenarios passed, including two organizations / two months, multiuser synchronization and tax registers. Assertions unchanged; the temporary local business-cycle screenshot allowance was 30 seconds.
- Project card direct estimate saving also passed at 375, 768 and 1440 px. Saving keeps the existing record-version guard, cancellation and validation.
- No deferred reviewer findings remain. No accounting formula or tax-policy changes were introduced.
- Publication and remote CI remain blocked pending explicit user permission to disclose the changes to the public repository.
