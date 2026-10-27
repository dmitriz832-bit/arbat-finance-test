# Warehouse operations audit — 2026-10-27

Audit scope: warehouse receipts/imports/corrections, opening stock, FIFO lot costing, warehouse and crew transfers, project reservations and partial picking, multi-item resupply, consumption, repeated unconsumed returns, closing an issue, and source deletion dependencies. All fixtures are disposable local data. No production financial data was written.

Baseline supplied by the coordinating audit: `1a48dad`, tree `200d5b740962af4484fcf54211afe94ddabec154`, matching production main `01bfb784`. Existing relevant tests were run before adding controls: 51 passed. Expected quantities and monetary amounts in the added tests are literal controls; they are not obtained by calling the production FIFO or finance helpers.

## Controls and destinations

All monetary amounts below are rubles. Stock is valued at supplier gross cost. Recoverable VAT acquisition bases are maintained separately for project expense/WIP; gross stock and net expense must not be added without the recoverable VAT bridge.

| Operation / fixture | Independently expected | Observed after fixes | Destinations checked |
|---|---|---|---|
| Opening A: 2 × 10.01; same-document receipt A: 3 × 20.03 + 2 × 30.07; receipt B: 5 × 7.11 | A 7 / 140.25; B 5 / 35.55; total 175.80 | Exact | FIFO receipts; supplier receipt group 155.78 excludes opening 20.02 |
| Warehouse → warehouse → crew, A quantity 4 | 2 from opening + 2 from second receipt; cost 60.08 | Exact; original source IDs remain intact | Both transfer movement allocations; historical parts remain immutable after depletion |
| Consume A 3, return A 1 | Cost 40.05; return 20.03; warehouse A 4 / 100.20 | Exact | Movement FIFO; one expense linked to consume ID; stock lots |
| Issue B 3, consume 1, return 1 twice | Expense 7.11; each return 7.11; B warehouse 4 / 28.44; crew zero | Exact | Repeated return source identity and quantity; no synthetic receipt |
| Entire multi-item chain | 175.80 = 47.16 expense + 128.64 remaining stock | Exact | Warehouse workspace, owner stock KPI, project actual, WIP 47.16 before realization; WIP zero and recognized cost 47.16 after full realization |
| Duplicate plan lines A 3 + 4 and B 5; pick A 3/B 2, then A 4/B 3 | Demand 7/5; second pick only 4/3; total crew reserve 12 | Exact | Native picking callbacks, readiness, availability, owner reservation KPI |
| Close first partial issue using A 2/B 1 | Return A 1/B 1; expense 30.35; stock 138.41; remaining open reserve 7 | Exact; repeated close rejected without extra movement | Issue lines, linked expenses, warehouse workspace, owner stock/reserves |
| Future receipt after historical consumption | Future 10 units cannot cover earlier shortfall 1 | Consumption is invalid / amount unknown; shortage 1 retained | Chronologically sorted FIFO, source identity, warnings |
| Paid unused receipt, remove/add rows including duplicate material | Stable document/import key; total 80, paid 30; existing payment untouched | Exact | Whole-receipt correction, payables document group, import identity |
| Used receipt correction | Changing touched consumed lot blocked; unrelated/untouched lots remain editable | Exact | Existing correction suite plus added native model controls |
| Used opening correction | Economic fields price/quantity/date/place locked; note-only correction permitted | Exact, no mutation before rejection | Native opening editor callback, original source identity |
| Fractional receipt 3 × 10.01; consume 0.5 / 0.5 / 2 | Total receipt/expense 30.03, never 30.04 | 5.01 + 5.00 + 20.02 = 30.03 | FIFO, linked expense, warehouse and project totals |
| Three warehouses, partial crew transfer, repeated fractional returns | Gross allocation 5.01 / 5.00 / 2.51 / 1.26 / 1.25; stock total 30.03 | Exact | Remaining lot values, historical transfer values, JSON serialization, source IDs |
| Deductible 22% receipt 3 × 10.01 | Gross 30.03; whole source base 24.61; net partial expense 4.10 / 4.10 / 16.41 | Exact; net remainder after first use 20.51 | FIFO independent net cent allocation and immutable full source gross/base evidence; tax agent verifies actual reconciliation |
| Delete consumed receipt while replacement stock is ample | Reject; do not change old 30 expense to replacement source cost 60 | Rejected; both stores unchanged | Cascade delete and alternate import/balance deletion commit |
| Delete receipt and its full dependent consumption together | Atomic removal permitted; remaining replacement receipt and no orphan expense | Exact | Warehouse state, active finance model and stored finance model |
| PDF/Excel row qty 2, printed net unit 100, printed gross 244 | Acquisition gross 244 and normalized unit gross 122 | Exact | Parser, review inputs, committed receipt, payables, stock |
| Printed line total 100 with qty 3 / rounded unit 33.33 | Printed gross 100 stays authoritative | Exact | Receipt `amountGross`, FIFO full cost, payables, paid note correction |
| Same unchanged receipt resubmits tax controls | Preserve authoritative gross; do not reduce 100 to 99.99 | Exact | Whole-receipt and legacy receipt editor paths |
| Browser full fractional chain | 30.03 = first use 5.01 + crew use 10.01 + final warehouse use 15.01; zero stock | Exact at 390/1440 | Actual production forms, native balance/summary, warehouse summary, journal, project actual/WIP, persistence/reload |
| Browser receipt import and duplicate prevention | Gross 244 + 100 = 344; shared source group and two document lines; repeat import blocked | Exact at 390/1440 | File input, parser, DOM review, real confirmation, file hash, committed stock/payables; existing expense 30.03 retained |
| Actual XLSX 0.18.5 decoder import | Real ZIP/XML workbook: qty 2, net unit 100, printed gross 244 → gross unit 122, acquisition 244 | Exact | Native file upload, real SheetJS decoder, review/confirmation, selected supplier/project, stable source group, payables and FIFO stock |
| Actual PDF.js 3.11.174 decoder/worker import | Real vector-text PDF: same invoice columns and gross 244 | Exact | Real PDF.js main and worker, Unicode text/coordinates, native review/confirmation, selected supplier/project, duplicate hash rejection |
| Actual image-only PDF | No invented material rows or financial mutation | Rejected with explicit unrecognized-row message; existing import retained | Real PDF.js worker, scan/image-only limit, stored document count |

