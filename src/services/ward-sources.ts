/**
 * THE WARD'S DIRECTORY ROSTER — the keeper's ruling (2026-08-10): the
 * ward widens to every public directory. Uniform — no targeting, no
 * picking favourites. If it is on a public list, we watch it.
 *
 * "Every public directory" is a roster, and the roster is honest about
 * both halves: the directories the round READS, and the directories it
 * KNOWS ABOUT and cannot read, each with the reason stated. A widening
 * that quietly skipped the unreadable ones would be the mail sweep's
 * counting mistake at ecosystem scale — the gap has to ride the same
 * artifact as the findings, counted against the instrument.
 *
 * THE ROSTER IS NOW ONE DECLARATION (2026-09-04). Until today the two
 * halves lived apart: the readers were functions, and the unread half
 * was a hand-written prose constant nothing re-checked. That constant
 * had asserted the same two sentences since 2026-08-18 — including a
 * "what remains is a funded wallet" line that would have kept reading
 * as current no matter how long it sat, because nothing in the store
 * could contradict it.
 *
 * The lesson came from outside. A neighbouring measurement project
 * publishes its source liveness "derived from actual run history after
 * every pipeline cycle, not hand-maintained, so it cannot quietly
 * drift out of date the way a written list does" — a sentence aimed
 * squarely at what this file used to be. So the roster below declares
 * what each source IS, and `services/source-liveness.ts` derives what
 * each source DID from the stored rounds. Prose can still be wrong
 * here; it can no longer be wrong about liveness, because liveness is
 * no longer written here.
 *
 * WHAT `readiness` MEANS. `read` says a reader exists and the round
 * calls it — it does NOT say the reader worked, which is the liveness
 * register's job and nobody else's. `unread` says there is no reader,
 * with the reason and the condition that would dissolve it. A source
 * whose reader exists but has never once answered shows as `read` here
 * and as `never_answered` there, and that disagreement is the useful
 * part: it is how a reader built against a guessed shape gets caught
 * instead of quietly recording nothing.
 */

const FUCHSS_BASE = "https://x402.fuchss.app";
const X402_LIST_BASE = "https://x402-list.com/api/v1";
const AGENTIC_MARKET_BASE = "https://api.agentic.market/v1";
const FETCH_TIMEOUT_MS = 8000;

/**
 * How many `/services` pages the x402-list reader will walk before it
 * calls the read partial. 630 rows at 100 a page was 7 pages on
 * 2026-09-04; the ceiling is set well above that so ordinary growth
 * does not trip it, and low enough that a directory which starts
 * answering with a broken `total_pages` cannot spend the round's
 * whole subrequest budget on one source.
 */
const X402_LIST_MAX_PAGES = 40;

/** What a roster entry says about whether the round can read it. */
export type SourceReadiness =
  | { state: "read" }
  | {
      /** No reader. `why` is the reason; `unblock` is what dissolves it. */
      state: "unread";
      why: string;
      unblock: string;
    };

export interface RosterEntry {
  /**
   * The id the census writes into `per_source`. A roster entry and a
   * census row are joined on this string, so it is the one field here
   * that must never be edited for readability.
   */
  source: string;
  /** The directory's own front door, so a reader can check our work. */
  home: string;
  /** What it enumerates, in a sentence. */
  what: string;
  readiness: SourceReadiness;
}

/**
 * EVERY DIRECTORY THE WARD KNOWS OF, read or not, one list.
 *
 * Order is roughly by how much population each contributes, but
 * nothing reads the order — it is for the human scanning the page.
 */
