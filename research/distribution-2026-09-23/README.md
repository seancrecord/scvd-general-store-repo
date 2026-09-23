# Distribution reconciliation — September 23, 2026

A return check after the September 18–20 submissions. Confirmed inclusion,
operator acknowledgments, unanswered requests and transport failures remain
separate. No recurring-fee services, duplicate identities or paid buyer trials.

## Confirmed listings

[Public readback receipt](listing-readback.json). Private correspondence
addresses and message contents are not copied into this record.

- [AgentERC](https://agenterc.com/explore/base/86957): its operator replied
  September 19 that indexing was complete. September 23 rendered readback
  names SCVD General Store, Base 86957, the canonical registration and
  MCP/A2A/OASF/web service links, with x402 enabled. HTTP retrieval also
  returned 200 with the SCVD title. This closes the earlier ingestion
  request, not service-health or reputation qualification.
- [WithAI.Top](https://withai.top/tool/scvd-store): September 19 acceptance
  email corroborated by September 23 HTTP 200, page title and scvd.store
  link. General tool-directory inclusion, not protocol certification.
- [UCP.tools](https://ucptools.dev/directory/scvd.store): public-record change
  #864 merged September 20; live trust JSON readback passed September 21.

AgentERC and WithAI.Top are added to the shared `EXTERNAL_RECORDS` source
and README by this change. AgentERC is grouped under ERC-8004; WithAI.Top
is a general discovery record. Pending submissions do not become records.

## Corrections and unresolved submissions

- MCP.so's rendered config still runs `npx wrangler kv namespace create
  ORDERS`. [Correction #4325](https://github.com/chatmcp/mcpso/issues/4325)
  requests the existing remote `https://scvd.store/mcp` service instead.
- MCPpedia combines General Store's identity, Tab's description and
  Wrangler stdio instructions. [Correction #172](https://github.com/BbekShr/MCPpedia/issues/172)
  supplies the root `server.json` and asks for discovery against the right
  endpoint. Neither correction is confirmed applied.
- Anthropic's signed-in submission dashboard says **No submissions yet**.
  The September 17 [confirmation receipt](../distribution-2026-09-17/observations/claude-publisher-submission.json)
  remains historical evidence. The account menu exposes one organization;
  a targeted contact-inbox search found no review outcome. Added the
  discrepancy to [existing issue #6290](https://github.com/anthropics/claude-plugins-official/issues/6290#issuecomment-5799240583).
  Cause, retained server-side status and admission remain unconfirmed.
  No duplicate submission or new terms acceptance.
- Anro's September 18 email failed final delivery September 21 after
  recipient-server connection timeouts. A working alternate contact or
  free external-ingestion route is needed; this is not awaiting a reply.
- UCPRegistry's September 20 email confirms receipt, not approval.
  Follow-up public searches for `scvd` on UCPList and UCPRegistry each
  returned no results. These are bounded query results, not a rejection
  or proof of absence across either complete directory. [Readback](remaining-directory-readback.json).
- Checked GitHub submissions remain open: Awesome Copilot #3255, Cline
  #122/#123, OpenCode #49834/#736, AIFI #13, Awesome UCP #30, merchants
  #1/#3, UCP directory #3 and MPP #991. No new maintainer response requiring
  a change. The merchants' Vercel preview needs upstream-team authorization.
- 8004scan #51, trust8004 #1 and A2A #184 remain open without replies.
  HOL exact-ID and domain queries each returned 200/zero hits; Agent Arena
  returned 404 for Base 86957. These queries do not establish cause.
  A bounded retry also returned Anro publisher-query 200/zero rows, AgentRanking
  homepage 522 and a DNS failure for 8004.directory. [Readback](remaining-directory-readback.json).
  No canonical identity rewrite was justified by these indexer readings.

## Own issues and the fresh audit

[#803](https://github.com/seancrecord/scvd-general-store-repo/issues/803)
already records merged #868 and stays open for reliable buyer completion.
The separate September 20 cohort remains one complete journey of four,
one interpretation failure and two incomplete journeys. This distribution
pass does not run or rescore buyers. The separate navigation repair
[#899](https://github.com/seancrecord/scvd-general-store-repo/pull/899)
merged September 23 at 17:30 UTC; fresh buyer qualification remains separate.

[#805](https://github.com/seancrecord/scvd-general-store-repo/issues/805)
was reconciled against [read-only run 35892503122](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35892503122).
The instrument's tests passed, the drift reading stayed red, and its original
`listings-reading` artifact is retained. Roster: 80 rows, 65 held, 11
unreachable, three silent, one walled. No baseline reset.

- x402-list now exposes 35 distinct current buy URLs, matching all 35 live
  menu IDs. The earlier `a2a_repair_kit`, `pack` and `window_pick` gaps
  are resolved. September 21 acceptance email also confirms the listing
  update. This is discovery coverage, not checkout qualification.
- Official MCP Registry requests failed in the workflow; direct retry
  returned active/latest General Store 0.2.3 and Tab 0.11.1 matching source.
- scvd-preflight 0.2.0 and x402-verify 1.7.0 match published source.
- Agentic Market's search returned 20 endpoints, but the direct service
  detail returned 30. A live exact-path comparison finds five current menu
  IDs absent from that detail: `a2a_repair_kit`, `opening_day`,
  `trust_profile`, `operator_statement`, `aura_walk`. The initial search
  reading remains preserved; it is not a full listing count.
- Fixed both repository readers to use the same detail endpoint and to
  require a matching domain. The weekly comparison now says **returned
  endpoints**, and the manual report no longer turns response gaps into
  proven removal or a proven registration/sync cause. A regression fixture
  returned one endpoint for search and two for detail: it failed before
  the fix and passed after. All 38 listings tests passed. The corrected
  live manual reader returned 30/35, with the five gaps above. Eligibility
  and complete-index coverage remain unverified; no third-party update
  or purchase was made. [Count receipt](agentic-market-reading.json).
- Follow-up through Agentic Market's own [seller validator](https://agentic.market/validate):
  all five absent endpoints returned **Implementation Looks Correct**, with
  every required check passed. Its guidance says a qualifying verify+settle
  is needed before Bazaar indexing. The already-listed `hello` control
  returned **Found on Bazaar**. This narrows the next step to observing a
  qualifying settlement and subsequent indexing; it does not prove no
  earlier purchase exists. No payment or fabricated adoption was generated.
  The dated receipt above records each result.
- ClawHub's unlabelled HTML remains an instrument limitation; publication
  has its separate saved receipt.

## Package release

The [scvd-defects 0.20.0 dry run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35892837686)
passed tests and packing. The keeper then ran the [actual publication](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35893806398)
September 23: Publish succeeded and logged `+ scvd-defects@0.20.0` from
`9d04efe5428eacd9eb997a34cae7e6edad2a3e36`. No duplicate publication was
started here. Initial npm reads still returned 0.19.0/latest and 404 for
0.20.0. A later registry read exposed latest 0.20.0. A fresh public install
then matched all 31 package files byte-for-byte against the publication
commit; npm verified its registry signature and provenance attestation.
The installed vocabulary reports v20 and the corrected unpaid-read buyer
hint. [Verification receipt](defects-publication.json).

## Validation

The updated trust-panel expectation failed against the old records at the
AgentERC inclusion assertion. This change preserves the same protocol index
and shared HTML/JSON source. The full local attempt passed 826 files and
15,479 tests, with one failed disclaimer-wording assertion, one skipped test
and two Worker startup timeouts. The new WithAI copy now uses the guard's
explicit disclaimer form. Both trust specs and both startup-timeout files
then passed together: four files, 27 tests. Typecheck, docs, 38 listing tests
and Worker/MPP dry-run builds passed. [Validation receipt](validation.json).
The full attempt stays recorded as red; the complete hosted suite gates merge.
No pending upstream correction is represented as fixed.
