# Payroll and production-accrual operation audit — 2026-10-27

Scope: local application source at baseline `1a48dad` / production-equivalent tree `200d5b740962af4484fcf54211afe94ddabec154`, followed by the fixes recorded here. No production financial records were read or changed by this audit worker. The actual deployed `my_payroll()` function definition was supplied by the integration owner from schema metadata, not inferred from an older migration. Browser backends and profile responses use isolated literal fixtures; external requests are intercepted or aborted.

## Independent control and destinations

The principal fixture uses exact decimal strings, literal integer-kopeck expectations and a three-person frozen work snapshot. `0.3333 × 300.06 = 100.009998`, rounded once to `100.01`. Distinct sorted members a/b/c receive `33.33 / 33.33 / 33.35`; the final member receives the remainder. One linked manual accrual replaces a's work share for payroll while adding only its employer contribution to the project ledger.

| Operation / destination | Independently expected | Observed after fixes |
| --- | ---: | ---: |
| Manual administration gross / NDFL / other / employer contribution | 1,000.01 / 130.00 / 20.01 / 300.03 | Exact |
| Linked production a gross / deductions / net | 33.33 / 5.33 / 28.00 | Exact; no second work gross |
| Production b manual plus work share gross | 200.03 + 33.33 = 233.36 | Exact |
| Full company gross / NDFL / other deductions | 1,300.05 / 160.33 / 25.04 | Exact |
| Full employer contributions / recognized expense | 370.04 / 1,670.09 | Exact |
| Total net entitlement | 1,114.68 | Exact |
| Existing recognized payments: prior admin 500 + bulk 161.35 + partial b 50 | 711.35 | Exact |
| Cumulative payroll positive debt | admin 350.00 + b 53.33 = 403.33 | Native/shared model, management workspace and owner-debt model agree |
| Project 1 cost: work 100.01 + linked insurance 10 + allocated b gross100 + insurance30 | 240.01 | Project snapshot exact |
| Project 2 cost: b gross100.03 + insurance30.01 | 130.04 | Project snapshot exact |
| Current P&L direct / administrative cost | 370.05 / 1,300.04 | Exact |
| Current revenue / profit | 2,000.00 / 329.91 | P&L, owner dashboard model and management report model agree |
| October outgoing cash | 411.36 | Includes non-salary200.01; excludes September500.00 |
| September outgoing cash | 500.00 | Exact; still settles cumulative payroll |
| Pay remaining admin350 and b53.33 | payable0; paid1,114.68; expense1,670.09 | Exact; no duplicate P&L/project expense |
| Repeat one-kopeck payment | overpayment0.01 | Explicitly reported |
| Same employee B gross100 / paid150 | B overpayment50; A debt remains403.33 | No cross-company netting |

Company and employee balances deliberately use cumulative entered history. Monthly cash and P&L retain their own date scopes. There is no configured payroll opening balance. Production's selected-period accrual report explicitly labels cash payments as all dates; it must not be mistaken for a standalone period liability roll-forward.

## Confirmed defects and fixes

