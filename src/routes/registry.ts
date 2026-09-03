import { Hono } from "hono";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import {
  isPerRail,
  type LegacyMarketRails,
  type MarketRails,
} from "@/services/market";
import { escapeHtml } from "@/lib/sanitize";
import { datasetEnvelope } from "@/lib/dataset-envelope";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  readRegistryPulse,
  type RegistryWeekEntry,
} from "@/services/registry-pulse";
import type { HonoEnv } from "@/types";

/**
 * GET /registry — "State of the registry": the public running tally
 * of what the weekly census finds behind the doors public x402
 * discovery lists. Aggregates only, no names, updated by the keeper's
 * hand each week (see services/registry-pulse.ts for both rules).
 *
 * THE PAGE'S JOB IS THE MIRROR, NOT THE PITCH. An operator who reads
 * "31% of listed doors answer no 402 at all" checks their own door
 * next — so the page hands them the free way to do that immediately,
 * and mentions what we sell exactly once, at the end, labeled as
 * such. The numbers do the outreach; the store just signs its work.
 */
export const registryRoutes = new Hono<HonoEnv>();

function money(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(value < 0.01 ? 4 : 3)}`;
}

function tallyRow(entry: RegistryWeekEntry): string {
  const offers =
    entry.signed_offers.of_ready > 0
      ? `${entry.signed_offers.serving} of ${entry.signed_offers.of_ready}`
      : "&mdash;";
  const median = entry.price_usdc
    ? escapeHtml(money(entry.price_usdc.median))
    : "&mdash;";
  return `<tr>
    <td>${escapeHtml(entry.week)}</td>
    <td>${entry.probed}</td>
    <td>${entry.ready}</td>
    <td>${entry.rot.pct}%</td>
    <td>${offers}</td>
    <td>${median}</td>
    <td>${entry.operators || "&mdash;"}</td>
  </tr>`;
}

/**
 * Exported for the guard in test/registry-claim.spec.ts. The claim it
 * builds is conditional on a round HAVING offers data, so a test that
 * only reads the rendered page passes whenever the condition is false
 * — green because the code never ran. The sentence has to be
 * testable on a fixture, not on this week's luck.
 */
/**
 * The rail split in prose, honest about which buckets it was taken
 * under. Percentages are of doors whose challenge parsed, never of
 * everything probed — the denominator is stated because a share with
 * an unstated denominator is the easiest number in this file to
 * misread.
 */
function railsSentence(rails: MarketRails | LegacyMarketRails): string {
  if (rails.of === 0) return "";
  if (!isPerRail(rails)) {
    // A week from before the buckets could see Polygon. Reported as
    // measured, with the limit named rather than papered over.
    return `Of ${rails.of} doors whose payment challenge parsed, ${rails.both} accepted both Base and Solana, ${rails.base_only} were Base-only, ${rails.solana_only} Solana-only, ${rails.other_only} neither. ${rails.testnet_flagged} quoted testnet networks. This week was measured before the split counted Polygon separately, so a Polygon-only door sits in "neither" and a Base+Polygon door in "Base-only" — the newer weeks below do not have that limit, and this row is not restated because nobody re-probed those doors.`;
  }
  const share = (count: number) => `${Math.round((count / rails.of) * 100)}%`;
  return `Of ${rails.of} doors whose payment challenge parsed: ${rails.base} take Base (${share(rails.base)}), ${rails.polygon} take Polygon (${share(rails.polygon)}), ${rails.solana} take Solana (${share(rails.solana)}). A door can appear in more than one of those, so they do not sum to ${rails.of}: ${rails.multi} accept more than one of the three and ${rails.single} accept exactly one — that single-rail share is the demand a seller turns away by picking one chain. ${rails.other} offered none of the three. ${rails.testnet_flagged} quoted testnet networks: live against test tooling, invisible to every mainnet wallet.`;
}

/**
 * WHAT THAT WEEK COULD NOT SEE, printed beside what it saw (the
 * keeper's ruling 2026-08-28, "yes safer better").
 *
 * NEVER SILENT, in any of its three states, because silence here
 * reads as a clean walk and only one of the three is one: the round
 * recorded trouble (say which), the round recorded none (say that),
 * or the week predates the carry-through and coverage was never
 * recorded at all (say THAT, and do not let it pass for a clean
 * walk). Rule 52: the reading publishes its own incompleteness or
 * it does not publish.
 */
export function coverageCaveat(entry: RegistryWeekEntry): string {
  const coverage = entry.coverage;
  if (!coverage) {
    return "Coverage was not recorded for this week — it was published before the round's own coverage fields were carried through. That is not a claim that the walk was complete.";
  }
  const notes: string[] = [];
  if (coverage.capped) {
    notes.push(
      "the round hit its host cap, so doors in the tail were never walked and every count here is a floor",
    );
  }
  if (coverage.coverage_suspect) {
    notes.push(
      "the discovery feed's own paging looked unreliable this round (a full page arrived with no cursor), so the denominator may undercount",
    );
  }
  if (coverage.coverage_drop) {
    notes.push(
      `this round probed ${coverage.coverage_drop.this_round} hosts against the previous round's ${coverage.coverage_drop.previous_hosts} — a drop that large is our instrument, not the market, and week-over-week comparisons are unsafe until it recovers`,
    );
  }
  if (
    coverage.population_known !== undefined &&
    coverage.population_walked !== undefined
  ) {
    notes.push(
      `the feeds named ${coverage.population_known} hosts and this round walked ${coverage.population_walked}${
        coverage.coverage_pct !== null && coverage.coverage_pct !== undefined
          ? ` (${coverage.coverage_pct}% of them)`
          : ""
      }`,
    );
  }
  if (notes.length === 0) {
    return "The round recorded no coverage trouble: it did not hit its cap, and the discovery feed paged cleanly.";
  }
  return `What this week could not see: ${notes.join("; ")}.`;
}

