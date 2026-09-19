import {
  CHEAPEST_ON_THE_SHELF,
  OPERATED_BY,
  POSITION_PARAGRAPH,
} from "@/store/copy/position";
import { STANDARDS_POSTURE } from "@/store/standards";
import { DISCOVERY_PROTOCOLS, type DiscoveryProtocol } from "@/store/discovery-protocols";
import { IDENTITY_VIEWERS } from "@/store/chain-identity";
import { SCVD_AGENT_ID, SCVD_AGENT_REGISTRY } from "@/store/agent-identity";
/**
 * THE TRUST LAYER, FOR MACHINE EYES ONLY.
 *
 * Written 2026-07-31 after three outside models were asked "what is
 * scvd.store" cold. Two read it well. Perplexity read it as
 * UNVERIFIED and would not call it legitimate, and its complaint was
 * specific rather than vague: no clear company identity, no contact
 * information, no terms, no privacy policy, no independent reputation
 * footprint.
 *
 * THE COMPLAINT WAS ACCURATE AND THE SUBSTANCE WAS ALREADY THERE.
 * /what says who runs it, /attestation says exactly what the key does
 * and does not prove, /stack lists every dependency and its failure
 * mode, /corrections lists everything we got wrong, /house-ledger.json
 * declares every wallet we control, and /neighbours carries receipts
 * from services we have actually paid. What did not exist was any of
 * it at a URL a generic legitimacy scan looks for, in a shape it
 * parses. A checklist crawler asking "is there a trust document" got
 * nothing, while a reader willing to browse got more than most stores
 * publish.
 *
 * SO THIS IS A ROUTING FIX, NOT NEW CLAIMS. Every fact below already
 * exists somewhere on this store in the keeper's own words. Nothing
 * here is asserted that is not asserted elsewhere, and where the
 * honest answer is "no," it says no.
 *
 * DELIBERATELY NOT A ROOM. The keeper's call and the right one: it is
 * not in ROOMS, not in the nav, not on the storefront, and no human
 * is ever shown it. The public rooms already say all of this in a
 * voice worth reading; a conventional trust page in conventional
 * language would be a second, duller version of pages that already
 * exist, and the store's whole argument is that it does not keep two
 * registers. Machines get the checklist at /.well-known/trust.json.
 * People get the shop.
 *
 * THE AUDIENCE THAT MATTERS IS NOT A CURIOUS HUMAN RUNNING A SEARCH.
 * It is an autonomous agent doing pre-purchase diligence with its
 * operator's money, whose decision loop is signal-driven rather than
 * impression-driven. If a clean trust document turns a bounce into a
 * settlement, that is a direct lever on revenue rather than a better
 * search snippet.
 */

export interface ExternalRecord {
  /** What this particular record indexes, not a claim of conformance. */
  protocols?: readonly DiscoveryProtocol[];
  /** Where the record lives. Must be a real, checked URL. */
  url: string;
  /** Who keeps it. */
  registry: string;
  /** ISO date somebody here actually opened it and saw us listed. */
  confirmed: string;
  /**
   * WHAT IT ACTUALLY IS, and this field exists to stop the list
   * overclaiming. A directory listing we submitted ourselves is an
   * independent RECORD that we exist and have been indexed. It is not
   * an endorsement, not an audit, and not a third party vouching for
   * us. Saying so here costs nothing and is the difference between a
   * trust document and a logo wall.
   */
  what_it_proves: string;
}

/**
 * Third-party records of this store's existence.
 *
 * ONLY URLS SOMEBODY HAS ACTUALLY OPENED GO IN THIS ARRAY. An
 * invented or assumed listing URL in a trust document is worse than
 * an empty list by a wide margin: the whole point of the field is that
 * a reader can follow it, and a dead link in the one document
 * claiming legitimacy is the strongest possible argument against it.
 * Each entry names a dated keeper or agent observation; transport limits
 * and partial reads stay explicit in its account.
 */