export const SOURCE_ROSTER: readonly RosterEntry[] = [
  {
    source: "discovery",
    home: "https://api.cdp.coinbase.com",
    what: "The CDP x402 Bazaar's discovery list — every resource a settle has ever registered.",
    readiness: { state: "read" },
  },
  {
    source: "fuchss",
    home: "https://x402.fuchss.app/providers",
    what: "The largest free full enumeration of x402 hosts we know of, ~10k across ~27 letter pages.",
    readiness: { state: "read" },
  },
  {
    source: "x402_list",
    home: "https://x402-list.com",
    what: "An open, continuously monitored directory of x402 services; free JSON, no auth, and it carries its own provenance (submitted, imported from the Bazaar, imported from x402scan).",
    readiness: { state: "read" },
  },
  {
    source: "leaderboard",
    home: "https://agent402.tools",
    what: "Seller leaderboard — a population source and the only outside read of our own rank.",
    readiness: { state: "read" },
  },
  {
    source: "agentic_market",
    home: "https://agentic.market",
    what: "A Bazaar mirror with its own ingest; it lists this store, which is how we learned its ingest prunes by recency.",
    readiness: { state: "read" },
  },
  {
    source: "402index.io",
    home: "https://402index.io",
    what: "A directory of paid endpoints across L402, x402 and MPP — self-described as 15,000+, which would make it the largest single frame available to us.",
    readiness: {
      state: "unread",
      why: "Full enumeration is paid (L402-gated CSV export); the free API rate-limits into 402s well before its rows are exhausted. A partial read is unread by the population layer's own law, so it is named instead of half-read.",
      unblock:
        "The wallet law was ruled 2026-08-18 ($25/month funding discipline). What remains is a funded wallet, one hand-captured paid response to build the reader against, and a price the keeper has seen — none of the three is done, and the price is not published anywhere we could reach.",
    },
  },
  {
    source: "x402scan.com",
    home: "https://www.x402scan.com",
    what: "A settlement indexer with a resource directory; the only one of these that watches money move rather than doors exist.",
    readiness: {
      state: "unread",
      why: "Resource enumeration is a paid endpoint. Paying is a wallet decision.",
      unblock:
        "The wallet law was ruled 2026-08-18; a funded wallet and one hand-captured paid response remain. Partial relief already landed: x402-list carries rows it imported from x402scan, tagged `imported:x402scan`, so a slice of this population now arrives free — 3 rows of 630 on 2026-09-04, which is a slice and not a substitute.",
    },
  },
  {
    source: "endpoint.x402jp.com",
    home: "https://endpoint.x402jp.com/hosts",
    what: "A crawler-built index of x402 hosts ranked by catalogued paid routes — 19,366 routes across 1,031 hosts when it was read by hand on 2026-09-03.",
    readiness: {
      state: "unread",
      why: "No response shape has been captured. The site is unreachable from every sandbox this store is built in, so the 2026-09-03 read-off in research/x402-pulse.md came from a pasted copy of the page and cannot be refreshed from a build.",
      unblock:
        "One hand-run read from the keeper's browser, saved as a fixture, exactly like every feed before it. The store's own row there disagrees with the counter (61 routes against 39), so the capture is worth having for its own sake.",
    },
  },
  {
    source: "agent-tools.cloud",
    home: "https://agent-tools.cloud",
    what: "An aggregator of x402scan, awesome-x402 and the CDP Bazaar with self-submissions on top; 20k+ entries, liveness-probed, refreshed every six hours.",
    readiness: {
      state: "unread",
      why: "No response shape has been captured and no public enumeration endpoint is documented anywhere we could reach.",
      unblock:
        "One hand-run read. Note before spending effort: it aggregates two frames we already hold, so its marginal population may be small — worth measuring against the union before it is built.",
    },
  },
  {
    source: "x402scout.com",
    home: "https://x402scout.com",
    what: "A self-described canonical registry with 0-100 trust scores, MCP-native, rescanning every six hours.",
    readiness: {
      state: "unread",
      why: "No response shape has been captured, and the host is unreachable from every sandbox this store is built in. Note also what would NOT be read if it were: its 0-100 trust scores are a standing verdict on operators, and this store does not republish other people's rankings — only the host list would enter the population.",
      unblock:
        "One hand-run read of whatever list endpoint it serves, saved as a fixture, with the scoring fields dropped at the parse rather than carried and ignored.",
    },
  },
  {
    source: "nohumans.directory",
    home: "https://nohumans.directory",
    what: "A directory that probes every listing every fifteen minutes and reports on-chain-proven buyers.",
    readiness: {
      state: "unread",
      why: "No response shape has been captured, and the host is unreachable from every sandbox this store is built in. It is the highest-cadence prober on this roster — every fifteen minutes against every listing — so its host list is the freshest of the free frames and the one most likely to disagree with our weekly picture.",
      unblock:
        "One hand-run read. Its own prober already visits us, so the relationship exists in one direction and has simply never been read in the other.",
    },
  },
] as const;

