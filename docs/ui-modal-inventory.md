# Fintablo modal and popup inventory

The shared appearance lives in `app/modal-system.css`, after the base tokens and component styles. The component modules continue to own their controls, financial persistence, open state and cancellation handlers. No form or control nodes are replaced by the stylesheet.

| Family | Production selectors | Owner / scenarios |
| --- | --- | --- |
| Record editors | `#dealModal`, `#genericModal`, `#walletModal`, `#calendarModal`, `#workEditModal` → `.modal` | `index.html`, document editors and project workspace |
| Work batches | `#batchModal` → `.batch-modal` | Crew/date, multiple projects and work rows |
| Payment distribution | `#allocModal` → `.modal` | Existing DDS allocation rows |
| Application notice | `#appNoticeModal` → `.app-notice` | Existing promise based notice/confirmation adapter |
| Warehouse editor | `#whDialog` → `.whmodal` | Item, place, receipt and movement forms |
| Warehouse document link | `#whLinkOverlay` → `.whmodal` | Generated import-to-project link editor |
| Crew / project warehouse editor | `.cw-overlay` → `.cw-dialog` | Generated issues, reservations, top-ups and warehouse settings |
| Business system editors | `.arbat-modal-backdrop` → `.arbat-modal` | Generated catalogue/folder/classification forms |
| Import review | `.bank-review-overlay` → `.modal` | Generated bank counterparty review with contained wide table |
| Generic generated modal | `.modal-backdrop.open` → `.modal` | Additional editor/review panels from `index.html` |
| Creation sheet | `.ui-sheet-overlay` → `.ui-sheet` | `interface.js`; document creation and import forms |
| Profile / access | `#ab-profile-overlay` → `#ab-profile-window` | Employee profile, admin access and employee cards |
| Financial period | `.ux-preferences-dialog:has(#uxPeriodDialogTitle)` | `experience.js`; period settings |
| Wallet order | `.ux-preferences-dialog:has(#walletOrderTitle)` | `dashboard-preferences.js`; presentation preferences |
| Table preferences | `.tp-dialog` | `table-preferences.js`; visible columns, order and reset |
| Supplier obligations | `#payablesDialog` | `payables.js`; registry, detail, payment terms, allocations and receipt editor |
| Tax registers | `#taxRegistersDialog` / `.tax-register-dialog` | `tax-registers.js`; advances, confirmed tax obligations, event editor |
| Tax P&L | `#taxPnlDialog` / `.tax-pnl-dialog` | `tax-pnl.js`; month accrual and quarter correction preview |
| Existing deletion confirmation | `.arbat-delete-alert` → `.arbat-delete-dialog` | Existing backup protected deletion guard |
| Shared confirmation / prompt | `dialog.ft-confirm-dialog` | `popup-system.js`; awaitable confirm/prompt, Escape/cancel safe |
| Nonblocking notification | `.ft-toast-region[popover]` → `.ft-toast` | `popup-system.js`; top layer toast with dismiss control |
| Searchable select popup | `.smart-combobox-list[data-open="1"]` | `document-ux.js`; portalled listbox, options, groups and empty state |

All families share Source Sans Pro, white surfaces, `#333` text, `#dadde7` window edges, 16px window radius, 24px/500 desktop headings, 5px field/button radii, 34px desktop fields and 37px primary actions. Complex accounting windows retain a 900px working width; simple editors retain the 600px reference width. Mobile windows use safe area insets, internal vertical scrolling and 44px input/button targets. Creation sheets use a heading with a close control and a separate Save/Cancel footer, keeping action labels whole. Native dialogs keep a viewport margin independently of custom backdrops.

The browser regression `e2e/modal-system.cjs` opens 17 production dialog families at 375, 768 and 1440 pixels using isolated local fixtures. It checks computed surface, heading, primary and field styles, horizontal containment, label wrapping, and each existing close/cancel action. It also compares persisted finance state before and after cancellation, checks a shared confirmation resolves false on Cancel, and verifies toast styling and native top-layer placement. Screenshots use fixture data only. Popup behavior and destructive cancel/Escape guarantees are covered separately by the shared popup regression.
