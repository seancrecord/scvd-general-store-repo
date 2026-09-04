import { Hono } from "hono";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { CORRECTIONS_POINTER } from "@/store/corrections";
import { getMenuItem } from "@/store/menu";
import { priceLine } from "@/services/menu-markdown";
import { listCorpus } from "@/services/corpus";
import { deriveDoorIndex, type DoorIndex, type DoorIndexEntry } from "@/services/door-index";
import type { HonoEnv, MenuItem } from "@/types";

/**
 * GET /doors — every x402 door this store has ever looked at, listed
 * (#26, keeper's ruling 2026-08-29: "Almost a combo of a and c ... if
 * it is human facing it needs to be compelling readable and scannable
 * with clear meaning while also able to drill deeper into full data").
 *
 * THE TASK SAID "SCOREBOARD" AND THE ANSWER IS NOT ONE. /llms.txt has
 * published this store's law since the beginning: never a ranking
 * (from 2026-09-02: "never a ranking, and never a verdict without its
 * derivation and denominator beside it"). A league table would
 * require publicly amending that sentence, and the sentence is what
 * the paid work is worth anything for. So this is an INDEX and a
 * COUNT: alphabetical, one dated observation per door, no standing,
 * no ratio, nothing accumulated against anybody.
 *
 * WHAT WAS ACTUALLY MISSING, WHICH WAS NOT WHAT ANYONE THOUGHT.
 * Asked whether "every endpoint we checked, machine-readable" was
 * already shipped, the honest first answer was yes — corpus.json,
 * per-host pages, trajectory, diff, wallet facts, battery delta, all
 * free and all JSON. That answer was wrong. /corpus.json indexes
 * SNAPSHOTS; /corpus/host/{host}.json is a TEMPLATE you must already
 * know a hostname to use. Between them, the one question a stranger
 * asks first — WHICH doors do you have? — had no door of its own. The
 * data was public and the list of it was not, which is a distinction
 * that matters to exactly the reader we built the census for.
 *
 * THE FIRST ROOM BUILT TO RULES 57 AND 58, adopted the same evening,
 * and it is meant to be the worked example: five agent questions
 * answered in the body an agent gets (what it is, what it is for,
 * free or paid and at what cadence, how to call it including the
 * errors by name, and what we hold ourselves to), and the human page
 * scannable in one screen with the free path first and the paid path
 * named and walkable by a person OR by their agent.
 */
export const doorsRoutes = new Hono<HonoEnv>();

const VERDICTS = ["ready", "not_ready", "unreachable", "not_probed"] as const;

/** Plain English for each verdict, for readers who have never been here. */
const VERDICT_MEANS: Record<string, string> = {
  ready:
    "at that moment the door answered 402 and its challenge passed every check in the battery",
  not_ready:
    "at that moment the door answered, and something in the challenge failed a named check",
  unreachable: "at that moment nothing answered at the URL a feed gave us",
  not_probed:
    "a feed named the host that week but we never knocked — usually a leaderboard row whose only URL is a homepage, which is not a paid resource and would manufacture a false failure if probed",
};

/**
 * THE DEEPER READS, DERIVED FROM THE SHELF (rule 58.4 and 57.3).
 *
 * Prices and terms are read off the menu items themselves rather than
 * typed here, because a page that quotes a price the shelf has moved
 * is the corrections desk's most common customer. `priceLine` is the
 * same function the catalog, the MCP tool list and the item pages
 * use, so this page cannot disagree with any of them about what a
 * thing costs or how long it lasts.
 */
const DEEPER: { id: string; answers: string }[] = [
  {
    id: "spot_check",
    answers:
      "one door, one moment, signed — the cheapest way to get a dated artifact you can hand to somebody else",
  },
  {
    id: "service_audit",
    answers:
      "one door read properly and written up, with the failures named in the published vocabulary",
  },
  {
    id: "conformance_watch",
    answers:
      "did the door STAY conformant through a week of deploys — one signed pass a day, our own missed days counted against us",
  },
  {
    id: "standing_watch",
    answers:
      "the same question hour by hour, which catches a door that answers two different ways inside one minute",
  },
  {
    id: "trust_profile",
    answers:
      "a standing page about the door at this store's domain, that its operator can hand to anyone",
  },
];

function deeperItems(): { item: MenuItem; answers: string }[] {
  return DEEPER.flatMap(({ id, answers }) => {
    const item = getMenuItem(id);
    return item ? [{ item, answers }] : [];
  });
}

