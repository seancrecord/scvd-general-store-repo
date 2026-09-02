import { checkProbeTarget } from "@/lib/probe-target";
import { webBotAuthHeaders, type WbaEnv } from "@/lib/web-bot-auth";
import { BASE_EVM, POLYGON_EVM } from "@/lib/base-rpc";
import { SOLANA_USDC_MINT } from "@/lib/solana-rpc";

/**
 * THE DOOR'S OTHER SURFACES (roadmap S8, Tier B, 2026-09-02; the
 * keeper's ruling: on the paid audit, always, same price).
 *
 * A door says its price in more than one place. The 402 is the one
 * a client signs against, canonical by spec. The same origin may also
 * publish a llms.txt for agents and an OpenAPI document for clients,
 * and the challenge may name a resource URL other than the one
 * knocked on. The free preflight makes one request and promises to;
 * the census makes one per host per week and promises the hosts. The
 * paid single-door audit already makes the reads those two cannot
 * afford (the EVM blacklist read), so the two-to-four extra GETs this
 * needs live there and nowhere else.
 *
 * FOUR STATES, NEVER FEWER. read: found, and it names a price for the
 * probed path. silent: found, names none. absent: no such surface (a
 * 404 is a fact, not a defect). unreadable: timed out, refused by the
 * probe law, or too large — ours to report, never the door's. Only a
 * read row can contradict. The summary is counts with their
 * denominators: how many surfaces named a price, how many agreed.
 *
 * THE BOOKEND. The 402 is read again at the end. If the two 402 reads
 * differ, the price was MOVING while we read, and nothing here is
 * charged against the door: a contradiction between a surface and a
 * price that changed under us is not a contradiction.
 *
 * MACHINE FIELDS ONLY. Prose is never read for a number. On llms.txt
 * the convention the keeper ruled is read: a code span holding the
 * endpoint path with a dollar amount beside it, inside the span or in
 * parentheses right after it. On OpenAPI, the x-payment-info /
 * x-payment extensions this store emits, or an x-price field. On the
 * resource URL, its own 402's accepts, field by field.
 *
 * NOT READ IN THIS VERSION, and said on the artifact: an MCP
 * tools/list. There is no standard place a door declares one.
 */

export type SurfaceState = "read" | "silent" | "absent" | "unreadable";

export interface SurfaceRow {
  surface: "llms.txt" | "openapi" | "resource_url" | "402_bookend";
  url: string;
  state: SurfaceState;
  /** The price the surface names for the probed path, in USDC, when it names one. */
  price_usdc?: number;
  /** Whether the named price equals the challenge's minimum on its first rail. */
  agrees?: boolean;
  detail: string;
}

export interface ChallengePrice {
  /** The rail (network + asset) the comparison is against: the first accepts entry's. */
  rail: string;
  /** The minimum amount on that rail, in USDC. Several tiers on one rail agree if the surface names the minimum. */
  minimum_usdc: number;
  tiers_offered: number;
}

export interface SurfacesSection {
  read_at: string;
  /** Null when the challenge's accepts named no asset this store can convert to dollars, or no amount in atomic units. */
  challenge_price: ChallengePrice | null;
  /** Present exactly when challenge_price is null: the reason, so the rows' "no comparison" has its derivation beside it. */
  no_challenge_price?: string;
  rows: SurfaceRow[];
  /** Surfaces found that name a price for the probed path: the denominator. */
  named_a_price: number;
  agree: number;
  differ: number;
  /** The bookend 402 read differed from the first: the price moved while we read, and no row counts against the door. */
  moving: boolean;
  not_read: string[];
  convention: string;
  what_this_is: string;
}

export const LLMS_PRICE_CONVENTION =
  "On llms.txt (the convention ruled 2026-09-02) a price is read only from a code span that holds the endpoint path with a dollar amount beside it, inside the span or in parentheses immediately after it — `GET /api/buy/thing` ($0.05) — and never from prose. On an OpenAPI document, from x-payment-info.price_usdc, the smallest of x-payment.price_usdc_options, or an x-price / x-price-usdc field on the path's operation.";

export const SURFACES_WHAT_THIS_IS =
  "The door's other surfaces on the same origin, read once each after the battery and compared with the 402 the battery read. Four states per surface: read (names a price), silent (names none), absent (no such surface), unreadable (our read failed). Only a read row can disagree, and counts travel with their denominators — how many surfaces named a price, how many agreed — so the reader divides. The 402 is read again at the end; if it moved, nothing here counts against the door. Prose is never read for a number.";

