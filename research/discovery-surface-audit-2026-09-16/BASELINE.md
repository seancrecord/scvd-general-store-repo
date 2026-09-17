# SCVD Discovery Surface Gap Audit

## Executive scorecard

The repository audited was the current public `main` branch of `seancrecord/scvd-general-store-repo`, which was updated and pushed on September 16, 2026; the repository identifies `https://scvd.store` as its homepage and describes itself as an x402/MCP evidence observatory. fileciteturn0file0L1-L13 The live SCVD discovery surfaces examined included the site, `menu.json`, and `/.well-known/x402.json`; the latter currently exposes the store’s paid-resource catalogue with rich schemas and multiple settlement networks. citeturn18view0turn18view1turn18view3turn19view3turn19view4

| Surface | Score | Current state | Biggest gap | Target state |
|---|---:|---|---|---|
| x402 Bazaar | **4/5** | Strong per-route Bazaar declarations and schema generation; broad paid-HTTP coverage | Current end-to-end Bazaar catalogue presence for every appropriate paid resource is not independently demonstrated | Every appropriate paid resource appears in Bazaar with complete `extensions.bazaar` metadata |
| Official MCP Registry | **5/5** | Domain namespace, remote MCP server, and `scvd-tab` package records are implemented and repo records say both are published | No material implementation gap found | Maintain the two legitimate server records under `store.scvd/*` |
| GitHub MCP Registry → Copilot / VS Code | **2/5** | Official-registry prerequisite is satisfied; separate Agent Finder artifacts exist | GitHub's **curated MCP Registry** onboarding is not shown as completed | Accepted into GitHub's curated registry, then synchronized from official MCP Registry releases |
| Agent Skills / skills.sh | **4/5** | Purpose-built `scvd-x402-verification` skill already teaches the correct decision sequence | Skill does not explicitly teach the MCP connection/install step; skills.sh discoverability was not established | Canonical skill is installable/discoverable and contains explicit MCP hookup |
| Claude Code / Gemini CLI / VS Code agent plugins | **4/5** | Thin manifests exist for all three families and reuse canonical repo assets | Repeated version/description/MCP metadata remains hand-copied; marketplace publication status is not uniformly evidenced | Generated/validated thin wrappers around one MCP + skill source of truth |
| A2A Agent Card + registries | **3/5** | SCVD genuinely implements an A2A JSON-RPC evidence agent | Validation and compatibility machinery is still generated from **A2A 0.3.0** while the current spec is v1.0 | Strict current-v1.0 Agent Card and protocol validation; no false non-A2A interfaces |
| OASF / AGNTCY Directory | **3/5** | Excellent OASF 1.1 record, taxonomy, MCP, skill, domain-verification and ERC-8004 integration | No shared/federated Directory publication has completed because write access is externally restricted | Signed, domain-verified record discoverable through a shared Directory peer and installable |
| ERC-8004 | **5/5** | Agent 86957 is centralized as canonical data and cross-linked into OASF and SCVD identity/discovery surfaces | No material gap against this move found | Keep the existing identity canonical and derived everywhere |

The most important distinction is that SCVD has already built substantially more of this discovery stack than a simple repository-name search suggests. The remaining work is concentrated in **external catalogue admission/synchronization, current A2A conformance, and a few last-mile canonicalization issues**, not in inventing new implementations.

## x402 Bazaar

**SCVD Move:** Make every appropriate SCVD paid surface Bazaar-discoverable, with excellent schemas/descriptions and the correct Bazaar extension metadata.

**Score: 4/5**

**What exists today.** This is one of the strongest parts of the implementation. `src/lib/bazaar-discovery.ts` imports the official `declareDiscoveryExtension` helper from `@x402/extensions/bazaar` and explicitly describes itself as providing `extensions.bazaar` declarations for every paid route. More importantly, the input schema is not separately retyped for discovery: `buyInputSchema(item)` is shared by Bazaar, listing/OpenAPI surfaces, and MCP. fileciteturn2file5L76-L87 fileciteturn18file0L1-L2

SCVD also has unusually good coverage machinery. `scripts/lib/bazaar-validation-resources.mjs` enumerates every menu item and then expands every non-deprecated OpenAPI operation carrying `x-payment`; it deliberately fails if a paid route cannot be safely reduced to a concrete validation URL. fileciteturn19file0L1-L13 `scripts/bazaar-validate.mjs` performs free preflights of the menu and published paid URLs, while the repository contains separate Bazaar catalogue/check and regex/schema checks. fileciteturn2file0L1-L12 fileciteturn2file2L38-L49 fileciteturn2file4L65-L75

The live machine-readable surface corroborates the schema work: `/.well-known/x402.json` currently exposes rich per-product input schemas and concrete paid resources, including non-menu paid URLs such as Almanac pages; individual resources advertise x402 v2 payment accepts across the supported chains. citeturn18view3turn19view3turn19view4turn19view5

**What the surface currently expects.** The official x402 Bazaar extension supports HTTP resources and MCP resources. For HTTP discovery, the Bazaar `info` block describes method/parameters and output information; for MCP resources it can identify the MCP type, tool name, input schema, description, transport, and examples. The official documentation recommends the SDK discovery helper and informative parameter descriptions. Provider-level metadata such as a short `serviceName`, up to five tags, and an absolute HTTP(S) `iconUrl` is optional enrichment. citeturn0search1