| Defect observed before change | Executable RED evidence | Result / downstream consequence |
| --- | --- | --- |
| Explicit salary cash with no person/parts disappeared from payroll entirely; valid100 or malformed amount still allowed paying the full computed debt again | New unit controls expected unallocated or invalid-payment issue and rejected payout; both failed | Salary-purpose flag now identifies the cash candidate. Valid amount remains fully unallocated; malformed amount produces an invalid-payment issue. Existing eligibility routes both to reconciliation and blocks direct payout. |
| Missing/null/blank imported salary amount was coerced to clean zero | New unit control expected an invalid-payment issue and blocked payout; old core returned no issue | Missing amount is unknown and blocked; explicit zero remains known zero. |
| Imported object/string `payrollAllocations` silently fell back to a whole single-person settlement | Expected paid0, actual paid100 | Malformed containers are quarantined in full with invalid-allocation issue, unallocated cash and blocked payout. |
| Production settlement all-company view netted an A accrual against a B payment for the same person | VM report control expected company column/two separate balances; failed | Report now uses organization-aware reconciliation and displays company per row. Settlement-link list respects selected company/crew; delete action retains the original source index. |
| Negative imported payroll reduced P&L cost while payroll reconciliation rejected it, leaving two different financial stories | New control expected source issue; ledger returned clean cost90 while payroll retained100 | Native entry already prohibits negative gross/deductions/contributions. Imported invalid payroll now remains an explicit `payroll-invalid-deductions` review issue and is quarantined from confirmed cost rows. Project, P&L, owner and management model issues propagate the source; browser confirms dashboard preliminary-result notice. This is not signed payroll-correction support. |
| Project payroll helper reparsed quarantined invalid labor before using the guarded ledger, causing the project card to throw | New project-control failed with `Invalid amount: invalid` through payrollParts; excessive deductions, negative gross and malformed contributions were also checked | payrollParts uses the exact payroll validation policy already used by the ledger, returns no confirmed cost for invalid source, and retains the source review issue in projectPayroll. Project/workspace cost retains the valid130 while profit is unknown; the card remains calculable. |
| Imported approved work with negative/nonfinite/missing quantity or rate produced clean negative cost or unknown-zero cost despite no valid crew entitlement | New control expected no confirmed work row and a source review issue; negative act originally produced clean cost-100 | Approved-work ledger and crew accrual validation now quarantine invalid source, preserve legitimate fractional line precision and propagate the source issue to project/P&L/owner outputs. |
| Malformed allocation container / null allocation member broke personal payroll history | Local browser history failed to render after malformed source | Management issue/history matching now validates the array and handles null members. Source remains available for reconciliation. The review filter also uses existing payout eligibility, so company-wide uncertain salary cannot disappear from the review list. |
| Actual deployed employee RPC counted linked work plus labor twice, omitted other deductions, ignored payroll parts/purpose and relied on article-name salary heuristics | Actual supplied schema definition; proposed pure SQL controls | Corrected migration and rollback-only fixture controls prepared. The integration owner verified pure-helper literal controls in actual PostgreSQL temporary schema with rollback. See exact SQL/access limits below. |
| Gross/contribution aliases accepted by payroll reconciliation were ignored by the expense ledger | New literal control expected expense130 for gross100/contributions30; actual ledger900 with conflicting amount900 | Payroll parts now uses the same gross-first/contribution authority as reconciliation; core ledger and P&L agree. |
| Employee profile netted foreign-company overpayment against another company's debt and labelled combined deductions as NDFL | New profile render control expected debt350/overpayment50; old UI showed signed300 | Profile preserves the legacy signed RPC balance field but displays new positive-company payable and overpayment separately, organization detail, other deductions and review status. It sends no employee override to the own-profile RPC. |

## Controls beyond the principal fixture

The added suite also checks overallocated/negative/malformed/null bulk parts (no partial credit), explicit allocation precedence over legacy settlement links and direct recipient, non-salary exclusion despite a salary-labelled note, unrelated-company issues, prior-period settlement, quantity `1.2345 × 123.45 → 152.40`, half-kopeck line rounding, deterministic last-cent split and nonmutation of source records.

Existing executable payroll/history controls were rerun. They cover manual administrator deductions, frozen historical crew/price snapshots, approved-work quantity precision, original work IDs on batch edits, invalid crew/quantity rejection, partial/bulk payouts, employee single/bulk deletion restrictions for accrual/cash/allocation/work/lead/settlement/leave history, and removal of unused employees without harming remaining crew members.

Leave arithmetic is audited against the application's own day model: full-year28, three used days and a negative0.50-day adjustment gives24.50; future adjustments are excluded. Existing termination/overlap controls also pass. This does not establish statutory tax or employment-law compliance and does not calculate payroll tax rates automatically.

The native accountant payout browser suite exercises partial230/full500 against net730, role checks, wrong identity, changed balance/reference data, closed periods, excess amount, asynchronous period-check races, successful local CAS persistence and reload. It also verifies that salary payout leaves accrual records and P&L expense unchanged. The new browser control verifies unknown salary review actions in both native and management views, direct-open blocking, organization-separated production, filtered legacy links, malformed-allocation history and negative-result review at390px and1440px.

