# Offline-dependence report (preliminary) — M1

Spec 3.3 requires the audit to determine how much each business depends on offline use,
and records the answer as a top migration risk. Full determination needs real usage data
(and H-04 databases); this is the evidence available from the pinned source.

## What the product is

`package.json` describes OLD as **"Professional Offline Desktop Business Management
Software"**. The local `better-sqlite3` database is the primary store; the Cloudflare D1
sync layer is an addition, not the source of truth for the desktop app.

## Evidence found

| Evidence | Where | Meaning |
|---|---|---|
| Local SQLite as primary store | `src/database/database.ts` | The app works with no network by design |
| Backup/restore built in | `electron/main/backup-service.ts`, `tests/main/entry-backup-restore.ts` | Businesses are expected to move data by file, not by server |
| Bidirectional sync + tombstones + cursors | `cloud-sync-manager.ts`, `0004`–`0006` | Offline edits are expected to reconcile later |
| Cloud multi-user and reset tests | `tests/main/entry-cloud-multiuser.ts`, `entry-cloud-reset.ts` | Multi-device use exists but sync conflicts are a known area |
| `verify:online` script | `scripts/verify-online-architecture.mjs` | An "online architecture" mode was being verified — the direction of travel is online |

## Preliminary conclusion

Offline is the **default operating mode** of the current product, not an edge case. A web
v1 that is online-only is therefore a real behaviour change for at least some customers,
not a neutral platform swap.

## Recommended treatment (per spec 3.3, pending owner confirmation)

1. Web v1 is online-only **and** the legacy desktop app stays supported for
   offline-dependent businesses until an offline-capable design is approved by an ADR.
2. During M1 interviews/usage review, record per business: hours per day without
   reliable internet, whether sales are entered during outages, and whether they use
   more than one device per business.
3. Record the result in the migration risk register as **top risk** with a cutover
   condition: a business that depends on offline writes is not cut over to web v1 until
   it accepts an online-only workflow in writing, or an offline design exists.

## Open questions for M1

- Does `mbs-user` (employee app) depend on the same local database, or its own?
- Is the D1 sync optional at runtime (can the desktop app run with cloud disabled)?
- Do any customers use two devices on one business today, and how are conflicts handled?

These need either H-04 data or owner answers; they are recorded here rather than guessed.