The most important operational rule is easy to miss: declaring the server-side extension is not by itself the final catalogue step. Bazaar discovery is populated when the extension is carried through the x402 payment flow to a facilitator/operator that indexes it. Thus **valid 402 metadata and actual Bazaar discoverability are related but not identical facts**. citeturn0search1

**Gap analysis.** I found no meaningful schema-quality gap in SCVD's paid HTTP implementation. The schemas are substantially better than the minimum: required inputs, formats, bounded lengths, safety constraints, and semantic descriptions are generated from the same definitions used elsewhere. fileciteturn18file0L1-L2

The confirmed remaining issue is an **end-to-end discovery assurance gap**. The repository proves that SCVD emits and validates the declarations; the live SCVD-owned manifest proves what SCVD advertises. Neither is equivalent to proving that *every* appropriate resource is currently present in the external Bazaar catalogue. SCVD itself has historical documentation explaining that bare paid-door behavior had to be changed after Bazaar and another crawler missed routes, underscoring why the external read matters. fileciteturn2file8L123-L133

I did **not** find sufficient evidence in this run to call paid MCP-tool Bazaar discovery missing. The official extension supports it, but the inspected evidence was not enough to prove either its absence or its complete catalogue state. That should therefore be tested, not guessed.

**Required fixes.**

1. **Fix:** Make Bazaar catalogue coverage an acceptance condition, not just extension-generation coverage.  
   **Surface:** x402 Bazaar.  
   **Priority:** High.  
   **Exact locations:** `scripts/bazaar-check.mjs`, `scripts/bazaar-validate.mjs`, `scripts/lib/bazaar-validation-resources.mjs`, CI workflow that invokes Bazaar checks.  
   **Specific change:** Compare the canonical set of appropriate paid resources derived from `menu.json` + OpenAPI `x-payment` routes against the facilitator/Bazaar discovery response after a Bazaar-aware payment has propagated the extension. Report `declared-but-not-catalogued` separately from schema failures.  
   **Acceptance test:** Every expected resource key is returned by Bazaar with the same HTTP method/resource URL and nonempty input/output discovery information.  
   **Dependency:** A facilitator/operator that exposes the Bazaar discovery API and a real Bazaar-aware payment path.

2. **Fix:** Explicitly include paid MCP resources in that coverage test **when and only when SCVD exposes them as Bazaar MCP resources**.  
   **Surface:** x402 Bazaar/MCP.  
   **Priority:** Medium.  
   **Exact locations:** Bazaar discovery builder and Bazaar catalogue test.  
   **Specific change:** For each intended MCP-discoverable paid tool, assert the official MCP discovery shape (`type`, `toolName`, `inputSchema`, and transport/description as appropriate). Do not create duplicate HTTP and MCP listings merely to increase catalogue count.  
   **Acceptance test:** Every intentionally advertised MCP resource validates against the official Bazaar shape and resolves to the canonical SCVD MCP server.  
   **Dependency:** The first task's external-catalogue harness.

**Definition of done:** the expected-resource set is mechanically derived, every expected resource validates locally, and a fresh external Bazaar query returns that same set with the intended schemas/descriptions. A route is not considered complete merely because its 402 response is locally correct.

## MCP registries: Official Registry and GitHub → Copilot / VS Code

### Official MCP Registry audit

**SCVD Move:** Publish SCVD under a domain-verified namespace with both `https://scvd.store/mcp` and the `scvd-tab` package represented in `server.json`.

**Score: 5/5**

**What exists today.** SCVD has two legitimate MCP server records, rather than incorrectly forcing two different MCP products into one identity.

The root `server.json` names `store.scvd/general-store`, uses the current `2025-12-11` official server schema, identifies the repository and website, and declares a Streamable HTTP remote at `https://scvd.store/mcp`. fileciteturn8file0L1-L13

`tab/server.json` separately names `store.scvd/tab` and advertises public npm package `scvd-tab@0.11.1` with stdio transport. fileciteturn9file0L1-L13 Its npm `package.json` contains the required registry ownership binding, `"mcpName": "store.scvd/tab"`, exactly matching the server record. fileciteturn31file0L1-L13

The official registry permits metadata to point either to publicly reachable remotes or supported public packages; for npm, the package's `mcpName` **must** match the `server.json` server name. citeturn29search0turn29search6 Domain authentication requires the reverse-DNS namespace of the controlled domain; `scvd.store` therefore maps naturally to `store.scvd/*`. citeturn29search5

The repository's listing checks compare the current manifests against the official Registry and npm, and current registry-maintenance documentation in the repo states that the general-store listing is published at `0.2.3` and the tab is also on the registry. fileciteturn3file2L30-L40 fileciteturn3file3L43-L53

**What the surface currently expects.** **Required:** valid `server.json`; namespace authentication; unique name/version; and a publicly available package or remote endpoint. For npm packages, package ownership is verified via the exact `mcpName` match. **Supported:** a server record may carry packages, remotes, or both where they describe the same logical MCP server. **Not required:** combining distinct MCP servers into one manifest. citeturn29search0turn29search4turn29search5turn29search6

