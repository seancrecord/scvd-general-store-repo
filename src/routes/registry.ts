import { Hono } from "hono";
import { jsonLdScript } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
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

function latestReading(entry: RegistryWeekEntry): string {
  const so = entry.signed_offers;
  const offersLine =
    so.of_ready > 0
      ? `Of the ${so.of_ready} doors that do answer correctly, ${so.serving} (${so.pct}%) serve offers a third party can cryptographically verify — the rest ask to be paid on their word alone.`
      : "";
  const railsLine =
    entry.rails.of > 0
      ? `Of ${entry.rails.of} doors whose payment challenge parsed, ${entry.rails.both} accept both USDC rails (Base and Solana), ${entry.rails.base_only} are Base-only, ${entry.rails.solana_only} Solana-only — every single-rail door turns away the other rail's buyers. ${entry.rails.testnet_flagged} quoted testnet networks: live against test tooling, invisible to every mainnet wallet.`
      : "";
  const priceLine = entry.price_usdc
    ? `Among ${entry.price_usdc.sample} doors quoting recognizable USDC, the median ask is ${money(entry.price_usdc.median)} (middle half ${money(entry.price_usdc.p25)}–${money(entry.price_usdc.p75)}).`
    : "";
  return [
    `In week ${entry.week} the census probed ${entry.probed} listed doors. ${entry.ready} answered as working x402 endpoints; ${entry.rot.dead_doors} (${entry.rot.pct}%) answered no valid payment challenge at all — listed, and functionally absent. Any count of "x402 endpoints" quoted from raw directory listings overstates the working market by roughly that factor.`,
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
          name: "doors answering as working x402 endpoints",
          value: latest.ready,
        },
        {
          "@type": "PropertyValue",
          name: "listed doors serving no valid payment challenge (percent)",
          value: latest.rot.pct,
          unitText: "PERCENT",
        },
        {
          "@type": "PropertyValue",
          name: "working doors serving verifiable signed offers (percent)",
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
      "A weekly running tally of the public x402 registry: how many listed payment endpoints answer as working, how many serve verifiable signed offers, how many are listed but functionally absent, and how many distinct operators the hosts collapse to. Aggregates only, never rows about a named operator. Measured by one signed GET per listed host, recorded in a hash-chained, Bitcoin-anchored corpus.",
    url: `${base}/registry`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "scvd.store", url: base },
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

registryRoutes.get("/registry", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const pulse = await readRegistryPulse(c.env);
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(pulse);
  }
  const latest = pulse.weeks[pulse.weeks.length - 1];
  const newestFirst = [...pulse.weeks].reverse();
  const bodyHtml = `<section>
    <p class="menu-desc">Every week this store's census knocks once on every
    door listed in public x402 discovery — one signed GET per host, verifiable
    in the host's own logs — and keeps what the doors answered. This page is
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
  </section>
  <section>
    <h2>The running tally</h2>
    <table border="1" cellpadding="6">
      <tr><th>week</th><th>doors probed</th><th>working</th><th>rot</th><th>signed offers</th><th>median ask</th><th>~operators</th></tr>
      ${newestFirst.map(tallyRow).join("\n")}
    </table>
    <p class="menu-meta">Rot: listed doors answering no valid 402 challenge.
    Signed offers: doors serving offers a third party can verify, of doors
    working at all. Median ask: middle USDC price among doors quoting a
    recognizable USDC asset. Operators: hosts grouped by registrable domain
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
    moments, not scores on anybody.</p>
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
        "A weekly running tally of the public x402 registry: how many listed payment endpoints actually work, how many serve verifiable signed offers, and what the market charges. Aggregates only, no names, updated by hand from a signed weekly census.",
      path: "/registry",
      bodyHtml: `${bodyHtml}\n${registryDatasetJsonLd(base, latest)}`,
    }),
  );
});
