import {
  CHEAPEST_ON_THE_SHELF,
  OPERATED_BY,
  POSITION_PARAGRAPH,
} from "@/store/copy/position";
import { STANDARDS_POSTURE } from "@/store/standards";
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
 * The store's own environment cannot reach external hosts, so every
 * entry here is one the keeper confirmed by hand.
 */
export const EXTERNAL_RECORDS: readonly ExternalRecord[] = [
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
    url: "https://www.x402scan.com/server/9b04e1cc-ff46-4377-a533-fe7981aa1597",
    registry: "x402scan",
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
    confirmed: "2026-07-27",
    what_it_proves:
      "That fourteen of this store's endpoints are registered to its wallet in the CDP discovery list, which is the authoritative index for x402 services rather than a browsable mirror. Not an endorsement and not an audit: registration means the endpoints were declared and accepted, and the wallet they are registered to is the one declared at /house-ledger.json.",
  },
  {
    url: "https://mcpservers.org/servers/seancrecord/scvd-general-store-repo",
    registry: "mcpservers.org",
    confirmed: "2026-07-29",
    what_it_proves:
      "That the MCP server is listed and claimed by its operator, categorised under Finance. Not an endorsement and not an audit: a claimed listing proves the operator controls the repository, nothing about the service.",
  },
  {
    url: "https://glama.ai/mcp/servers/seancrecord/scvd-general-store-repo",
    registry: "Glama MCP server index",
    confirmed: "2026-07-31",
    what_it_proves:
      "That this store's MCP server was auto-indexed by a third-party directory that crawled it without being asked. Unclaimed, and it mirrors the repository README. Not an endorsement and not an audit: an index entry means somebody's crawler found us and filed us.",
  },
  {
    url: "https://x402-list.com/services/sean-claude-van-damme-s-general-store",
    registry: "x402-list.com",
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
    confirmed: "2026-08-04",
    what_it_proves:
      "That Glama also carries this store as a connector page, distinct from its earlier auto-crawled server index entry. Not an endorsement and not an audit: a directory page proves indexing, nothing about the service.",
  },
  {
    url: "https://mcpindex.ai/server/store-scvd-general-store",
    registry: "mcpindex.ai",
    confirmed: "2026-08-04",
    what_it_proves:
      "That mcpindex.ai lists the MCP server with its own live verdict page. Not an endorsement and not an audit: their verdict is their instrument, read on their page — this record only proves the listing exists.",
  },
  {
    url: "https://agent-tools.cloud/services/scvd-store-bazaar",
    registry: "agent-tools.cloud",
    confirmed: "2026-09-01",
    what_it_proves:
      "That agent-tools.cloud carries the store's Bazaar-registered service among the paid tools it indexes. Not an endorsement and not an audit: a directory page proves indexing, nothing about the goods.",
  },
  {
    url: "https://x402.fuchss.app/provider/scvd.store",
    registry: "x402.fuchss.app (provider index)",
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
     * SKILL.md files a GitHub repository publishes, keyed by owner and
     * repo, and is the source `npx skills add` installs from. The row
     * is here because the desk filed it on 2026-09-01 as "a listing,
     * not a new skill" — the channel classifier already knew the host
     * — and a listing somebody can install from is a record worth
     * dating like the rest.
     */
    url: "https://skills.sh/seancrecord/scvd-general-store-repo",
    registry: "skills.sh (open Agent Skills directory)",
    confirmed: "2026-09-02",
    what_it_proves:
      "That the open Agent Skills directory indexes this repository's skill bundle by owner and repo, which is the form an agent installs it in. Not an endorsement and not an audit: a skill index proves the SKILL.md was found under this repository, nothing about the store the skill walks into.",
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
    confirmed: "2026-09-01",
    what_it_proves:
      "That Circle's readiness scanner reaches this origin, fetches its OpenAPI contract and its live 402, and scores how legible the paid interface is to a buying agent. Scored per endpoint with no summary page, so one door stands for the set — every paid door here is described by the same contract and answers the same challenge, which is the fact the reading actually turns on. An instrument reading, not a listing and not an audit: it measures the shape of the door — payment terms declared, inputs described, guidance present — and never buys anything, so it says nothing about the goods behind it.",
  },
  {
    url: "https://www.getdrio.com/mcp/store-scvd-general-store",
    registry: "Drio (getdrio.com)",
    confirmed: "2026-09-01",
    what_it_proves:
      "That Drio's MCP index carries the server under its canonical name. Not an endorsement and not an audit: a directory page proves indexing, nothing about the goods.",
  },
  {
    url: "https://index.zbs.gg/en/mcp/store-scvd-general-store/",
    registry: "ZBS Index (index.zbs.gg)",
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
    confirmed: "2026-09-02",
    what_it_proves:
      "That VerifyMCP connected to the live door, read its tools and scored what it found — endpoint security, schema quality, tool safety, spec recency — with the derivation of each row on the page. Not an endorsement and not an audit: an instrument reading on the shape of the door, taken by their probe on their schedule, which says nothing about the goods behind it. Their handshake name is verifymcp-probe.",
  },
  {
    url: "https://verifymcp.io/servers/store-scvd-tab/scvd-tab",
    registry: "VerifyMCP (verifymcp.io) — the tab",
    confirmed: "2026-09-02",
    what_it_proves:
      "That VerifyMCP carries the second server this repo publishes, scvd-tab, and scored it from the npm package and the repository — the first third-party number on the tab at all. Not an endorsement and not an audit: their instrument, their rows, read on their page.",
  },
  {
    url: "https://catalog.agentage.io/mcp/store-scvd-general-store",
    registry: "agentage MCP Catalog (catalog.agentage.io)",
    confirmed: "2026-09-02",
    what_it_proves:
      "That the agentage catalog, synced from the official MCP registry, carries the server under its registry name. Their page says plainly that it holds only what the registry entry says; a directory page proves indexing, nothing about the goods. Not an endorsement and not an audit.",
  },
  {
    url: "https://catalog.agentage.io/mcp/store-scvd-tab",
    registry: "agentage MCP Catalog (catalog.agentage.io) — the tab",
    confirmed: "2026-09-02",
    what_it_proves:
      "That the same catalog carries scvd-tab, from the same registry sync. Not an endorsement and not an audit: indexing, nothing more.",
  },
  {
    url: "https://mcpservers.org/servers/scvd-store-llms-txt",
    registry: "mcpservers.org (llms.txt entry)",
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
    confirmed: "2026-08-04",
    what_it_proves:
      "That mcp-marketplace.io lists the MCP server and republishes an OpenSSF Scorecard reading against the repository — an instrument, not a listing we wrote. Not an endorsement and not an audit of the goods: its scorecard measures repository hygiene (workflow permissions, update tooling, review process), several items of which were fixed the day this record was added, and the reading lags the repo until its next crawl.",
  },
  {
    url: "https://x402-bazaar.com/resources/6a61e8fc7356b8e8002b1af7",
    registry: "x402-bazaar.com (Bazaar mirror)",
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
    confirmed: "2026-08-11",
    /**
     * THE FIRST LISTING BUILT FROM THE REPO'S OWN PACKAGE rather than
     * a crawler's paraphrase: its scanner rejected this repository in
     * the morning ("No plugin components found in: repo root"), the
     * Agent Plugins package (plugin.json, mcp.json, skills/) shipped
     * in answer, and the rescan produced a page that reads correctly
     * on arrival — both MCP servers with their real connection
     * configs, the skill, and the trust-layer description leading.
     * Nothing to correct at the source, for once, because the source
     * is this repository.
     */
    what_it_proves:
      "That the Cursor Directory carries a plugin page for this store, generated from this repository's own Agent Plugins package (plugin.json, mcp.json, skills/) — so its connection configs and description are the repo's own words rather than a crawler's guess. Not an endorsement and not an audit: a directory page proves indexing, nothing about the service.",
  },
  {
    url: "https://smithery.ai/servers/seancrecord/scvd-general-store",
    registry: "Smithery",
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
  "Five further listings exist and are deliberately not linked in the sameAs above, for one reason: none publishes a per-service page that points at THIS store. The official MCP registry has carried this store as store.scvd/general-store since 2026-07-30, and x402scout.com lists it too — in both you are in the index and that is all there is. The MCP Census (mcpcensus.com) returns both of this repo's servers to a lookup and no page of their own, and Spanly (spanly.com) will scan the door on demand and list its tools without keeping a record of having done so; a search result and a scan-on-demand are both true and neither is an address. MIT's Project NANDA index (the 'DNS of the agentic web', where an agent publishes an Agent Facts file) lists the store as scvd.store, and its entry links OUT to this site's llms.txt — which is NANDA pointing at us, not a NANDA page identifying us, so there is still no URL that points at this store rather than at the directory. NANDA carries no organization verification of the entry, and this says so rather than borrowing the word. That is a permanent property of these catalogues rather than a link nobody has found yet, and the difference matters to whoever reads this next. A catalogue root will not be added to stand in for one: schema.org's sameAs means a page that unambiguously indicates THIS item's identity, and a directory homepage identifies the directory. Padding a legitimacy document with a link that proves somebody else exists is worse than the space it fills. All three are named here rather than quietly dropped, because a curated list with no statement of its own edges is a list you cannot tell is curated.";

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
    "Payments settle through the Coinbase CDP facilitator and the chain the buyer chose — Base, Polygon, or Solana — which see the transaction because they are the transaction. Hosting is Cloudflare. Both are listed with their failure modes at /stack. Nothing else receives anything.",
  selling_data: "Never, and there is nothing to sell.",
} as const;

export const TRUST_STANDFIRST =
  "A machine-readable summary for automated diligence: who runs this store, what it does and does not claim, and where every answer is written out at length. Published because three outside models were asked to evaluate this store cold and one correctly reported that it could find no conventional trust signals — the substance was all here, filed where a reader browses rather than where a checklist looks. Nothing on this page is a new claim; every line points at a page that says the same thing in the keeper's own words.";

export const TRUST_LIMIT =
  "WHAT THIS DOCUMENT IS WORTH: it is self-published, like every trust page anywhere, and a store writing its own legitimacy statement is the weakest possible evidence of legitimacy. Two things here are NOT self-attested and they are the only two that matter — the ed25519 signature on every artifact we issue, which you check with your own library against a key we publish, and the on-chain settlement transaction bound into every certificate, which you check on any Base, Polygon, or Solana explorer without asking us. Everything else on this page is our word. Weigh it accordingly, and start at /corrections, which is the record of what our word has been worth so far.";