That last point matters for interpreting the requested move. `general-store` and `scvd-tab` are distinct MCP servers with different capabilities, versions, and transports. Two `server.json` records under one domain-verified namespace are cleaner and more faithful to the registry's model than pretending they are two transports for one server.

**Gap analysis.** No material implementation gap was found. The requested remote and package are represented, the domain namespace is correct, and npm ownership metadata is present. The one research limitation is that a direct browser fetch of the live official Registry search API was blocked by the browsing environment; the conclusion about current publication therefore relies on the current repository's own registry reconciliation records rather than an independently rendered Registry response. The repo was updated on September 16, 2026 and contains automated checks expressly designed to detect Registry/version drift. fileciteturn0file0L1-L13 fileciteturn3file2L30-L40

**Required fixes:** none for the stated move. Keep the existing two-record model and the current `listings-check`/publish workflow.

**Definition of done:** already met at the implementation level: `store.scvd/general-store` resolves to `/mcp`, `store.scvd/tab` resolves to the matching `scvd-tab` npm package, and the public package's `mcpName` equals the Registry name.

### GitHub MCP Registry → Copilot / VS Code audit

**SCVD Move:** Get SCVD onboarded to GitHub's curated MCP registry after publishing to the official registry, accounting for the current onboarding and synchronization process.

**Score: 2/5**

**What exists today.** The prerequisite is strong: SCVD already has official-MCP-compatible records and repository automation around them. SCVD also contains `registry/agentfinder/` artifacts for the separate community Agent Finder catalogue, including a general-store MCP entry and skill entries. fileciteturn3file5L75-L85

That Agent Finder work should **not** be confused with GitHub's curated MCP Registry. GitHub documents the MCP Registry as a curated source from which MCP servers can be installed into supported Copilot/VS Code environments; GitHub's Agent Finder/ARD discovery is a separate discovery mechanism. citeturn12view3turn12view4

**What the surface currently expects.** GitHub's MCP Registry is curated rather than an unreviewed mirror. Current public onboarding material shows the practical process as: establish the server in the official MCP Registry, obtain initial GitHub curation/onboarding, and thereafter rely on the synchronization path from the upstream official Registry for version updates. The initial admission remains an external GitHub decision rather than something SCVD can accomplish merely by committing another local manifest. citeturn1search31turn12view3

**Gap analysis.** I found evidence of the prerequisite and of a **different** GitHub-adjacent Agent Finder submission, but not evidence that SCVD has been accepted into the curated GitHub MCP Registry itself. Consequently, the move is substantially incomplete despite the technical manifests being ready. This affects **discovery, installation, registry eligibility, and synchronization**, not MCP execution.

**Required fixes.**

1. **Fix:** Submit/onboard `store.scvd/general-store` to GitHub's curated MCP Registry using the current GitHub onboarding channel, referencing the already-published official Registry record.  
   **Priority:** Blocker.  
   **Exact location:** External GitHub MCP Registry onboarding/review; no new SCVD implementation should be invented.  
   **Acceptance test:** Searching GitHub's MCP Registry for SCVD returns the general-store server, and VS Code/Copilot can install it from that result.  
   **Dependency:** GitHub curation/review.

2. **Fix:** Treat official Registry publication as the version source after initial acceptance.  
   **Priority:** High.  
   **Exact locations:** `.github/workflows/publish-mcp-registry.yml`, `scripts/listings-check.mjs`, GitHub-registry reconciliation check.  
   **Specific change:** Add a downstream assertion that the GitHub-curated entry has synchronized to the current official Registry version; do not maintain a second GitHub-specific server description.  
   **Acceptance test:** after publishing a new official Registry version, GitHub's entry converges to the same version/name/remote without a hand-edited duplicate manifest.  
   **Dependency:** Initial GitHub acceptance.

**Definition of done:** SCVD appears in GitHub's curated MCP Registry, can be installed into a supported Copilot/VS Code client from that catalogue, and version changes originate from the official Registry record rather than from a separately maintained GitHub implementation.

## Agent Skills and marketplace wrappers

### Agent Skills / skills.sh audit

**SCVD Move:** Publish an SCVD/x402 verification skill that teaches agents when to preflight, when to verify receipts, when to buy evidence, and how to connect to the MCP server.

**Score: 4/5**

**What exists today.** The exact requested skill already exists at `skills/scvd-x402-verification/SKILL.md`. fileciteturn14file0L1-L13 Its operational sequence closely matches the requested move:

- preflight an unfamiliar x402 endpoint **before spending**;
- inspect the observed gaps rather than inferring missing facts;
- verify a receipt after payment;
- buy a signed observation only when durable third-party evidence is actually needed;
- verify evidence offline. fileciteturn15file0L1-L13

It also explicitly says it is operating knowledge for the `scvd-general-store` MCP server. fileciteturn15file0L1-L13

The official Agent Skills specification requires a `SKILL.md` under a skill directory with YAML frontmatter containing at least `name` and `description`; it supports optional fields such as license, compatibility, metadata, and allowed tools. SCVD's directory name and skill name align, and the body is compact and task-oriented. citeturn12view5

skills.sh's documented installation model is repository-based (`npx skills add …`); its public directory/leaderboard is built around public skill installations rather than a separate bespoke SCVD manifest. citeturn15view0turn16view0

