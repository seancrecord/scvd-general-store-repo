/**
 * THE MIRRORS, READ AS A CRAWLER READS THEM (2026-09-03, the AEO
 * plan's PR 4).
 *
 * On 2026-09-02 the web carried three generations of this store at
 * once: July's shop ("signed hellos, portraits, a phone call"),
 * August's "trust layer of the x402 economy", and September's
 * evidence observatory. An entity resolver saw three stores. The
 * homepage's sameAs list names every mirror the store claims; this
 * reads each one and says which generation of text it carries, so a
 * mirror that regresses is a line in a report rather than a surprise
 * in an answer engine six weeks later.
 *
 * READ-ONLY. Fetches public pages, writes nothing unless a human
 * types --record. Nothing here is typed that the live store already
 * says: the current generation is recognised by the sixty words the
 * homepage's og:description carries verbatim, read at run time.
 */

/** The phrases that place a mirror in a generation, oldest first. */
export const GENERATION_MARKERS = Object.freeze({
  july: [
    "signed hello",
    "hand-drawn portrait",
    "genuine phone call",
    "luckies",
    "certificate of nomenclature",
    "quirky",
  ],
  august: ["trust layer of the x402 economy", "trust layer"],
  september: ["evidence observatory"],
});

export const GENERATIONS = Object.freeze(["unreachable", "unknown", "july", "august", "september", "current"]);

/** A lower rank is an older reading; a move to a lower rank is a regression. */
export function rank(generation) {
  return GENERATIONS.indexOf(generation);
}

/**
 * Which generation a page's text carries. `current` means the sixty
 * words themselves are on the page (the first sentence after the
 * identity clause is enough — mirrors truncate). Then the newest
 * marker present wins: a page that says "evidence observatory" and
 * still mentions luckies is September with July's leftovers, not July.
 */
export function classify(text, sixtyWords) {
  const lower = (text ?? "").toLowerCase();
  if (!lower.trim()) return "unknown";
  const probe = currentProbe(sixtyWords);
  if (probe && lower.includes(probe)) return "current";
  for (const generation of ["september", "august", "july"]) {
    if (GENERATION_MARKERS[generation].some((marker) => lower.includes(marker))) return generation;
  }
  return "unknown";
}

/** The sentence of the sixty words a truncating mirror keeps: the second one. */
export function currentProbe(sixtyWords) {
  const sentences = (sixtyWords ?? "").split(/(?<=\.)\s+/).map((s) => s.trim().toLowerCase());
  return sentences[1] ?? sentences[0] ?? "";
}

/** The homepage's og:description carries the sixty words verbatim (roadmap N2). */
export function sixtyWordsFrom(homepageHtml) {
  const match = /<meta property="og:description" content="([^"]*)"/.exec(homepageHtml);
  return match ? decodeEntities(match[1]) : "";
}

/** Every sameAs URL the homepage's Organization node declares. */
export function sameAsFrom(homepageHtml) {
  const blocks = [...homepageHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const block of blocks) {
    try {
      const node = JSON.parse(block[1]);
      if (node["@type"] === "Organization" && Array.isArray(node.sameAs)) return node.sameAs;
    } catch {
      // A block that does not parse is somebody else's problem; keep looking.
    }
  }
  return [];
}

/**
 * Visible text, roughly: scripts and styles out, tags out, entities
 * decoded once. The end-tag pattern allows anything but `>` after the
 * tag name, as browsers do (CodeQL: a `</script >` or `</script foo>`
 * that the pattern misses leaves script text in what we classify),
 * and entities decode in ONE pass so a literal
 * `&amp;lt;` in a page cannot become `<` by being unescaped twice.
 */
export function visibleText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  );
}

const ENTITIES = Object.freeze({
  "&#39;": "'",
  "&#x27;": "'",
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
});

function decodeEntities(text) {
  return text.replace(/&(?:#39|#x27|quot|amp|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity);
}

/**
 * Compare a fresh reading against the recorded baseline. A mirror
 * that moved to an OLDER generation, or from readable to unreachable,
 * is a regression. A mirror that moved forward, or a new mirror, is
 * news, not a failure. `unreachable` against `unreachable` is silence.
 */
export function compare(baseline, fresh) {
  const before = new Map((baseline?.mirrors ?? []).map((m) => [m.url, m.generation]));
  const regressions = [];
  const advances = [];
  for (const mirror of fresh.mirrors) {
    const was = before.get(mirror.url);
    if (was === undefined) continue;
    if (rank(mirror.generation) < rank(was)) regressions.push({ url: mirror.url, was, now: mirror.generation });
    else if (rank(mirror.generation) > rank(was)) advances.push({ url: mirror.url, was, now: mirror.generation });
  }
  return { regressions, advances };
}

/** Read one mirror as a browser would; never throws. */
export async function readMirror(url, fetchImpl = fetch, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; scvd-listings-check/1.0; +https://scvd.store/llms.txt)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: "", error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

/** The whole walk: one homepage read, one read per mirror, one line each. */
export async function walk(base, fetchImpl = fetch) {
  const home = await readMirror(`${base}/`, fetchImpl);
  const sixtyWords = sixtyWordsFrom(home.text);
  const urls = sameAsFrom(home.text);
  const mirrors = [];
  for (const url of urls) {
    const read = await readMirror(url, fetchImpl);
    mirrors.push({
      url,
      status: read.status,
      generation: read.ok ? classify(visibleText(read.text), sixtyWords) : "unreachable",
      ...(read.error ? { error: read.error } : {}),
    });
  }
  return { base, read_at: new Date().toISOString(), sixty_words_probe: currentProbe(sixtyWords), mirrors };
}