/**
 * How many of the deeper reads carry a stated term, and which — read
 * off the shelf rather than counted by a person.
 *
 * This sentence shipped typed, as "Two of them cover a stated term of
 * days", and it was wrong the day it shipped: three of the five carry
 * term_days (the two watches at 7, the Hosted Profile at 30). Nobody
 * miscounted on purpose — the Hosted Profile was added to the deeper
 * list and the sentence beneath it was not re-read, which is the exact
 * failure mode the derived-not-typed guard exists for. The JSON body
 * above never had the bug, because it publishes term_days per item
 * instead of a tally.
 */
function termLine(): string {
  const termed = deeperItems().filter(
    ({ item }) => typeof item.term_days === "number",
  );
  if (termed.length === 0) {
    return "None of them covers a stated term of days";
  }
  const named = termed
    .map(({ item }) => `${item.name} (${String(item.term_days)} days)`)
    .join(", ");
  return `${termed.length} of the ${deeperItems().length} cover a stated term of days &mdash; ${escapeHtml(named)}`;
}

/* ------------------------------------------------------------------ */
/* THE FIVE ANSWERS RULE 57 REQUIRES, WRITTEN ONCE AND SERVED TWICE.  */
/* The JSON body and the human page read the same constants, so the   */
/* two cannot come to say different things about the same surface.    */
/* ------------------------------------------------------------------ */

const WHAT_THIS_IS =
  "Every x402 endpoint this store's weekly ward round has ever observed, in one list, with the most recent dated observation of each and a link to its full signed history. Free, complete, and derived at read time from the hash-chained corpus.";

const WHAT_IT_IS_FOR =
  "Anything a list of observed endpoints is good for. Some obvious ones: finding doors to test a client against, checking whether your own endpoint is in the census and what we last saw, sampling the ecosystem for research, or feeding a crawler a starting set. The observations are CC-BY and there is no use case we are reserving — if you build something we did not think of, that is the point of publishing it.";

const WHAT_THIS_IS_NOT =
  "Not a scoreboard, not a ranking, not a rating, and not a reliability figure. The list is alphabetical and each entry carries ONE observation with the date it was taken. rounds_scored is published as a denominator so you can see how much looking is behind an entry; the division that would turn it into a score on an operator is deliberately not performed here or anywhere else at this store.";

const EXPECTED_OUTCOME =
  "HTTP 200 and a JSON object whose `hosts` array holds one entry per host, alphabetical, each with host, first_seen, last_seen, rounds_present, rounds_scored, latest_verdict, latest_verdict_week and url. An empty `hosts` array with total_hosts 0 is a valid answer and means the chain holds no signed week yet, not that the lookup failed.";

const ERRORS = [
  {
    code: "unknown_verdict",
    http: 400,
    means:
      "the ?verdict= filter named something that is not one of the four verdicts",
    what_to_do: `Use one of: ${VERDICTS.join(", ")}. The error body lists them too.`,
  },
  {
    code: "empty_chain",
    http: 200,
    means:
      "no signed week exists yet, so there is nothing to list. This is NOT an error status and must not be retried as one",
    what_to_do:
      "Read total_hosts and latest_week. A zero here is a fact about our record, never a fact about any host.",
  },
] as const;

const SECURITY = {
  what_this_surface_reads:
    "Signed corpus snapshots this store already published. It takes no input but an optional verdict filter, touches no wallet, and performs no network call to any host at request time.",
  /*
   * DATED AND GUARDED, because the claims register caught it unbound
   * (2026-08-29) and it was right to. This is the one sentence on the
   * page a reader has no way to check for themselves — everything
   * else here can be recomputed from published bytes, and "we keep
   * nothing about you" cannot. So it carries the date it was true on,
   * the store's own method applied to its own copy, and a standing
   * test that goes red if this door ever sets a cookie or writes a
   * counter (test/door-index.spec.ts).
   */
  what_it_stores_about_you:
    "Nothing. There is no account, no cookie, no body to post, and no log entry keyed to a caller — true as of 2026-08-29, and held by a standing test that fails if this door ever sets a cookie or writes anything.",
  what_the_data_is:
    "Observations of PUBLIC endpoints that public discovery feeds listed, taken by one GET each. No authentication was bypassed, no rate limit was evaded, and nothing private was read to produce any row here.",
  integrity:
    "Every figure derives from ed25519-signed, hash-chained snapshots whose digests are submitted to OpenTimestamps for Bitcoin anchoring. You do not have to trust this page: rebuild it from the entries and compare.",
  standards:
    "Disclosure is private-first and symmetric — an operator hears from us before the public does, and we hold ourselves to the same rule when the defect is ours. Corrections are dated and public, never silent. An operator who proves control of a door can attach a standing note that rides beside our observation everywhere it appears.",
  reporting:
    "/.well-known/security.txt, and the corrections desk takes anything we got wrong.",
} as const;