**Gap analysis.** One substantive content requirement remains: the skill says it belongs to the MCP server but does not provide the actual connection target or a concrete connection/install example. The target move explicitly says the skill must teach **how to connect to the MCP server**.

There is also a distribution-verification gap: SCVD has substantial ClawHub publication machinery, but that is not skills.sh. The current `publish-skill.yml` publishes to ClawHub and maintains a ClawHub publication record. fileciteturn16file0L1-L13 That is useful distribution, but it does not prove skills.sh discoverability.

The repository itself documents a broader drift lesson: at least one external skill copy has become stale, and an Agent Finder description has disagreed with the canonical skill's price language. fileciteturn4file5L88-L99 fileciteturn4file2L35-L46 Those copies should not become alternate implementations of this move.

**Required fixes.**

1. **Fix:** Add an explicit MCP connection section to the canonical verification skill.  
   **Priority:** High.  
   **Exact file:** `skills/scvd-x402-verification/SKILL.md`.  
   **Specific change:** State the canonical remote endpoint `https://scvd.store/mcp` and, where useful, point to the existing repository MCP manifests instead of reproducing tool definitions.  
   **Acceptance test:** an agent given only this `SKILL.md` can identify the exact MCP server URL and the prescribed preflight → receipt verification → paid evidence sequence.  
   **Dependencies:** none.

2. **Fix:** Validate skills.sh installation/discovery from the public repository.  
   **Priority:** Medium.  
   **Exact surface:** skills.sh / `skills` CLI; canonical source remains `skills/scvd-x402-verification/SKILL.md`.  
   **Specific change:** Use the current skills.sh CLI against `seancrecord/scvd-general-store-repo`, confirm that the nested `scvd-x402-verification` skill is detected and installable, and record that test in the existing listings/findability suite. Do not create a separate skills.sh copy.  
   **Acceptance test:** a clean environment installs/discovers the canonical skill from the GitHub repository and skills.sh resolves it as that same skill.  
   **Dependencies:** skills.sh indexing/telemetry behavior.

**Definition of done:** a cold agent can install the canonical skill, learn the free-first spending policy, understand when durable evidence warrants payment, verify receipts, and obtain `https://scvd.store/mcp` without consulting another SCVD document.

### Claude Code / Gemini CLI / VS Code agent-plugin marketplaces audit

**SCVD Move:** Wrap SCVD's canonical MCP and skill assets in thin marketplace/plugin manifests rather than maintaining separate implementations.

**Score: 4/5**

**What exists today.** Architecturally, SCVD is already doing the right thing.

For Claude Code, `.claude-plugin/plugin.json` carries identity/metadata and points the MCP surface at `https://scvd.store/mcp`; `.claude-plugin/marketplace.json` exposes a repository-local plugin whose source is `./`. fileciteturn12file0L1-L13 fileciteturn13file0L1-L13 That layout allows the repository's skills to remain canonical rather than copying their prose into the marketplace record. Claude's plugin model is specifically designed to package reusable skills, MCP integrations and other agent customizations together. citeturn12view6

For Gemini CLI, `gemini-extension.json` is similarly thin: it declares the name/version/description, the `/mcp` remote and `AGENTS.md` as the context file rather than reimplementing SCVD behavior. fileciteturn7file0L1-L13 Gemini's extension model supports an extension manifest, MCP servers, a context file, and repository-local agent skills. citeturn12view8

For the cross-client/VS Code agent-plugin shape, root `plugin.json` contains plugin metadata while root `mcp.json` contains the actual MCP bindings: the canonical remote general store plus `scvd-tab` as `npx -y scvd-tab@0.11.1`. fileciteturn11file0L1-L13 fileciteturn10file0L1-L13 VS Code's current agent environment explicitly supports agent skills, MCP servers and agent plugins as customization surfaces. citeturn29search2

**Gap analysis.** This is not suffering from separate code implementations; the remaining problem is **metadata duplication**. The same `0.2.3` version, description, homepage/repository and MCP URL appear in `server.json`, `plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `gemini-extension.json`. fileciteturn8file0L1-L13 fileciteturn11file0L1-L13 fileciteturn12file0L1-L13 fileciteturn13file0L1-L13 fileciteturn7file0L1-L13 SCVD already has tests intended to keep some of those copies aligned, including Gemini checks, but validation is weaker than generation because a new wrapper is another place a stale literal can be introduced. fileciteturn6file1L12-L22

I also did not obtain evidence that every wrapper is currently **listed in an externally curated marketplace**. That is different from saying the wrappers are missing: the requested architectural move is mostly done, but marketplace publication should be tested independently.

**Required fixes.**

1. **Fix:** Generate thin wrapper metadata from the canonical MCP/plugin metadata instead of manually repeating name/version/description/URL.  
   **Priority:** Medium.  
   **Exact files:** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json`, root `plugin.json`, root `mcp.json`; generator source should consume `server.json`, `tab/server.json`, and canonical skill metadata.  
   **Specific change:** Keep only ecosystem-specific fields hand-authored; derive common identity/version/MCP URLs/package versions.  
   **Acceptance test:** changing the canonical server description or version and running the generator changes every applicable wrapper; CI fails if generated files are dirty.  
   **Dependencies:** none.

