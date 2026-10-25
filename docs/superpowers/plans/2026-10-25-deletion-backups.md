# Reliable deletion backups

Fix the reported backup error without changing production financial documents for tests.

- [ ] Reproduce localStorage backup quota failure; test archive write/read failures and exact preservation of legacy copies.
- [ ] Store deletion snapshots in IndexedDB, verify committed reads, and archive existing deletion-only localStorage copies before freeing duplicate space. Never touch live stores, Auth tokens or unsynced recovery copies.
- [ ] Keep one durable full snapshot per UI deletion. Existing synchronous delete handlers verify their checkpoint is covered by the prepared snapshot. Reject changes made while backup is being saved.
- [ ] Make retained archives downloadable; test real deletion, reload, quota, failure, race and legacy migration in Chromium/WebKit at phone/tablet/desktop sizes using isolated data.
- [ ] Review, run all CI, merge green changes and verify deployed hashes against main.