function howToCall(base: string) {
  return {
    the_whole_list: `GET ${base}/doors.json`,
    one_verdict_only: `GET ${base}/doors.json?verdict=not_ready`,
    one_door_in_full: `GET ${base}/corpus/host/{host}.json — take the url field off any entry`,
    authentication: "None. No key, no header, no payment.",
    rate_limit: "None published; be reasonable and cache.",
    smallest_useful_call: `curl -s ${base}/doors.json | jq '.hosts[] | select(.latest_verdict=="not_ready") | .host'`,
  };
}

const FAQ = [
  {
    q: "Is a host on this list broken?",
    a: "The entry says what one probe saw on one dated week. A not_ready from three weeks ago is evidence about that week and nothing else. Follow the url for the whole history, including every week we did not look — those are on the record too, with the reason.",
  },
  {
    q: "Why is there no percentage?",
    a: "Because a percentage on this list would order the doors, and this list never ranks one host against another. Both counts are published on every entry. Where the store does derive a reading from a host's rounds — on its passport, from 2026-09-02 — it prints the rule, the fraction and the rows beside it, never the number alone.",
  },
  {
    q: "My door is listed and the observation is wrong.",
    a: "Two paths, both free: the corrections desk, which publishes dated corrections rather than quietly editing; and a standing note, which lets you put your own dated statement beside our observation on every surface that shows it.",
  },
  {
    q: "Is my door here because I did something wrong?",
    a: "No. A host appears because a public x402 discovery feed listed it. Nothing here is opt-in and nothing here is a penalty.",
  },
  {
    q: "Can I get this without the ranking I actually wanted?",
    a: "There is no ranking to get. If you want one, the raw record is free and complete and you can build it yourself — we would just rather it not have our signature on it.",
  },
] as const;

/* ------------------------------------------------------------------ */

function filtered(index: DoorIndex, verdict: string | undefined): DoorIndexEntry[] {
  if (!verdict) return index.hosts;
  return index.hosts.filter((entry) => entry.latest_verdict === verdict);
}

function bodyJson(base: string, index: DoorIndex, hosts: DoorIndexEntry[]) {
  return {
    what_this_is: WHAT_THIS_IS,
    what_you_can_use_it_for: WHAT_IT_IS_FOR,
    what_this_is_not: WHAT_THIS_IS_NOT,
    price: {
      this_surface: "free",
      cadence: "not applicable — nothing is charged for reading this",
      the_whole_record: "free, forever, and never behind a payment",
      what_money_buys:
        "our labour on the record, never the record. Every deeper read below is a separate purchase; none of them is a subscription and nothing at this store charges twice by itself.",
      deeper: deeperItems().map(({ item, answers }) => ({
        id: item.id,
        name: item.name,
        answers,
        price: priceLine(item),
        price_usdc: item.price_usdc,
        cadence: item.cadence,
        ...(item.term_days !== undefined ? { term_days: item.term_days } : {}),
        buy_url: `${base}/api/buy/${item.id}`,
      })),
    },
    how_to_call: howToCall(base),
    expected_outcome: EXPECTED_OUTCOME,
    errors: ERRORS,
    faq: FAQ,
    security: SECURITY,
    how_to_rederive: `Fetch every entry named in ${base}/corpus.json, take each round's host rows, and keep the last row seen for each host in ascending sequence order. first_seen and last_seen are the first and last weeks a host appears at all; rounds_scored counts rows whose verdict is ready or not_ready. Nothing here is computed from anything the signed snapshots do not already contain, and no row was rewritten to produce it.`,
    corrections: CORRECTIONS_POINTER,
    honest_limits:
      "One instrument, weekly cadence, and only the hosts public discovery feeds declared. A door nobody listed is not here and its absence says nothing about it. This store's own host is in no round — a Worker cannot fetch itself — so we are structurally absent from our own denominators, stated because it flatters us.",
    total_hosts: index.total_hosts,
    by_latest_verdict: index.by_latest_verdict,
    verdict_means: VERDICT_MEANS,
    weeks_read: index.weeks_read,
    latest_week: index.latest_week,
    returned: hosts.length,
    hosts: hosts.map((entry) => ({ ...entry, url: `${base}${entry.url}` })),
  };
}

