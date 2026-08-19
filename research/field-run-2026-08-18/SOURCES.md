# Where the rest of the run lives

This directory holds the evidence of the 2026-08-18 walkabout — the
run the WALKABOUT.md spec at the repo root governs (run zero and the
full walk both; the spec's run-zero section records what was learned
the hard way).

Committed here, because it cannot be regenerated at any price:
- ledger.jsonl — all 1,707 attempts, tagged UA on every line
- ledger-v1-anonymous.jsonl — the first 100, default UA, kept as the
  correction it is
- usdc-transfers.json — the wallet's full on-chain record: 669
  settlements, $6.396969, one tx hash each; the reconciliation
  against the ledger is in FIELD-REPORT.md §7
- preflight-results-*.json — 1,189 domains probed unpaid
- FIELD-REPORT.md — the write-up, every number re-derivable from the
  files above
- the run scripts (field-run.mjs, field-run-v2.mjs, buyer.py) — keys
  were never in them; they read ~/.secrets/ on the runner

Deliberately NOT committed, because both are snapshots of somebody
else's catalog and regenerable from the Bazaar on any day (25 MB of
cache is not evidence): endpoint-catalog.json (30,494 endpoints) and
walkable-set.json (22,828 Base endpoints ≤ $0.05). Both remain at
https://github.com/cv-scvd/scvd-field-run (branch field-run-clean),
alongside this directory's history as it was assembled.