## Confirmed defects and implementation

1. Independent rounding of each fractional movement manufactured kopecks. The RED control produced 30.04 expense from a 30.03 receipt. Lots now retain integer gross `valueCents`; proportional allocations round half up against remaining quantity/value, and final depletion takes the remainder. These values travel through transfers/returns. Native summary, balances, item detail and owner valuation use the carried values.
2. Transfer movement parts were also live destination-bin objects. Later movements rewrote historical transfer quantities to zero. Destination lots are now clones; movement allocations remain immutable.
3. Deleting a used receipt with enough replacement quantity silently substituted another FIFO source. Cascade deletion and alternate deletion commit now reject changed surviving source allocations. Native movement deletion and the legacy bulk entrypoint route through the protected cascade. Removing an entire legitimate dependency chain remains possible. Existing period/CAS/backup guards are retained.
4. PDF/Excel import accepted printed gross totals including VAT but stored net unit prices unchanged. The fixture 2 × 100 + 22% became 200 instead of 244. Parsers now normalize gross unit price using printed line total and retain authoritative `amountGross` when review quantity/price remain unchanged. Supplier payables and FIFO honor the line total. No VAT recoverability is inferred from organization.
5. Receipt correction deleted authoritative gross merely because the editor resubmitted tax controls. An unchanged paid 100 line could become 99.99 and fail correction. Unchanged quantity/price now preserves gross while tax-derived net/VAT amounts can be recomputed.
6. The opening-stock editor allowed used source quantities/prices/dates/places to change while a posted consumption survived. Economic corrections now check old and proposed FIFO dependencies before mutating the source; note-only corrections remain valid.

Coordinated tax work adds separate `expenseValueCents` on lots/parts, plus immutable `sourceGrossValueCents` and `sourceExpenseValueCents`. This prevents repeated partial VAT rounding from creating a second penny discrepancy and permits per-source mixed VAT policies. The tax audit owns receipt policy validation and native project expense reconciliation; project planning/forecast owns consumption of these net values.

## Verification commands

```sh
node --test tests/warehouse*.cjs tests/owner-warehouse-kpis.test.cjs
node --test tests/all-operations-warehouse.test.cjs tests/all-operations-warehouse-vat.test.cjs tests/warehouse*.cjs tests/owner-warehouse-kpis.test.cjs
NODE_OPTIONS='--require=/workspace/scratch/b72655be7787/browser-runtime/preload.cjs' ARBAT_BROWSER=chromium node --test e2e/audit-warehouse-operations.cjs e2e/warehouse-comprehensive.cjs e2e/warehouse-feedback-19.cjs e2e/warehouse-workspace.cjs
NODE_OPTIONS='--require=/workspace/scratch/b72655be7787/browser-runtime/preload.cjs' ARBAT_BROWSER=chromium node --test e2e/audit-warehouse-real-imports.cjs
```

The browser runner blocks every non-local application request, replaces authentication/sync/profile code, and uses disposable storage. The first import test replaces the external XLSX decoder with deterministic workbook cells to isolate review/confirmation/hash/saving. The added real-decoder test closes that limit: it generates valid XLSX and vector-text/image-only PDF files using Python standard-library code and an installed TrueType font, then loads the application's exact CDN decoder versions through local route fulfillment. Vendor bytes are fetched into a temporary cache, checked against pinned SHA-256 values, and never vendored into the repository; no financial data is sent with those setup downloads. The PDF worker is also the real pinned production worker. Both real invoice formats passed; image-only PDFs have no OCR support and were rejected without financial mutation. Arbitrary supplier layouts, production authentication/RPCs and remote synchronization remain outside this local test. Browser scripts default to Chromium and WebKit; this environment was run with Chromium explicitly, leaving actual WebKit execution to CI.

Final targeted verification: **73 unit checks passed** (13 added warehouse controls, 9 coordinated VAT controls, 51 original warehouse controls); **5 browser scenarios passed** across desktop/mobile fixture matrices. The additional real-decoder browser test passed in 6.0 seconds, covering actual XLSX and PDF invoices plus an image-only PDF rejection. Import approval stale-state/cancel regression fixtures were updated to include the real preview row's `data-i` identity; all 6 approval tests passed.
