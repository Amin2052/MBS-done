# MASTER_V6 — specification pointer

> **Status: POINTER, not the verbatim specification.**
> Spec 1.4 requires `docs/spec/MASTER_V6.md` to hold the master prompt verbatim so later
> sessions can read only the part they need. The bootstrap session had the document as a
> chat attachment rather than a file on disk, so it left this pointer instead of
> reproducing 67 KB from memory (an unverifiable copy would be worse than none).

| Field | Value |
|---|---|
| Source document | `MBS_MASTER_PROMPT_V6_2_GITHUB.md` |
| Version | 6.2 (supersedes V5; 6.1/6.2 = project files on GitHub) |
| Size | 67,615 bytes |
| Supersedes | V5 |
| Upgraded | 2026-11-20 |

## To restore

Copy the owner's original file over this one and commit:

```bash
cp /path/to/MBS_MASTER_PROMPT_V6_2_GITHUB.md docs/spec/MASTER_V6.md
git add docs/spec/MASTER_V6.md && git commit -m "docs: restore verbatim master prompt"
```

Tracked as **H-03** in `docs/human-required.md`.

## What this session already extracted from it

| Part | Used for |
|---|---|
| 0 | Repo locations, read-only guards, manifest, directory skeleton |
| 1.1 / 1.4 / 1.5 | Decision classes, resume protocol, honest status vocabulary |
| 1.7 | `docs/requirements.csv` seed |
| 1.8 | `AGENTS.md` |
| 2 | Environment inventory (see `docs/environment.md`) |
| 3.3 | Offline-dependence default and load model |
| 4 | M1 audit scope and required outputs |
| 6 | Tenant isolation defaults, for `db-inventory` context |
| 11.2 / 11.3 | Money and numbering findings against the legacy schema |
| 17 | M0/M1 exit criteria |
