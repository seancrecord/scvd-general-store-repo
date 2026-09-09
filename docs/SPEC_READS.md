# Spec reads — the store's positions on adjacent protocols

## 2026-09-09 — Bitcoin header verification and verifier publication

Read the [OpenTimestamps client](https://github.com/opentimestamps/opentimestamps-client)
and its installed Python library: `BitcoinBlockHeaderAttestation.verify_against_blockheader`
checks the computed proof message against a selected header's Merkle root.
The standard client normally obtains chain membership from Bitcoin Core.
This sitting checked saved proof operations against matching headers from
two HTTPS explorers, including header hash and proof of work; it did not
validate a local chain. Read the [Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md)
for height-to-hash and serialized-header endpoints. URLs and capture dates
for all selected headers are in `research/verification-2026-09-09/`.

Re-read [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
and the [Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/)
before adding the missing corpus upgrade pass. Existing KV/R2 helpers and
the hourly `waitUntil` pattern are reused; signed bytes are not rewritten.
Read [npm provenance guidance](https://docs.npmjs.com/generating-provenance-statements/):
publication will use the existing GitHub-hosted workflow and provenance,
not a laptop token export. Public npm was still at x402-verify 1.0.2 at the
start of this sitting. Publication results belong in DISTRIBUTION.md.

The directory service and Coinbase mappings were re-read. The same
attribution discrepancy remains. Existing Base transaction evidence is
historical and reused, not described as a fresh chain read. The
[methodology](https://www.x402-list.com/methodology) describes transaction
origin for facilitator attribution, but uses “sender” of a USDC transfer
for service attribution; the prepared note asks which field that means.
The [contact page](https://www.x402-list.com/contact) identifies
info@x402-list.com. Web extraction missed that page; a direct HTTPS read
succeeded. No message sent.

## 2026-09-08 — Verification implementation and live reconciliation

Follow-through on the recommendation below, authorized in the same sitting.
Read the current [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
and [Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/).
The changes reuse the existing payment gate and metadata. Both Worker
bundles were checked with the existing dry-run command; no deployment.

Read [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) and the
[@noble/post-quantum source documentation](https://github.com/paulmillr/noble-post-quantum).
The installed 0.7.1 README explicitly says no independent audit. An exact
pin and separate lockfile keep the local experiment out of production.
The real dual-signature pilot and a second verifier process passed;
same-library verification is not independent interoperability or FIPS
validation. Full limits and results: `experiments/pqc/README.md`.

Read the [OpenTimestamps detached-file serialization](https://github.com/opentimestamps/python-opentimestamps/blob/master/opentimestamps/core/timestamp.py).
The store serves raw calendar operations, so a portable `.ots` file needs
the detached-file magic, version, hash operation and digest. The standard
client independently parsed the exported real receipt proof. It did not
validate the Bitcoin header chain. No server `bounded` label was promoted
to a local proof verdict.

Public receipt and key reads succeeded on the direct HTTP client at
20:44 UTC. The receipt signature was checked locally against that separate
HTTPS key capture. Saved directory service, facilitator, transaction and
USDC logs show the directory already tracks this receipt's Coinbase
origin while marking the service `unmeasured-network`. Attribution or
harvest/computation coverage is now the question, not an assumed missing
store facilitator. It is the keeper's browser canary, not organic demand.
No directory message was sent. Source URLs, timestamps, CC BY 4.0
provenance and joins: `research/verification-2026-09-08/`.

The corpus index and latest record exceeded the bounded read's 8 MiB cap;
their unreadability remains recorded. Snapshot 1 was captured for a local
file-checkpoint experiment only. No corpus-wide anchor percentage is
claimed. The source bundle now exists locally, superseding the absence
noted in the recommendation read below; npm publication is pending.
Design, actual result and remaining limits:
`docs/VERIFICATION_OBSERVATIONS_2026-09-08.md`.

## 2026-09-08 — Adjacent verification products: recommendation read

Read [x402-list's methodology](https://www.x402-list.com/methodology),
especially per-service attribution and its instruction to submit missing
facilitators with settler wallets. Attribution requires tracked settler
addresses and the service's payTo mapping; a ranking gain is not established.
The current checkout code constructs the Coinbase CDP facilitator client
(`src/lib/payments.ts`), so the supplied premise that an unregistered
store-operated facilitator explains the gap needs transaction-level checking.

Read [Rubric's homepage](https://rubric-protocol.com/) and
[canonical-host documentation](https://rubric-protocol.com/docs).
They describe ML-DSA-65, direct and batched Hedera anchoring, pending
states, MCP tools, and encrypted retention. These are vendor claims,
not a reproduced paid workflow or cryptographic audit. The keeper
subsequently confirmed in this sitting that Rubric is the competitor
in the supplied comparison, resolving the initial identity uncertainty.
That confirmation does not independently verify the product claims. The blanket claims
"every artifact immediately anchored" and "no MCP" must not be repeated
about Rubric: its own documentation describes batching, delay and MCP.

Read [NIST's PQC migration guidance](https://www.nist.gov/pqc) and
[NIST IR 8547 initial public draft](https://csrc.nist.gov/pubs/ir/8547/ipd).
ML-DSA is standardized; migration planning is warranted. Neither source
establishes a quantum-computer arrival date or buyer demand for this store.
Preservation must distinguish signature authentication from an independently
verified existed-by proof; a future signature alone cannot recover lost
historical authenticity after compromise.

Local reconciliation: `src/services/certificate-anchors.ts` already submits
individual certificate signed-payload digests through an hourly bounded sweep;
`src/services/anchor-submit.ts` gives key-history snapshots a daily interval;
the weekly corpus is a separate chain. Coverage and backlog remain relevant,
and this read did not verify deployed proofs. Algorithm labels already appear
in `src/routes/verify.ts`; signing remains Ed25519. Product specimens and
derived sample links already exist in `sample-artifacts.ts` and
`shopping-fields.ts`. A portable offline evidence bundle remains explicitly
absent in `src/store/attestation-spec.ts`.

Gaps: the web fetcher could not read the store's selected live certificate,
its x402 well-known document, or Rubric's llms.txt. No payment, vault opening,
signature verification, ledger proof verification, current scoreboard capture,
or attribution reconciliation was performed. Reported latency, price-stability,
age, Algorand counts and vault attempts remain the keeper's supplied observation.
This is a recommendation read, not a product change or a revised build queue.

## 2026-09-06 — A2A live compliance and the checker itself

Follow-through, same sitting: re-read the versioned request definitions and
Cloudflare's [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
and [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
references. A result and its expiry alarm commit in one Durable Object
transaction; task retrieval checks expiry even before cleanup runs. KV
was not selected because cross-edge read-after-write is required. The
runtime validators are generated from the retained official schema with
the existing Ajv development dependency; the Worker does no dynamic code
generation. No new production dependency or secret. The A2A task binding
uses a new SQLite class migration, applied by deployment, not version upload.

Read the [official A2A 0.3.0 specification](https://a2a-protocol.org/v0.3.0/specification/)
and [versioned JSON schema](https://raw.githubusercontent.com/a2aproject/A2A/v0.3.0/specification/json/a2a.json),
especially Task.contextId and core task retrieval/cancellation. Ran
`@a2a-compliance/cli@0.3.3` against the live store: mandatory gate exits 0,
but a successful task fails the official schema (missing contextId), the
same task cannot be fetched, and a null part produces HTTP 500. The
checker's published schema makes contextId optional; its version mapping
also differs from the official spec. Do not adjust our wire to flatter it.
Exact readings, versions, reproduction and gaps:
`docs/A2A_COMPLIANCE_2026-09-06.md` and `research/a2a-2026-09-06/`.

Read the [checker README](https://github.com/UltraSkye/a2a-compliance) and
its cited [issue #1755](https://github.com/a2aproject/A2A/issues/1755).
The near-zero claim is an OpenClaw research agent's reported 50-agent
sample, not verified here as a statement by protocol maintainers. The raw
sample was not reproduced. Official structural validation disabled format
checks; no TCK, Inspector, authentication, streaming, paid call or third-party
task was exercised. L11 is the future battery, not a new product build.

## 2026-09-06 — Desvela Registry Watch and publisher records

Read https://desvela.dev/registry-watch directly (the web-fetch cache
missed; a direct HTTPS GET succeeded). Confirmed the six event types,
four surface kinds, raw-body HMAC-SHA256 header, caller User-Agent,
weekly change-only delivery, and optional platform_template flag.
Read Cloudflare's current Workers best practices and Web Crypto docs;
use native HMAC verification and await the private receipt write before
acknowledging delivery. Existing trade-counter receipts, KV retry,
bulk reads, and admin authentication supply the local pattern.

Opened https://neuronto.com/ard-publishers/scvd.store and
https://wellknownhq.com/d/scvd.store and confirmed the domain's publisher
records. https://desvela.ai/check#domain=scvd.store is a checker link,
not a publisher profile; it is labelled separately in the README.
The keeper reported grades of A/100 from WellKnown and Desvela and B/83
from Neuronto. No grade is frozen into public copy. The supplied
impressions are index appearances, not unique visitors. The corrections
query matches both saved September 6 registry-verification requests:
22:51:23Z and 23:28:03Z, each returning the general-store server entry
at rank 4. That is the exact count and rank in the supplied table; treat
this row as verification traffic, not evidence of outside demand.
Saved response excerpts: [before](ard-discovery/2026-09-06/corrections-query-before.json)
and [after](ard-discovery/2026-09-06/corrections-query-after.json). The site's
exclusion of its own probes does not establish exclusion of ours.

Not performed: watch registration, secret generation, a real Desvela
webhook delivery, or attribution of individual search requests.
Operational contract: [Registry Watch receiver](DESVELA_REGISTRY_WATCH.md).

## 2026-09-06 — ARD search-query coverage

Read [Neuronto's publishing guide](https://www.neuronto.com/publish) and
the keeper's live discoverability scorecard: 21 entries, only five with
representativeQueries, zero conformance errors and 16 warnings. The
guide asks for 2–5 requests per entry in the words a caller would use.
This is a discovery requirement beyond passing the JSON schemas; the
existing test skipped entries without queries and therefore concealed
the gap. Every emitted entry now has queries, including datasets and
feeds, whose queries live beside their source descriptions.

Read the actual dataset and feed declarations and the execution-contract
skill before writing its requests. Queries describe the evidence those
resources serve: inflows remain transfers, fixtures remain test material,
and dated observations remain dated. No media type was relabelled merely
to fit an audit allowlist.

Both ARD head links were present in live homepage HTML fetched with
Accept `*/*` and `text/html` despite the scorecard's missing-path finding.
The cause is reproducible: [Neuronto's audit source](https://github.com/neuronto/agentic-resource-discovery/blob/main/app/audit.py)
sends Accept `application/json,*/*` to every path, including the homepage,
then searches that response for HTML link tags. Our homepage correctly
returns JSON for that request and HTML with both tags for an HTML request.
Changing content negotiation to satisfy that detector would break the
agent's JSON door. Registry admission and query ranking are external results;
coverage changes do not guarantee a particular score or search position.

## 2026-09-06 — ARD trust-manifest signing

Read the [current ARD specification §4.5–5.1](https://agenticresourcediscovery.org/spec/),
the [entry schema](https://raw.githubusercontent.com/ards-project/ard-spec/main/spec/schemas/ard-entry.schema.json),
[RFC 7515 Appendix F](https://www.rfc-editor.org/rfc/rfc7515#appendix-F), and
[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).
The current ARD text delegates signing bytes and verification to
`trustSchema`; it does not itself prescribe JWS/JCS. This store declares
the requested EdDSA detached-JWS / RFC 8785 profile at
`/attestation#ard_trust_manifest`. Its payload is the trust envelope
minus `signature`. A signed `provenance.sourceDigest` binds the full catalog
after omitting only `host.trustManifest` and each `entries[].trustManifest`:
SHA-256 of its JCS UTF-8 bytes, lowercase hex prefixed with `sha256:`.
Without this binding a genuine identity envelope could be copied onto
forged entries without the signing key. Both the JWS and the catalog digest
must verify. Detailed limits and the anchor check live on the linked
governance page because the older schema rejects custom trust fields.
`type` and the parent
AI Catalog's `mediaType` are both emitted from one entry type.

Repository evidence: the existing DID document publishes the certificate
key as an OKP JWK. `/.well-known/scvd-signing-key` is a hex-key directory
with history and a DID link, not a JWK Set. No new key or key endpoint
is needed. The anchor log commits snapshots with SHA-256 links and OTS;
the handover announcements, separately, are signed by outgoing keys.
The verifier must check both succession and external Bitcoin evidence,
including continuity from a previously trusted checkpoint. Neither a
same-origin key nor a claimed `existed_by.status` authenticates itself.

Also read [the client guide](https://agenticresourcediscovery.org/how_to_build_a_client/)
and [interoperability](https://agenticresourcediscovery.org/interoperability/).
For future ecosystem research: query an operator-approved registry with
`POST /search`, verify trust, then connect through the resource's native
protocol. Publishing once permits independent indexing; it does not prove
any registry has indexed us. The guide advertises connectors for Claude,
ChatGPT, GitHub Copilot, Microsoft Copilot and Gemini; their installation,
registry coverage and discovery of this store were not exercised.

Gaps: the legacy `trust_manifest/` page and raw `spec/ai-catalog.md` could
not be retrieved. The current normative text and entry schema were read;
no live anchor proof or production signature was verified in this build.
Workers handling was checked against the [current best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
and installed types. The signing path adds no binding, runtime dependency, network
request or KV write.

**THIS FILE IS NOW LOAD-BEARING (rule 61, 2026-09-06).** It was a
register of positions kept out of good practice; it is now the
evidence any work that turns on an outside fact has to cite. A read
that is not written here did not happen. Name the source, the date,
and the parts that stayed secondhand — a read with no gaps declared
is the one to distrust.

One dated entry per read. These are POSITIONS, not implementations:
what the protocol is, what it would cost us to speak it, and what we
say about it until we do. The standards-boundary law applies to every
entry — we say "x402-native", "maps to", "references"; we never say
"compliant with" a protocol whose flows we have not implemented.

Sourcing note (2026-08-21): the primary spec hosts (docs.stripe.com,
mpp.dev, x401.id, developers.circle.com) are egress-blocked from the
build environment, so these reads are assembled from secondary
coverage and Circle's own announcement posts, dated below. Byte-level
claims (header names, envelope fields) are therefore NOT settled facts
here — any build that touches wire format re-reads the primary spec
first. Positions and boundaries below don't depend on those bytes.

## 2026-09-06 — ARD catalog envelope and live registry discovery

Read [the published proposal](https://agenticresourcediscovery.org/spec/)
and both upstream schemas at [commit aa3e598bb775](https://github.com/ards-project/ard-spec/tree/aa3e598bb7752a9175897823234311216acfa864/spec/schemas).
The proposal remains v0.91; the catalog envelope's `specVersion` enum is
`1.0`. These are separate version namespaces, not a new v1.0 proposal.
The catalog schema rejects extra root properties: our root `updatedAt`
and `trustManifest` must go. Entry timestamps and identity remain legal.
`host` is optional in that schema, but when supplied requires displayName;
the reported registry validator also requires host. Its optional fields are
identifier, documentationUrl, logoUrl and trustManifest. The host identifier
can reuse our published DID; signing remains separate work. Optional
representativeQueries has a 2–5 constraint in the catalog schema; all five
query-bearing entries already satisfy it. Entry updatedAt must be date-time,
so normalize the existing date-only catalog date to midnight UTC without
claiming a fresh observation. The newer entry schema permits
additional envelope properties and relaxes query counts; validate both.

Fixtures preserve upstream bytes. Live indexing and submission evidence is
recorded in `docs/ARD_DISCOVERY_2026-09-06.md`; publication alone is not indexing.
Gaps: schema validity cannot establish signature verification, registry
admission, or search visibility. Those require separate live observations.

## 2026-09-06 — AWS registry cleanup

Read the primary [AWS registry overview](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry.html)
and [registry concepts](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-concepts.html)
for the remaining ROADMAP C3 and delegated-agent decision 4 cleanup.
AWS describes a catalog created in an AWS account, with authorization
and approval configured by its administrator. That supports a named
customer integration; it does not establish the general public listing
press the old rows assumed. Those rows now withdraw that assumption.
The store's existing ARD endpoint remains built.

Gaps: these primary pages were returned by web search; no AWS console,
customer registry, or publication flow was exercised. This read does not
verify the earlier entry's launch date or future cross-organization
roadmap, and does not turn other secondhand venue notes into primary reads.

## 2026-09-06 — the listing and discovery surfaces, read under rule 61

The read that motivated rule 61, recorded first so the rule ships with
its own evidence rather than as an instruction nobody has followed yet.
Occasioned by two listings in this repository being found stale on the
same afternoon: `DISTRIBUTION.md` called the Cursor directory a place
that "accepts submissions" while `trust-signals.ts` had carried its
page, and the archived venue list called mcpbeat "not yet opened" while
the same file carried two of its pages. Both errors were repeated aloud
from the written record before anyone read the live one.

**REACHED, and what each settled.**

- **OpenAI plugins.** The App Directory folded into the Plugin
  Directory on 2026-07-09; a plugin bundles an app (a remote MCP
  server), skills and app templates, and is submitted at
  platform.openai.com/plugins. Domain control is proved by a bare
  token at `/.well-known/openai-apps-challenge` on the ORIGIN ROOT —
  the `/mcp` subpath is stripped server-side. Their scan opens a GET
  expecting `text/event-stream` before it POSTs anything. Commerce is
  physical-goods only: "selling digital products or services —
  including subscriptions, digital content, tokens, or credits — is
  not allowed, whether offered directly or indirectly." Filed as
  DISTRIBUTION §5b; both wire facts are now built and tested.
- **Claude connectors.** Submission is through the portal in a Team or
  Enterprise organisation's settings on claude.ai. A personal Pro
  account cannot reach it. The two technical gates the store already
  meets — a public privacy policy and a remote streamable-HTTP server
  — are not the blocker; the organisation is.
- **Perplexity.** THERE IS NO DIRECTORY TO SUBMIT TO, which corrects
  what DISTRIBUTION §5 said. Two paths exist and neither is an
  application: any Pro, Max or Enterprise user adds a custom remote
  connector by pasting the MCP URL (remote MCP URLs launched there
  2026-03-13), and built-in connectors are business-development
  partnerships (Semrush, 2026-06). The action is documentation, not a
  form.
- **AWS Agent Registry.** GA 2026-08 as part of Bedrock AgentCore, and
  it is a PRIVATE catalog a customer creates in their own AWS account,
  shared across accounts by AWS RAM. There is no public AWS-hosted
  directory a third party lists in for discovery; cross-organisational
  discovery is announced future work. The AWS-aligned discovery move is
  the open ARD specification, which this store already serves at
  `/.well-known/ard.json`. A keeper-list row that read "an AWS Agent
  Registry entry" was written on the opposite assumption.
- **WebMCP directories.** At least six list sites — webmcp.com (email
  and URL, human review), webmcp.cool (nekuda; a scanner verifies the
  tools are live), webmcpdirectory.com, webmcplist.com, webmcp.ora.ai
  (which grades each row as a registry claim, tools observed live, or a
  full audit), and webmcp-registry.dev (DNS TXT proof of control).
  Four more audit rather than list: webmcpaudit.com,
  webmcpvalidator.com, webmcp-checker.com, and Discovered Labs'
  agentic-browsing-checker. NONE appears in `trust-signals.ts`, though
  the store has served `webmcp.js` for weeks.

**NOT REACHED, and therefore secondhand (rule 55).** Every one of
these domains is egress-blocked from the build sandbox:
developers.openai.com, help.openai.com, learn.chatgpt.com,
community.openai.com, docs.aws.amazon.com, www.perplexity.ai, and all
ten WebMCP hosts above. The findings are assembled from search results
and secondary coverage. The two OpenAI wire facts are the exception and
are NOT secondhand — the challenge path and the SSE probe were proved
against the live portal, which failed and then passed. Everything else
here should be re-read from a primary source before anything is built
on it, and the WebMCP list in particular is a list of names to go and
look at, not a set of confirmed listings.

## 2026-09-06, third pass — A2A's URL and the browser door's listings

Three reads the register itself asked for, plus one lesson that cost a
morning's work and belongs on the record.

**THE A2A SPECIFICATION HAS A HOME, AND WE ALREADY SERVE THE RIGHT
PATH.** `a2a-protocol.org` is the specification site; the reference
repository is `github.com/a2aproject/A2A`. Google donated the protocol
to the Linux Foundation in June 2025 for neutral governance and it
reached v1.0 in 2026. The spec recommends the agent card at
`/.well-known/agent-card.json` under RFC 8615 — which is exactly where
this store serves it, checked live today alongside
`/.well-known/a2a.json`. The gap the register flagged was in our
RECORD, not our behaviour: the card was right and the citation was
missing. `a2a-agent-card` is now its own row, sourced at the
versionless site because the specification is versioned and a pinned
URL would rot.

**AWS: SUPERSEDED BY THE PRIMARY READ ABOVE.** This pass reached the
same conclusion from search results while another session reached the
AWS documentation itself ("AWS registry cleanup", above, which cites
the registry overview and concepts pages). Theirs is the primary read
and this one defers to it rather than restating it: two entries saying
the same thing from different evidence is how a register starts
disagreeing with itself. The ROADMAP C3 and decision-4 rows carry
their wording, not this session's. What stands from here: the spec
watch's `aws-ard` row, and the point that ARD — the open specification
AWS itself published — is the discovery move, already served at
`/.well-known/ard.json`.

**THE BROWSER DOOR HAS EXTERNAL RECORDS AT LAST.** The keeper supplied
four URLs, closing the gap found this morning — the store had served
`/webmcp.js` for weeks with not one listing row behind it. Four rows,
kept apart on purpose: `webmcpdirectory.com` and `webmcp.ora.ai` are
WebMCP directories, `directory.ora.ai` is Ora's wider agentic index,
and `ora.ai/score` is an INSTRUMENT rather than a listing, filed with
the separation the two Circle rows already keep. None was opened from
here; all four are the keeper's confirmation, the standard every row
in that file runs on.

**⚑ THE LESSON, RECORDED AGAINST US.** An agent spent this morning
building the verifier door — roadmap A3, `/mcp/verifier`, five
read-only tools — and it was already built and merged, in
`src/routes/mcp-verifier.ts`, under the memo's own task-shaped names,
wired into the atlas, the catalogs, the docs and the porch count. The
work was discarded whole. The cause was exactly what rule 61 names,
turned inward: a picture of the repository formed earlier in a long
session, trusted instead of re-read, while other sessions merged into
main the whole time. **Rule 61 says outside facts expire. So does the
state of this repository during a session that changes it.** Before
building anything from a roadmap row, re-read main and grep for the
thing — a test file named for the feature would have shown it in one
command.

## 2026-09-06, later — the register's own sources, challenged and corrected

The keeper's question, hours after rule 61 was adopted: are those the
right sources, and is Amazon not doing WebMCP work? Both halves earned
a change, and the first one caught a row that was wrong on its opening
day — which is the register working, not the register failing.

**THE x402 SPEC HAD ALREADY MOVED, AND TWO ROWS POINTED AT A FORK.**
Governance went to the x402 Foundation: announced with Cloudflare
2025-09-23, formalised under the Linux Foundation 2026-04-02 with 22
launch members (AWS, Circle, Google, Mastercard, Stripe, Visa among
them). The repository is `github.com/x402-foundation/x402`;
`coinbase/x402` is now a development fork. `x402-wire`,
`offer-receipt` and `x402-client-defaults` all cited the fork.
`docs/PROTOCOL_EXPANSION_2026-08.md` had recorded the foundation in
August and the spec URL was never moved with it — a fact known in one
file and stale in another, which is the same shape as the listing
drift that started this whole thread.

**WEBMCP: THE SOURCE IS RIGHT, THE FACT MAY NOT BE.** The W3C Web
Machine Learning Community Group draft is the spec of record — a Draft
Community Group Report, not on the standards track, edited by Google
and Microsoft engineers, most recent revision reported 2026-07-21, API
surface still changing between drafts. So the row's source stands. But
this repository records `document.modelContext` as the surface with
`navigator.modelContext` deprecated, and sources read today still show
`navigator.modelContext.registerTool()` in the @mcp-b polyfill. A
moved spec with a lagging polyfill explains both; so does our note
being wrong. Nobody here has opened the draft. The row now asks the
question instead of asserting the answer, and it is the read to do
before anything touches `/webmcp.js`.

**GOOGLE, YES. AMAZON, NOT IN WEBMCP.** Google moved WebMCP from
prototype to public origin trial at I/O 2026, with Gemini as the
in-browser agent and the trial reported as Chrome 149 to 156; Edge
ships it behind a flag. That makes Chrome the browser door's landlord
and its trial window a date this store depends on, so the row now
carries the window rather than a vague "unexpired". On Amazon: no
WebMCP standards work found. What exists is adjacent and easy to
conflate — AWS shipped a managed MCP server (GA, OAuth 2.1 through
AWS Sign-In since July), AgentCore has a browser tool, AWS is a launch
member of the x402 Foundation, and Alex Nahas built MCPB, WebMCP's
precursor, while at Amazon. Real proximity, no specification work.
Recorded so the next intake does not re-open it on the same hunch.

**ROW 14 WAS ONE ROW DOING FIVE JOBS,** covering llms.txt, agents.md,
RFC 9727, ARD, ai-catalog and the A2A card against a single source
that describes one of them. Split into `llms-txt` and
`well-known-catalogs`. The second carries the sharper finding: **the
A2A specification's canonical URL is written down nowhere in this
tree.** The store serves an agent card at three paths against a shape
it cannot cite. Establishing that URL is the first read that row is
due.

**EVERY SOURCE ABOVE IS SECONDHAND (rule 55).** github.com,
developer.chrome.com, the W3C hosts and aws.amazon.com are all
egress-blocked from the build sandbox; this is assembled from search
results, and not one of the primaries was opened. Five rows now carry
a `caveat` field saying what is unsettled about the row itself, and
`npm run specs:check` prints them under a ⚑. A register whose own rows
are presumed sound is the failure rule 61 describes, so the doubt
travels with the row.

## 2026-08-30 — the cross-protocol re-read (supersedes the sourcing caveat above, in part)

The three reads below were assembled under an egress block. On
2026-08-30 a wider read reached some of those primaries and their
mirrors — the cloudflare-docs repository, the AWS AgentCore SDK, the
x402 Foundation issue tracker — and could still not reach
paymentauth.org, docs.stripe.com or developers.circle.com directly.
The result, with what changed, what stands, and what is still
secondhand, is filed at `docs/PROTOCOL_EXPANSION_2026-08.md`. It covers
MPP, Circle Gateway nanopayments, AP2, ACP/UCP, x401 and the discovery
surfaces around them, and it re-poses (does not re-rule) the MPP gate
in PAYMENT_RAILS Part B. The positions below stand until the keeper
rules; the door-cost sizing in the MPP entry is superseded there.

## 2026-08-21 — MPP (Machine Payments Protocol, Stripe + Tempo)

**What it is.** An open protocol co-authored by Stripe and Tempo,
released 2026-03-18 (the day Tempo's payments L1 hit mainnet). Same
door as ours — HTTP 402 — with a Challenge → Credential → Receipt
flow. It is the multi-method envelope: one agent flow that can settle
over stablecoins on Tempo, a linked card via Stripe's Shared Payment
Tokens, or Stripe PaymentIntents generally. Streaming/session
payments: agent deposits to escrow, issues cumulative EIP-712 signed
vouchers per request, server verifies with a bare ecrecover;
micro-amounts batch-settle when the session closes.

**How it relates to x402.** x402 is the one-shot stablecoin handshake
wire format; MPP wraps that shape and adds card rails, subscriptions,
and sessions. They are siblings at the same status code, not
competitors at the wire level. Several aggregators already describe
services as "x402/MPP" as one capability class.

**The chargeback question (the open RULE, now framed for the
keeper).** MPP settlement runs through Stripe machinery — refunds,
disputes, Radar, the dashboard — which means the rail is REVERSIBLE:
a payment can come back weeks after it lands. Our certificates are
forever-signed observations. The collision: a cert minted against a
payment that later reverses is still a true observation ("we saw this
paid and delivered at this moment") but a false implication if a
reader takes "paid" to mean "finally settled". The house already has
the cure in doctrine: outcome-verification separation — paid /
settled / executed / delivered / externally-observed / not-checked as
distinct fields, never collapsed.

**Position (recommended, not ruled):** if we ever accept a reversible
rail, the artifact carries a `settlement_finality` field —
"irreversible rail" for on-chain USDC as today, "reversible window
open until <date>" for card-shaped rails — and the cert language
never promises finality it cannot see. We do NOT delay signing (kills
instant delivery, our best property) and we do NOT refuse reversible
rails outright (closes the biggest future door). Until the keeper
rules and a build lands: we accept no reversible rail, and our copy
nowhere claims MPP support.

**What a build would take.** A Stripe account + PaymentIntents
integration (config-level for an existing Stripe merchant — Record
Creative Co. may already have one), MPP challenge emission alongside
our x402 402 body, and the finality field above. Medium build, real
new revenue surface, gated on the keeper's chargeback ruling.

## 2026-08-21 — Circle Gateway (and the badge's contents)

**What it is.** Circle's crosschain primitive: deposit USDC into the
non-custodial Gateway Wallet contract on any supported chain and it
becomes one UNIFIED balance, spendable on any other supported chain
in under 500ms. Transfer works by user-signed burn intent on the
source side and a Circle attestation authorizing a mint at the
destination. Mainnet since mid-August 2026 on Arbitrum, Avalanche,
Base, Ethereum, Optimism, Polygon, Unichain (11 EVM chains + Solana
per current docs), with ERC-1271 support added 2026-08 so smart
wallets can authorize with their existing logic. It also powers
Circle's "Nanopayments" — gas-free sub-cent transfers — which is the
same item already on the keeper's backlog by name.

**What the greyed badge would include for us.** The good news: on the
receiving side, a Gateway payment ARRIVES AS NATIVE USDC on a chain
we already accept — the mint at the destination is plain USDC to the
payTo. Base, Polygon, and Solana are all Gateway chains and all three
are our rails. So a buyer holding a unified balance can already pay
us today; the badge is about DECLARING that capability (and possibly
accepting Gateway-attested settlement as a first-class flow /
supporting nanopayment-scale pricing). Likely the cheapest badge on
the card: mostly a declaration plus a read of Circle's exact badge
criteria once we can reach the primary docs — no new settlement code
on the happy path.

**Position:** say nothing until verified against Circle's own badge
criteria (verified-fact law), but expect this one to be a small PR,
not a build. Worth raising on the Haider call: "what exactly does the
Gateway badge check for — do we already qualify?"

## 2026-08-21 — x401 (Proof: identity at the 401 door)

**What it is.** Launched 2026-06 by Proof, spec v0.2.0 at
x401.proof.com. The identity twin of x402: where 402 says "pay
first", x401 uses HTTP 401 challenges to say "prove who is behind
this agent first". The agent answers with a verifiable credential (a
"VP Artifact") proving verified human/organizational authority,
issuer-neutral (government ID, corporate badge, DID — any issuer).
Contributions named from Circle, OpenAI, Google, Okta. Explicitly
designed to compose with x402: identity + payment in one transaction.

**How it maps to what we have.** Our claims desk (CAIP-122 / SIWX) is
WALLET identity — "this address consents". x401 is PRINCIPAL
identity — "a verified human/org authorized this agent". They are
complementary layers, not substitutes. Circle's scanner surfaces this
class as the Proof-of-Human badge (World ID is the other route in
that cluster, and that one needs keeper enrollment).

**Position:** watch, don't implement. The spec is v0.2.x and young;
requiring identity at our door would also cut against the store's
open-porch posture (any agent with a wallet may buy). Two cheap
future moves when it matures: (a) the conformance battery learns to
CHECK an x401 challenge's shape on other people's endpoints — reading
the protocol is our lane even when we don't speak it; (b) if agentic
marketplaces begin requiring it merchant-side, revisit. Nothing in
our current copy references x401.


## 2026-09-06 — machine-readable checkout and the chain boundary

Read for the machine-readiness release, under rule 61. Primary sources
were reachable directly in this session:

- [Foundation HTTP transport](https://raw.githubusercontent.com/x402-foundation/x402/main/specs/transports-v2/http.md):
  v2 uses the PAYMENT-REQUIRED header for the challenge and
  PAYMENT-SIGNATURE for the signed retry; amounts are atomic strings.
- [Foundation MCP transport](https://raw.githubusercontent.com/x402-foundation/x402/main/specs/transports-v2/mcp.md):
  payment challenges are tool results with isError true, identical
  structuredContent and JSON text; payments and settlement receipts
  use x402/payment and x402/payment-response metadata. The store's
  payment=tool-result URL is an explicit compatibility selector of
  our own, not a query parameter prescribed by the spec. The existing
  RPC-error profile remains available for existing callers.
- [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28):
  the current revision is available; docs and verifier connections
  use the main server's negotiation and metadata handling.
- [CDP facilitator](https://docs.cdp.coinbase.com/x402/seller/facilitator):
  its current production-network table lists Base, Polygon, Arbitrum,
  World and Solana. Ethereum, Optimism and Avalanche are absent.
  The live store's cached facilitator capability list was also read
  through KV: v2 exact includes those five production networks and
  their listed testnets. This is a cached observation, not a new
  authenticated supported call: the local CDP credential loader had
  neither credential, so a direct authenticated refresh did not run.
- [Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
  and [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/):
  the quote Worker is a separate deployment. Its configuration must
  agree with the store; a service binding does not copy secrets.

**The distinction the keeper asked about.** The September 3 addition
of Ethereum, Arbitrum, Optimism and Avalanche was reader support
(PAYMENT_RAILS Part F); it did not add checkout rails. The till still
registers Base, flag-enabled Polygon and flag-enabled Solana. A
statement's network argument chooses the evidence chain, not the
payment chain. The compact contract now says that at checkout.

**Gaps.** These reads do not prove every MCP host implements the new
payment profile, nor that an arbitrary older x402 SDK can pay v2.
No live settlement was made. Adding Arbitrum or another checkout rail
still requires the receiving-address decision, settlement integration,
receipt/refund/reconciliation coverage and payment tests; a matching
SDK or reader enum alone does not establish those properties.

## 2026-09-06 — checkout copy, browser purchases, and additional EVM rails

Read for the payment/discovery follow-through under rule 61:

- Google Search Central, [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): ordinary SEO remains applicable; visible text and structured data must agree. No special AI schema or additional AI text file is required. This work corrects the existing surfaces rather than promising ranking or indexing.
- [WebMCP draft, 4 September 2026](https://webmachinelearning.github.io/webmcp/): document.modelContext registers tools; ToolAnnotations includes consequentialHint for consequential actions. Execute receives input plus an AbortSignal. The draft defines neither a wallet signer nor x402 payment metadata. The browser purchase bridge will therefore explicitly accept a buyer-signed x402 payload; it will not infer wallet support or collect key material. Browser-host compatibility still requires testing; this is a community draft, not a W3C Standard.
- [x402 HTTP transport](https://raw.githubusercontent.com/x402-foundation/x402/main/specs/transports-v2/http.md): the challenge and settlement result travel in PAYMENT-REQUIRED and PAYMENT-RESPONSE; signed retries use PAYMENT-SIGNATURE. These remain the protocol source for publication purchases as well as menu items.
- [CDP facilitator](https://docs.cdp.coinbase.com/x402/seller/facilitator): production v2 exact includes Base, Polygon, Arbitrum, World and Solana. The supported endpoint remains the programmatic capability source; the list alone is not evidence of an enabled store recipient or successful settlement.
- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses): canonical Arbitrum and World contracts were read directly. The installed EVM SDK has an Arbitrum dollar-price mapping but no World mapping; World must use an explicit asset amount with independently verified token metadata. The attempted World mainnet documentation URL was unavailable; no RPC fact is inferred from it.
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/): request configuration stays local; both Worker deployments need the enabled recipient settings.

No live payment was made during these reads. Existing buyer-audit findings are owned by another task and excluded from this follow-through.

World follow-up, 2026-09-06: [network configuration](https://docs.world.org/world-chain/quick-start/info) supplies chain 480, a two-second block cadence and the public Alchemy RPC. Read-only calls to Circle's listed native USDC contract returned chainId 480, name `USDC`, version `2`, decimals `6`. Its domain name differs from Base/Polygon's `USD Coin`; copying that domain would be incorrect. No wallet was loaded and no transaction submitted.

Implementation evidence: publication indexes expose paged HTTP purchase instructions and receipt semantics; discovery tiers derive from the same penny-page tiers as the gate. WebMCP adds an explicit free quote and buyer-signed submission, using September 4's `consequentialHint`. The actual served module is exercised under Node with fabricated payments, including cancellation, changed accepts, duplicate calls, lost responses and expired quotes. Browser-native signing support remains absent from the draft; a compatible external wallet/client is required.

Receipt links: [Arbitrum's builder directory](https://arbitrum.io/build-app) names Arbiscan as its primary explorer; [WorldScan's own description](https://info.worldscan.org/what-is-worldscan/) identifies worldscan.org as the World Chain explorer. Receipt pages now select their explorer from the recorded checkout network; unknown networks get no guessed link.

Receiving-account preflight, 2026-09-06: the public Base and Polygon offers name the same receiving account. Read-only Arbitrum and World calls confirmed each chain ID, no deployed code at that recipient, and code at the listed native USDC contract. This checks account shape and contract presence; it does not prove a live settlement or authorize production activation.

World RPC fallback: [World's node-provider directory](https://docs.world.org/world-chain/providers/nodes) names Tenderly. Read-only calls to its World mainnet endpoint returned chain ID 480 and a complete 500-block native-USDC log window. The World reader keeps both Alchemy and Tenderly fallbacks; no timeout allowance or fallback test was relaxed.


### 2026-09-06 — five-network quote header budget

Re-read `https://raw.githubusercontent.com/x402-foundation/x402/main/specs/extensions/extension-offer-and-receipt.md`, sections 2, 4.1 and 6.1: the signed-offer extension is optional and its response-body placement remains usable when a duplicate header copy exceeds transport limits. All accepts and all signed offers remain available. Stock Node fetch reproduced `UND_ERR_HEADERS_OVERFLOW` after five networks were enabled; the all-network regression reproduces oversized menu and publication quotes before the fix. The optional signed-offer header mirror is now capped at 12 KiB, reserving 4 KiB of the common 16 KiB header allowance for other headers and edge additions.


### 2026-09-06 — secondary checkout copy and browser test

Read Coinbase's current [CDP Facilitator documentation](https://docs.cdp.coinbase.com/x402/seller/facilitator), including its supported-network table: the configured store checkout networks remain supported for exact v2 payments. The live store manifest and browser quote named the same networks. Reader coverage was checked separately against EVM_CHAINS and statement-rails; it does not widen checkout or the automatic settlement-attestation lookup.

Read [Chrome's imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api), updated 2026-09-01: Chrome 152 executeTool takes JSON-string input. The current WebMCP draft instead specifies an object; using the draft call shape failed before tool execution, and using Chrome's documented shape passed for quoting and unsigned refusal. No signer or wallet extension was present in that session. The keeper's separate browser purchase and certificate check are recorded in BROWSER_CHECKOUT_2026-09-06.md; neither proves paid WebMCP completion.

The World domain remains the USDC/version 2 mapping already read and tested during integration. Browser copy now compares the selected quote's domain instead of instructing every buyer to expect USD Coin. No new chain-contract read or payment was made in this copy task. [Wrangler command documentation](https://developers.cloudflare.com/workers/wrangler/commands/) was re-read for the existing dry-run bundle checks; no deployment configuration was changed.

### 2026-09-06 — ARD media types match the machine representation

Read the [IANA JSON-LD registration](https://www.iana.org/assignments/media-types/application/ld+json): its optional `profile` parameter identifies conventions using URIs. Our `profile=dataset` was a homemade label, not that convention. The [Atom registration](https://www.iana.org/assignments/media-types/application/atom+xml) confirms `application/atom+xml`; an incomplete checker allowlist is no reason to relabel an Atom feed. The current [REST API Media Types draft, revision 09](https://datatracker.ietf.org/doc/draft-ietf-httpapi-rest-api-mediatypes/09/) still specifies `application/openapi+json` with an optional `version` parameter. It is an active Internet-Draft, not a published RFC. The older GitHub-rendered draft linked in the discussion was stale; the Datatracker revision is the reference for this read.

Read-only requests to all ten live dataset URLs with `Accept: application/json` found schema.org `Dataset` JSON-LD in `/fixtures.json`, `/corpus.json`, `/registry` and `/inflows`. The other six machine responses are ordinary JSON; JSON-LD in an HTML page does not change its separate JSON response. ARD now derives each format from the dataset roster and emits it in both `type` and `mediaType`. All currently use `application/json` HTTP response headers; the four JSON-LD bodies also remain retrievable when explicitly requested as `application/ld+json`. No response body or negotiation rule changes here.

The function-calling document is ordinary JSON with a `tools` array; the description already names its function-calling shape. Its homemade profile is removed too. The Atom type and OpenAPI version parameter remain. Regression tests compare the declarations with the served machine bodies; the new dataset and tools assertions were observed failing before the fix. This improves the declarations, not evidence of new visitors, registry coverage or a promised score.

## 2026-09-07 — A2A repair-kit pilot

- [Official A2A 0.3.0 specification](https://a2a-protocol.org/v0.3.0/specification/):
  re-read card discovery, Task/Message shapes, JSON-RPC methods and errors.
  The retained official 0.3.0 schema generates validators for the hosted
  instrument and downloadable runner. Scope deliberately excludes other
  versions/transports, streaming, push, authentication and long tasks.
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
  and [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/):
  bounded body reads, explicit async completion, per-object storage and
  finite schedules. Alarm retries do not establish a complete history;
  missed slots remain derivable and visible. Local installed Workers types
  and Wrangler schema are used for binding/type validation.
- [a2a-compliance README](https://github.com/UltraSkye/a2a-compliance) and
  [AgentCard repair explanations](https://www.agentcard.net/blog/agent-card-validation-errors):
  free validation, explanations and CI tooling already exist. This pilot
  sells hosted work, repair handoff and signed observations/rechecks.
  The external CLI is not used as a completeness oracle or run by the Worker.

Gaps: no market demand, competing paid-service pricing or full multi-version
conformance coverage verified. No claim is made from the unverified 50-agent
sample in A2A issue #1755. No third-party production endpoint was actively
probed during the build; tests use operator-style fixtures.
