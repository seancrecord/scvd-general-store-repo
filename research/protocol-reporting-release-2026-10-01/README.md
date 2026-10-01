# Reporting release readback — October 1, 2026

[PR #947](https://github.com/seancrecord/scvd-general-store-repo/pull/947)
merged September 30 at `15c7af8e7ae20df1f66f6673d81215c296f4859d` after all
four test shards and the required `check` passed in
[CI run 36778500189](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36778500189).
Both merged-commit Worker builds passed. Subsequent main releases were also
present by this read; the findings verify retained behavior, not attribution
to one deployed commit.

## Public readback

All seven groups passed across 21 read-only public responses at 12:47 UTC.
[Exact checks, timestamps and response hashes](readback.json) accompany the
responses. Bodies are gzip-compressed; each hash covers the decoded original
UTF-8 body. The retained [baseline months](before-months.json) were read
before the reporting release.

- Rails names its monthly x402-only scope separately from combined all-time
  totals; stats names native MPP corrections and the recorded networks.
- Pulse's combined total equals its separate x402 and native MPP counts;
  the x402 conversion denominator remains explicit.
- July and August documents, canonical signed payloads, digests, signatures
  and public keys exactly match the baseline. SHA-256 and Ed25519 signatures
  verify independently with Node's crypto implementation. Dated JSON links
  and the visible historical-scope note work.
- Developer HTML/Markdown/JSON, MCP discovery aliases, the agent manual and
  authentication metadata agree with enabled native MPP checkout. The
  developer protocol list includes x402, MPP, MCP, WebMCP, A2A and UCP.
- Trust describes native checkout separately from endpoint inspection;
  homepage inspection copy is visible outside head metadata. A served
  deployment identifier was retained.

Reproduce against a new output directory with
`node research/protocol-reporting-release-2026-10-01/readback.mjs <directory>`.
A new reading is a new dated observation; do not overwrite this record.

## Remaining boundaries

Authenticated production admin screens were not read. Package publication,
external listing corrections and new AEO/buyer qualification were not
performed. Only July and August were present; no newly sealed combined-total record
was observed. Those additive fields are covered by source tests. No new signed
month was forced and no signed record was rewritten.
The separately committed [guide cleanup](../guide-readability-2026-09-30/README.md)
remains local and needs its own release before live slimmer-guide claims.
