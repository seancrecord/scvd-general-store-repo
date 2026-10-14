# Listing and package review — September 30, 2026

The local manifests are refreshed and the external corrections are prepared.
External pages are not all accurate: two existing install/configuration
corrections remain open, other listings retain old descriptions, and several
records could not be read. Nothing was published, submitted, edited in a
remote account or posted to an issue. No buyer qualification was run.

## At a glance

| Check | Result | Evidence |
| --- | --- | --- |
| Claimed public records | All 82 URLs attempted; 74 returned HTTP 200, 70 contained visible SCVD identity text. These are availability/presence counts, not accuracy scores. | [Every record and its finding](INVENTORY.md), [dated reads](listing-readings.json), [served roster](roster-source.json) |
| Official MCP Registry | v0 search timed out; direct v0.1 reads succeeded. Store 0.2.3 and Tab 0.11.2 are active/latest. Runtime server 0.5.0 is a separate version, not registry drift. | [Direct registry and canonical capability reads](live-capability-readings.json), [failed first read](mcp-registry.json) |
| npm | CLI 0.4.0 source vs 0.3.0 published; preflight 0.3.0 vs 0.2.0; defects 0.21.0 vs 0.20.0. Other five audited versions match. | [Eight package reads](package-readings.json) |
| Existing GitHub submissions | 26 linked issues/PRs read: 23 open, three closed. Closed results are the known A2A modes repair, Awesome Copilot rejection and merged HOL plugin entry. No new admission inferred. | [Submission states](submission-readings.json) |
| Repository About/topics | Correct identity/homepage; About omits MPP and says every verdict is signed. Prepared bounded copy and topic replacements; not applied remotely. | [Current repository metadata](github-repository.json), [correction packet](CORRECTIONS.md) |
| Form-only / gated submissions | No new review/admission evidence for Cursor publisher, Kiro, Muse, UCP forms, Claude portal, GitHub/AGNTCY discussions or ClawHub scan clearance. Prior receipts retain their dates. | Existing keeper entries and DISTRIBUTION.md |

The roster names in this checkout match the served roster read for the audit.
A title match alone does not verify a tool list, price, transport or version.
Unreachable URLs remain unverified; they are not treated as delistings. The
ChatGPT verifier listing was publicly readable this time, showing version
1.0.0 and its free-tool scope; that does not establish publication of the
keeper’s later uploaded skill update.

## Repairs and prepared assets

- **MCP discovery card:** a fresh read exposed the same x402-only summary
  still being copied by directories. All three discovery aliases now derive
  checkout description, native retry instructions and a separate native MPP
  shape from existing capability helpers, with no native claim when disabled.
- **Store MCP manifest 0.2.4 / portable wrappers 0.2.6:** prepared short
  x402/MPP inspection description; plugin keywords include the implemented
  protocol surfaces. MCP identity and endpoint remain unchanged.
- **Generated OASF and Agent Finder draft:** refreshed from canonical inputs.
  OASF is not signed/pushed; the draft Agent Finder URL for 0.2.4 must not be
  sent until that registry version is published and read back.
- **CLI / preflight SDK:** prepared descriptions cover inspection. README
  version requirements distinguish new source features from older npm installs.
  The developer portal labels package versions as source versions and tells
  readers to check npm. No published package was replaced.
- **External corrections:** use the [exact prepared packet](CORRECTIONS.md).
  Prioritize wrong install commands, component confusion and false Free labels
  ahead of wording refreshes and dated tool-count rescans. Existing open issues
  stay the route for MCPpedia and mcp.so; no duplicates were sent.

## Method and limits

Read-only public HTTP requests, plus read-only GitHub API requests. Each
reading retains URL, UTC time, HTTP result/date when available, response hash,
and bounded descriptions/excerpts. Original full response bodies were kept
only in temporary audit files; the committed evidence is deliberately bounded.
No login, challenge bypass, payment, rescan trigger or external write was used.
Directory scores and third-party health labels remain attributed to their
instruments, not adopted as endorsements or current purchase proof.

A2A’s canonical legacy card currently declares 0.3.0, agent version 1.1.0 and
`/a2a`; directory records carrying those fields are not stale merely because a
separate newer A2A interface exists. UCP's canonical profile declares live
catalog/checkout/order and its scoped rail/item set. That is advertised
availability, not fresh paid qualification. The MCP card declares 21 tools;
no browser registration count or compatible wallet was newly tested.

## Validation and remaining gates

The new MCP-card enabled/disabled regression failed before the repair and
passed afterward. Final focused suite: **164 tests / 10 files passed**.
Existing manifest/Agent Finder parity checks: **11 passed**, after synchronizing
the prepared version URL. Typecheck and all three dry-run builds passed.
Earlier package/manifest focused checks also passed 60 tests / six files.

Before release: required full CI shards and review of the prepared publication
sequence. After release: read back the public fixes. Registry/package
publication, GitHub About/topics changes, external correction submissions,
rescans and inaccessible venues remain separate work; they are not marked
completed by a local commit. Confirmation dates and weekly listing baselines
were not advanced.

## October 1 release status

Source merged in [PR #947](https://github.com/seancrecord/scvd-general-store-repo/pull/947)
after all required CI passed. The [public reporting/discovery readback](../protocol-reporting-release-2026-10-01/README.md)
passed; earlier local-only statements above describe their dated checkpoint.
Package publication, external corrections, authenticated admin and native-host
qualification remain separate. The [guide cleanup](../guide-readability-2026-09-30/README.md)
is a later local follow-up, not part of the live readback.