/** Surfaces this version does not read, named so a reader does not take silence for agreement. */
export const NOT_READ = [
  "mcp tools/list: no standard place a door declares an MCP endpoint, so none is attempted; a door that publishes one is not read as silent, it is not read at all",
];

/** Timeout per extra read; the audit's own probe allows eight seconds and these are cheaper reads. */
const SURFACE_TIMEOUT_MS = 4000;
/** Bytes read per surface before it is reported unreadable: a llms.txt or OpenAPI document past this is not a surface, it is a corpus. */
export const SURFACE_BODY_CAP = 262_144;

const USDC_ASSETS = new Set(
  [BASE_EVM.usdc, POLYGON_EVM.usdc, SOLANA_USDC_MINT].map((asset) => asset.toLowerCase()),
);

function usdcFromAtomic(amount: string): number | null {
  if (!/^\d+$/.test(amount)) return null;
  const units = BigInt(amount);
  const whole = units / 1_000_000n;
  const frac = units % 1_000_000n;
  return Number(`${whole}.${frac.toString().padStart(6, "0")}`);
}

/**
 * Why the challenge yielded no dollar price, when it did not — said on
 * the row, because "no comparison" without the reason reads as a
 * shrug. The specimen's door is the common case: USDC on Base, and an
 * amount typed in dollars where atomic units belong, which is the
 * very defect the battery names and not a number this store guesses at.
 */
export function whyNoChallengePrice(accepts: Record<string, unknown>[] | null | undefined): string {
  if (!accepts || accepts.length === 0) return "the challenge carried no accepts to price";
  const first = accepts[0]!;
  const network = String(first["network"] ?? "");
  const asset = String(first["asset"] ?? "").toLowerCase();
  if (!network) return "the challenge's first accepts entry names no network";
  if (!USDC_ASSETS.has(asset)) return "the challenge's first rail is not a USDC asset this store converts to dollars";
  return "the challenge's amount on its first rail is not in atomic units, so it cannot be read as dollars without guessing";
}

/** The challenge's own price: the first rail's minimum, in USDC, when the asset is one we can convert. */
export function challengePriceOf(accepts: Record<string, unknown>[] | null | undefined): ChallengePrice | null {
  if (!accepts || accepts.length === 0) return null;
  const first = accepts[0]!;
  const network = String(first["network"] ?? "");
  const asset = String(first["asset"] ?? "").toLowerCase();
  if (!network || !USDC_ASSETS.has(asset)) return null;
  const onRail = accepts.filter(
    (entry) => String(entry["network"] ?? "") === network && String(entry["asset"] ?? "").toLowerCase() === asset,
  );
  const amounts = onRail
    .map((entry) => usdcFromAtomic(String(entry["amount"] ?? entry["maxAmountRequired"] ?? "")))
    .filter((value): value is number => value !== null);
  if (amounts.length === 0) return null;
  return { rail: `${network} ${asset}`, minimum_usdc: Math.min(...amounts), tiers_offered: amounts.length };
}

function sameMoney(a: number, b: number): boolean {
  return Math.round(a * 1_000_000) === Math.round(b * 1_000_000);
}