function summaryBand(index: DoorIndex): string {
  if (index.total_hosts === 0) {
    return `<p class="menu-desc"><strong>The chain holds no signed week yet.</strong> This list fills with the first ward round rather than quoting a number we do not have.</p>`;
  }
  const cells = VERDICTS.filter((verdict) => index.by_latest_verdict[verdict])
    .map(
      (verdict) =>
        `<li><strong>${index.by_latest_verdict[verdict]}</strong> <code>${verdict}</code> &mdash; ${escapeHtml(VERDICT_MEANS[verdict] ?? "")}</li>`,
    )
    .join("");
  return `<p class="menu-desc"><strong>${index.total_hosts} doors observed across ${index.weeks_read} signed weeks.</strong> Latest week on the chain: <code>${escapeHtml(index.latest_week ?? "")}</code>. What the most recent look at each one saw:</p>
    <ul class="menu-desc">${cells}</ul>
    <p class="menu-desc">Those buckets are not standings. A door moves between them week to week, and every count here is the last dated observation of each door rather than an accumulated record of any of them.</p>`;
}

function hostTable(hosts: DoorIndexEntry[], base: string): string {
  if (hosts.length === 0) return "";
  const rows = hosts
    .map(
      (entry) =>
        `<tr><td><a href="${base}${entry.url}"><code>${escapeHtml(entry.host)}</code></a></td><td><code>${escapeHtml(entry.latest_verdict)}</code></td><td>${escapeHtml(entry.latest_verdict_week)}</td><td>${entry.rounds_scored} of ${entry.rounds_present}</td></tr>`,
    )
    .join("");
  /*
   * A PLAIN <table>, because paper-css already styles one and already
   * makes it scroll rather than the page under 640px. The first draft
   * wrapped it in a `scroll-x` div and gave it a `tally` class, and
   * the stylesheet has never heard of either — decoration pretending
   * to be layout, on the room built to demonstrate rule 58.
   */
  return `<table>
    <thead><tr><th>Door</th><th>Last seen as</th><th>Week</th><th>Rounds scored</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function landingHtml(base: string, index: DoorIndex): string {
  const deeper = deeperItems()
    .map(
      ({ item, answers }) =>
        `<li><a href="/menu/${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong></a> &mdash; ${escapeHtml(answers)}. <em>${escapeHtml(priceLine(item))}.</em></li>`,
    )
    .join("");
  const faq = FAQ.map(
    (entry) =>
      `<p class="menu-desc"><strong>${escapeHtml(entry.q)}</strong><br>${escapeHtml(entry.a)}</p>`,
  ).join("");
  return `<section>
      ${summaryBand(index)}
      <p class="menu-desc">Once a week this store walks the public x402 discovery lists and knocks on every door they name. This is the list of every door that has ever answered the knock, or failed to. It is free, it is complete, and it is derived at read time from snapshots that are ed25519-signed, chained by hash, and anchored into Bitcoin &mdash; so you can check it without believing us.</p>
    </section>
    <section>
      <h2>What this is not</h2>
      <p class="menu-desc">${escapeHtml(WHAT_THIS_IS_NOT)}</p>
    </section>
    <section>
      <h2>Every door, alphabetically</h2>
      <p class="menu-desc">&ldquo;Last seen as&rdquo; is one observation on one date, not a standing. &ldquo;Rounds scored&rdquo; is how many rounds reached a real verdict out of how many rounds carried the host at all &mdash; a denominator, published so you can see the weight behind a row. Click any door for its full replayed history, including every week we missed and why.</p>
      ${hostTable(index.hosts, base)}
    </section>
    <section>
      <h2>What you can do with this</h2>
      <p class="menu-desc"><strong>Free, and first:</strong> the machine copy of this page is at <a href="/doors.json"><code>/doors.json</code></a>, filterable with <code>?verdict=not_ready</code>. One door's whole signed history is at <code>/corpus/host/{host}.json</code>. The battery we run is free to run yourself against your own door at <a href="/conformance">/conformance</a>, and a client can ask <a href="/api/before-you-pay/v1"><code>/api/before-you-pay/v1</code></a> whether a door it is about to pay is payable at all. None of that costs anything and none of it ever will.</p>
      <p class="menu-desc"><strong>Paid, if you want our labour on it:</strong></p>
      <ul class="menu-desc">${deeper}</ul>
      <p class="menu-desc">Every one of those is a single payment. ${termLine()}; none of them is a subscription, and this store holds no mechanism that could charge you a second time.</p>
      <p class="menu-desc"><strong>Or hand it to your agent.</strong> Paste this and it will do the whole thing without you: <em>&ldquo;Read ${base}/doors.json, find the entry for my domain, then buy the Once-Over for it at ${base}/api/buy/service_audit?url=&hellip; over x402.&rdquo;</em> The shelf speaks x402 at <a href="/menu.json"><code>/menu.json</code></a> and MCP at <code>POST /mcp</code> (not a page &mdash; a browser gets a 405 there, which is the protocol working); an agent needs nothing from this page but the URL.</p>
    </section>
    <section>
      <h2>Questions people actually ask</h2>
      ${faq}
    </section>
    <section>
      <h2>How safe this is, and what we hold ourselves to</h2>
      <p class="menu-desc">${escapeHtml(SECURITY.what_this_surface_reads)} ${escapeHtml(SECURITY.what_it_stores_about_you)}</p>
      <p class="menu-desc">${escapeHtml(SECURITY.what_the_data_is)}</p>
      <p class="menu-desc">This list is one week wide and alphabetical. The
      same week read as a whole &mdash; what we reached, what moved, which
      defects by name, and what we could not see &mdash; is
      <a href="/ledger">The Week&rsquo;s Ledger</a>, one page per signed
      week.</p>
      <p class="menu-desc">${escapeHtml(SECURITY.integrity)}</p>
      <p class="menu-desc">${escapeHtml(SECURITY.standards)} Report anything at <a href="/.well-known/security.txt"><code>/.well-known/security.txt</code></a> or the <a href="/corrections">corrections desk</a>.</p>
    </section>
    <section>
      <p class="menu-meta">${escapeHtml(index.total_hosts > 0 ? `Rebuilt from the chain on every request: ${index.weeks_read} signed weeks read.` : "Nothing read yet.")} The recipe for rebuilding this list yourself rides on <a href="/doors.json"><code>/doors.json</code></a>. The corpus it derives from is at <a href="/corpus">/corpus</a>.</p>
    </section>`;
}