/**
 * The unread half, in the exact `{source, why}` shape the round has
 * written to `directories_unread` since the widening.
 *
 * DERIVED, NOT DECLARED — but the wire shape is frozen on purpose:
 * this field rides the hash-chained, Bitcoin-anchored corpus, and
 * changing the bytes of a published field to tidy a data structure is
 * rewriting history for a refactor. The `unblock` sentence is folded
 * into `why` so no published text is lost.
 */
export const UNREAD_DIRECTORIES: { source: string; why: string }[] =
  SOURCE_ROSTER.filter(
    (entry): entry is RosterEntry & { readiness: { state: "unread"; why: string; unblock: string } } =>
      entry.readiness.state === "unread",
  ).map((entry) => ({
    source: entry.source,
    why: `${entry.readiness.why} ${entry.readiness.unblock}`,
  }));

/** The ids of every source the round is supposed to actually call. */
export const READ_SOURCES: string[] = SOURCE_ROSTER.filter(
  (entry) => entry.readiness.state === "read",
).map((entry) => entry.source);

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * A hostname out of whatever a directory calls its URL field. Returns
 * null for anything that is not a bare host, because a phantom row is
 * worse than a missing one: it inflates the denominator every verdict
 * is quoted against.
 */
export function hostFromUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const candidate = raw.trim();
  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    const host = url.hostname.toLowerCase();
    return host === "" || host.includes(" ") ? null : host;
  } catch {
    return null;
  }
}

/**
 * x402.fuchss.app's provider directory — the largest free full
 * enumeration of x402 hosts anywhere we know of (~10k hosts across
 * ~27 letter pages, verified by hand 2026-08-10). The hub page at
 * /providers links one bucket page per leading character, and each
 * bucket page carries every provider as an href="/provider/<host>"
 * link with the HOST ITSELF in the path — so the parse is an anchor
 * match, not a scrape of layout.
 *
 * TWO REFUSALS, both the population layer's law arriving early:
 *
 *   A hub with no bucket links is UNREADABLE, not empty. The page
 *   answering 200 with a moved shape is exactly how a mass extinction
 *   gets written by accident, and null is the word for "could not
 *   read".
 *
 *   ANY bucket page failing makes the whole source unreadable. A
 *   26-of-27 read is a partial read, and a partial read cannot tell
 *   "delisted" from "on the page that failed".
 */
export async function readFuchssProviders(
  ownHost: string,
): Promise<string[] | null> {
  const hub = await fetchText(`${FUCHSS_BASE}/providers`);
  if (!hub) return null;

  const buckets = new Set<string>();
  for (const match of hub.matchAll(/href="\/providers\/([^"/]+)"/g)) {
    const bucket = match[1];
    if (bucket) buckets.add(bucket);
  }
  if (buckets.size === 0) return null;

  const pages = await Promise.all(
    [...buckets].map((bucket) =>
      fetchText(`${FUCHSS_BASE}/providers/${encodeURIComponent(bucket)}`),
    ),
  );
  if (pages.some((page) => page === null)) return null;

  const hosts = new Set<string>();
  for (const page of pages) {
    for (const match of (page ?? "").matchAll(/href="\/provider\/([^"/]+)"/g)) {
      const raw = match[1];
      if (!raw) continue;
      let host: string;
      try {
        host = decodeURIComponent(raw).trim().toLowerCase();
      } catch {
        continue;
      }
      // A path segment that is not a bare hostname is the shape
      // moving under us; skip the row rather than register a phantom.
      if (host === "" || host.includes("/") || host.includes(" ")) continue;
      if (host === ownHost) continue;
      hosts.add(host);
    }
  }
  return [...hosts];
}