2. **Fix:** Add ecosystem-native manifest/install validation to `scripts/findability-manifests.test.mjs` rather than implementing any new MCP server or skill.  
   **Priority:** Medium.  
   **Exact location:** `scripts/findability-manifests.test.mjs` and listings CI.  
   **Acceptance test:** Claude, Gemini and VS Code/agent-plugin validators or dry-run installers accept the repository, expose the same remote MCP server, and discover the same canonical skills.  
   **Dependencies:** respective public validator/CLI availability.

**Definition of done:** each ecosystem-specific file is only a thin adapter; no skill body, MCP tool description, transport URL, package version, or product implementation is independently maintained inside a marketplace wrapper.

## A2A Agent Card and discovery

**SCVD Move:** Determine whether SCVD currently exposes a genuine A2A server. Only if it does, ensure the appropriate Agent Card and discovery surfaces are implemented correctly. Do not recommend publishing an Agent Card merely because SCVD can inspect A2A agents.

**Score: 3/5**

**The first question has a clear answer: yes, SCVD now exposes a genuine A2A server.** This is not merely its A2A inspection tooling. `src/services/a2a-evidence.ts` implements a delegated evidence agent, accepts A2A JSON-RPC at `/a2a`, supports real A2A task lifecycle operations, and offers three read-only agent tasks: endpoint preflight, receipt verification, and endpoint-readiness retrieval. fileciteturn23file0L1-L2 The builder also publishes `/a2a` as its first supported interface. fileciteturn22file0L1-L16

SCVD serves the canonical `/.well-known/agent-card.json` and also checks two historical aliases. fileciteturn20file6L76-L87 Existing tests verify the presence of the newer `supportedInterfaces` structure. fileciteturn22file2L33-L47

**What the surface currently expects.** Current A2A documentation is v1.0. The current Agent Card model centers on `name`, `description`, `supportedInterfaces`, agent `version`, `capabilities`, default input/output modes and skills; an A2A interface declares its URL, protocol binding and protocol version. The recommended well-known discovery path is `/.well-known/agent-card.json`. citeturn24view0turn25view0turn26view0turn26view2turn26view3

A2A does **not** prescribe a single universal registry API. Curated registries are an ecosystem layer rather than a normative requirement of the protocol. citeturn25view0 Therefore, “publish to an A2A registry” should not be invented as a compliance requirement.

**Gap analysis.** There is one decisive, material conformance problem: SCVD's actual generated validators are still built from the **official A2A 0.3.0 schema**. `scripts/a2a-validation-build.mjs` says this explicitly and derives `A2A_PROTOCOL_VERSION` from that schema. fileciteturn24file0L1-L11 `src/services/a2a-evidence.ts` imports that generated constant into both runtime behavior and the Agent Card. fileciteturn24file2L30-L42

The repository's own older compliance document likewise records that its cards passed the official **0.3.0** structural schema. fileciteturn20file11L143-L154 In other words, the code has partially adopted v1.0 card vocabulary (`supportedInterfaces`) but its source-of-truth protocol validator has not moved to v1.0. That is precisely the kind of mixed-era implementation that should not receive a 4 or 5.

A second, smaller issue is conceptual. `supportedInterfaces` currently contains `/a2a`, `/mcp`, and `/llms.txt`. fileciteturn23file0L1-L2 MCP and x402 are valuable cross-links, but an A2A Agent Card's supported interfaces should describe ways to interact with **this A2A agent**. Unless those endpoints intentionally implement A2A through custom bindings, they belong in SCVD's wider identity/discovery graph, not beside the canonical A2A JSON-RPC interface.

**Required fixes.**

1. **Fix:** Upgrade the A2A validation source of truth from 0.3.0 to the current official v1.0 schema/protocol definitions.  
   **Priority:** Blocker.  
   **Exact locations:** versioned A2A schema fixture/source; `scripts/a2a-validation-build.mjs`; generated `src/lib/a2a-validation.js` and `.d.ts`; `test/a2a-card.spec.ts`; runtime request validators.  
   **Specific change:** regenerate all Agent Card and request validators from the official v1.0 definitions and make the protocol version used by `/a2a` come from that source.  
   **Acceptance test:** SCVD's canonical card and supported A2A requests validate against the official current v1.0 definitions; no test labels a 0.3-derived validator “v1.0.”  
   **Dependencies:** none.

2. **Fix:** Make `/.well-known/agent-card.json` a strict current-version card rather than a hybrid legacy/current document.  
   **Priority:** High.  
   **Exact location:** `evidenceAgentCard()` in `src/services/a2a-evidence.ts`.  
   **Specific change:** retain current-v1.0 fields; remove obsolete 0.x-only fields where the current schema does not permit them. Keep historical URL aliases only if they serve a valid representation rather than relying on extra legacy fields inside the canonical document.  
   **Acceptance test:** official current Agent Card validation passes with no compatibility exceptions.  
   **Dependency:** A2A v1 validator update.