function doorsDatasetJsonLd(base: string, index: DoorIndex): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Every x402 endpoint scvd.store has observed",
    description:
      "One entry per host the weekly ward round has ever seen, with the most recent dated conformance observation of each and a link to its full signed history. Alphabetical, never ranked: dated observations of moments, and no figure without its denominator.",
    url: `${base}/doors`,
    sameAs: `${base}/doors.json`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: organizationRef(base),
    ...(index.total_hosts > 0 ? { size: `${index.total_hosts} endpoints` } : {}),
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${base}/doors.json`,
    },
  });
}

/**
 * The fold is the same for both doors, so a reader can never catch
 * the page and the JSON disagreeing about a count.
 */
async function readIndex(env: HonoEnv["Bindings"]): Promise<DoorIndex> {
  return deriveDoorIndex(await listCorpus(env));
}

doorsRoutes.get("/doors.json", async (c) => {
  const verdict = c.req.query("verdict");
  if (verdict !== undefined && !VERDICTS.includes(verdict as (typeof VERDICTS)[number])) {
    return c.json(
      {
        error: "unknown_verdict",
        message: `"${verdict}" is not a verdict this census records.`,
        valid_verdicts: VERDICTS,
        verdict_means: VERDICT_MEANS,
      },
      400,
    );
  }
  const base = c.env.STORE_BASE_URL;
  const index = await readIndex(c.env);
  return c.json(bodyJson(base, index, filtered(index, verdict)));
});

doorsRoutes.get("/doors", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const index = await readIndex(c.env);
  if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.html(
      renderSimplePage({
        title: "Every door we have checked",
        description:
          "Every x402 endpoint this store's weekly ward round has observed, with the most recent dated observation of each and a link to its full signed history. Free, alphabetical, never a ranking.",
        path: "/doors",
        bodyHtml: `${landingHtml(base, index)}\n${doorsDatasetJsonLd(base, index)}`,
      }),
    );
  }
  return c.json(bodyJson(base, index, index.hosts));
});
