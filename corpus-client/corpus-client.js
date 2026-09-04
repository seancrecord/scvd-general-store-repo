/**
 * scvd-corpus-client — the signed corpus, read as the store serves it.
 *
 * Every function is one GET to a public, stable address and returns
 * the store's own JSON, whole. Nothing is summarised, scored or
 * re-derived here: the corpus is signed and Bitcoin-anchored, and a
 * client that rewrote it would be a second source of truth. The
 * signatures are checkable with the x402-verify package, or any
 * ed25519 library, against the key at /.well-known/scvd-signing-key.
 *
 * Node builtins and global fetch only. Nothing installed.
 */

export const DEFAULT_BASE = "https://scvd.store";

export const DOORS = Object.freeze({
  corpus: "/corpus.json",
  fresh_set: "/fresh-set.json",
  host: (host) => `/corpus/host/${encodeURIComponent(host)}.json`,
  month: (month) => (month ? `/corpus/month/${month}` : "/corpus/month"),
  feeds: "/feeds",
  diff: "/corpus/diff.json",
  defects: "/defects.json",
});

const UA = "scvd-corpus-client (+https://scvd.store/corpus)";
/** Trailing slashes off an origin, without a regular expression over caller input. */
function trimSlashes(value) {
  let end = String(value).length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return String(value).slice(0, end);
}


export class CorpusHttpError extends Error {
  constructor(path, status, body) {
    super(`${path} answered ${status}${body && typeof body === "object" && body.error ? `: ${body.error}` : ""}`);
    this.name = "CorpusHttpError";
    this.status = status;
    this.body = body;
  }
}

async function getJson(base, path, fetchImpl, timeoutMs) {
  const response = await fetchImpl(`${trimSlashes(base)}${path}`, {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new CorpusHttpError(path, response.status, body);
  return body;
}

function opts({ base = DEFAULT_BASE, fetch: fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  return { base, fetchImpl, timeoutMs };
}

/** The weekly signed census, whole. */
export function corpus(options) {
  const o = opts(options);
  return getJson(o.base, DOORS.corpus, o.fetchImpl, o.timeoutMs);
}

/** This week's doors that answered a conformant challenge. */
export function freshSet(options) {
  const o = opts(options);
  return getJson(o.base, DOORS.fresh_set, o.fetchImpl, o.timeoutMs);
}

/** One host's readiness history: rounds probed of rounds since first sighting, the tier with its fraction, the gaps counted against the observer. */
export function hostHistory(host, options) {
  const o = opts(options);
  return getJson(o.base, DOORS.host(String(host).toLowerCase()), o.fetchImpl, o.timeoutMs);
}

/** The state of x402 for one month (YYYY-MM), or the latest month. */
export function month(which, options) {
  if (which !== undefined && !/^\d{4}-\d{2}$/.test(String(which))) throw new TypeError("month: pass YYYY-MM, or nothing for the latest");
  const o = opts(options);
  return getJson(o.base, DOORS.month(which), o.fetchImpl, o.timeoutMs);
}

/** The four Atom feeds, by address, from the store's own index. */
export function feeds(options) {
  const o = opts(options);
  return getJson(o.base, DOORS.feeds, o.fetchImpl, o.timeoutMs);
}

/** What changed between the two latest signed snapshots. */
export function diff(options) {
  const o = opts(options);
  return getJson(o.base, DOORS.diff, o.fetchImpl, o.timeoutMs);
}

/** The defect vocabulary, live. */
export function defects(options) {
  const o = opts(options);
  return getJson(o.base, DOORS.defects, o.fetchImpl, o.timeoutMs);
}

/**
 * A counted reading with its denominator beside it, as a string a
 * report can print: "3 of 4 rounds". Never a percentage: the store's
 * rule is that counts travel with denominators and a share invites a
 * ranking.
 */
export function withDenominator(count, of, noun) {
  return `${count} of ${of} ${noun}`;
}
