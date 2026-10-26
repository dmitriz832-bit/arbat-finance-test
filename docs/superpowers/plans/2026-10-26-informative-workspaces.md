# Informative Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Перестроить подачу финансовой информации и действия по Финтабло, включая закреплённые статьи отчётов.
**Architecture:** Независимые модули представления поверх действующих моделей и сохранений; общий контракт периода/организации и общие стили. Координатор владеет index.html и интеграцией.
**Tech Stack:** Vanilla JS/CSS, существующее финансовое ядро, node:test/Playwright, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-10-26-informative-workspaces-design.md

## Global Constraints
- Не менять финансовые формулы и форматы документов; использовать копеечные источники ядра.
- Сохранить CAS/роль/закрытые периоды/резервные копии и diagnostics из main.
- Общий стиль Source Sans Pro и токены Финтабло; светлый фон цифр.
- Синтетические данные и отсутствие внешних запросов в browser fixtures.
- Никаких частных снимков Финтабло в публичном git.

## Review Focus
- Переставленная/скрытая первая колонка и колонка выбора: закрепляется статья, настройки сохраняются (Task 1).
- Общий/двухорганизационный выбор и предыдущий период: числа не смешиваются, неизвестное не становится нулём (Tasks 2/3).
- Длинные и отрицательные суммы, нулевой план/неполный прогноз, 375px: нет обрезанных значений и ложных процентов (Tasks 2–5).
- Смена фильтров при открытом документе: исходная привязка и несохранённый ввод сохраняются (Tasks 3/4).
- Пришедшее облачное обновление: новое представление обновляется и не пишет устаревший документ (Tasks 2–5).

## Task 1 — Закреплённые статьи матричных отчётов
Files: new report-table presentation helper/styles if needed, table-preferences integration, targeted browser test.
Consumes: existing report DOM, real column identity/settings. Produces: sticky article column and scroll containers without replacing rows/handlers.
- [x] Write failing browser check: cashflow/P&L article x stays fixed after scrollLeft, numeric columns move, row/check selection intact.
- [x] Implement semantic table scope/column detection with opaque surfaces and header intersection.
- [x] Verify 375/768/1440, reordered/hidden columns, rerender and no page overflow.

## Task 2 — Главная собственника
Files: dashboard.js/css, dashboard-summary.css, scoped browser fixtures.
Consumes: arbatDashboardSnapshot, ArbatDashboardSummary, owner period/org. Produces: first-screen priorities, comparison and grouped drilldown analytics.
- [x] Write failing layout+reconciliation test using populated two-org fixtures.
- [x] Recompose dashboard and existing source actions; retain snapshot sums and unknown-state semantics.
- [x] Verify first-screen KPI/graph visibility, selected scopes, negative/empty states and drilldowns.

## Task 3 — Рабочий экран ДДС
Files: cash-workspace.js/css (new focused model/helper only if needed), scoped tests.
Consumes: existing cash/wallet/article document state, render events and creation form event. Produces: synchronized filters/chart/totals/journal with amount visible and intact edit actions.
- [x] Write failing interaction test for type/period/search, row IDs, matching totals/chart, source edit and reset.
- [x] Implement common filter/query state and compact toolbar/list view without replacing accounting handlers.
- [x] Verify two orgs, transfer handling, exact sums, no results, reload and mobile.

## Task 4 — Обзор сделки
Files: project-workspace.js and scoped project workspace stylesheet/test.
Consumes: existing project view/model/budget/documents and native forms. Produces: read-first overview and explicit details editing with source navigation.
- [x] Write failing test for overview vs edit, budget/debt/status documents and dirty cancel.
- [x] Implement overview and links, preserving projectKey and model calculations.
- [x] Verify historical payroll/warehouse state unchanged and linked creation keeps scope.

## Task 5 — Остальные рабочие разделы
Files: module-workspaces.js + tax/warehouse/management workspace presentation files; scoped tests.
Consumes: existing snapshots and open-document APIs. Produces: compact meaningful status/result/action hierarchy and coherent report filters.
- [x] Inventory active controls/snapshots and write meaningful source/navigation tests for changed behavior.
- [x] Improve tax/warehouse/payroll/planning/obligations/report presentation with existing amounts and actions.
- [x] Verify desktop/tablet/phone, incomplete and empty data, source refresh without new posting.

## Task 6 — Обследование эталона и интеграция
Owner: coordinator. Files: docs/fintablo-function-matrix.md, app/index.html, cache versions and integration tests.
- [x] Browse available demo construction sections and record tested/blocked button families and ARBAT mapping.
- [x] Integrate component assets and eliminate superseded layout conflicts.
- [ ] Independent whole-branch review, all unit/browser/acceptance/PostgreSQL checks.
- [ ] Publish PR/merge and verify deployed source/assets exactly.

## Task 7 — Динамический анализ отчётов ДДС/ОПиУ
Files: new report-analysis-model.js, report-analysis-workspace.js/.css and dedicated unit/browser tests. Root alone links assets in index.
Consumes: existing db/core.ownerPeriodSnapshot/core.cashFlow, warehouse FIFO, reportType/reportYear/orgFilter; produces exact matrix values and source rows without financial posting.
- [x] Write failing test: monthly/quarterly/yearly columns reconcile, changing group/filter updates cells and source rows, article stays pinned.
- [x] Add date-range/granularity and meaningful report groups, rowsearch, zero-row toggle, percentages, saved row order per group, numeric CSV export; exact BigInt sums, transfers separate, no formatted-money parsing.
- [x] Replace only legacy #reports presentation after native rendering; preserve native report selectors and prevent old monthly-cell handler from interpreting quarter/day columns. Each own cell opens source documents correctly for its exact period and filters.
- [x] Verify P&L WIP/tax/other-income semantics, two orgs, negative/empty/large values and no finance writes; source edit refresh and375/768/1440 matrix scroll. No model/schema/rates changes.

## Integration evidence

- Baseline main9283c09:598 unit tests. After implementation/review fixes:612 unit tests, Decimal oracle and JS/inline syntax checks pass.
- Chromium full browser matrix:40 passing scenarios; added final report lifecycle coverage and scoped fix regressions are checked separately before release.
- All11 acceptance families pass in the current local tree (9 in the common run; management-review and tax-registers rerun after adapting visible tabs/disclosures). CI also runs both Chromium and WebKit and PostgreSQL.
- Independent reviews: matrix/deal3 findings fixed and independently rechecked; cash/module4 findings fixed and independently rechecked; report analysis allocation/identity/lifecycle fixes rechecked before release.
- Final CI, merge SHA and deployed byte verification are recorded in the PR/release result.