3. **Fix:** Keep only genuine A2A interaction interfaces in `supportedInterfaces`; cross-link MCP/x402 from appropriate identity/metadata surfaces instead.  
   **Priority:** Medium.  
   **Exact location:** `evidenceAgentCard()` and SCVD identity cross-link builder.  
   **Acceptance test:** every entry in `supportedInterfaces` is actually usable as an interface to the advertised A2A agent; `/mcp` and x402 remain discoverable elsewhere.  
   **Dependency:** v1 card cleanup.

**Definition of done:** a third-party current A2A v1.0 client discovers `/.well-known/agent-card.json`, validates it with no legacy exceptions, sends an A2A request to `/a2a`, receives a standards-conformant task/result, and does not have to interpret MCP or x402 as A2A transports.

## OASF / AGNTCY Directory

**SCVD Move:** Ensure SCVD is properly represented and discoverable through OASF/AGNTCY, including the aspects relevant to its provenance, capabilities, MCP exposure, identity, and directory discovery.

**Score: 3/5**

**What exists today.** The implementation quality is high. `src/lib/oasf-record.ts` is explicitly the canonical OASF record builder and targets OASF `1.1.0`, the current major schema release published by AGNTCY in July 2026. It defines precise payment/blockchain domains and capability skills rather than stuffing the record with adjacent taxonomy categories. fileciteturn28file0L1-L2 OASF 1.1.0 expanded the taxonomy and current OASF tooling validates records according to their declared schema version. citeturn30search5turn30search6

This record is not independently retyped. Its MCP connections are derived from `mcp.json`, its server identity from `server.json`, its plugin/author metadata from `plugin.json`, and its tool inventory from SCVD's MCP catalogue. fileciteturn3file6L86-L97 fileciteturn28file0L1-L2 The canonical OASF name is domain-owned `https://scvd.store/agents/general-store`. fileciteturn28file0L1-L2

The record also contains both MCP forms: the remote SCVD server and the stdio install path. The repository explains why: the current OASF-to-Copilot installation translator used by `dirctl install` requires the stdio side to produce a useful installation, so `scvd-tab` is included alongside the superior remote endpoint rather than as an unrelated duplicate. fileciteturn29file0L1-L10

Identity/provenance are strong. The OASF annotations derive the ERC-8004 registry/address and agent ID from `src/store/agent-identity.ts` rather than copying them. fileciteturn25file9L122-L132 SCVD has also published the JWKS needed for domain-based Directory name verification; the repo records a successful `dirctl` push/sign/verify/name-verification test on September 15, 2026. fileciteturn29file0L1-L10

These choices line up with OASF's purpose: a record is the core representation, annotated with skills/domains and extensible modules for interoperable capability discovery. citeturn30search2 AGNTCY describes its Directory as a federated registry for publishing, verifying and discovering agents and multi-agent applications. citeturn30search9

**Gap analysis.** The gap is **not** the OASF record. The gap is federated Directory publication.

SCVD's own current Directory record states that local push/sign/verify/name verification succeeded, including public-domain key verification, but publishing to the shared `ads.outshift.io` node was refused with `PermissionDenied`; the authenticated principal does not currently have `StoreService/Push` authorization. Consequently the record has **not** yet been tested end-to-end across a shared federation for taxonomy search, safe-search scanning, retrieval and installation. fileciteturn29file0L1-L10

That is a major discoverability gap even though it is externally blocked. The user asked whether SCVD is discoverable **through AGNTCY**, not merely whether a correct record can be built.

**Required fixes.**

1. **Fix:** Obtain write participation in an AGNTCY shared Directory/testbed and publish the existing canonical record there.  
   **Priority:** Blocker.  
   **Exact surface:** AGNTCY Directory shared node/testbed; `registry/agntcy/record.json`.  
   **Specific sequence:** run the existing taxonomy check and cut; `dirctl push`; sign the returned CID with the dedicated record-signing key; `dirctl verify`; wait for and verify domain-name binding; `dirctl routing publish`. The repository already documents this sequence. fileciteturn29file0L1-L10  
   **Acceptance test:** from an independent/shared Directory client, searches by `scvd.store/*`, payments domain, relevant skill, and `integration/mcp` return SCVD; `--safe` includes it after the scanner runs; `dirctl install ... --dry-run` produces a usable MCP/skill installation.  
   **Dependency:** shared-node write grant / AGNTCY testbed participation.

2. **Fix:** Operationalize routing re-announcement without minting pointless new OASF records.  
   **Priority:** High after onboarding.  
   **Exact location:** Directory release/runbook or a deliberately approved publishing workflow.  
   **Specific change:** re-publish the current record CID before routing TTL expiry; create a new content-addressed record only when canonical metadata actually changes. fileciteturn29file0L1-L10  
   **Acceptance test:** the record remains discoverable beyond one routing TTL and its CID changes only when record content changes.  
   **Dependency:** shared Directory access.

**Definition of done:** an unrelated Directory peer can discover SCVD from its OASF taxonomy, verify that `scvd.store` authorized the signing key, retrieve the record, see the MCP/skill/identity provenance, pass the safe-search path, and dry-run installation successfully.

This move should **not** be expanded into a requirement to adopt every separate AGNTCY Identity/VC facility. AGNTCY's Identity system is a distinct subsystem for decentralized identifiers and verifiable credentials; the Directory's domain-key name verification already satisfies the relevant directory provenance requirement unless SCVD has a separate reason to add a VC. citeturn30search3turn30search9