function dollars(text: string): number | null {
  const match = /\$\s*(\d+(?:\.\d+)?)/.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * The convention, read: a code span holding the probed path, and a
 * dollar amount inside that span or in parentheses right after it.
 * The first line that satisfies it wins; a document naming two prices
 * for one path is read as the first and said so in the detail.
 */
export function llmsPriceFor(text: string, pathname: string): { price: number; line: string } | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.includes(pathname)) continue;
    const spans = [...line.matchAll(/`([^`]+)`/g)];
    for (const span of spans) {
      const inner = span[1] ?? "";
      if (!inner.includes(pathname)) continue;
      const inside = dollars(inner);
      if (inside !== null) return { price: inside, line };
      const after = line.slice((span.index ?? 0) + span[0].length);
      const paren = /^\s*\(([^)]*)\)/.exec(after);
      if (paren) {
        const price = dollars(paren[1] ?? "");
        if (price !== null) return { price, line };
      }
    }
  }
  return null;
}

/** The OpenAPI document's price for the path, from the machine fields this store and its clients emit. */
export function openapiPriceFor(doc: unknown, pathname: string): number | null {
  if (!doc || typeof doc !== "object") return null;
  const paths = (doc as Record<string, unknown>)["paths"];
  if (!paths || typeof paths !== "object") return null;
  const entry = (paths as Record<string, unknown>)[pathname];
  if (!entry || typeof entry !== "object") return null;
  const operations = Object.values(entry as Record<string, unknown>).filter(
    (value): value is Record<string, unknown> => Boolean(value) && typeof value === "object",
  );
  for (const operation of [entry as Record<string, unknown>, ...operations]) {
    const info = operation["x-payment-info"];
    if (info && typeof info === "object") {
      const price = Number((info as Record<string, unknown>)["price_usdc"]);
      if (Number.isFinite(price)) return price;
    }
    const payment = operation["x-payment"];
    if (payment && typeof payment === "object") {
      const options = (payment as Record<string, unknown>)["price_usdc_options"];
      if (Array.isArray(options)) {
        const numbers = options.map(Number).filter((value) => Number.isFinite(value));
        if (numbers.length > 0) return Math.min(...numbers);
      }
    }
    for (const key of ["x-price-usdc", "x-price"]) {
      const raw = operation[key];
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "string") {
        const price = dollars(raw) ?? (Number.isFinite(Number(raw)) ? Number(raw) : null);
        if (price !== null) return price;
      }
    }
  }
  return null;
}

/** Whether the path exists in the document at all — silent needs to know found-from-absent. */
function openapiHasPath(doc: unknown, pathname: string): boolean {
  if (!doc || typeof doc !== "object") return false;
  const paths = (doc as Record<string, unknown>)["paths"];
  return Boolean(paths && typeof paths === "object" && pathname in (paths as Record<string, unknown>));
}

/** What one read came back as, before any comparison. */
export interface SurfaceRead {
  url: string;
  status: number | null;
  text: string | null;
  /** Set when the read itself failed: the reason, ours to report. */
  failure?: string;
}

async function readSurface(
  env: WbaEnv,
  url: string,
  fetchImpl: typeof fetch,
  accept: string,
): Promise<SurfaceRead> {
  try {
    const target = new URL(url);
    const verdict = checkProbeTarget(target, "");
    if (!verdict.ok) return { url, status: null, text: null, failure: `not read: ${verdict.reason}` };
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(SURFACE_TIMEOUT_MS),
      headers: await webBotAuthHeaders(env, url, { Accept: accept }),
    });
    const text = await response.text();
    if (text.length > SURFACE_BODY_CAP) {
      return { url, status: response.status, text: null, failure: `the body exceeded ${SURFACE_BODY_CAP} bytes and was not read` };
    }
    return { url, status: response.status, text };
  } catch (error) {
    return { url, status: null, text: null, failure: String(error) };
  }
}

function decodeChallenge(response: SurfaceRead): Record<string, unknown>[] | null {
  if (response.status !== 402 || response.text === null) return null;
  // The header is not kept on a SurfaceRead; the bookend and the
  // resource read keep the decoded accepts in `text` as JSON (see
  // readChallengeAccepts), so this is a parse of that.
  try {
    const parsed = JSON.parse(response.text) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

/** A 402 read that keeps only its decoded accepts, header first then body, as JSON text. */
async function readChallengeAccepts(env: WbaEnv, url: string, fetchImpl: typeof fetch): Promise<SurfaceRead> {
  try {
    const target = new URL(url);
    const verdict = checkProbeTarget(target, "");
    if (!verdict.ok) return { url, status: null, text: null, failure: `not read: ${verdict.reason}` };
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(SURFACE_TIMEOUT_MS),
      headers: await webBotAuthHeaders(env, url, { Accept: "application/json" }),
    });
    const header = response.headers.get("PAYMENT-REQUIRED");
    let accepts: unknown = null;
    if (header) {
      try {
        accepts = (JSON.parse(atob(header)) as Record<string, unknown>)["accepts"];
      } catch {
        accepts = null;
      }
    }
    if (!Array.isArray(accepts)) {
      const body = await response.text();
      if (body.length <= SURFACE_BODY_CAP) {
        try {
          accepts = (JSON.parse(body) as Record<string, unknown>)["accepts"];
        } catch {
          accepts = null;
        }
      }
    }
    return { url, status: response.status, text: Array.isArray(accepts) ? JSON.stringify(accepts) : null };
  } catch (error) {
    return { url, status: null, text: null, failure: String(error) };
  }
}

/** Everything Tier B reads for one door, no comparison yet. */
export interface SurfaceReads {
  probed_url: string;
  llms: SurfaceRead;
  openapi: SurfaceRead;
  /** Absent when the challenge named no resource URL, or the same one. */
  resource: SurfaceRead | null;
  resource_url: string | null;
  bookend: SurfaceRead;
}

/** The network half: two to four GETs on the same origin, each guarded, each bounded. */
export async function readSurfaces(
  env: WbaEnv,
  probedUrl: string,
  resourceUrl: string | null,
  fetchImpl: typeof fetch,
): Promise<SurfaceReads> {
  const origin = new URL(probedUrl).origin;
  const llms = await readSurface(env, `${origin}/llms.txt`, fetchImpl, "text/plain");
  let openapi = await readSurface(env, `${origin}/openapi.json`, fetchImpl, "application/json");
  if (openapi.status === 404 || openapi.status === null) {
    const wellKnown = await readSurface(env, `${origin}/.well-known/openapi.json`, fetchImpl, "application/json");
    if (wellKnown.status !== null && wellKnown.status !== 404) openapi = wellKnown;
  }
  const differentResource =
    resourceUrl !== null && resourceUrl !== "" && resourceUrl !== probedUrl ? resourceUrl : null;
  const resource = differentResource ? await readChallengeAccepts(env, differentResource, fetchImpl) : null;
  const bookend = await readChallengeAccepts(env, probedUrl, fetchImpl);
  return { probed_url: probedUrl, llms, openapi, resource, resource_url: differentResource, bookend };
}

function railKey(entry: Record<string, unknown>): string {
  return `${String(entry["network"] ?? "")}|${String(entry["asset"] ?? "").toLowerCase()}`;
}

/** Which fields differ between two accepts lists, by rail; empty when they agree. */
export function acceptsDifference(first: Record<string, unknown>[], second: Record<string, unknown>[]): string[] {
  const out: string[] = [];
  const byRail = (list: Record<string, unknown>[]): Map<string, Record<string, unknown>[]> => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const entry of list) {
      const key = railKey(entry);
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  };
  const a = byRail(first);
  const b = byRail(second);
  for (const [rail, entries] of a) {
    const others = b.get(rail);
    if (!others) {
      out.push(`${rail.split("|")[0]}: offered by the first read only`);
      continue;
    }
    const wanted = entries.map((entry) => `${String(entry["payTo"] ?? "").toLowerCase()}@${String(entry["amount"] ?? "")}`).sort();
    const got = others.map((entry) => `${String(entry["payTo"] ?? "").toLowerCase()}@${String(entry["amount"] ?? "")}`).sort();
    if (JSON.stringify(wanted) !== JSON.stringify(got)) {
      out.push(`${rail.split("|")[0]}: payTo or amount differ (${wanted.join(", ")} against ${got.join(", ")})`);
    }
  }
  for (const rail of b.keys()) {
    if (!a.has(rail)) out.push(`${rail.split("|")[0]}: offered by the second read only`);
  }
  return out;
}

/**
 * The pure half: the section from the reads and the challenge the
 * battery read. The specimen builds its section through this same
 * function over constructed reads, so it cannot drift from the paid
 * artifact's arithmetic.
 */
export function surfacesSectionOf(
  reads: SurfaceReads,
  challengeAccepts: Record<string, unknown>[] | null | undefined,
  readAt: string,
): SurfacesSection {
  const pathname = new URL(reads.probed_url).pathname;
  const price = challengePriceOf(challengeAccepts);
  const rows: SurfaceRow[] = [];

  const compare = (named: number | null): { agrees?: boolean; verdict: string } => {
    if (named === null) return { verdict: "names no price for this path" };
    if (!price) return { verdict: `names $${named}; ${whyNoChallengePrice(challengeAccepts)}, so no comparison` };
    const agrees = sameMoney(named, price.minimum_usdc);
    return {
      agrees,
      verdict: agrees
        ? `names $${named}, the challenge's minimum on ${price.rail.split(" ")[0]}`
        : `names $${named} against the challenge's minimum of $${price.minimum_usdc} on ${price.rail.split(" ")[0]}`,
    };
  };

  // llms.txt
  if (reads.llms.failure) {
    rows.push({ surface: "llms.txt", url: reads.llms.url, state: "unreadable", detail: reads.llms.failure });
  } else if (reads.llms.status === 200 && reads.llms.text !== null) {
    const found = llmsPriceFor(reads.llms.text, pathname);
    const c = compare(found?.price ?? null);
    rows.push({
      surface: "llms.txt",
      url: reads.llms.url,
      state: found ? "read" : "silent",
      ...(found ? { price_usdc: found.price } : {}),
      ...(c.agrees !== undefined ? { agrees: c.agrees } : {}),
      detail: found ? `${c.verdict}; the line read: ${found.line.slice(0, 200)}` : `served, but no code span holds ${pathname} with a dollar amount beside it (the convention); prose is not read`,
    });
  } else if (reads.llms.status === 404) {
    rows.push({ surface: "llms.txt", url: reads.llms.url, state: "absent", detail: "no such surface: the origin answered 404" });
  } else {
    rows.push({ surface: "llms.txt", url: reads.llms.url, state: "absent", detail: `the origin answered ${reads.llms.status ?? "nothing"} for it, which is not a document` });
  }

  // openapi
  if (reads.openapi.failure) {
    rows.push({ surface: "openapi", url: reads.openapi.url, state: "unreadable", detail: reads.openapi.failure });
  } else if (reads.openapi.status === 200 && reads.openapi.text !== null) {
    let doc: unknown = null;
    try {
      doc = JSON.parse(reads.openapi.text);
    } catch {
      doc = null;
    }
    if (doc === null) {
      rows.push({ surface: "openapi", url: reads.openapi.url, state: "unreadable", detail: "served, but not JSON" });
    } else {
      const named = openapiPriceFor(doc, pathname);
      const c = compare(named);
      rows.push({
        surface: "openapi",
        url: reads.openapi.url,
        state: named !== null ? "read" : "silent",
        ...(named !== null ? { price_usdc: named } : {}),
        ...(c.agrees !== undefined ? { agrees: c.agrees } : {}),
        detail:
          named !== null
            ? c.verdict
            : openapiHasPath(doc, pathname)
              ? `the document describes ${pathname} but carries no x-payment-info, x-payment or x-price field for it`
              : `the document does not describe ${pathname}`,
      });
    }
  } else if (reads.openapi.status === 404) {
    rows.push({ surface: "openapi", url: reads.openapi.url, state: "absent", detail: "no such surface: 404 at /openapi.json and /.well-known/openapi.json" });
  } else {
    rows.push({ surface: "openapi", url: reads.openapi.url, state: "absent", detail: `the origin answered ${reads.openapi.status ?? "nothing"} for it, which is not a document` });
  }

  // resource url
  if (reads.resource === null) {
    rows.push({
      surface: "resource_url",
      url: reads.resource_url ?? reads.probed_url,
      state: "absent",
      detail: "the challenge names no resource URL other than the one knocked on, so there is no second door to compare",
    });
  } else if (reads.resource.failure) {
    rows.push({ surface: "resource_url", url: reads.resource.url, state: "unreadable", detail: reads.resource.failure });
  } else {
    const theirs = decodeChallenge(reads.resource);
    if (!theirs || !challengeAccepts) {
      rows.push({ surface: "resource_url", url: reads.resource.url, state: "silent", detail: `answered ${reads.resource.status ?? "nothing"} with no parseable challenge to compare` });
    } else {
      const differences = acceptsDifference(challengeAccepts, theirs);
      const named = challengePriceOf(theirs);
      rows.push({
        surface: "resource_url",
        url: reads.resource.url,
        state: "read",
        ...(named ? { price_usdc: named.minimum_usdc } : {}),
        agrees: differences.length === 0,
        detail:
          differences.length === 0
            ? "its own 402 carries the same accepts, rail by rail"
            : `its own 402 differs from the probed door's: ${differences.join("; ")}`,
      });
    }
  }

  // bookend
  let moving = false;
  if (reads.bookend.failure) {
    rows.push({ surface: "402_bookend", url: reads.bookend.url, state: "unreadable", detail: reads.bookend.failure });
  } else {
    const again = decodeChallenge(reads.bookend);
    if (!again || !challengeAccepts) {
      rows.push({ surface: "402_bookend", url: reads.bookend.url, state: "silent", detail: `the second read answered ${reads.bookend.status ?? "nothing"} with no parseable challenge` });
    } else {
      const differences = acceptsDifference(challengeAccepts, again);
      moving = differences.length > 0;
      rows.push({
        surface: "402_bookend",
        url: reads.bookend.url,
        state: "read",
        agrees: !moving,
        detail: moving
          ? `the 402 changed between the first read and this one (${differences.join("; ")}): the price was moving while we read, so no row above counts against the door`
          : "the 402 read the same both times; the rows above compared against a price that held still",
      });
    }
  }

  const compared = rows.filter((row) => row.surface !== "402_bookend" && row.state === "read" && row.agrees !== undefined);
  return {
    read_at: readAt,
    challenge_price: price,
    ...(price ? {} : { no_challenge_price: whyNoChallengePrice(challengeAccepts) }),
    rows,
    named_a_price: compared.length,
    agree: moving ? 0 : compared.filter((row) => row.agrees).length,
    differ: moving ? 0 : compared.filter((row) => !row.agrees).length,
    moving,
    not_read: [...NOT_READ],
    convention: LLMS_PRICE_CONVENTION,
    what_this_is: SURFACES_WHAT_THIS_IS,
  };
}