/**
 * x402-list.com — an open directory of x402 services, free, no auth,
 * 200 requests a minute, shape captured 2026-09-04 (630 services over
 * 7 pages at 100 a page; `meta.total_pages` says how many).
 *
 * WHY IT EARNED A READER OVER THE OTHER CANDIDATES: it is the only
 * unpaid directory we found that publishes PROVENANCE per row —
 * `submitted`, `imported:bazaar`, `imported:x402scan` — which means
 * its rows can be decomposed against frames we already hold instead
 * of being poured into the union as an undifferentiated lump. It is
 * also the cheapest partial relief available for x402scan, whose own
 * enumeration is paid.
 *
 * THE SAME TWO REFUSALS AS FUCHSS, for the same reason. Any page
 * failing makes the whole source unreadable, and a `total_pages` that
 * runs past the ceiling is a partial read, not a big one: a
 * page-capped listing cannot tell "delisted" from "on page eight".
 *
 * A NOTE ON WHICH DENOMINATOR THIS IS. `/status` returns all rows in
 * one fetch and would be cheaper, but it carries slugs and not hosts,
 * and the population layer counts hosts. It also answered with 659
 * rows on the day `/services` answered with 630 — a 29-row
 * disagreement inside one directory, unexplained. We read the
 * endpoint that answers our question and leave theirs alone.
 */
export async function readX402List(ownHost: string): Promise<string[] | null> {
  const hosts = new Set<string>();
  let page = 1;
  let totalPages = 1;

  do {
    const body = await fetchJson(
      `${X402_LIST_BASE}/services?per_page=100&page=${page}&ref=scvd`,
    );
    if (body === null || typeof body !== "object") return null;
    const payload = body as { data?: unknown; meta?: unknown };
    const rows = payload.data;
    // A 200 with no `data` array is the shape moving under us.
    if (!Array.isArray(rows)) return null;

    const meta = payload.meta;
    if (page === 1) {
      const declared =
        typeof meta === "object" && meta !== null
          ? (meta as { total_pages?: unknown }).total_pages
          : undefined;
      if (typeof declared !== "number" || !Number.isFinite(declared) || declared < 1) {
        return null;
      }
      // Past the ceiling is a PARTIAL read, and a partial read is unread.
      if (declared > X402_LIST_MAX_PAGES) return null;
      totalPages = declared;
    }

    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const host = hostFromUrl((row as { base_url?: unknown }).base_url);
      if (host === null || host === ownHost) continue;
      hosts.add(host);
    }
    page += 1;
  } while (page <= totalPages);

  return [...hosts];
}

/**
 * agentic.market — the Bazaar mirror that lists this store, added to
 * the roster on the keeper's word (2026-09-04: "they do list us and
 * they are or should be in our sources").
 *
 * THE SHAPE IS BORROWED, NOT CAPTURED, and that is worth saying
 * plainly. `scripts/agentic-market-check.mjs` has parsed
 * `/v1/services/search` since 2026-08-04 and the reader below matches
 * it field for field — `services[]`, each with a `domain` and an
 * `endpoints[].url` — but that script reads a SEARCH for one term,
 * and enumeration is a different endpoint we have never seen answer.
 * The host is unreachable from every sandbox this store is built in,
 * so no capture was possible at build time.
 *
 * SO THE READER IS BUILT TO FAIL LOUDLY RATHER THAN QUIETLY. It tries
 * the list endpoint, accepts only a recognised shape, and returns null
 * for everything else. A null here is not a silent zero: the liveness
 * register will carry this source as never having answered, on a page
 * that says so, until it does. That is the whole reason the register
 * was built before this reader — an unverifiable feed added to a
 * hand-maintained roster is how a source ends up "configured and
 * silently recording nothing", which is the failure this store spends
 * its design budget refusing.
 */
export async function readAgenticMarket(ownHost: string): Promise<string[] | null> {
  const body = await fetchJson(`${AGENTIC_MARKET_BASE}/services?limit=1000`);
  if (body === null || typeof body !== "object") return null;
  const rows = (body as { services?: unknown }).services;
  if (!Array.isArray(rows)) return null;
  // An enumeration endpoint answering with nothing at all is a shape
  // we do not recognise, not a market that emptied: it lists us.
  if (rows.length === 0) return null;

  const hosts = new Set<string>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const entry = row as { domain?: unknown; base_url?: unknown; endpoints?: unknown };
    const host =
      hostFromUrl(entry.domain) ??
      hostFromUrl(entry.base_url) ??
      (Array.isArray(entry.endpoints)
        ? hostFromUrl((entry.endpoints[0] as { url?: unknown } | undefined)?.url)
        : null);
    if (host === null || host === ownHost) continue;
    hosts.add(host);
  }
  // Rows that parsed to no host at all means the field names moved.
  if (hosts.size === 0) return null;
  return [...hosts];
}
