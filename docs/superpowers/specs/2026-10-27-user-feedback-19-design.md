# User feedback: 19 corrections

The user authorizes implementation of all 19 points in the current application, preserving accounting and reports. Existing explicit instructions to proceed and publish remain in force; this is an incremental correction of the approved application.

## Approach

Extend the current native editors and pure calculation models. Keep one database, existing identity, closed-period protection, monetary precision, deletion backups and CAS persistence. Avoid a replacement app or duplicate accounting.

1. Table settings become an accessible ellipsis button.
2. Bank preview amounts have income green, expense red, transfer amber; file control vertically centered.
3. Project expenses occupy the available width.
4. Column filters use a funnel icon, compose without changing source data, and clearly show active criteria and reset.
5. Realizations resolve project titles from stable project identity, with explicit unresolved state.
6. New work batches have no unwanted empty work row.
7. Price list has no selection checkbox column.
8. USN VAT threshold is configurable with effective date, scoped appropriately and auditable; historic dates use historic policy. Existing defaults remain until explicitly overridden. This changes configuration, not legal guidance.
9. Project material needs group by project and support filtering.
10. All table headings centered horizontally and vertically without breaking sticky columns and editable grids.
11. Crew topup accepts multiple materials atomically, validates cumulative availability/reserves and retains period protection.
12. Brand is a keyboard-accessible home link.
13. Project forecast derives remaining work/material costs from current plan, rates and purchase/FIFO prices after data changes. Explicit original budgets stay distinguishable; unknown prices are unknown, not zero. Forecast never posts an accounting expense or duplicates actuals.
14. Work absent from the original estimate appears in the deal with explicit red unbudgeted marking.
15. Project picking form prioritizes smartphone entry: compact context, adjacent quantities/actions, no page overflow.
16. Any active table/data filter is visible with count/criteria/reset where relevant.
17. Remove tooltips repeating visible labels; preserve meaningful icon labels and explain calculations/consequences.
18. Remove BDDC/BDR/payment requests from navigation, routes and calculations. Retain historical stored records intact; exclude request-owned calendar aliases and request claims from forecasts/caps.
19. Audit beginning balances across cash, warehouse, taxes, people/production, loans/assets. Prevent fabricated cash/expense on initialization, require date and correct organization where meaningful, expose unsupported/unreconciled opening positions honestly.

## Verification

Reproduce bugs before changes; regression cases cover calculations and workflow persistence. Browser checks at 375, 768 and 1440 pixels, real form interactions, visible filters, responsive picking, source labels. Run complete unit suite, source validation, business-cycle acceptance and PostgreSQL checks before publication. No test writes to live financial records.
