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
 * Two directories are unread on purpose, not oversight:
 *
 *   402index.io — full enumeration is paid (the CSV export is
 *   L402-gated) and the free API rate-limits into 402s well before its
 *   ~90k rows at 200 a page. The population layer's own law says a
 *   partial read is unread — a page-capped listing cannot tell "gone"
 *   from "on page two" — so until spending is ruled, it is named here
 *   rather than half-read.
 *
 *   x402scan.com — resource enumeration is a paid endpoint. Paying is
 *   a wallet decision, and the wallet law is not yet ruled; the day it
 *   is, this entry moves from the unread list to a reader.
 *
 * Both exclusions dissolve the same way: the keeper rules the wallet
 * law, the round pays for its reads, the roster shrinks by two.
 */

const FUCHSS_BASE = "https://x402.fuchss.app";
const FETCH_TIMEOUT_MS = 8000;

/** Directories the ward knows exist and cannot read, with the reason. */
export const UNREAD_DIRECTORIES = [
  {
    source: "402index.io",
    why: "Full enumeration is paid (L402-gated CSV export); the free API rate-limits into 402s well before its ~90k rows. A partial read is unread by the population layer's own law, so it is named instead of half-read. Unblocks when the wallet law is ruled.",
  },
  {
    source: "x402scan.com",
    why: "Resource enumeration is a paid endpoint. Spending waits on the wallet law; the day it is ruled, this moves from the unread list to a reader.",
  },
] as const;

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