## ERC-8004 and cross-surface canonicalization

### ERC-8004 audit

**SCVD Move:** Since SCVD has already minted an ERC-8004 identity, make it a cross-linked canonical identity throughout other relevant discovery, metadata, registry, provenance, and machine-readable surfaces rather than treating it as a standalone acquisition channel.

**Score: 5/5**

**What exists today.** This move appears to have been deliberately completed on September 15, 2026.

`src/store/agent-identity.ts` is now the single data source for SCVD's on-chain identity:

- agent ID `86957`;
- registry `eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`;
- Base mainnet. fileciteturn27file0L1-L13

That is exactly the right architecture for this move. The identity was explicitly moved out of the registration-service implementation so build-time consumers such as the OASF record can import identity data without importing an unrelated route/runtime graph. fileciteturn27file0L1-L13

`src/store/chain-identity.ts` then turns those canonical constants into the cross-surface identity graph. It links the ERC-8004 registration file, `did:web`, the A2A Agent Card, MCP server card, OASF record, x402 discovery surface, signing key and wallet ledger, and gives a concrete cross-check between on-chain ownership and the wallet present in live x402 payment terms. fileciteturn26file0L1-L10

The OASF record derives the ERC-8004 identifier from those same constants instead of copying the contract address/token ID. fileciteturn28file0L1-L2 The ERC-8004 registration builder also exists specifically for agent `86957`. fileciteturn25file3L51-L62

This matches ERC-8004's core identity model: its Identity Registry is ERC-721-based and binds an agent identifier to an agent URI/registration representation that makes the agent discoverable and portable across services. citeturn31search0

**Gap analysis.** No confirmed material gap remains against the stated move. Crucially, I would **not** recommend adding arbitrary `erc8004` fields to `server.json`, Claude manifests, Gemini manifests, or other schemas that do not define such fields. Cross-linking should use extension points and identity documents that actually support it; schema pollution would reduce interoperability rather than improve identity.

The current centralization is unusually good: the on-chain identifier has one code source, OASF derives it, and SCVD's wider identity document points a reader among ERC-8004, A2A, MCP, x402 and DID surfaces. fileciteturn26file0L1-L10

**Required fixes:** none specific to ERC-8004. Preserve the current derivation tests and ensure future discovery artifacts consume `SCVD_AGENT_ID`/`SCVD_AGENT_REGISTRY` or a generated identity projection rather than copying them.

**Definition of done:** already met: a reader beginning at the SCVD domain can discover the on-chain identity, and a reader beginning with ERC-8004 agent 86957 can resolve back to the same SCVD origin and its protocol surfaces; the contract/token identifier exists in one canonical source.

### Cross-surface source-of-truth audit

SCVD already has three exemplary canonicalization patterns that should be extended rather than replaced:

| Canonical artifact | Already feeds | Assessment |
|---|---|---|
| `buyInputSchema()` / store menu | x402/Bazaar, listing/OpenAPI, MCP input semantics | **Keep.** This is the right answer to schema drift. fileciteturn18file0L1-L2 |
| `server.json` + `mcp.json` + MCP tool catalogue | OASF record, Registry checks, plugin surfaces | **Keep and expand generation.** fileciteturn28file0L1-L2 |
| `src/store/agent-identity.ts` | ERC-8004 registration, identity graph, OASF annotation | **Keep.** This is the desired ERC-8004 architecture. fileciteturn27file0L1-L13 |

The remaining drift risk is mostly metadata rather than logic. `server.json`, `plugin.json`, Claude's plugin/marketplace files and Gemini's extension each contain copies of the same product version/description, while Agent Finder and prior skill mirrors have already demonstrated that copied descriptions/prices can diverge. fileciteturn8file0L1-L13 fileciteturn11file0L1-L13 fileciteturn12file0L1-L13 fileciteturn13file0L1-L13 fileciteturn7file0L1-L13 fileciteturn4file2L35-L46

The preferred dependency graph is therefore:

`server.json` + `tab/server.json` + canonical skill frontmatter + `agent-identity.ts` + canonical MCP tool catalogue  
→ generated Claude/Gemini/agent-plugin metadata  
→ generated OASF projection  
→ registry publication/reconciliation checks.

The external registries should **consume or synchronize those artifacts**, not acquire SCVD-specific implementations of their own.

## Consolidated implementation backlog and final disposition

### Deduplicated implementation backlog