export function latestReading(entry: RegistryWeekEntry): string {
  const so = entry.signed_offers;
  const offersLine =
    so.of_ready > 0
      /*
       * LEDGER A2 (2026-08-24). This read "serve offers a third party
       * can cryptographically verify". The census never verified a
       * signature — it parses the JWS and stops, and the check that
       * does it says so itself: "Signatures NOT verified here — that
       * needs the issuer's key, which is a second request this probe
       * refuses to make."
       *
       * The instrument was honest; the statistic derived from it was
       * not, which is the worse direction — the caveat sat in a check
       * nobody reads while the confident sentence was the quotable
       * one. It also flattered us twice over: this store SELLS
       * signature verification at the desk, so a census implying we
       * already do it free both overstates the census and makes the
       * paid product look redundant.
       */
      ? `Of the ${so.of_ready} doors that do answer correctly, ${so.serving} (${so.pct}%) serve signed offers that are present and structurally valid JWS.${
          so.not_found_in_challenge === undefined
            ? ""
            : ` The remainder is counted, not assumed: ${so.not_found_in_challenge} carried no offers in the challenge we read${
                so.present_but_unparseable
                  ? `, and ${so.present_but_unparseable} carried offers that would not parse as JWS`
                  : ""
              }. WE DID NOT FIND THEM IS NOT THEY DO NOT HAVE THEM — that count cannot separate a door that serves none from one that serves them at a placement or path this probe did not look at, or under a convention this census does not recognize. Where an operator says otherwise, the corrections desk records it.`
        } ${
          so.basis
            ? "Both offer placements were read (challenge header and 402 body)."
            : "This week was measured under the header-only read — offers placed only in the 402 body were invisible to it, so treat the serving count as a floor."
        } Signatures are NOT verified by this census: that needs each issuer's key and a second request the weekly probe does not make. The conformance desk verifies them free, one artifact at a time. Our own door, which serves signed offers, is structurally outside this denominator — a census cannot probe its own host.`
      : "";
  /*
   * THIS SENTENCE WAS FALSE UNTIL 2026-08-25, and it was false on the
   * page this store points people at as the market's rail split.
   *
   * It read "N accept both USDC rails (Base, Polygon, and Solana)" —
   * three chains called "both", off a number computed from Base AND
   * Solana with Polygon nowhere in it. A Polygon-only door was
   * counted "neither mainnet"; a Base+Polygon door was counted
   * Base-only and described as turning away the other rail's buyers.
   *
   * It is derived per rail now, and a week measured under the old
   * buckets says so rather than being silently re-read.
   */
  const railsLine = railsSentence(entry.rails);
  const priceLine = entry.price_usdc
    ? `Among ${entry.price_usdc.sample} doors quoting recognizable USDC, the median ask is ${money(entry.price_usdc.median)} (middle half ${money(entry.price_usdc.p25)}–${money(entry.price_usdc.p75)}).`
    : "";
  return [
    `In week ${entry.week} the census probed ${entry.probed} listed doors. ${entry.ready} answered a well-formed x402 payment challenge — shape only, from one vantage, at one moment, and never a claim that a purchase would deliver; ${entry.rot.dead_doors} (${entry.rot.pct}%) answered no valid payment challenge at all — listed, and functionally absent. Any count of "x402 endpoints" quoted from raw directory listings overstates the working market by roughly that factor.`,
    offersLine,
    railsLine,
    priceLine,
    `The ${entry.hosts} probed hosts collapse to about ${entry.operators} distinct operators (top five hold ${entry.top5_share_pct}% of hosts) — subdomain farms inflate every raw host count too.`,
  ]
    .filter(Boolean)
    .map((line) => `<p class="menu-desc">${escapeHtml(line)}</p>`)
    .join("\n");
}