export const EXTERNAL_RECORDS: readonly ExternalRecord[] = [
  {
    url: "https://github.com/hashgraph-online/awesome-ai-plugins#tools--integrations",
    registry: "HOL — Awesome AI Plugins community catalog",
    protocols: ["skills", "mcp"],
    confirmed: "2026-09-19",
    what_it_proves: "That HOL accepted SCVD General Store into its community plugin catalog through PR #349. The source README and machine-readable plugins.json both list the repository, its skills and hosted MCP. This establishes catalog admission, not inclusion in HOL's separate ERC-8004 agent index or acceptance by every supported client marketplace. Not an endorsement and not an audit of runtime behavior, purchases or security.",
  },
  {
    url: "https://a2aregistry.org/api/agents/3ec62f32-4e67-4382-8d15-2b6bf689f33a",
    registry: "A2A Registry — community API register",
    protocols: ["a2a"],
    confirmed: "2026-09-18",
    what_it_proves: "That this separate community registry retained SCVD's canonical Agent Card and three evidence skills after submission. Its public API reports card conformance and endpoint health, but its task smoke test failed with category OTHER. The published test sends a plain-text greeting; a fresh direct check rejected that greeting and completed the documented JSON readiness task. Issue #184 asks the operator to distinguish probe compatibility; their task verification remains failed. This is listing evidence, not certification. Not an endorsement and not an audit of purchases.",
  },
  {
    url: "https://geminicli.com/extensions/?name=seancrecordscvd-general-store-repo",
    registry: "Gemini CLI — extension gallery",
    protocols: ["skills", "mcp"],
    confirmed: "2026-09-18",
    what_it_proves: "That Google's Gemini CLI gallery lists the public scvd-general-store extension at version 0.2.4 with MCP and Skills labels and an installation command pointing to this repository. Search and the detail panel were opened. Google states these third-party extensions are not vetted or endorsed. Not an endorsement and not an audit. Gallery presence does not establish model execution, purchase success or security review.",
  },
  {
    url: "https://www.a2a-registry.org/agent/store.scvd.scvd_evidence_agent",
    registry: "Global A2A Registry — community agent directory",
    protocols: ["a2a"],
    confirmed: "2026-09-18",
    what_it_proves: "That this community registry lists SCVD Evidence Agent with its canonical Agent Card, endpoint and three free evidence skills. We submitted the public URL and opened the resulting record. The keeper completed the ownership claim September 18 and the public Verified label was confirmed; that label is directory ownership verification, not a service audit. On September 18, after the operator repaired issue #7, a fresh read showed application/json for both input and output modes, matching the retained card. This checks those fields for this record, not every parser field. Not an endorsement and not an audit.",
  },
  {
    url: "https://github.com/sing1ee/a2a-directory#readme",
    registry: "A2A Directory — community source catalog",
    protocols: ["a2a", "x402"],
    confirmed: "2026-09-17",
    what_it_proves: "That the community-maintained A2A Directory lists SCVD's evidence agent, its Agent Card and separate x402 instruments. Its source README includes SCVD in the tools, A2A agents and x402 service sections. This establishes a source-catalog listing, not inclusion in every downstream website or protocol certification. Not an endorsement and not an audit of purchases.",
  },
  {
    url: `https://8004scan.io/agents/base/${SCVD_AGENT_ID}`,
    registry: "8004scan — ERC-8004 agent index",
    protocols: ["erc8004"],
    confirmed: "2026-09-17",
    what_it_proves: "That 8004scan indexes this Base identity and displays its MCP, A2A and OASF services. On the confirmation date its cached MCP health showed HTTP 405 while a fresh protocol initialization succeeded; the two observations have different times and scopes. Not an endorsement and not an audit of purchases; its health reading remains its own.",
  },
  {
    url: "https://agentscan.info/agents/0711e5ab-eca5-42cc-a7ca-38b433689d56",
    registry: "Agentscan — ERC-8004 agent index",
    protocols: ["erc8004"],
    confirmed: "2026-09-17",
    what_it_proves: "That Agentscan indexes the store's Base identity and displays its current registration fields. On the confirmation date its separate AI taxonomy said Image Generation and Banking while its OASF service block showed the canonical payment, blockchain, fact-verification and API-schema taxonomy. Not an endorsement and not an audit; the conflicting classifications need reconciliation.",
  },
  {
    url: `https://8004agents.ai/base/agent/${SCVD_AGENT_ID}`,
    registry: "8004agents — ERC-8004 agent index",
    protocols: ["erc8004"],
    confirmed: "2026-09-17",
    what_it_proves: "That 8004agents returns SCVD under its Base identity, with its name and owner in the search result. The observation establishes indexing, not a complete protocol check or a successful purchase. Not an endorsement and not an audit.",
  },
  {
    url: `https://trust8004.xyz/agents/${SCVD_AGENT_REGISTRY.split(":")[1]}%3A${SCVD_AGENT_ID}`,
    registry: "trust8004 — ERC-8004 agent index",
    protocols: ["erc8004"],
    confirmed: "2026-09-17",
    what_it_proves: "That trust8004 indexes this identity. On the confirmation date its x402 flag and MCP/A2A skill labels differed from the canonical source: x402 was shown unsupported and OASF taxonomy labels appeared as protocol tools/skills. Refresh and parsing need reconciliation. Not an endorsement and not an audit; listing presence does not establish metadata accuracy.",
  },
  /**
   * FOUR FROM THE KEEPER'S HAND (2026-09-10). The URLs came in from
   * the keeper's browser; every one of these hosts refuses this
   * sandbox's egress, so no page was opened here. What each row says
   * beyond the address comes from the search engine's snippet of the
   * page (research/listing-scan-2026-09-10.md holds the snippets as
   * read), which is a partial read and is named as one — nothing a
   * snippet did not show is asserted, because a reading copied from
   * memory would be exactly the invented claim the docblock above
   * forbids. `npm run listings:check` reads all four from CI and says
   * which generation of the store's text each carries.
   */
  /*
   * READ IN FULL 2026-09-17 (the host answered the sandbox this
   * time). What the page measures, in its own words: a weekly census
   * of the official MCP registry that sends each remote endpoint a
   * real initialize handshake and tools/list, one pass, no retries,
   * and grades what came back on four questions (does it answer,
   * what is it, can it be checked, did it hold) into allow / warn /
   * block with a because-clause, a cluster within its cohort, a
   * legibility band for the tool catalogue, and an ed25519-signed
   * receipt against a published key. It offers a JSON dossier, an
   * RSS change feed per server, a README badge, a public dispute
   * route and an operator-invited verification path. The read, with
   * what it says about us and what this store took from it, is
   * research/robinsaige-read-2026-09-17.md. Its verdict stays its
   * own: read on its page, dated by its census, never copied here.
   */
  {
    url: "https://robinsaige.com/s/store.scvd/general-store",
    registry: "robinsaige.com — MCP server observatory",
    protocols: ["mcp"],
    confirmed: "2026-09-17",

    what_it_proves:
      "That robinsaige.com keeps a verification record for this server under the official registry name, store.scvd/general-store, built from its own weekly probes of the live MCP door (initialize and tools/list, no tool ever fired), with a verdict, a because-clause, a signed receipt and a public dispute route on the page. Not an endorsement and not an audit by this store: an observatory's page proves the door was found and answered its handshake, its verdict is its instrument under its published method, and nothing on it establishes a purchase or a delivery.",
  },
  {
    url: "https://crosspeel.com/endpoints/scvd-store/",
    registry: "Crosspeel (crosspeel.com) — endpoint observer",
    protocols: ["x402"],
    confirmed: "2026-09-10",
    what_it_proves:
      "That Crosspeel keeps a per-provider page for this store's x402 endpoints under the slug scvd-store — observations, price history and every stored response, in its own words, with named goods among them. Not an endorsement and not an audit: an observer's page proves the doors were found and knocked on, nothing about the goods behind them or whether a purchase ever settled.",
  },
  {
    url: "https://publishyoursaas.com/listing/scvd-store",
    registry: "PublishYourSaaS",
    confirmed: "2026-09-10",
    what_it_proves:
      "That a SaaS launch directory carries a listing for scvd.store whose opening line is the sixty words' first sentence, verbatim. Not an endorsement and not an audit: a listing proves indexing under the current text, nothing about the goods.",
  },
  {
    url: "https://aitoolscapital.com/tools/scvd-general-store/",
    registry: "AI Tools Capital",
    confirmed: "2026-09-10",
    what_it_proves:
      "That an AI-tools review directory carries a page for SCVD General Store, shaped as a review ('Worth It?') and reading it as an evidence observatory and marketplace for agentic commerce with x402 payments and endpoint verification, priced from free. Not an endorsement and not an audit: a review-shaped directory page is still a directory page — it proves indexing, and its verdict is its own.",
  },
  {
    url: "https://agenstry.com/agents/scvd.store",
    registry: "Agenstry — agent directory",
    protocols: ["a2a"],
    confirmed: "2026-09-08",
    what_it_proves:
      "That Agenstry indexes the store's agent card and publishes its own observations and card history. Not an endorsement and not an audit by this store: Agenstry's grades and probe conclusions remain its own, and a listing does not establish successful purchases or delivery.",
  },
  {
    url: "https://agenstry.com/mcp/store.scvd/general-store",
    registry: "Agenstry — MCP directory",
    protocols: ["mcp"],
    confirmed: "2026-09-08",
    what_it_proves:
      "That Agenstry lists SCVD General Store's MCP server, names https://scvd.store/mcp as its primary URL and publishes tool and resource metadata. Not an endorsement and not an audit: the listing establishes that the server was indexed, not that the mirrored catalog is complete or current or that a purchase succeeded.",
  },
  {
    url: "https://mcpfind.org/servers/store-scvd-general-store",
    registry: "MCPFind",
    protocols: ["mcp"],
    confirmed: "2026-09-08",
    what_it_proves:
      "That MCPFind lists SCVD General Store with its repository and describes its x402 preflight, receipt checks and settlement attestations. Not an endorsement and not an audit: the directory page establishes that the server was indexed, not that a purchase or delivery succeeded.",
  },
  {
    url: "https://www.licium.ai/directory/scvd-store-mcp~aHR0cHM6Ly9zY3ZkLnN0b3JlL21jcA",
    registry: "Licium",
    protocols: ["mcp"],
    confirmed: "2026-09-06",
    what_it_proves:
      "That Licium lists the store's MCP endpoint and publishes its endpoint history. Not an endorsement and not an audit of purchases: a directory record does not prove successful payment or delivery.",
  },
  {
    url: "https://www.zero.xyz/c/scvd-signature-agent-card-15cd521c",
    registry: "Zero.xyz — SCVD Signature Agent Card",
    confirmed: "2026-09-06",
    what_it_proves:
      "That Zero.xyz carries a service listing for SCVD Signature Agent Card. Not an endorsement and not an audit of its output: the listing is a discovery record, not evidence that anyone invoked the service or bought it.",
  },
  {
    url: "https://neuronto.com/ard-publishers/scvd.store",
    registry: "Neuronto ARD Registry",
    confirmed: "2026-09-06",
    what_it_proves:
      "That Neuronto has indexed this store's published ARD resources and gives the domain a publisher page. Its search impressions count appearances in that index, not visitors or purchases; our own verification queries may appear among them. Not an endorsement and not an audit of the goods. The page carries its current observations rather than a grade copied here.",
  },
  {
    url: "https://wellknownhq.com/d/scvd.store",
    registry: "WellKnown",
    confirmed: "2026-09-06",
    what_it_proves:
      "That WellKnown has indexed this store's discovery catalog and publishes a domain page with its own checks. Not an endorsement and not an audit of the goods: the grade describes what its discovery checker observed, not whether a purchase succeeds or an entry remains accurate. Its live page and README badge carry the current reading.",
  },
  {
    /**
     * THE SOURCE, AND THE ONE ENTRY THAT IS NOT A LISTING (added
     * 2026-08-26). Every other record here is somebody else's index
     * saying we exist. This is the code itself — the same repository
     * the settlement path, the verifier, the CLI and the conformance
     * desk already point strangers at from six other surfaces, and
     * the only URL on this list where a reader can check a claim
     * rather than check that a claim was filed.
     *
     * DERIVED, NOT RETYPED: `code_transparency.repository` is where
     * this store already publishes its own address. A second copy of
     * it in a trust document is a second thing to get wrong, and this
     * is the document where a dead link does the most damage.
     *
     * Its absence was found from outside: a diligence scan looks for
     * Wikipedia, Wikidata and GitHub in `sameAs` specifically, and
     * scored this store nought for two while the repository sat
     * public and linked from half the site. The other two stay off
     * this list — we have no Wikipedia article and no Wikidata item,
     * and a `sameAs` naming a page that does not exist is exactly the
     * failure this array's own docblock forbids.
     */
    url: STANDARDS_POSTURE.code_transparency.repository,
    registry: "GitHub (the store's own source)",
    confirmed: "2026-08-26",
    what_it_proves:
      "That the code running this store is public and readable: the settlement path, the signing, the verifier, the CLI and every test that guards them. It proves nothing about the operator and it is not an endorsement or an audit — nobody has paid anyone to review it, which /trust says elsewhere in those words. What it does mean is that every claim made anywhere on this site has a file behind it somebody can go and read, which no directory entry can offer.",
  },
  {
    /**
     * A SKILL IN SOMEBODY ELSE'S ALMANAC (2026-09-03, the keeper's
     * pointer). pjt222/agent-almanac is a curated repository of agent
     * skills; its test-x402-payment-client skill walks an agent
     * through the full 402 → sign → settle → verify loop and names
     * this store's cheapest door as the mainnet target, with the
     * conformance desk and the preflight beside it. The skill's author
     * field reads cv-scvd, so this is OUR contribution accepted by
     * THEIR maintainer: more than a filing (a person read it and
     * merged it), less than an independent write-up (we wrote it),
     * and said so here rather than flattened into either.
     */
    url: "https://github.com/pjt222/agent-almanac/blob/main/skills/test-x402-payment-client/SKILL.md",
    registry: "agent-almanac (pjt222), a curated skills repository on GitHub",
    protocols: ["skills", "x402"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That a curated third-party skills repository carries, by its maintainer's merge, a skill that instructs agents to test an x402 payment client against this store's cheapest door ($0.001 on 2026-09-03, the day this was recorded; the menu is the live price) and to check offers and receipts at the free conformance desk. The skill was written from this side (author cv-scvd) and accepted by theirs, so it proves a maintainer read it and kept it. Not an endorsement and not an audit: nobody independent vouches for the store by it. The prices and endpoints it names were checked against the menu on the day it was recorded.",
  },
  {
    /**
     * SCORED BY AN ALGORITHM FROM PUBLIC DATA (2026-09-03, the keeper's
     * pointer). MCPpedia computes a score daily from OSV, the GitHub
     * API, npm, deps.dev and the official registry, with no manual
     * overrides and the scoring code public. Its tool definitions come
     * from the README, not the running server, which is why the
     * README carries a tools table held to the catalogue by test.
     */
    url: "https://mcppedia.org/s/store-scvd-general-store",
    registry: "MCPpedia",
    protocols: ["mcp"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That an independent index discovered this store from the official MCP registry and scores it daily by a published algorithm over public data: known CVEs, tool-metadata poisoning patterns, maintenance signals, README structure and transports. Not an endorsement and not an audit: the score is a static read of metadata, says so on its own methodology page, and moves with the inputs. It proves the metadata was read by something that cannot be talked to.",
  },
  {
    url: "https://www.getmcp.es/servers/general-store",
    registry: "getmcp.es",
    protocols: ["mcp"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    url: "https://lightnow.ai/servers/store.scvd/general-store/versions",
    registry: "lightnow.ai",
    protocols: ["mcp"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    url: "https://mcplookup.com/server/store.scvd/general-store",
    registry: "MCP Lookup",
    protocols: ["mcp"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    url: "https://roninforge.org/data/state-of-mcp/servers/store.scvd/general-store/",
    registry: "Ronin Forge, State of MCP",
    protocols: ["mcp"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    url: "https://socketcat.com/servers/store.scvd/general-store",
    registry: "socketcat",
    protocols: ["mcp"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    url: "https://tracevero.com/mcp/store-scvd-general-store",
    registry: "Tracevero",
    protocols: ["mcp"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    url: "https://signal402.com/services/scvd-store",
    registry: "signal402",
    protocols: ["x402"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    url: "https://402.ad/service/0ca76ae0-f524-4cfa-a782-ff262f38e489/collaborative-creative-commission-api",
    registry: "402.ad",
    protocols: ["x402"],
    confirmed: "2026-09-10",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03 and again 2026-09-10). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    url: "https://decipherranker.com/dashboard/merchant/https:%2F%2Fscvd.store%2Fapi%2Fbuy%2Fnomenclature",
    registry: "Decipher Ranker",
    protocols: ["x402"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That one more index carries the store under its own page (the keeper opened it 2026-09-03). A listing: evidence of being indexed and nothing else, not an endorsement and not an audit. Which generation of the store's text it carries is read by the listings check.",
  },
  {
    /**
     * TOLL402'S THREE "UNREACHABLE" ROWS (2026-09-03, the keeper's
     * pointer). Their probe of 2026-08-24 reports UND_ERR_HEADERS_OVERFLOW
     * on the three tiered doors: a Node client refusing a 402 whose
     * header block passed 16KB. That was true on that date and is the
     * defect on /corrections that test/challenge-header-budget.spec.ts
     * now holds under the cliff; the same doors measured 13.7KB from
     * outside on 2026-09-03. Their row is a dated third-party
     * observation of a real defect, kept here as one, not corrected
     * from this side.
     */
    url: "https://toll402.com/resource/scvd-store-buy-graffiti-on-a-train-get-x402-api--6551e8200c4f7fa4ccb7ab6c",
    registry: "toll402",
    protocols: ["x402"],
    confirmed: "2026-09-03",
    what_it_proves:
      "That an independent prober fetched the store's tiered doors on 2026-08-24 and recorded what a stock Node client saw: a 402 whose headers overflowed Node's 16KB limit. Not an endorsement and not an audit; a dated observation of a defect this store has since fixed and holds under test, and the row stands as they wrote it until they probe again.",
  },
  {
    url: "https://agentpluginsdirectory.com/plugins/scvd-general-store",
    registry: "Agent Plugins Directory",
    protocols: ["skills", "mcp"],
    confirmed: "2026-09-08",
    what_it_proves:
      "That Agent Plugins Directory indexes the repository's plugin bundle, names Record Creative Co. LLC as author, lists its skill and MCP servers, and publishes its own manifest-schema verification date. Not an endorsement and not an audit of runtime behavior: a manifest check does not prove client marketplace acceptance, installation support, purchases or delivery.",
  },
  {
    url: "https://www.x402scan.com/server/9b04e1cc-ff46-4377-a533-fe7981aa1597",
    registry: "x402scan",
    protocols: ["x402"],
    confirmed: "2026-07-27",
    /**
     * THE STRONGEST ENTRY ON THIS LIST AND THE ONLY ONE THAT IS MORE
     * THAN A FILING. The others record that we submitted ourselves and
     * were indexed. This one PROBES THE PAID ROUTES ITSELF — it reads
     * what /.well-known/x402 and /openapi.json declare and then goes
     * and checks the endpoints answer as declared. That is a third
     * party testing our claims rather than repeating them, which is a
     * different class of evidence and is said so out loud rather than
     * flattened into the same sentence as a directory entry.
     */
    what_it_proves:
      "That an independent scanner read this store's x402 declaration and OPENAPI contract and probed the paid routes itself, rather than taking the listing at face value. Still not an endorsement and not an audit — it confirms the endpoints answer as declared, not that the goods are any good or the operator trustworthy.",
  },
  {
    url: "https://agentic.market/services/scvd-store",
    registry: "The x402 Bazaar (Coinbase CDP), via agentic.market",
    protocols: ["x402"],
    confirmed: "2026-07-27",
    what_it_proves:
      "That fourteen of this store's endpoints are registered to its wallet in the CDP discovery list, which is the authoritative index for x402 services rather than a browsable mirror. Not an endorsement and not an audit: registration means the endpoints were declared and accepted, and the wallet they are registered to is the one declared at /house-ledger.json.",
  },
  {
    url: "https://mcpservers.org/servers/seancrecord/scvd-general-store-repo",
    registry: "mcpservers.org",
    protocols: ["mcp"],
    confirmed: "2026-07-29",
    what_it_proves:
      "That the MCP server is listed and claimed by its operator, categorised under Finance. Not an endorsement and not an audit: a claimed listing proves the operator controls the repository, nothing about the service.",
  },
  {
    url: "https://glama.ai/mcp/servers/seancrecord/scvd-general-store-repo",
    registry: "Glama MCP server index",
    protocols: ["mcp"],
    confirmed: "2026-07-31",
    what_it_proves:
      "That this store's MCP server was auto-indexed by a third-party directory that crawled it without being asked. Unclaimed, and it mirrors the repository README. Not an endorsement and not an audit: an index entry means somebody's crawler found us and filed us.",
  },
  {
    url: "https://x402-list.com/services/sean-claude-van-damme-s-general-store",
    registry: "x402-list.com",
    protocols: ["x402"],
    confirmed: "2026-08-02",
    /**
     * A per-service page that RUNS CHECKS rather than just listing —
     * grade A on 14 of 14, and VERIFIED as of 2026-08-02: the keeper
     * completed the directory's domain-ownership proof (one-time token
     * at /.well-known/x402list.txt, since removed as invited). Proven
     * a second time 2026-08-11, same token flow, when the keeper moved
     * the listing to Finance and updated its description to the
     * current positioning — an update there requires a fresh proof.
     */
    what_it_proves:
      "That an x402 directory ran its automated checks against this store's own service page and graded it A (14 of 14) — a third party testing the endpoints rather than repeating a listing — and that the store verified domain ownership with the directory on 2026-08-02 and again on 2026-08-11 when the listing moved to the Finance category with an updated description. Not an endorsement and not an audit of the goods.",
  },
  {
    url: "https://glama.ai/mcp/connectors/store.scvd/general-store",
    registry: "Glama MCP connectors",
    protocols: ["mcp"],
    confirmed: "2026-08-04",
    what_it_proves:
      "That Glama also carries this store as a connector page, distinct from its earlier auto-crawled server index entry. Not an endorsement and not an audit: a directory page proves indexing, nothing about the service.",
  },
  {
    url: "https://mcpindex.ai/server/store-scvd-general-store",
    registry: "mcpindex.ai",
    protocols: ["mcp"],
    confirmed: "2026-08-04",
    what_it_proves:
      "That mcpindex.ai lists the MCP server with its own live verdict page. Not an endorsement and not an audit: their verdict is their instrument, read on their page — this record only proves the listing exists.",
  },
  /**
   * THE THREE AGENT-TOOLS ENTRIES, one per protocol, 2026-09-15.
   *
   * That directory indexes x402 services, MCP servers and A2A agents
   * as three separate populations, so this store appears in three
   * places rather than one. Listed separately because they are
   * separate records: a reader checking whether the A2A agent is real
   * should not have to take an x402 listing as evidence for it.
   *
   * WHAT CHANGED THE CLAIM. Until this date these were crawler
   * imports nobody here had authenticated. The store then proved
   * domain control (the `agentToolsVerify` token in
   * src/store/site-verification.ts), which means the operator can now
   * edit the descriptive fields. That CUTS what a listing proves
   * rather than raising it: the name and description are now the
   * store's own words, so they are self-description carried by a third
   * party, not a third party's account of us. The measured fields are
   * the opposite — their directory holds those shut against the
   * operator, so those remain somebody else's reading.
   *
   * THE GRADE IS NOT REPRODUCED HERE, and that is the rule rather than
   * modesty about the number. This store does not republish other
   * people's scores (the same rule that drops x402scout's 0-100 at the
   * parse in src/services/ward-sources.ts). Their grade is their
   * instrument, it moves on their probe schedule, and a figure copied
   * into this file would be stale the first time they re-probe while
   * still reading as a current claim. Follow the link and read it
   * there.
   */
  {
    url: "https://agent-tools.cloud/services/scvd-store-bazaar",
    registry: "agent-tools.cloud (x402 services)",
    protocols: ["x402"],
    confirmed: "2026-09-15",
    what_it_proves:
      "That agent-tools.cloud carries this origin among the x402 services it indexes, and that the operator proved control of the domain to them. Not an endorsement and not an audit: the page's description is the store's own words, and its quality grade is their measurement on their schedule — read it there rather than here.",
  },
  {
    url: "https://agent-tools.cloud/a2a/agents/scvd-evidence-agent",
    registry: "agent-tools.cloud (A2A agents)",
    protocols: ["a2a"],
    confirmed: "2026-09-15",
    what_it_proves:
      "That the same directory carries the SCVD Evidence Agent in its A2A population, resolved from the agent card at /.well-known/agent-card.json. Not an endorsement and not an audit: it proves the card was fetched and parsed, nothing about what the agent does when asked.",
  },
  {
    url: "https://agent-tools.cloud/mcp/servers/scvd-general-store-scvd-store",
    registry: "agent-tools.cloud (MCP servers)",
    protocols: ["mcp"],
    confirmed: "2026-09-15",
    what_it_proves:
      "That the same directory carries this store's MCP server, listed against the endpoint at /mcp. Not an endorsement and not an audit: it proves the server was reachable and its card read, nothing about the tools behind it.",
  },
  {
    url: "https://x402.fuchss.app/provider/scvd.store",
    registry: "x402.fuchss.app (provider index)",
    protocols: ["x402"],
    confirmed: "2026-09-01",
    what_it_proves:
      "That an independent x402 provider index carries this origin as a provider — keyed on the domain rather than on a submitted listing. Not an endorsement and not an audit: an index proves the door was found, nothing about what comes through it.",
  },
  {
    /**
     * FOUND, NOT SUBMITTED, and the crawl says when. AgentIndex walked
     * this store's Appendix C catalog and the agentic.market listing
     * on its own; its snapshot froze on the July 23/24 copy and still
     * carried jar_of_tuesday on 2026-09-01, which is the same day the
     * keeper claimed the host so they re-read (/.well-known/
     * agentindex-verify.txt). A stale index is still a record that we
     * were found — it is just a dated one, like everything else here.
     */
    url: "https://agents.traderszone.net/a/urn%3Adirectory%3Aagentic-market%3Ahttps%3A%2F%2Fscvd.store%2Fapi%2Fbuy%2Fcertificate_of_patronage",
    registry: "AgentIndex (agents.traderszone.net)",
    protocols: ["x402"],
    confirmed: "2026-09-01",
    what_it_proves:
      "That AgentIndex carries this store's doors as resources it found on its own — this row is the certificate_of_patronage door as their crawl of the agentic.market listing saw it; the host page at agents.traderszone.net/explore?host=scvd.store lists the rest. Not an endorsement and not an audit: an index proves the door was found, and this one also proves how long a found listing can lag the shelf.",
  },
  {
    /**
     * FOUND, NOT CLAIMED, and their page says so in as many words:
     * "The domain has not claimed it; each entry says what its own
     * source said, no more." AgentMesh Catalog groups what it found
     * published under scvd.store — the MCP server card among it,
     * keyed by the Appendix C URN this store emits — and keeps the
     * grouping unclaimed until the domain says otherwise. That
     * restraint is the right shape for a directory and is worth
     * recording as such.
     */
    url: "https://agentcatalog.com/publishers/scvd.store?q=",
    registry: "AgentMesh Catalog (agentcatalog.com)",
    confirmed: "2026-09-02",
    what_it_proves:
      "That AgentMesh Catalog groups what it found published under this domain — the MCP server card and the catalog entries — and says on the page that the domain has not claimed the grouping and that each entry repeats only what its source said. Not an endorsement and not an audit: a publisher page proves the sources were found and read, nothing about the goods.",
  },
  {
    /**
     * A SKILL DIRECTORY, NOT A STORE DIRECTORY: skills.sh indexes the
     * SKILL.md files a GitHub repository publishes. The 2026-09-08
     * read confirmed the individual skill page, including the skill
     * name after owner/repo; the old repository-only URL was not the
     * page this record meant to identify.
     */
    url: "https://www.skills.sh/seancrecord/scvd-general-store-repo/scvd-general-store",
    registry: "skills.sh (open Agent Skills directory)",
    protocols: ["skills"],
    confirmed: "2026-09-08",
    what_it_proves:
      "That the open Agent Skills directory publishes this repository's scvd-general-store skill, its SKILL.md excerpt and an installation command. Not an endorsement and not an audit: a skill index proves the skill was found under this repository, nothing about the store the skill walks into.",
  },
  {
    /**
     * THE COLD WALK, and the one row in this array that is neither a
     * directory nor an instrument. Cairn (cairnwake.com) approached the
     * store unannounced on 2026-08-25 under terms agreed in advance —
     * both sides publish their half, unflattering parts included —
     * bought with their own money, checked every claim against things
     * this store does not control (the published key offline, a Base
     * receipt, the free verify door, the public ledger moving), and
     * published the transcript. They found one wrinkle: the store
     * refused the X-PAYMENT header most of the ecosystem speaks. That
     * is on /corrections, was fixed the next day, and they re-ran it
     * with fresh authorizations rather than take the keeper's word.
     *
     * WHY THE ROW STILL SAYS "NOT AN ENDORSEMENT". Because they say
     * so: one walk, one night, one wallet, offered at its true weight.
     * A record is what happened at the door to a stranger with no
     * notice. That is more than any listing here proves and less than
     * a guarantee, and the line between those is the whole trust doc.
     */
    url: "https://cairnwake.com/2026-08-25-cold-walk-scvd.html",
    registry: "Cairn (cairnwake.com) — the cold walk, published by arrangement",
    confirmed: "2026-09-02",
    what_it_proves:
      "That an independent tester walked the store cold on 2026-08-25, paid with their own wallet, verified the certificate offline against the published key, read the settlement back from a Base RPC, watched the public ledger move, found one defect (the X-PAYMENT header refused) and re-tested the fix the next day with fresh authorizations. Not an endorsement and not an audit of anything beyond that night: one dated observation by one buyer, published with the unflattering part in it, and the defect it found is on /corrections under its own date.",
  },
  {
    /**
     * THE SECOND COLD READ, and it checked a different thing than
     * Cairn did. Cairn walked the STORE — bought, verified, watched
     * the ledger move. 0200project re-derived a FIELD WALK: they took
     * the 2026-09-05 ledger, went to a public Base node without our
     * tooling, and rebuilt the settlement set from the chain itself.
     *
     * IT BEGAN AS TWO FINDINGS AGAINST US, which is why it belongs
     * here rather than in a testimonial. They caught the walk ledger
     * publishing an EIP-3009 authorization nonce under prose calling
     * it a transaction hash (/corrections, 2026-09-04), then caught
     * the overcorrection — our "no node will ever answer it", when
     * AuthorizationUsed is indexed and answers exactly that
     * (/corrections, 2026-09-05). The convergence below is the third
     * round of a thread whose first two rounds we lost.
     *
     * AND THE SHARPEST LINE IN IT WAS ABOUT OUR OWN INSTRUMENT: our
     * reconciliation's "gap $0.00" was this store's tooling agreeing
     * with itself, where a second instrument agreeing with the chain
     * is the different and stronger claim. The walk report now states
     * that beside the number on every run, because they said it.
     *
     * WEAKER THAN CAIRN'S IN ONE RESPECT, said here rather than left
     * for a reader to notice: Cairn published on their own domain. This
     * lives in their comments on our issue tracker — text we can
     * neither author nor edit, on a host we control and could delete.
     */
    url: "https://github.com/seancrecord/scvd-general-store-repo/issues/188#issuecomment-5555985899",
    registry:
      "0200project (base-tx-explain) — an independent re-derivation of a field walk, published in thread",
    confirmed: "2026-09-06",
    what_it_proves:
      "That on 2026-09-06 an outside operator re-derived this store's 2026-09-05 field walk from a public Base node using none of our tooling: 34 chain transfers totalling $0.0350 against 34 settled ledger rows, all 31 rows carrying a transaction hash agreeing with the chain on amount and recipient, and the 3 rows whose receipts named no transaction recovered from their authorization nonce. Zero disagreements. Their own decoder separately read one of those transactions and agreed with our row on every field both instruments hold. Not an endorsement and not an audit: one run, one day, 34 settlements on the simplest shape either instrument handles, and it establishes nothing about the paid audits, watches or attestations. The same thread carries two findings against this store, both on /corrections, and one the other operator disclosed against their own product.",
  },
  {
    /**
     * AN INSTRUMENT, NOT A DIRECTORY — the same care as the Circle
     * entry below, and one more: probe402 is the nearest thing to this
     * store's own house style anywhere in the field (named operator,
     * corrections from day one, a structural inability to pay; see
     * docs/VERIFICATION_LANDSCAPE_2026-08.md), and it signs nothing.
     * Its page on a door is a DATED PROBE RECORD — latest reading,
     * price, payTo, and how many observations it holds — with the
     * line "that is a statement about our record, not about the
     * endpoint" when the window is thin. The row here is a record
     * that an independent prober reads one of this store's doors and
     * publishes what it saw; whatever it saw is theirs to say, on
     * their page, re-taken on their schedule, and no reading is
     * quoted here for the same reason no Circle score is.
     */
    url: "https://probe402.com/grade?url=https%3A%2F%2Fscvd.store%2Fapi%2Fbuy%2Fsmall_blessing",
    registry: "probe402 — dated probe record",
    protocols: ["x402"],
    confirmed: "2026-09-02",
    what_it_proves:
      "That an independent x402 prober reads the small_blessing door and publishes a dated record of what it saw — status, price, payTo, and how many observations stand behind the page. Not an endorsement and not an audit: it is their observation on their page, re-taken on their schedule, and it never buys anything, so it cannot speak to what comes through the door once money moves.",
  },
  {
    /**
     * AN INSTRUMENT, NOT A DIRECTORY, and the wording below is careful
     * about the difference. Circle's readiness scanner fetches the
     * origin's OpenAPI document and the live 402 and scores what it
     * finds — how legible the interface is to a buying agent. It never
     * buys anything, so it cannot speak to whether the goods are worth
     * the money, which is the line every entry in this array holds.
     *
     * NO NUMBER IS QUOTED HERE ON PURPOSE. The score is re-taken on
     * every scan and this file is not re-read on every scan; a figure
     * written down here would be a claim that rots quietly, which is
     * the failure /corrections exists to catch. The badge in the
     * README renders the live value, which is the honest place for a
     * number that moves.
     */
    url: "https://agents.circle.com/sell/score?url=scvd.store%2Fapi%2Fbuy%2Fhello",
    registry: "Circle — Sell to Agents readiness score",
    protocols: ["x402"],
    confirmed: "2026-09-01",
    what_it_proves:
      "That Circle's readiness scanner reaches this origin, fetches its OpenAPI contract and its live 402, and scores how legible the paid interface is to a buying agent. Scored per endpoint with no summary page, so one door stands for the set — every paid door here is described by the same contract and answers the same challenge, which is the fact the reading actually turns on. An instrument reading, not a listing and not an audit: it measures the shape of the door — payment terms declared, inputs described, guidance present — and never buys anything, so it says nothing about the goods behind it.",
  },
  {
    /**
     * THE BROWSER DOOR'S FIRST RECORDS (2026-09-06, the keeper's four
     * URLs). The store has served /webmcp.js for weeks and the WebMCP
     * door scores 5/5 in its own battery, while this list — the only
     * listing record anyone can check — carried nothing for it at all.
     * A capability with no external record is a claim, and SIX_DOORS
     * argues that door at length.
     *
     * These are LISTINGS OF A BROWSER SURFACE, and the distinction
     * from every MCP row here is worth keeping: what is indexed is
     * that this origin declares tools to an agent arriving in a
     * browser, which is a different fact from a server answering a
     * handshake.
     */
    url: "https://webmcpdirectory.com/tool/scvd-store",
    registry: "WebMCP Directory (webmcpdirectory.com)",
    protocols: ["webmcp"],
    confirmed: "2026-09-06",
    what_it_proves:
      "That a directory of WebMCP-enabled sites carries a page for this store's browser surface. Not an endorsement and not an audit: it proves the origin declares tools an in-browser agent can find, and says nothing about whether those tools return anything worth having.",
  },
  {
    url: "https://webmcp.ora.ai/scvd.store",
    registry: "Ora — WebMCP directory (webmcp.ora.ai)",
    protocols: ["webmcp"],
    confirmed: "2026-09-06",
    what_it_proves:
      "That Ora's WebMCP directory carries this origin. Not an endorsement and not an audit: a directory page proves indexing. Their rows say HOW each site's support is known — a registry claim, tools observed live, or a full audit with its score — which is the same claim-versus-observation line this store draws in its own readings; what tier they give us is theirs to change and is deliberately not restated here.",
  },
  {
    url: "https://directory.ora.ai/scvd.store",
    registry: "Ora Directory (directory.ora.ai)",
    confirmed: "2026-09-06",
    what_it_proves:
      "That Ora's wider agentic index of the web carries a page for this store. Not an endorsement and not an audit: a directory page proves indexing. Listed apart from their WebMCP directory above on purpose — being in an index of agent-usable sites is a different fact from declaring browser tools, and collapsing the two would count one listing twice.",
  },
  {
    /**
     * AN INSTRUMENT, NOT A DIRECTORY — the same separation the two
     * Circle rows keep, for the same reason. A score is somebody
     * running a battery against this origin; a listing is somebody
     * holding a page about it. Filing them together would say a
     * reading and a row are the same kind of evidence.
     */
    url: "https://ora.ai/score/scvd.store",
    registry: "Ora — agent-readiness score",
    confirmed: "2026-09-06",
    what_it_proves:
      "That Ora's scanner reaches this origin and grades how legible it is to an arriving agent. An instrument reading, not a listing and not an audit: it measures the shape of what we serve and never buys anything, so it says nothing about the goods behind the doors. The number is theirs and moves when they change the battery; this records that the reading exists, never what it says.",
  },
  {
    /**
     * A DIRECTORY THIS TIME, NOT AN INSTRUMENT — and the wording below
     * keeps the two apart, because the entry above is also Circle's
     * and measures something. This one is a per-partner page in
     * Circle's partner directory, submitted by the keeper on
     * 2026-09-01 (KEEPER_LIST: "Circle Agent Marketplace") and seen
     * listed 2026-09-04. A directory page proves the listing exists
     * and that the operator went through a submission; it is not the
     * issuer of USDC vouching for the goods, and the row says so.
     *
     * RECORDED FROM THE KEEPER'S WORD. The sandbox that wrote this row
     * could not fetch partners.circle.com (egress policy), so the
     * page's own wording is unread here and nothing from it is quoted
     * — the same discipline as the score entry above, for a different
     * reason. The confirmed date is the keeper's sighting.
     */
    url: "https://partners.circle.com/partner/scvdstore",
    registry: "Circle partner directory",
    confirmed: "2026-09-04",
    what_it_proves:
      "That Circle's partner directory carries a per-partner page for this store, submitted by the keeper and listed after review. Not an endorsement and not an audit: a directory page proves the listing exists and that a submission was accepted, nothing about the goods — and being listed by the issuer of the stablecoin this store is paid in says the store is on their map, not that they stand behind what it sells.",
  },
  {
    url: "https://www.getdrio.com/mcp/store-scvd-general-store",
    registry: "Drio (getdrio.com)",
    protocols: ["mcp"],
    confirmed: "2026-09-01",
    what_it_proves:
      "That Drio's MCP index carries the server under its canonical name. Not an endorsement and not an audit: a directory page proves indexing, nothing about the goods.",
  },
  {
    url: "https://index.zbs.gg/en/mcp/store-scvd-general-store/",
    registry: "ZBS Index (index.zbs.gg)",
    protocols: ["mcp"],
    confirmed: "2026-09-01",
    what_it_proves:
      "That the ZBS MCP index carries the server, under the same canonical name every other registry resolved it to. Not an endorsement and not an audit: a directory page proves indexing, nothing about the goods.",
  },
  /**
   * THE REGISTRY'S DOWNSTREAM, FOUND BY WHO KNOCKED (2026-09-02). The
   * MCP door's client census showed a month of handshakes from names
   * the store had never listed. The keeper walked the ones that
   * resolved to a website; these are the ones with a page of their
   * own that points at THIS server rather than at a directory. Each
   * of them ingested the official registry entry, so the slug is the
   * registry name with its punctuation flattened, and each carries
   * both entries this repo publishes — the store and the tab.
   */
  {
    url: "https://verifymcp.io/servers/store-scvd-general-store/scvd",
    registry: "VerifyMCP (verifymcp.io)",
    protocols: ["mcp"],
    confirmed: "2026-09-10",
    what_it_proves:
      "That VerifyMCP connected to the live door, read its tools and scored what it found — endpoint security, schema quality, tool safety, spec recency — with the derivation of each row on the page. Not an endorsement and not an audit: an instrument reading on the shape of the door, taken by their probe on their schedule, which says nothing about the goods behind it. Their handshake name is verifymcp-probe.",
  },
  {
    url: "https://verifymcp.io/servers/store-scvd-tab/scvd-tab",
    registry: "VerifyMCP (verifymcp.io) — the tab",
    protocols: ["mcp"],
    confirmed: "2026-09-02",
    what_it_proves:
      "That VerifyMCP carries the second server this repo publishes, scvd-tab, and scored it from the npm package and the repository — the first third-party number on the tab at all. Not an endorsement and not an audit: their instrument, their rows, read on their page.",
  },
  {
    /*
     * THE FIRST VENUE THAT REVIEWED RATHER THAN INDEXED (2026-09-17).
     *
     * Every other row on this list is a directory that read a registry
     * entry or pinged a door. This one is a human review process the
     * store FAILED first — submitted 2026-09-09, rejected 2026-09-13
     * on bad test results and unconfirmed ownership, resubmitted after
     * business verification and a transport red team of the door, and
     * admitted on the second attempt. That history is in
     * docs/SPEC_READS.md, and it is the reason this row names the
     * review rather than dressing it as an endorsement.
     *
     * IT IS THE VERIFIER DOOR, NOT THE STORE. What OpenAI reviewed and
     * listed is /mcp/verifier: five read-only tools and no shelf. A
     * reader who takes this row as evidence about the paid instruments
     * has read it wrong, so the sentence says which door.
     */
    url: "https://chatgpt.com/plugins/plugin_asdk_app_6aaa9b3afcc081918be808a0d8cfd212",
    registry: "ChatGPT Plugin Directory (chatgpt.com) — the verifier door",
    protocols: ["skills", "mcp"],
    confirmed: "2026-09-17",
    what_it_proves:
      "That OpenAI reviewed the free verifier door at /mcp/verifier against its own submission guidelines and admitted it to the plugin directory, on the second attempt. Not an endorsement and not an audit: a directory review checks a listing's claims, its test cases and its tool annotations, and says nothing about whether the goods on this store's other doors are worth buying. It covers the five read-only tools on that door only.",
  },
  {
    url: "https://mcpbeat.com/mcp-servers/scvd/general-store/",
    registry: "mcpbeat (mcpbeat.com)",
    protocols: ["mcp"],
    confirmed: "2026-09-02",
    what_it_proves:
      "That mcpbeat lists the server, pings the door on a fifteen-minute loop, and shows the tool list it read there. Not an endorsement and not an audit: a liveness directory proves the door answered its last knock, nothing about the goods. Its handshake name is mcpbeat.",
  },
  {
    url: "https://mcpbeat.com/mcp-servers/scvd/tab/",
    registry: "mcpbeat (mcpbeat.com) — the tab",
    protocols: ["mcp"],
    confirmed: "2026-09-02",
    what_it_proves:
      "That mcpbeat carries scvd-tab too, from the same registry ingest. Not an endorsement and not an audit: a directory page proves indexing, nothing more.",
  },
  {
    url: "https://catalog.agentage.io/mcp/store-scvd-general-store",
    registry: "agentage MCP Catalog (catalog.agentage.io)",
    protocols: ["mcp"],
    confirmed: "2026-09-02",
    what_it_proves:
      "That the agentage catalog, synced from the official MCP registry, carries the server under its registry name. Their page says plainly that it holds only what the registry entry says; a directory page proves indexing, nothing about the goods. Not an endorsement and not an audit.",
  },
  {
    url: "https://catalog.agentage.io/mcp/store-scvd-tab",
    registry: "agentage MCP Catalog (catalog.agentage.io) — the tab",
    protocols: ["mcp"],
    confirmed: "2026-09-02",
    what_it_proves:
      "That the same catalog carries scvd-tab, from the same registry sync. Not an endorsement and not an audit: indexing, nothing more.",
  },
  {
    url: "https://mcpservers.org/servers/scvd-store-llms-txt",
    registry: "mcpservers.org (llms.txt entry)",
    protocols: ["mcp"],
    confirmed: "2026-08-04",
    what_it_proves:
      "That mcpservers.org carries a second, llms.txt-derived entry beside the claimed server listing above — the store's own machine-readable front door, independently ingested. Not an endorsement and not an audit.",
  },
  {
    /**
     * RE-SLUGGED 2026-08-18: m8ven's Live Monitored connection issued
     * a new listing id (-0xqk2v, replacing -l9nvwp) and now re-verifies
     * on every code change. The keeper opened the new page the same
     * day, per this list's only-opened-URLs rule; the README badge
     * moved with it.
     */
    url: "https://m8ven.ai/mcp/seancrecord-scvd-general-store-repo-0xqk2v",
    registry: "m8ven.ai",
    protocols: ["mcp"],
    confirmed: "2026-08-18",
    /**
     * A SCANNER, NOT A MIRROR — the class of entry worth having even
     * when its current readings are unflattering, and the readings are
     * recorded here honestly: on 2026-08-04 it flagged one high CVE
     * (wrangler, a devDependency that never ships in the Worker;
     * upgraded the same day) and listed the shopping script's env
     * knobs as if the MCP required them (the stdio bridge reads no
     * env at all). Third parties that run checks are the ones that
     * catch real things eventually; the wrong readings get fixed at
     * the source, not argued with.
     */
    what_it_proves:
      "That a third-party scanner audits this repository's declared dependencies against OSV and republishes its findings — an instrument pointed at us, not a listing we wrote. Not an endorsement and not an audit of the goods. Its readings can lag or misattribute (its 2026-08-04 CVE flag was a dev-only tool, upgraded same day; its env-var table describes a test script, not the MCP bridge, which needs none), and this record claims only that the scanner watches, not that its current score is right.",
  },
  {
    url: "https://mcp-marketplace.io/server/store-scvd-general-store",
    registry: "mcp-marketplace.io",
    protocols: ["mcp"],
    confirmed: "2026-08-04",
    what_it_proves:
      "That mcp-marketplace.io lists the MCP server and republishes an OpenSSF Scorecard reading against the repository — an instrument, not a listing we wrote. Not an endorsement and not an audit of the goods: its scorecard measures repository hygiene (workflow permissions, update tooling, review process), several items of which were fixed the day this record was added, and the reading lags the repo until its next crawl.",
  },
  {
    url: "https://x402-bazaar.com/resources/6a61e8fc7356b8e8002b1af7",
    registry: "x402-bazaar.com (Bazaar mirror)",
    protocols: ["x402"],
    confirmed: "2026-08-04",
    what_it_proves:
      "That a Bazaar mirror the store never submitted to serves per-resource pages for its items — found by the keeper within hours of the registration run, which is the settle-triggered discovery pipeline observed propagating to a surface we did not know existed. ONE URL STANDS FOR THE SET on purpose: the mirror pages every registered resource separately and has no summary page, and a row per endpoint would repeat a single fact fourteen times, which is the logo wall this array's docblock refuses. Not an endorsement and not an audit: a mirror proves the source catalog carries us, nothing more.",
  },
  {
    url: "https://agentidentityregistry.org/lookup/?id=AIR-BYYP-0MQC-TAKR",
    registry: "Agent Identity Registry (AIR) — scvd-store, AIR-BYYP-0MQC-TAKR",
    confirmed: "2026-08-01",
    /**
     * A THIRD-PARTY SCORE, and its two lowest dimensions independently
     * name the two weak spots this store's own /corrections and its
     * research already knew — which is the point worth recording, not
     * the number. The URL is the id-lookup page, which resolves to THIS
     * store's passport (registered there as scvd-store), so it is a
     * per-service page rather than a directory root — a legitimate
     * sameAs. Verification level is VERIFIED BY USER: self-attested,
     * NOT verified by the organization, and the record says so rather
     * than letting "verified" imply more than a self-claim. That is the
     * deliberate posture (reputation-through-public-work), not a gap to
     * close by doxxing.
     */
    what_it_proves:
      "That an agent-identity registry scored this store 470/1000 (grade B) against five weighted dimensions, resolving did:web:scvd.store, at verification level VERIFIED BY USER — self-attested, not organization-verified, and the record says so. Not an endorsement and not an audit of the goods: it is an automated score of posture. Its highest dimension is Transparency (650) — the radical-honesty layer showing — and its two lowest, Security Posture (300) and Peer Attestations (300), are the same two this store already flags itself: the OpenSSF Scorecard's security items, and the fact that no peer has yet cross-attested us (there is no peer-attestation prior art in x402 to have earned one from).",
  },
  {
    url: "https://mcpmarket.com/server/sean-claude-van-damme-s-general-store",
    registry: "mcpmarket.com",
    protocols: ["mcp"],
    confirmed: "2026-08-11",
    /**
     * ITS WRONG READINGS, recorded on arrival (the m8ven precedent):
     * the page's generated summary paraphrases the pre-repositioning
     * README — leads with "quaint and sincere digital marketplace",
     * names no conformance desk or corpus, and invents "zodiac
     * readings", an item this store has never sold. The source
     * (README, llms.txt) already says the current thing; the summary
     * lags until their next crawl and is not argued with.
     */
    what_it_proves:
      "That mcpmarket.com carries a per-server page for this store. Not an endorsement and not an audit: a directory page proves indexing, nothing about the service — and this one's generated summary paraphrases an earlier README (it leads with the marketplace framing, omits the conformance desk and corpus, and lists a 'zodiac readings' item that has never existed here), so it lags the repository until its next crawl.",
  },
  {
    url: "https://deepwiki.com/seancrecord/scvd-general-store-repo",
    registry: "DeepWiki (Cognition/Devin)",
    confirmed: "2026-08-11",
    /**
     * A DERIVED DOCUMENT, NOT A LISTING: DeepWiki generates a
     * browsable wiki of the repository with Devin, and models and
     * developers consult it as if it were documentation. The keeper
     * requested indexing 2026-08-11; the page existed and was opened
     * before this entry was written, per this list's own rule. What
     * renders there is Devin's READING of this repo — it can lag a
     * commit or misread a design the way every derived surface on
     * this list has at least once, and the repository stays the
     * source it gets corrected from.
     */
    what_it_proves:
      "That DeepWiki (Cognition's repository index, the one Devin consults) carries a page for this repository, with a generated wiki requested by the keeper on 2026-08-11. Not an endorsement and not an audit: the wiki is a machine's reading of the source, it can lag or misread until its next regeneration, and the repository it derives from is public beside it.",
  },
  {
    url: "https://cursor.directory/plugins/scvd-general-store-repo",
    registry: "Cursor Directory",
    protocols: ["skills", "mcp"],
    confirmed: "2026-09-18",
    what_it_proves:
      "That Cursor Directory carries a plugin page for this store. On September 18 the owner updated its name, description and keywords, replaced the stale skill with the current general-store skill, added the verification skill and pinned the Tab server to the published package version. The public page displayed both skills and both MCP servers. Not an endorsement and not an audit: this community listing does not establish official Cursor marketplace acceptance, a security-scan verdict or native Cursor skill activation.",
  },
  {
    url: "https://smithery.ai/servers/seancrecord/scvd-general-store",
    registry: "Smithery",
    protocols: ["mcp"],
    confirmed: "2026-08-11",
    /**
     * ITS READING WAS WRONG, AND THEN IT WAS OURS (2026-09-01).
     *
     * This record used to say the scan graded descriptions, parameter
     * descriptions and output schemas at full marks, with a stale
     * "Annotations 0/27" against a catalog retired on 2026-08-02. That
     * was true when it was written and is not now, and the reason is
     * ours rather than theirs.
     *
     * Smithery reads /.well-known/mcp/server-card.json INSTEAD OF
     * calling tools/list. This store began serving the card at that
     * path on 2026-08-30, closing a 404 that read as absence — and the
     * card declared `capabilities.tools: true` while naming no tools.
     * So the scan found six resources and nothing to call, and graded
     * capability quality 0 of 40: not a judgement on the tools, a
     * denominator. The card names all thirteen since; the reading
     * refreshes on the next scan and is not argued with.
     *
     * WHY IT IS WRITTEN OUT RATHER THAN QUIETLY DROPPED. Every other
     * entry here records a registry's wrong reading against the
     * registry. This one records a wrong reading we caused, in the one
     * document whose whole claim is that the gaps get counted against
     * us too. See test/server-card-names-the-tools.spec.ts, which
     * fails if the card ever again declares a capability it does not
     * enumerate.
     */
    what_it_proves:
      "That Smithery carries a per-server page for this store, submitted by the keeper, with its own quality scan. Not an endorsement and not an audit: a directory page proves indexing — and this one's capability reading (0 of 40, descriptions 0 of 0) is a fault of ours, not a finding about the tools: its scanner reads our server card instead of calling tools/list, and from 2026-08-30 that card declared tools and named none. The card lists all thirteen since, so the reading lags until its next scan.",
  },
  {
    url: "https://mcp.so/servers/scvd-store",
    registry: "mcp.so",
    protocols: ["mcp"],
    confirmed: "2026-08-10",
    /**
     * ITS WRONG READINGS, recorded on arrival (the m8ven precedent):
     * the page's auto-extracted install config shows a wrangler
     * KV-setup command from this README as if it were the server
     * command — the real door is streamable HTTP at /mcp, and the
     * README now carries that config where an extractor will find it
     * — and its overview mirrors a pre-2026-08-10 ClawHub bundle that
     * still said settle-first. Both get fixed at the source and wait
     * for its next crawl, not argued with.
     */
    what_it_proves:
      "That mcp.so carries a per-server page for this store whose summary leads with the current positioning. Not an endorsement and not an audit: a directory page proves indexing, nothing about the service — and this one's auto-extracted install config and mirrored skill text lag the repository until its next crawl.",
  },
];

/**
 * WHAT IS DELIBERATELY NOT IN THE LIST ABOVE, and why.
 *
 * A trust document is exactly the wrong place to round up. Three real
 * listings are left out, and the reason is the same for all: NONE
 * PUBLISHES A PER-SERVICE PAGE that points at this store. You are in
 * the index and that is all there is; there is no URL that points at
 * this store rather than at the directory containing it. MIT's Project
 * NANDA is the sharpest example of the distinction — its entry links
 * OUT to this site's llms.txt, which is NANDA pointing at us, not a
 * NANDA page identifying us, so there is still nothing to sameAs to.
 *
 * So the omission is permanent rather than pending a link somebody
 * has not found yet, and that distinction is worth writing down —
 * "we could not find the URL" and "the URL does not exist" invite
 * completely different next actions from whoever reads this next.
 *
 * A CATALOGUE ROOT IS NOT A sameAs AND WILL NOT BE ADDED AS ONE.
 * schema.org defines that field as a page that unambiguously
 * indicates the ITEM's identity, and a directory homepage identifies
 * the directory. Listing it would be padding a legitimacy document
 * with a link that proves somebody else exists, which is worse than
 * the empty space it fills.
 */
export const RECORDS_NOT_LISTED =
  "Five further listings exist and are deliberately not linked in the sameAs above, for one reason: none publishes a per-service page that points at THIS store. The official MCP registry has carried this store as store.scvd/general-store since 2026-07-30, and x402scout.com lists it too — in both you are in the index and that is all there is. The MCP Census (mcpcensus.com) returns both of this repo's servers to a lookup and no page of their own, and Spanly (spanly.com) will scan the door on demand and list its tools without keeping a record of having done so; a search result and a scan-on-demand are both true and neither is an address. MIT's Project NANDA index (the 'DNS of the agentic web', where an agent publishes an Agent Facts file) lists the store as scvd.store, and its entry links OUT to this site's llms.txt — which is NANDA pointing at us, not a NANDA page identifying us, so there is still no URL that points at this store rather than at the directory. NANDA carries no organization verification of the entry, and this says so rather than borrowing the word. That is a permanent property of these catalogues rather than a link nobody has found yet, and the difference matters to whoever reads this next. A catalogue root will not be added to stand in for one: schema.org's sameAs means a page that unambiguously indicates THIS item's identity, and a directory homepage identifies the directory. Padding a legitimacy document with a link that proves somebody else exists is worse than the space it fills. All five are named here rather than quietly dropped, because a curated list with no statement of its own edges is a list you cannot tell is curated.";

/**
 * THE OPERATOR, stated the way a diligence check expects to find it.
 *
 * legal_entity is null and that is a deliberate statement rather than
 * an omission: this store does not claim a registered company, and
 * publishing nothing at all in this field would let a reader assume
 * either answer. If an entity is ever registered, this becomes a
 * checkable fact and goes here; until then the honest answer is that
 * you are dealing with one named person and a published wallet.
 */
/**
 * THE KEEPER'S OWN SOCIAL ACCOUNT (his word, 2026-08-28: "@keeper_scvd
 * — is my twitter in the schemas?"). It was not, anywhere. It rides
 * sameAs beside EXTERNAL_RECORDS — a social profile is the textbook
 * sameAs use, and it is the one identity link here that is
 * self-controlled rather than somebody else's index, which is why it
 * is its own constant instead of an EXTERNAL_RECORDS entry: that
 * array's docblock promises independent records, and a store that
 * quietly reclassifies its own account as independent record is
 * arguing with its own definitions.
 */
export const KEEPER_SOCIAL: readonly string[] = [
  "https://x.com/keeper_scvd",
];

/**
 * THE ENTITY PROFILES (AEO plan, entity anchors, 2026-09-03): pages
 * the keeper created on registries that resolve "is there an
 * organisation behind this domain" — the LinkedIn showcase page under
 * Record Creative Co. LLC's company page, and the Crunchbase profile.
 * They are neither social accounts nor independent records: we wrote
 * them, on somebody else's register, and a resolver reads them as
 * identity claims we control. So they ride sameAs from their own
 * constant, beside KEEPER_SOCIAL and apart from EXTERNAL_RECORDS,
 * whose docblock promises records we did not write.
 */
export const ENTITY_PROFILES: readonly string[] = [
  "https://www.linkedin.com/showcase/scvd-general-store/",
  "https://www.crunchbase.com/organization/scvd-general-store",
];

export const OPERATOR = {
  kind: "individual",
  /**
   * NAMED 2026-07-31 ON THE KEEPER'S CONFIRMATION, and it was an open
   * question until he answered it rather than something assumed either
   * way. This field read null for a few hours, meaning "no company is
   * claimed" — which was the honest placeholder while nobody here knew,
   * and would have stayed the answer if there were no entity.
   *
   * It is here in the MACHINE layer only. The shop still speaks as one
   * person out of Oak City, because that is what a buyer actually
   * deals with; the registered company is the answer to a diligence
   * question, not a thing to put on the sign.
   */
  legal_entity: OPERATED_BY,
  legal_entity_note:
    "The store is operated under Record Creative Co. LLC. That is a checkable fact and it is what belongs in an automated diligence answer — but it changes nothing about what a buyer is dealing with, which is one person keeping a shop, as /what and /stack both say. The company does not add a support desk, a second pair of hands, or anyone else who can sign. What actually stands behind a purchase is unchanged: the wallet is declared and signed at /house-ledger.json, the signing key is published with its full history, and every service this store depends on and does NOT control is listed at /stack with its failure mode.",
  location: "Oak City, North Carolina",
  contact:
    "The mailbox at /api/letter — free, one a day, and a human reads every one. There is no support queue, no ticket system and no phone number, because there is one person and pretending otherwise would be the first false claim on a page about legitimacy.",
  responds:
    "Human-labor items carry a 168-hour promise and it has not been missed. Letters are read; a reply is not guaranteed.",
} as const;

/**
 * What a diligence check is really asking, answered including where
 * the answer is unflattering. Every line points at a page that says
 * the same thing at more length.
 *
 * TWO THINGS WERE WRONG HERE, both found by the AEO sweep on
 * 2026-08-10 and both the same species of rot.
 *
 * It opened "A general store selling small signed goods…", which is
 * the PRE-REVERSAL position — and this string feeds both
 * `.well-known/trust.json` and the A2A card, so the two documents a
 * diligence check reads first were the two still describing the store
 * the keeper stopped running on 2026-08-07.
 *
 * And it said "Nine days old at the time this was written", a fact
 * with a shelf life of one day that was served for a fortnight. An
 * age that has to be re-typed to stay true is a claim rule 10 was
 * written about; pointing at foundingDate instead makes the reader
 * compute it from something that cannot go stale.
 */
export const WHAT_IT_IS = `${POSITION_PARAGRAPH} Young, and it says so rather than being coy: foundingDate is in the storefront's JSON-LD and the domain registration will agree with it.`;

/**
 * PATHS ONLY, so every value can be resolved to an absolute URL
 * without a caller inspecting it first. A prose sentence briefly lived
 * in here and quietly broke that promise — a map whose values are
 * mostly one type and occasionally another is a map every consumer has
 * to defend against.
 */
export const TRUST_ANSWERS = {
  who_is_behind_it: "/what",
  what_a_signature_proves: "/attestation",
  what_we_depend_on_and_do_not_control: "/stack",
  every_claim_we_got_wrong: "/corrections",
  every_wallet_we_control: "/house-ledger.json",
  services_we_have_actually_paid: "/neighbours",
  what_you_own_after_buying: "/rights",
  what_happens_if_we_close: "/wind-down",
  the_books: "/stats",
  the_funnel_with_its_denominator: "/pulse.json",
} as const;

/**
 * THE ABSENCES, FIRST-PERSON, because a trust document that lists only
 * strengths is the document a scam would write. Each of these already
 * appears on /attestation or /stack in longer form.
 */
export const NOT_CLAIMED: readonly string[] = [
  "No third-party security audit of anything here, and no plans for one.",
  "No VAT number and no D-U-N-S. There IS a registered company — Record Creative Co. LLC — and it is worth being plain that this changes nothing operationally: it is still one person, one key, and one pair of hands on the human-labor shelf.",
  `No escrow and no chargebacks. x402 settles wallet-to-wallet; once a payment settles the money has moved. Your exposure is the price, which starts at ${CHEAPEST_ON_THE_SHELF}.`,
  "No insurance, no bonding, no regulator, and nothing here is offered as a financial service.",
  "One ed25519 signing key and one operator. That is the wrong root of trust for compliance, dispute resolution, or anything load-bearing, and /attestation says so on its own page rather than leaving you to work it out.",
  "No post-quantum signatures — Ed25519 everywhere, the assumption named on /attestation, and the migration path (a key handover under the succession protocol) already published rather than improvised later.",
  "No reputation score on any actor, ours or anybody's, ever, and no ranking of one host against another. What the store built instead (direction decided 2026-08-07, both halves shipped by 2026-08-20, tracked at /becoming): dated, signed checks on artifacts against published criteria — a thing verified at a moment, never a person scored over time — and, from 2026-09-02, readings derived from those checks that print their rule, their fraction and their rows. What stands in a score's place is that, plus a dated record of every claim we got wrong, at /corrections.",
  "No independent audit of the books. /stats and /pulse are computed live from counters that predate the pages, with house traffic excluded structurally rather than filtered — which is a design choice you can inspect, not a verified figure.",
];

/**
 * WHAT THIS STORE COLLECTS, which is the question /privacy would have
 * answered if it existed.
 *
 * PUBLISHED HERE BECAUSE IT WAS ONLY EVER IN CODE COMMENTS. The stance
 * is real, deliberate, and stronger than most stores manage — headers
 * only, no bodies, no cookies, nothing client-side, and uniqueness
 * deliberately unavailable so the books cannot quietly become a
 * tracking system. It was enforced in src/lib/metrics.ts and stated to
 * nobody, which meant an automated diligence pass asking "is there a
 * privacy policy" correctly found none.
 *
 * The last line is the load-bearing one and it is a design choice
 * rather than a promise: this store CANNOT tell you how many unique
 * visitors it has had, because it never collected anything that would
 * let it. A limit you can inspect beats a policy you have to trust.
 */
export const DATA_HANDLING = {
  cookies: "None. Not for sessions, not for analytics, not at all.",
  client_side_tracking:
    "None. No pixels, no beacons, no third-party script of any kind. One first-party script is served, /till.js, and only on pages that sell something: it asks a wallet for a signature so a person can buy in a browser at all. It reports nothing anywhere, stores nothing in the browser, and talks only to this origin — the source is in the public repository and is served byte-for-byte as it is written there, unminified, so the thing your browser runs is the thing you can read.",
  ip_addresses: "Not stored and not logged by this store.",
  accounts: "None exist. There is nothing to sign up for and no password to lose.",
  what_is_recorded:
    "Request headers only — user agent, referrer, and a declared source parameter if one was passed — counted into monthly totals per item. No request bodies. Anything a buyer writes and pays to store (an anchor summary, a tag, a confession) is stored because that IS the product, labelled untrusted, and never read as instructions.",
  uniqueness:
    "Deliberately unavailable. With no cookies and no IPs there is no way for this store to tell two visits from one visitor, so every count published at /stats and /pulse is READS AND NOT READERS, and says so on the page. That is a limit built in on purpose, not a gap waiting to be closed.",
  third_party_processors:
    "Payments settle through the Coinbase CDP facilitator and the chain the buyer selected from the current payment quote — listed at /rails — which see the transaction because they are the transaction. Hosting is Cloudflare. Both are listed with their failure modes at /stack. Nothing else receives anything.",
  selling_data: "Never, and there is nothing to sell.",
} as const;

export const TRUST_STANDFIRST =
  "A machine-readable summary for automated diligence: who runs this store, what it does and does not claim, and where every answer is written out at length. Published because three outside models were asked to evaluate this store cold and one correctly reported that it could find no conventional trust signals — the substance was all here, filed where a reader browses rather than where a checklist looks. Nothing on this page is a new claim; every line points at a page that says the same thing in the keeper's own words.";

export const TRUST_LIMIT =
  "WHAT THIS DOCUMENT IS WORTH: it is self-published, like every trust page anywhere, and a store writing its own legitimacy statement is the weakest possible evidence of legitimacy. Two things here are NOT self-attested and they are the only two that matter — the ed25519 signature on every artifact we issue, which you check with your own library against a key we publish, and the on-chain settlement transaction bound into every certificate, which you check on the explorer for the certificate's recorded settlement network without asking us. Everything else on this page is our word. Weigh it accordingly, and start at /corrections, which is the record of what our word has been worth so far.";

/** Group the same records for people and machines; pending applications stay off this list. */
export function discoveryByProtocol(base: string) {
  return DISCOVERY_PROTOCOLS.map((protocol) => ({
    id: protocol.id,
    label: protocol.label,
    status: protocol.status,
    scope: protocol.scope,
    scvd_url: `${base}${protocol.path}`,
    records: EXTERNAL_RECORDS.filter((record) =>
      (record.protocols ?? ["general"]).includes(protocol.id)),
    identity_viewers: protocol.id === "erc8004" ? IDENTITY_VIEWERS : [],
  }));
}

/** The JSON index points into the existing records, rather than doubling every description. */
export function discoveryProtocolIndex(base: string) {
  return discoveryByProtocol(base).map(({ records, identity_viewers, ...protocol }) => ({
    ...protocol,
    records: records.map(({ url }) => ({ url })),
    identity_viewers: identity_viewers.map(({ url }) => ({ url })),
  }));
}