| ID | Priority | Surface(s) | Fix | Exact location | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| **DS-01** | **Blocker** | A2A | Replace 0.3.0-generated validation with current A2A v1.0 validation | A2A schema source; `scripts/a2a-validation-build.mjs`; generated `src/lib/a2a-validation.*`; A2A tests | None | Current official v1.0 card/request validation passes |
| **DS-02** | **High** | A2A | Make canonical Agent Card strictly current-version and restrict `supportedInterfaces` to actual A2A interfaces | `src/services/a2a-evidence.ts`, `/.well-known/agent-card.json` | DS-01 | Current v1.0 client discovers and successfully calls `/a2a` with no legacy exceptions |
| **DS-03** | **Blocker** | GitHub MCP Registry | Complete initial curated GitHub MCP Registry onboarding | External GitHub onboarding, referencing `store.scvd/general-store` | Official MCP publication already complete; GitHub review | SCVD appears in GitHub MCP Registry and is installable from Copilot/VS Code |
| **DS-04** | **High** | GitHub MCP Registry, Official MCP | Verify downstream synchronization rather than maintaining GitHub-specific server metadata | `.github/workflows/publish-mcp-registry.yml`; `scripts/listings-check.mjs` | DS-03 | New official Registry version propagates to GitHub entry and reconciliation passes |
| **DS-05** | **Blocker** | OASF / AGNTCY | Obtain shared Directory write participation and publish/sign/announce canonical OASF record | `registry/agntcy/record.json`; external shared Directory/testbed | AGNTCY authorization | Independent peer finds SCVD by name/domain/skill/module; name verification and `--safe` succeed |
| **DS-06** | **High** | OASF / AGNTCY | Re-announce the same CID before routing TTL expiry | Directory publication workflow/runbook | DS-05 | Discovery persists across TTL without unnecessary new record versions |
| **DS-07** | **High** | x402 Bazaar | Test expected paid-resource set against the external Bazaar catalogue after extension propagation | `scripts/bazaar-check.mjs`, `scripts/bazaar-validate.mjs`, Bazaar CI | Bazaar-capable facilitator/payment | No expected resource is merely “declared locally”; every expected resource is externally returned |
| **DS-08** | **Medium** | x402 Bazaar, MCP | Extend catalogue assertion to intentionally Bazaar-discoverable paid MCP resources using official MCP discovery shape | Bazaar discovery builder/tests | DS-07 | Each intended MCP listing has correct `type`, `toolName`, schema and transport |
| **DS-09** | **High** | Agent Skills / skills.sh | Add explicit MCP connection instructions to the x402 verification skill | `skills/scvd-x402-verification/SKILL.md` | None | Skill-only reader can connect to `https://scvd.store/mcp` and follow the free-first workflow |
| **DS-10** | **Medium** | Agent Skills / skills.sh | Validate public repository install/discovery through skills.sh's current CLI/index | listings/findability tests; canonical skill remains in `skills/` | skills.sh external indexing | Clean installation discovers exactly `scvd-x402-verification` from canonical repo |
| **DS-11** | **Medium** | Claude, Gemini, VS Code agent plugins; MCP | Generate common name/version/description/MCP references from canonical manifests | `.claude-plugin/*`, `gemini-extension.json`, `plugin.json`, `mcp.json`; new generator/check | None | Editing canonical metadata and regenerating updates every wrapper; CI rejects drift |
| **DS-12** | **Medium** | Claude, Gemini, VS Code agent plugins | Add native manifest/dry-run installation validation | `scripts/findability-manifests.test.mjs` / listings CI | Ecosystem CLIs/validators | All wrappers install/validate and expose the same canonical MCP/skill assets |

There are deliberately **no implementation tasks for the Official MCP Registry or ERC-8004 move** beyond ongoing reconciliation, because adding work there would manufacture gaps that the evidence does not support.

### Final disposition

| Original SCVD Move | Disposition | Rationale |
|---|---|---|
| **x402 Bazaar** | **Needs minor work** | SCVD's declarations, schemas and coverage generation are excellent; the remaining material issue is proving and maintaining complete external Bazaar catalogue presence. |
| **Official MCP Registry** | **Already complete** | Domain-namespace records exist for the remote general store and npm `scvd-tab`, and the npm ownership binding matches. |
| **GitHub MCP Registry → Copilot / VS Code** | **Blocked by external onboarding/review** | The official-registry prerequisite is done, but the curated GitHub MCP Registry is a separate admission step; the Agent Finder artifacts do not substitute for it. |
| **Agent Skills / skills.sh** | **Needs minor work** | The requested verification skill already teaches preflight, receipt verification and when to buy evidence; explicit MCP hookup and confirmed skills.sh discovery remain. |
| **Claude Code / Gemini CLI / VS Code agent-plugin marketplaces** | **Needs minor work** | Thin wrappers already exist; the remaining work is eliminating hand-copied metadata and validating/publishing the wrappers without creating alternate implementations. |
| **A2A Agent Card + registries** | **Needs material implementation** | SCVD genuinely speaks A2A, but its generated protocol validator is still based on 0.3.0 while the current specification is v1.0. |
| **OASF / AGNTCY Directory** | **Blocked by external onboarding/review** | The OASF record, domain verification and local signing flow are mature; shared federated publication is blocked on Directory write authorization. |
| **ERC-8004** | **Already complete** | Agent 86957 has been turned into canonical identity data and cross-linked into OASF and SCVD's broader machine-readable identity/discovery graph. |

The net result is a much narrower gap than “SCVD needs discovery integrations.” **SCVD already has the core integrations.** The highest-value closure work is to bring the genuine A2A server fully onto current v1.0, complete the two externally controlled catalogue admissions (GitHub MCP and shared AGNTCY Directory), prove Bazaar's *external* catalogue coverage rather than only its locally declared coverage, and finish turning marketplace wrappers into generated projections of the canonical MCP/skill metadata. The existing ERC-8004, OASF-generation, and Bazaar-schema architecture should be preserved rather than replaced.