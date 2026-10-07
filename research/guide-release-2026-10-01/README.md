# Guide release — October 1, 2026

[PR #951](https://github.com/seancrecord/scvd-general-store-repo/pull/951)
merged at 14:51:57 UTC as `6714adf00a30bd2bf87b056d3d2cbc8f1a663658`.
All four CI test shards, quality and the required `check` passed. Both
merged-commit Cloudflare builds passed. Receipts: [merge](merge.json),
[CI](ci.json), [deployment](deployment-checks.json).

The first CI attempt stopped on `Network connection lost` in the existing
passport-decision test. All nine tests in that file passed locally; the
failed CI shard then passed on the same source, with no code, timeout or
gate changes. The other successful groups were retained.

## Live result

[Verification](verification.json) passed at 14:53 UTC across nine public
read-only responses:

- Developer guide: **32,551 → 24,499 characters**, about 25% shorter.
- `/developers/llms.txt`, `/docs/llms.txt` and `/api/llms.txt` are byte-identical;
  both aliases identify the canonical URL.
- The index remains below its alarm; every non-menu guide stays inside the
  existing reading budget. The menu's established exemption remains explicit.
- Capability limits appear whole in the linked accountability guide.
- All **52 original sections** occur intact in exactly one modular guide.
- The complete guide is byte-identical to the immediately preceding deployment.

## Baselines and concurrent release

The [first baseline](before.json) was captured before CI completed. The
independent Spot Check release #953 landed during this run and legitimately
changed the complete guide from 176,181 to 178,188 characters. An initial
post-merge read still reached that preceding deployment: the old oversized
developer guide caused the size assertion to fail, and those responses are
retained under [before-deployment](before-deployment/after.json).

That capture supplies the like-for-like full-guide baseline. Its full-guide
SHA-256 equals the final deployed response exactly; no exception to byte
preservation was needed. The final source also passed all 123 focused guide,
navigation and recovery tests again on the combined merge, including the
updated full-guide digest pins from #953.

All response bodies are retained as gzip files beside their metadata.
Every retained body's decompressed SHA-256 was checked against its record.
The [readback script](readback.mjs) derives routes and budgets from source;
run from the repository root with a fresh output directory. Usage:
`node research/guide-release-2026-10-01/readback.mjs before OUTPUT`, then
`node research/guide-release-2026-10-01/readback.mjs after OUTPUT`.
An optional final argument selects a retained baseline JSON relative to OUTPUT;
this run used `before-deployment/after.json` after the concurrent release.

This closes PR3's site-discovery and guide release gates. Authenticated admin
review, package publication, external listing corrections and future AEO
observations remain separate. No buyer qualification or paid action ran here.
