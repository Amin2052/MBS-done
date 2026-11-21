# HUMAN-REQUIRED

Things only the owner can do. The agent prepares everything it can (runbook, checklist,
rollback, verified backups) and never performs these. Each item: what, why, steps,
prerequisites, rollback.

---

## H-01 — Provide push credentials for `MBS-done`

**What:** A Git credential that can write to `https://github.com/Amin2052/MBS-done.git`.

**Why:** Spec 0.3 — every work unit ends in a pushed commit, and 1.4 resumes by
re-cloning. Without it, commits are landed through the GitHub API one file at a time,
which produces a noisy history and cannot carry binary files.

**Steps:**
1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained**.
2. Scope: only `MBS-done`. Permission: **Contents: Read and write** (Metadata: Read is
   automatic). Short expiry.
3. Save it in an untracked env file (for example `.env.local`) as `GITHUB_TOKEN_MBS_DONE`.
4. Tell the agent the variable name — never the value.

**Prerequisites:** access to the `Amin2052` account.
**Rollback:** revoke the token in the same settings page.

---

## H-02 — Confirm `MBS-done` visibility

**What:** State whether the repository should be **public** or **private**.

**Why:** At bootstrap it is **public** and empty. Spec 0.1 treats every push as
publication; a private repo lowers the cost of a mistake.

**Steps:** choose; if private, GitHub → Settings → General → Danger zone → change
visibility.
**Prerequisites:** admin on the repository.
**Rollback:** visibility can be changed back; anything already public must be treated as
disclosed.

---

## H-03 — Restore the verbatim specification

**What:** Copy `MBS_MASTER_PROMPT_V6_2_GITHUB.md` (67,615 bytes) to
`docs/spec/MASTER_V6.md` in this repository.

**Why:** Spec 1.4 says the spec is saved verbatim so later sessions read the part they
need instead of re-reading the whole file. The bootstrap session could only leave a
pointer.

**Steps:** copy the file into `docs/spec/MASTER_V6.md` and commit.
**Prerequisites:** the original attachment.
**Rollback:** none needed; documentation only.

---

## H-04 — Supply anonymised legacy databases

**What:** Anonymised copies of real `mooral.db` (Electron `userData`) and, if used, the
D1 export of `mooral-db`.

**Why:** Spec 0.1/Part 12 — real data is not in GitHub. Until supplied, the ETL is built
and rehearsed on synthetic fixtures derived from the OLD schema.

**Steps:**
1. Copy `mooral.db` **with** any `-wal` and `-shm` siblings (copying the main file alone
   can lose recent writes).
2. Anonymise identifying values; keep shapes, odd values and the REAL money columns.
3. Hand over out of band. The agent stores them in `migration/source-copies/`
   (git-ignored, never pushed) and verifies `PRAGMA integrity_check`.

**Prerequisites:** access to a machine or backup holding the legacy database.
**Rollback:** copies are read-only and ignored by git; deleting them changes nothing else.

---

## H-05 — Read-only access to OLD (optional hardening)

**What:** A read-only deploy key for `Amin2052/MBS`.

**Why:** Spec 0.1 — makes "never push to OLD" a technical limit rather than a promise.
The clone already has its push URL set to `DISABLED`.

**Steps:** create a deploy key with **read** access; tell the agent it exists.
**Prerequisites:** admin on `MBS`.
**Rollback:** delete the key.

---

## H-06 — Professional review of D2 decisions

**What:** Bangladeshi legal/tax review of the PDPO compliance map, the Mushak 6.3
template and retention period, and the money-rounding rules.

**Why:** Spec 1.1 D2 — the agent chooses the safest conservative option and tags it
`NEEDS-PROFESSIONAL-REVIEW`; it must never present those as verified law.

**Steps:** engage a lawyer/tax professional when the M2 ADRs are ready.
**Prerequisites:** the ADRs (not yet written).
**Rollback:** decisions can be revised; templates are configuration-driven.

---

## Later items (prepared by the agent, executed by the owner)

| Item | Milestone | Notes |
|---|---|---|
| External penetration test | M14/M15 | All critical/high findings fixed first |
| Pilot with 1–3 businesses | M15 | |
| Final production release | M15 | |
| Per-business cutover + written owner sign-off | M10 | Legacy stays authoritative 30 days after sign-off |
| Deletion/anonymisation of real production data | — | Audited process, legal retention |
| Code-signing certificate (Windows Electron) | M12 | Purchase + identity verification |
| Payment-provider onboarding (BDT capable) | M13 | KYC is the owner's |
| Cloud/DNS/billing accounts, production secrets | M15 | Agent writes IaC + runbooks |
| Real Android device testing | M12/M14 | Emulation is a stand-in, not a substitute |
