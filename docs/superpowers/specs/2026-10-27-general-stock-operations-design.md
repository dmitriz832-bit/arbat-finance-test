# General stock operations

User confirmed the mechanism must apply to every deal, independent of a named project. Reuse the current finance and warehouse stores and their atomic CAS RPC; do not change live documents automatically.

Three operations share a multi-line form: direct project consumption without a crew; purchase immediately consumed on a project (two linked stock legs); buyer shipment with linked realization and FIFO cost. Purchase remains inventory until consumption or shipment. Payment remains a separate cash document. Sale prices and procurement costs are distinct.

Expose purchases, paid supplier documents, remaining own receipt stock across storage places, and actual material consumption separately in every deal. No automatic invented estimate or retrospective write-offs.

Approach: reuse receipt/consume movements with explicit document and realization links. A separate sales inventory subsystem would duplicate balances; forcing sales through crews would invent movements. Atomic linked documents preserve one stock and one cost authority. For mixed service/sale projects with no revenue allocation, flag incomplete partial WIP rather than silently inventing service allocation.

Security: validate dates, roles, organizations, stock, prices, source valuation, duplicates, stale drafts, closed periods and complete source graphs on both client and server. Changes to a linked stock document must retain the entire graph; generic editors must not orphan one leg. No new packages, no production data fixtures.
