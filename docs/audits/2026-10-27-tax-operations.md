# Tax operations controls — 2026-10-27

This is an offline calculation and propagation audit of the application. It is not a certification of tax returns, source documents, data completeness, or either company's statutory accounting. No production financial data was read or written. No migrations were executed against a server.

Audit starting point: branch `audit/all-business-operations-20261027`, baseline commit `1a48dad`, application tree `200d5b740962af4484fcf54211afe94ddabec154` (the coordinated audit identifies that tree with production commit `01bfb784`). Other audit changes share this working tree. Tax/VAT changes cover `quarterTaxSnapshot`, source acquisition valuation and `warehouseCostAudit` in `app/finance-core.js`, native `reconcileProjectExpenses` in `app/index.html`, the new controls and this report. The coordinated warehouse work owns FIFO lot allocation and the project work owns plan/forecast acquisition costs.

## Product policy and legal verification

The configured business policy is AIR: USN income minus accepted expenses at 15%, with separately controlled VAT and an explicit dated threshold; ARBAT: VAT documents normally at 22% and profit tax at 25%. These are application policies, not a finding that a particular regional benefit, exemption, or special regime applies to a company.

Official sources reviewed on 2026-10-27:

| Source | What it supports | Scope of verification |
| --- | --- | --- |
| [FNS: 2026 changes](https://www.nalog.gov.ru/new2026/) | General VAT changes from 20% to 22%; calculated rate 22/122; application to 2026 supplies. | Supports the 2026 general document rate. Does not establish the rate of every individual operation. |
| [FNS: VAT and USN](https://www.nalog.gov.ru/rn77/taxation/taxes/nds_usn/) | 2026 exemption control of 20m; prior-year and current-year tests; current-year excess begins VAT from the following month; general rates with deductions versus special 5%/7% without ordinary input deductions. | Supports 2026 boundary and special-rate policy. Future-year text on this page requires reconciliation with later legislation. |
| [FNS: USN](https://www.nalog.gov.ru/rn77/taxation/taxes/usn/) | Standard income-minus-expenses rate 15%, possible regional rates; cumulative reporting; annual 1% minimum when greater than ordinary tax. | Supports calculation mechanics. Regional eligibility was not investigated. |
| [FNS statutory text: article 346.17](https://nalog.garant.ru/fns/nk/dc4ae77b10917a7a5fd3273b3c547c33/) | Cash recognition and reduction of income in the period an advance is returned. | Supports cash/return timing. Full expense eligibility is not derivable from a bank payment alone. |
| [FNS: profit tax](https://www.nalog.gov.ru/rn77/taxation/taxes/profitul/) and [article 284](https://nalog.garant.ru/fns/nk/8c70e67a1baf4df060d06da1331e0835/) | General profit rate 25%, annual tax period and cumulative reporting periods. | Supports the general 2026 product rate. Special rates and company eligibility were not audited. |
| [FNS notice of 2026-07-08](https://www.nalog.gov.ru/rn50/news/activities_fts/16635909/) | Reports amendment by law 04.07.2026 No. 228-FZ to future USN/VAT thresholds. | The linked [official publication](https://publication.pravo.gov.ru/document/0001202607040017) timed out in this audit. Root verification uses the active FNS overview below, without claiming an independently read full legal text. |

The baseline fallback schedule was 2025 60m, 2026 20m, 2027 15m, 2028 10m. The coordinated audit's root verification identified the active [FNS 2026 overview](https://www.nalog.gov.ru/new2026/), which describes VAT-assessment years 2026–2029 at 20m, 2030 at 15m and 2031 onward at 10m. Income measured in an earlier calendar year is a separate test from the assessment year. The outdated fallback schedule is being corrected by the coordinated root change, with its own RED control. Dated `usnVatPolicies` continue to override defaults and persist until another version. The threshold remains an explicit management configuration; the legal source does not authorize silently rewriting saved historical policy versions. The full operative law PDF could not be independently read here, and this report does not claim otherwise.

## Inputs and recognition rules actually implemented

All monetary calculation outputs are integer kopecks. Document VAT accepts explicit 0/5/7/10/20/22 rates, calculates VAT from gross, rounds half away from zero, and derives net as gross minus VAT. It validates supplied `vatAmount`/`amountNet` against that computation. Explicit deductible purchase VAT produces net P&L expense; explicitly non-deductible VAT remains in gross expense. A missing VAT rate is not inferred as a valid taxable profit document.

AIR cash income requires its date and amount; `usnTaxable=false` excludes only with an exclusion reason. Ambiguous classifications produce review issues. A documented `usnVatAmount`/`usnVatDocument`, or accepted advance VAT, excludes the received VAT once. AIR expenses require affirmative deductibility, payment and subsequent recognition dates, accepted amount within the paid amount, and evidence. Partial recognition events have independent identifiers, dates, amounts and documents. A realization alone does not create USN cash income.

ARBAT tax profit uses net accrued revenue and separately confirmed tax expense recognition, including recognition events. VAT deduction uses a confirmed right, invoice and deduction date; it may fall in a later quarter than the purchase. Warehouse consumption is not another VAT invoice. Under AIR's special-rate policy, an ordinary supplier purchase does not create an input VAT deduction. Accepted advance offsets/refunds can reverse the original advance VAT.

Warehouse receipt gross is its authoritative printed `amountGross`, when present, otherwise exact decimal quantity times unit price rounded once at the line. A receipt's full acquisition cost strips VAT only when deductibility is explicit. FIFO conserves gross cents and acquisition-cost cents independently across partial issues, transfers and returns, assigning the final remainder once. A consumption posts an internal cost: `amount`, `amountGross` and `amountNet` equal the validated acquisition-cost base, with internal VAT rate/amount zero and deductibility false. `warehouseGrossAmount` retains gross FIFO value, and `warehouseValuationParts` retains allocated gross/net and full-source evidence. This zero internal VAT does not change the supplier invoice rate or create another VAT deduction. Missing explicit source recoverability makes the generated cost null with review status; a genuinely unclassified legacy source retains an explicitly labelled gross fallback.

Read-time `warehouseCostAudit` revalidates the original source and its full gross/acquisition-cost evidence, checks summed FIFO parts against movement gross, and checks the generated expense, metadata and saved parts against the acquisition-cost sum. It therefore rejects stale policy, deleted/ambiguous source, changed net allocation or edited cost. It does not recalculate VAT on each consumed fragment, which would create or lose a kopeck.

USN/profit estimates are year-to-date through the selected quarter end. VAT is for that quarter. The threshold control uses the specific selected date, aggregates same-day signed cash income, uses the January policy for the previous-year test, and detects a mid-year policy decrease even without a receipt that day. Equality is not excess. Once a crossing occurs it remains effective for the year despite a return or a later higher threshold. Future cash is excluded from the threshold observation.

Confirmed liabilities are a separate event register: organization, tax, period, date, positive amount, document and confirmation are required. Payments/refunds additionally require a cash link of the appropriate direction and within the cash amount. An ENS balance is separate; an ENS offset requires explicit confirmation. A calculated tax amount creates neither a confirmed debt nor a payment. Monthly management P&L tax accruals are a third, separate source; missing months keep the total unknown.

## Independent controls and results

`tests/helpers/all-operations-tax-oracle.py` imports no application code. Python `Decimal` with `ROUND_HALF_UP` supplies 54 signed VAT/net cases across all six rates and independently computed threshold observations. The existing `tests/helpers/tax-control-oracle.py` remains an independent four-quarter control with 84 VAT cases. Test expectations are not produced by the application functions under test.

Amounts in the following table are rubles; the assertions use exact kopecks. “Actual” refers to the patched local tree.

| Input/policy | Independent expected result | Actual |
| --- | --- | --- |
| All 0/5/7/10/20/22 rates; positive/zero/negative gross and kopeck boundaries | Gross = net + VAT; revenue net; deductible expense net; non-deductible expense gross. | Matches all 54 Decimal cases and P&L variants. |
| AIR income-type general entries: 105 at 5% in April, correction -21 at 5% in May | Output VAT 5 - 1 = 4; monthly 5/-1/0; USN cash income 0. | Before: 0 VAT. After: 4 in core and workspace monthly/source rows. |
| ARBAT realization 122 on March 31; purchase 61 on March 31, deductible/recognized April 1 | Q1 VAT output 22/input 0/profit tax 25. Q2 output 0/input 11; YTD profit tax 12.50. | Matches. |
| AIR cash 105 including documented VAT 5 on March 31; paid 70, accepted expense 60 on April 1 | Q1 income 100/expense 0/tax 15; Q2 YTD income 100/expense 60/tax 6. | Matches. |
| AIR income 1000, accepted expenses 1200 | Q1 ordinary tax 0; annual minimum 10 only at year end. | Matches. Carryforward remains unsupported. |
| Custom threshold 100; previous-year income 80; current income 100 then 0.01 on February 28; March return 40 | Equality does not cross; crossing February 28; VAT control date March 1 remains after return; observed income 60.01. | Matches independent Decimal observations. |
| Custom threshold 100 changed to 70 on February 15, then 200 in April; cumulative income 80 | No January excess; February 15 crossing; effective March 1 survives later increase. Historic January result unchanged. | Matches. |
| AIR prior-year advance 105 at 5%; current-year return 42 | Previous-year net income 100; current-year income -40; advance VAT reversal 2; historical advance remains 105 at prior-year cutoff. | Matches. |
| Prior-year advance 120 at 20%; Q1 offset 60 against new 22% realization 61; Q2 refund 60 | Q1 output VAT 11/input 10; Q2 output 0/input 10; original advance VAT exhausted once. | Matches. |
| Opening debt 20, credit 5; Q1 accrual 100; Q2 cash payment 40, confirmed offset 10, refund 2; ENS balance 500 | Q2 opening 115; closing 67; Q1-period balance 52; April payment movement 40; ENS remains separate 500. | Matches. |
| Missing amount/VAT metadata/monthly tax accrual; unsupported future threshold year | Review flags; missing P&L total/threshold remains null; numeric tax subtotals do not certify completeness. | Matches. |
| Current realization 122 at 22%, organization missing | Known assigned subtotal 0, but explicit unassigned source issue and incomplete scopes. | Before: no issues and all ready flags true. After: review issue, incomplete flags. Foreign organization and future document remain outside scope. |
| Documented excluded loan; transfers; disabled BDDS/BDR/payment requests | No additional tax income, deduction, output VAT or confirmed obligation. | Matches. |
| Receipt 10 × 122 including deductible VAT 22%; consume 4 | Supplier/FIFO gross 488; internal P&L acquisition cost 400; only original receipt VAT deduction. | Before: actual cost 488. After: actual cost 400, separate gross evidence 488, no repeated deduction. |
| Mixed consumption: deductible 122 at 22%, non-deductible 105 at 5%, deductible 110 at 10% | Internal acquisition cost 100 + 105 + 100 = 305; gross FIFO 337. | Matches per-source parts; no averaged rate. |
| Receipt 3 × 10.01, deductible 22%; issues 0.5/0.5/2 | Full gross 30.03; acquisition cost 24.61 allocated 4.10/4.10/16.41. | Matches, exactly conserved through full depletion. |
| Quantity 3, unit price 10.005, deductible 22% | Line gross 30.02, full acquisition cost 24.61. | Matches exact decimal multiplication and independent read validation. |
| Printed gross 100 versus 3 × rounded price 33.33; explicit net 81.97/VAT 18.03 | Input VAT deduction 18.03 from authoritative original receipt total. | Before: deduction 0 with metadata mismatch. After: 18.03, VAT-ready. |

Four defects were reproduced with failing assertions before production-code changes: omitted AIR VAT on income-type general entries; false completeness for an unattributed current tax document; gross VAT incorrectly included in native deductible warehouse consumption cost; and original receipt VAT deduction ignoring an authoritative gross line total. The warehouse matrix additionally verifies mixed source policies, independent gross/net cent conservation, source changes and unknown values. No tax-register model changes were needed.

Verification:

```text
node --test tests/all-operations-warehouse-vat.test.cjs tests/*tax*.cjs tests/usn-vat-policy.test.cjs
118 tests, 118 passed, 0 failed

python3 tests/helpers/tax-control-oracle.py --check
Independent Decimal oracle: four quarters and 84 VAT cases match
```

The new tax suite has 15 tests; the warehouse/VAT matrix has 9. Existing source/recognition/obligation/workspace/P&L tests also passed. The warehouse controls execute native FIFO and reconciliation functions in a disposable VM. These controls do not inspect production accounting records. Browser verification is handled by the coordinated project/warehouse audit.

## Material boundaries

The application does not implement a complete purchase/sales book, statutory tax return, inventory-to-tax register, depreciation tax register, loss carryforward register, full restoration/corrective-invoice treatment, special operation/regime eligibility, or automated legal classification of every receipt/payment. Arbitrary sales returns outside documented advance refunds need a separately specified accounting treatment. A supplier payment alone proves neither an accepted USN expense nor a deductible VAT purchase. Unknown data is a review item; visible numeric calculations are known subtotals, not a claim that missing contributions equal zero.

Source coverage and opening tax balances remain unconfirmed (`coverageConfirmed=false` / `completenessConfirmed=false`). Tax payments do not automatically offset a calculated YTD estimate; only confirmed events establish the liability reconciliation. The obligation schema does not calculate due dates, annual advance schedules, or ENS allocation from an ENS balance. Refund events cannot independently establish a statutory right to a refund.

Dated policies are append-only through the existing UI and `20261027061323_usn_vat_policy_guard.sql`; the protected range includes later affected years and the remainder of a crossing year. The migration and its isolated SQL test exist, but this tax sub-audit did not execute SQL or verify a live server installation. Its pure historical controls prove read-only date/version behavior, not production permissions or period-lock enforcement.

There is no blanket tax-compliance conclusion. The successful controls establish the stated mathematics and source propagation for the explicit inputs and implemented policies above.