/**
 * THE DATASET MARKUP, ON THE HTML PAGE — the same straggler the corpus
 * landing caught on 2026-08-18, sitting one page over and missed then.
 * This page publishes the most citable thing this store owns: dated,
 * weekly, original aggregate measurements of the public x402 registry
 * that no other party publishes at all. Answer engines and dataset
 * crawlers read HTML, not JSON endpoints, so a page carrying real
 * measurements and no Dataset node is a page that reads as prose and
 * gets cited as nobody.
 *
 * variableMeasured names the actual measurements rather than
 * describing them, because a crawler can lift a named measurement and
 * cannot lift an adjective. Every value comes from the same signed
 * census the prose quotes — one source, so the markup and the page
 * cannot drift.
 */
function registryDatasetJsonLd(
  base: string,
  latest: RegistryWeekEntry | undefined,
): string {
  const measurements = latest
    ? [
        {
          "@type": "PropertyValue",
          name: "listed x402 doors probed",
          value: latest.probed,
        },
        {
          "@type": "PropertyValue",
          /*
           * LEDGER H1. "working" read as purchasable-and-delivering;
           * `ready` is shape-conformance from one vantage at one
           * moment. This is the MACHINE-READABLE half, so it matters
           * more than the prose — an indexer quotes this verbatim and
           * cannot see the caveat in a paragraph beside it.
           */
          name: "doors answering a well-formed x402 payment challenge (shape only, one vantage)",
          value: latest.ready,
        },
        {
          "@type": "PropertyValue",
          name: "listed doors serving no valid payment challenge (percent, of doors probed)",
          value: latest.rot.pct,
          unitText: "PERCENT",
        },
        /*
         * THE MACHINE HALF KEPT THE WORD THE PROSE GAVE UP (the
         * instrument audit, 2026-08-28). After A2/H1 retired
         * "verifiable" and "working" from the prose, this block —
         * which the H1 note above says matters MORE, because
         * indexers quote it verbatim — still said both, as a bare
         * percent. B10: the counts now ride beside the ratio, and
         * the words say what the census measured: JWS structure,
         * signatures never verified, from the placement it reads.
         */
        {
          "@type": "PropertyValue",
          name: "shape-ready doors serving structurally valid signed offers (count; JWS parse only, signatures not verified by the census)",
          value: latest.signed_offers.serving,
        },
        {
          "@type": "PropertyValue",
          name: "shape-ready doors checked for signed offers (denominator)",
          value: latest.signed_offers.of_ready,
        },
        {
          "@type": "PropertyValue",
          name: "shape-ready doors serving structurally valid signed offers (percent, of shape-ready doors probed)",
          value: latest.signed_offers.pct,
          unitText: "PERCENT",
        },
        {
          "@type": "PropertyValue",
          name: "distinct operators behind the probed hosts",
          value: latest.operators,
        },
      ]
    : [];
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "State of the x402 registry — weekly census of public payment endpoints",
    description:
      "A weekly running tally of the public x402 registry: how many listed payment endpoints answer a well-formed x402 challenge (shape only, one vantage, one moment), how many of those serve structurally valid signed offers (JWS parse only — signatures are not verified by the census), how many are listed but functionally absent, and how many distinct operators the hosts collapse to. Aggregates only, never rows about a named operator. Measured by one signed GET per listed host, recorded in a hash-chained, Bitcoin-anchored corpus. The store's own door is not in any denominator here: a census cannot probe its own host.",
    url: `${base}/registry`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: organizationRef(base),
    ...(latest
      ? {
          temporalCoverage: latest.week,
          dateModified: latest.published_at,
          variableMeasured: measurements,
        }
      : {}),
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${base}/registry`,
    },
    isBasedOn: `${base}/corpus`,
  };
  return jsonLdScript(dataset);
}

/**
 * THE ATLAS — /atlas.json, and it is an experiment.
 *
 * The keeper's idea, 2026-08-29: "idk if anybody does this so don't
 * be afraid to try... and just see if agents like it." Every other
 * surface here answers "what exists". None of them answers the
 * question a reader actually arrives with, which is "I want to do X —
 * what do I call, does it cost anything, and what comes back?"
 *
 * JSON ONLY, DELIBERATELY. It is a machine surface; a human has the
 * whole store to read. Counted on the porch like every other door, so
 * whether agents want this gets a number instead of an argument.
 */
registryRoutes.get("/atlas.json", async (c) => {
  const { buildAtlas } = await import("@/store/atlas");
  return c.json(buildAtlas(c.env.STORE_BASE_URL));
});

/**
 * THE INFLOW TALLY, PUBLIC — /inflows.
 *
 * Its own page rather than a block on /registry, because it answers a
 * different question about a different population. /registry says
 * what the listings are worth: how many doors work, what they charge.
 * This says what arrived at the addresses those doors advertised —
 * which is a fact about money, not about shape, and reads as a
 * revenue claim the moment it sits under a heading about listings.
 *
 * COUNTS ONLY, BY RULING (T1, 2026-08-28): no address, no host, no
 * sender. And every week here was pressed by a hand — nothing on this
 * page arrived by a clock.
 */
registryRoutes.get("/inflows", async (c) => {
  const { readInflowPulse } = await import("@/services/inflow-pulse");
  const pulse = await readInflowPulse(c.env);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({
      ...datasetEnvelope({
        name: "Inflows to advertised x402 payment addresses",
        description:
          "What arrived at the payment addresses public x402 doors advertise in their own 402 challenges, read from Base and Polygon over roughly a day per weekly round. Counts only: no address, host or sender appears here.",
        url: `${c.env.STORE_BASE_URL}/inflows`,
        measurementTechnique:
          "Every distinct EVM address the week's probed doors advertised is watched via eth_getLogs against each chain's canonical USDC contract, over a block window each chain line names. Amounts are compared against the USDC range the advertising door itself quoted. Published only by the keeper's hand, and only for a reading whose chains covered the same window with no address left unread.",
        whatThisIsNot:
          "NOT sales and NOT revenue. A transfer into an advertised address can be treasury movement, a shared or facilitator wallet, or an operator funding itself, and nothing here can tell those apart. A zero is not evidence nobody paid: an operator who rotated addresses, settles on a rail we do not read, or opened after the window began is invisible. No figure here is a fact about any named door.",
        howToRead:
          "Read narrowest.multi_payer_in_band against narrowest.watched — that is the tightest figure this data supports, and it is still a floor on plausible payments rather than a count of sales. Every ratio has its denominator as a sibling field; do not compute a percentage against any other number. The weeks array is ascending by ISO week.",
        variableMeasured: [
          { name: "sole-advertised addresses watched (advertised by exactly one door)", path: "weeks[].reading.by_exclusivity.sole.watched" },
          { name: "of those, how many received any USDC in the window", path: "weeks[].reading.by_exclusivity.sole.received" },
          { name: "addresses advertised by more than one door — shared infrastructure by construction", path: "weeks[].reading.by_exclusivity.shared.watched" },
          { name: "sole-advertised addresses taking in-band transfers from more than one distinct payer — the narrowest figure this data supports", path: "weeks[].reading.narrowest.multi_payer_in_band", notes: "Still not proof of a purchase: one operator with two wallets clears this bar, and nothing here has seen a receipt." },
          { name: "median transfer size", path: "weeks[].reading.amounts.median_usdc", unitText: "USDC" },
          { name: "share of all transfers held by the busiest tenth of receiving addresses", path: "weeks[].reading.distribution.top_decile_share_pct", unitText: "PERCENT" },
          { name: "distinct sending addresses across every transfer seen", path: "weeks[].reading.senders.distinct" },
          { name: "receiving addresses whose entire inflow came from a single sender", path: "weeks[].reading.senders.single_sender_receivers", notes: "A high share is what dusting and self-funding look like, not a customer base." },
          { name: "addresses whose doors quoted this rail, per chain — the per-chain denominator", path: "weeks[].reading.windows[].advertised_here" },
          { name: "blocks actually covered, per chain", path: "weeks[].reading.windows[].blocks", unitText: "BLOCKS" },
          { name: "true only when every chain reached the same window; when false the union is a floor and no percentage is valid", path: "weeks[].reading.windows_equal" },
        ],
      }),
      ...pulse,
    });
  }
  const latest = pulse.weeks[pulse.weeks.length - 1];
  const bodyHtml = `<section>
    <p class="menu-desc">Every week this store files the payment addresses that
    public x402 doors advertise in their own 402s. This page reads what actually
    ARRIVED at them, on Base and Polygon, over roughly a day.
    <strong>It is not sales and not revenue.</strong> A transfer into an
    advertised address can be treasury movement, a shared or facilitator
    wallet, or an operator funding itself, and no reading here can tell those
    apart — so every number below travels with the denominator it was computed
    over and the coverage the walk actually had.
    <strong>Counts only, no names</strong>. Published by hand, never by a
    clock.</p>
  </section>
  ${
    latest
      ? `<section>
    <h2>Week ${escapeHtml(latest.week)}</h2>
    <p><strong>${latest.reading.by_exclusivity.sole.received} of
    ${latest.reading.by_exclusivity.sole.watched}</strong> addresses that only one
    door advertised received USDC in the window walked.</p>
    <p><strong>${latest.reading.narrowest.multi_payer_in_band} of
    ${latest.reading.narrowest.watched}</strong> of those took transfers inside the
    USDC range the advertising door itself quoted, from more than one distinct
    payer — the narrowest figure chain data can produce, and still not proof
    that anyone bought anything.</p>
    <p class="menu-meta">Median transfer size $${latest.reading.amounts.median_usdc};
    the busiest tenth of receiving addresses hold
    ${latest.reading.distribution.top_decile_share_pct ?? 0}% of every transfer seen;
    ${latest.reading.senders.single_sender_receivers} addresses took their entire
    inflow from a single sender.</p>
    ${latest.reading.windows
      .map(
        (window) =>
          `<p class="menu-meta">${escapeHtml(window.chain)}:
           ${window.received_advertised} of ${window.advertised_here} addresses whose
           doors quoted this rail received here, over
           ${window.blocks.toLocaleString()} blocks.</p>`,
      )
      .join("")}
    <h3>What this counts</h3>
    <p class="menu-meta">${escapeHtml(latest.reading.what_this_counts)}</p>
    <h3>What this is not</h3>
    <p class="menu-meta">${escapeHtml(latest.reading.what_this_is_not)}</p>
    <p class="menu-meta">Observed ${escapeHtml(latest.observed_at)}; published by
    hand ${escapeHtml(latest.published_at)}.</p>
  </section>`
      : `<section><p class="menu-desc">No week has been published yet. The reading
    exists and is read by hand; nothing reaches this page until it is
    pressed.</p></section>`
  }`;
  return c.html(
    renderSimplePage({
      title: "Inflows",
      description:
        "What actually arrived at the payment addresses public x402 doors advertise. Counts only, no names; not sales and not revenue.",
      path: "/inflows",
      bodyHtml,
    }),
  );
});

registryRoutes.get("/registry", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const pulse = await readRegistryPulse(c.env);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    /*
     * THE JSON HALF GETS THE CAVEATS THE HTML HALF ALREADY HAD.
     * This page has carried careful JSON-LD in its markup since the
     * corrections that fixed its vocabulary — and served the same
     * numbers bare to anyone who asked for JSON, which is what an
     * agent does. The reader least able to see a paragraph was the
     * one handed the naked ratio.
     */
    return c.json({
      ...datasetEnvelope({
        name: "State of the public x402 registry",
        description:
          "A weekly running tally of the public x402 discovery list: how many listed doors answer a well-formed payment challenge, how many serve structurally valid signed offers, what the market charges, and how concentrated it is. Aggregates only, no names.",
        url: `${base}/registry`,
        measurementTechnique:
          "One signed GET per declared host per week against the published preflight battery, verifiable in the host's own logs. The walk is capped; where a round hit that cap or lost coverage, the week's coverage block says so. Published by the keeper's hand, never by a clock.",
        whatThisIsNot:
          "NOT a ranking of any operator, no verdict without its derivation and denominator beside it, and not a claim any door is safe to buy from. A verdict is shape-conformance from one vantage at one moment: the census parses signed offers as JWS and does NOT verify their signatures. A door counted as answering is a door that answered our probe, not a door that delivers goods. Weeks whose coverage block is absent were measured before that layer existed — treat missing as NOT MEASURED, never as full coverage.",
        howToRead:
          "Every percentage ships beside the counts it was computed from; use those rather than recomputing against another field. Read each week's coverage block before comparing weeks — a capped round and a quiet week produce the same totals. The weeks array is ascending by ISO week.",
        variableMeasured: [
          { name: "listed x402 doors probed this round", path: "weeks[].probed" },
          { name: "doors answering a well-formed x402 payment challenge (shape only, one vantage)", path: "weeks[].ready", notes: "Not 'working': this is challenge shape, not delivery." },
          { name: "listed doors serving no valid payment challenge", path: "weeks[].rot.pct", unitText: "PERCENT" },
          { name: "shape-ready doors serving structurally valid signed offers (JWS parse only, signatures not verified)", path: "weeks[].signed_offers.serving" },
          { name: "distinct hosts seen this round", path: "weeks[].hosts" },
          { name: "share of doors held by the five largest operators", path: "weeks[].top5_share_pct", unitText: "PERCENT" },
          { name: "what the round could not see: cap hit, coverage suspect, coverage drop, population denominator", path: "weeks[].coverage", notes: "Absent on weeks measured before this layer existed. Missing means not recorded, never means coverage was fine." },
        ],
      }),
      ...pulse,
    });
  }
  const latest = pulse.weeks[pulse.weeks.length - 1];
  const newestFirst = [...pulse.weeks].reverse();
  const bodyHtml = `<section>
    <p class="menu-desc">Every week this store's census knocks once on as many
    doors as one round can reach from public x402 discovery — one signed GET
    per host, verifiable in the host's own logs — and keeps what the doors
    answered. The walk is capped, and where a week's round hit that cap or
    lost coverage it says so under its own reading below: a tally that cannot
    see everything must not read as a total. This page is
    the running tally of what the listings are actually worth: how many
    listed endpoints work, how many ask for verifiable trust, and what the
    market charges. <strong>Aggregates only, no names</strong> — numbers
    about the neighbourhood, never rows about a neighbour. Updated by hand
    when each week's round is read.</p>
  </section>
  ${
    latest
      ? `<section>
    <h2>Week ${escapeHtml(latest.week)}</h2>
    ${latestReading(latest)}
    <p class="menu-meta">${escapeHtml(coverageCaveat(latest))}</p>
  </section>
  <section>
    <h2>The running tally</h2>
    <table border="1" cellpadding="6">
      <tr><th>week</th><th>doors probed</th><th>working</th><th>rot</th><th>signed offers</th><th>median ask</th><th>~operators</th></tr>
      ${newestFirst.map(tallyRow).join("\n")}
    </table>
    <p class="menu-meta">Rot: listed doors answering no valid 402 challenge.
    Signed offers: doors serving structurally valid signed offers (JWS parse
    only — signatures are not verified by the census), of doors answering a
    well-formed challenge. Median ask: middle USDC price among doors quoting
    a recognizable USDC asset. Operators: hosts grouped by registrable domain
    (platform subdomains counted as their own operators). An em dash means
    that week's round predates the capture of that measurement.</p>
  </section>`
      : `<section><h2>No weeks published yet</h2>
    <p class="menu-desc">The census walks weekly; the first tally row lands
    here when the keeper publishes it. The machinery and its history are
    already public in the signed corpus below.</p></section>`
  }
  <section>
    <h2>Check your own door</h2>
    <p class="menu-desc">If you sell over x402, the number above most likely
    to include you is the rot figure — operators rarely notice their own door
    breaking, because buyers who bounce off a bad 402 don't file complaints,
    they just leave. Check yours in one command, free, no account:</p>
    <pre>curl -X POST ${escapeHtml(base)}/api/preflight \\
  -H 'Content-Type: application/json' \\
  -d '{"url": "https://your-endpoint.example/api/thing"}'</pre>
    <p class="menu-meta">Found our user-agent in your access logs? That was
    the census — <a href="/bot-auth">how to verify the knock was really us</a>.</p>
  </section>
  <section>
    <h2>Method, and what this cannot see</h2>
    <p class="menu-meta">Fed by the same weekly round that mints the signed,
    Bitcoin-anchored <a href="/corpus">corpus</a> — the row-level record, kept
    under its own rules. One GET per host per week; no purchases are made, so
    nothing here speaks to delivery quality, and nothing here sees the buy
    side. Probes are signed (Web Bot Auth) and identify themselves. Grouping
    into operators is a heuristic, stated above. These are observations of
    moments, not scores on anybody. One structural blindness, stated because
    it flatters the trust-gap numbers: the census cannot probe this store's
    own host (a Worker cannot fetch itself), so our own door — which serves
    signed offers — is in no denominator on this page.</p>
    <p class="menu-meta">Disclosure, so the incentive is on the table: this
    store sells verification — signed audits and standing watches at
    <a href="/conformance">the conformance desk</a> — which means we benefit
    when the trust gap closes. The free preflight above is the same battery
    with no signature; nothing on this page requires buying anything.</p>
  </section>`;
  return c.html(
    renderSimplePage({
      title: "State of the registry",
      description:
        "A weekly running tally of the public x402 registry: how many listed payment endpoints actually work, how many serve verifiable signed offers.",
      path: "/registry",
      bodyHtml: `${bodyHtml}\n${registryDatasetJsonLd(base, latest)}`,
    }),
  );
});