## SQL / employee-profile status

Proposed migration: `supabase/migrations/20261027095005_align_employee_payroll_snapshot.sql`. It adds a pure `payroll_employee_snapshot(payload, employee)` calculator with execution revoked from PUBLIC/anon/authenticated, and retains the `my_payroll()` active-session guard plus enabled staff mapping from `auth.uid()`. The own-profile wrapper accepts no employee parameter. The pure helper permits fixture verification without reading `finance_state`.

Disposable controls: `tests/all-operations-payroll-rpc.sql`; literal payload only, wrapped in `BEGIN … ROLLBACK`. Expected own-person results mirror the JS control. Added B admin100/paid150 verifies signedbalance300 while payable350 and overpaid50 stay separate. Tests include linked work deduplication, allocation precedence, hidden/other-person isolation, malformed amounts, non-salary purpose, contributions excluded from employee net, final-cent split, organization detail and helper ACL.

No local Postgres executable is installed. The integration owner executed the pure helper and literal fixtures in actual PostgreSQL under a temporary schema with rollback: all controls passed after a qualified-column fix. No actual `my_payroll()` call or production financial payload read was used for these controls. The final missing-work-field alignment and deployment remain subject to the integration owner's final rerun. A separate `tests/all-operations-payroll-rpc-access.sql` psql harness refuses a database containing finance/staff tables before creating fixture-only auth/session/table stubs, and verifies own identity, missing/unmapped/disabled UID, revoked session, anonymous denial and helper ACL in an empty disposable database. Its execution is distinct from pure monetary-fixture coverage; do not infer authentication coverage from helper controls. Browser profile tests use a controlled RPC response and establish UI consumption and empty `{}` request body, not actual employee authentication or live SQL parity.

## Verification record

- Initial relevant payroll/core/P&L set:35/35 pass before new controls.
- Targeted final payroll/leave/history/management set:95/95 pass, including18 new unit/crossmodule/profile controls.
- Initial existing Chromium accountant payout/history/organization acceptance:12/12 pass. No emulated WebKit substitution was used.
- Final integrated Chromium accountant/new-audit/history/organization run:14/14 pass, including own-profile rendering at390px and1440px.
- Full `npm test` during concurrent audit work:839 tests,837 pass,2 fail. Failures were the other-domain in-progress controls `supplier card and supplier dashboard summary cannot call cross-register overallocated cash a valid settlement` and `VAT-inclusive PDF and spreadsheet invoice gross remains supplier/warehouse acquisition value`; payroll was green. A later full run while other owners were still editing had869 tests/864pass/5fail, with payroll green; failures were tax active-year defaults, generated-expense source scanner, fractional FIFO plan price curve, WIP missing-linked-expense, and unchanged/cancelled import approval controls. The latest worker handoff run had873 tests/869pass/4fail: tax unsupported-year metadata, backup inspection with a null finance store, legacy2027 threshold expectation and legacyyear-specific-USN default expectation. Payroll remained green; all full-run logs were reported by test name to the integration owner. The final worker full run had874 tests/872pass/2fail, both tax expectations (unsupported future year and legacy2027 threshold timing), with payroll green. A final integration run is required after all owners finish.

Files added: `tests/all-operations-payroll.test.cjs`, `e2e/all-operations-payroll.cjs`, the SQL migration/control script and this audit. Scoped edits: finance-core payroll candidate/quarantine, payroll project helpers and expense-ledger validation, native production settlement renderer, management payroll matching and personal-profile salary renderer. No branches, commits or production finance operations were performed by this worker.

Follow-up integration review: the malformed-project-payroll bypass regression and revised frozen-source contribution/nonmutation integration test pass26/26 together. A full880-test snapshot during the project owner's final work had877pass/3fail (future-refund cutoff, validated-refund project card, invalid-approved-work forecast); all were reported to the integration owner. No SQL changes were made in this follow-up.
