import { paymentChallenges } from "@/lib/mpp-challenge";
import { isRecord } from "@/types";
import type { SurfaceReads, SurfaceState } from "@/services/surface-reads";

export const MPP_DISCOVERY_VERSION = "mpp-discovery-v1";
export const MPP_DISCOVERY_SPEC = "https://github.com/tempoxyz/mpp-specs/blob/main/specs/extensions/draft-payment-discovery-01.md";
const FIELDS = ["method", "intent", "amount", "currency"] as const;
type Field = typeof FIELDS[number];
type Terms = Record<Field, string>;
type Offer = Omit<Terms, "amount" | "currency"> & { amount: string | null; currency?: string };
export interface MppChallengeRead { status: number | null; www_authenticate?: string | null }
interface ChallengeReading { state: "read" | "absent" | "unreadable"; terms: Terms[]; detail: string }
interface DiscoveryReading { state: SurfaceState; offers: Offer[]; detail: string }
interface Candidate { offer_index: number; agree: Field[]; differ: Field[]; not_compared: Field[] }
interface ComparisonRow {
  challenge_index: number;
  state: "agree" | "differ" | "moving" | "unmeasured";
  matching_offers: number[];
  candidates: Candidate[];
  defect_class?: "surface-contradicts-challenge";
}
export interface MppSurfacesSection {
  version: typeof MPP_DISCOVERY_VERSION;
  spec: string;
  operation: string;
  openapi: DiscoveryReading & { url: string };
  challenge: ChallengeReading;
  bookend: ChallengeReading & { state: "read" | "absent" | "unreadable"; stability: "stable" | "moving" | "unmeasured" };
  rows: ComparisonRow[];
  compared: number;
  agree: number;
  differ: number;
  moving: boolean;
  gaps: string[];
  rule: string;
}

const MAX_ALTERNATIVES = 64;
const MAX_HEADER = 16_384;
const atomic = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
const word = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function challengeOf(read: MppChallengeRead): ChallengeReading {
  const result = (state: ChallengeReading["state"], detail: string, terms: Terms[] = []): ChallengeReading => ({ state, terms, detail });
  if (read.status === null || read.www_authenticate === undefined) return result("unreadable", "The challenge header was not captured.");
  if ((read.www_authenticate?.length ?? 0) > MAX_HEADER) return result("unreadable", "The challenge header exceeded this reader's limit.");
  const challenges = paymentChallenges(read.www_authenticate);
  if (!challenges.length) return result("absent", "No Payment challenge was observed in this response.");
  if (read.status !== 402 || challenges.length > MAX_ALTERNATIVES) return result("unreadable", "Payment terms could not be compared on this response.");
  const terms: Terms[] = [];
  for (const c of challenges) {
    if (!word(c.method) || !word(c.intent) || !atomic(c.request?.amount) || !word(c.request?.currency)) {
      return result("unreadable", "At least one Payment challenge lacked readable method, intent, atomic amount or currency; no alternatives were discarded to claim a comparison.");
    }
    terms.push({ method: c.method, intent: c.intent, amount: c.request.amount, currency: c.request.currency });
  }
  return result("read", "Only method, intent, amount and currency were read; this is not challenge validation.", terms);
}

function discoveryOf(reads: SurfaceReads): DiscoveryReading {
  const read = reads.openapi;
  const result = (state: SurfaceState, detail: string, offers: Offer[] = []): DiscoveryReading => ({ state, offers, detail });
  if (read.failure) return result("unreadable", "The OpenAPI read failed or exceeded its body limit.");
  if (read.status === 404) return result("absent", "The origin answered 404 for the discovery document.");
  if (read.status !== 200 || read.text === null) return result("unreadable", "No complete successful discovery document was captured.");
  let doc: unknown;
  try { doc = JSON.parse(read.text); } catch { return result("unreadable", "The discovery document was not JSON."); }
  if (!isRecord(doc) || typeof doc.openapi !== "string" || !/^3\.[01]\./.test(doc.openapi) || !isRecord(doc.paths)) {
    return result("unreadable", "This reader supports JSON OpenAPI 3.0 and 3.1 paths only.");
  }
  const url = new URL(reads.probed_url);
  const path = doc.paths[url.pathname];
  if (!isRecord(path)) return result("unreadable", "No exact path was found; templates, references and server path prefixes are not resolved by this reader.");
  if ("$ref" in path) return result("unreadable", "The path uses a reference this reader does not resolve.");
  if (!isRecord(path.get)) return result("silent", "The exact path names no GET operation; another method's metadata is not used.");
  const operation = path.get;
  // A matching path on a different API server is not this door's metadata.
  // An explicit null is malformed; only omission inherits a parent.
  const servers = operation.servers !== undefined ? operation.servers
    : path.servers !== undefined ? path.servers : doc.servers;
  if (servers !== undefined) {
    if (!Array.isArray(servers) || servers.length !== 1 || !isRecord(servers[0]) || typeof servers[0].url !== "string") {
      return result("unreadable", "Only an omitted server or one explicit same-origin root server is resolved.");
    }
    try {
      const server = new URL(servers[0].url, read.url);
      if (server.origin !== url.origin || server.pathname !== "/" || server.search || server.hash || servers[0].variables) {
        return result("unreadable", "The declared server is not a literal same-origin root server.");
      }
    } catch { return result("unreadable", "The declared server URL could not be resolved."); }
  }
  const info = operation["x-payment-info"];
  if (info === undefined || (isRecord(info) && !["offers", ...FIELDS].some((key) => key in info))) {
    return result("silent", "The GET operation names no MPP payment offers; other payment extensions are not interpreted as MPP.");
  }
  if (!isRecord(info)) return result("unreadable", "The MPP extension is not an object.");
  const values = "offers" in info ? info.offers : [info];
  if (!Array.isArray(values) || !values.length || values.length > MAX_ALTERNATIVES || ("offers" in info && Object.keys(info).some((key) => key !== "offers"))) {
    return result("unreadable", "The extension does not have a supported single-offer or offers-array shape.");
  }
  const offers: Offer[] = [];
  for (const value of values) {
    if (!isRecord(value) || !word(value.method) || (typeof value.intent !== "string" || !["charge", "session"].includes(value.intent)) ||
      !(value.amount === null || atomic(value.amount)) ||
      (value.currency !== undefined && !word(value.currency)) ||
      (value.description !== undefined && typeof value.description !== "string") ||
      Object.keys(value).some((key) => ![...FIELDS, "description"].includes(key))) {
      return result("unreadable", "At least one advertised offer could not be read under discovery draft-01; no offer was discarded to claim a comparison.");
    }
    offers.push({ method: value.method, intent: value.intent as string, amount: value.amount as string | null,
      ...(typeof value.currency === "string" ? { currency: value.currency } : {}) });
  }
  return result("read", "The exact GET operation's advertised alternatives, read without choosing a payment method.", offers);
}

/** Pure comparison of bytes already collected by the paid audit. Never fetches or pays. */
export function mppSurfacesSectionOf(reads: SurfaceReads, first: MppChallengeRead): MppSurfacesSection {
  const openapi = discoveryOf(reads);
  const challenge = challengeOf(first);
  const bookend = reads.bookend.failure
    ? { state: "unreadable" as const, terms: [], detail: "The closing challenge read failed." }
    : challengeOf(reads.bookend);
  // Nonces and expiry normally rotate; only the compared terms determine movement.
  const key = (reading: ChallengeReading) => JSON.stringify([...new Set(reading.terms.map((terms) => JSON.stringify(terms)))].sort());
  const measured = challenge.state !== "unreadable" && bookend.state !== "unreadable";
  const moving = measured && key(challenge) !== key(bookend);
  const stable = measured && !moving && challenge.state === "read";
  const rows: ComparisonRow[] = openapi.state !== "read" || challenge.state !== "read" ? [] : challenge.terms.map((terms, index) => {
    const candidates = openapi.offers.map((offer, offer_index): Candidate => {
      const candidate: Candidate = { offer_index, agree: [], differ: [], not_compared: [] };
      for (const field of FIELDS) {
        const value = offer[field];
        if (value === null || value === undefined) candidate.not_compared.push(field);
        else candidate[value === terms[field] ? "agree" : "differ"].push(field);
      }
      return candidate;
    });
    const matching_offers = candidates.filter((candidate) => !candidate.differ.length).map((candidate) => candidate.offer_index);
    const state = moving ? "moving" : !stable ? "unmeasured" : matching_offers.length ? "agree" : "differ";
    return { challenge_index: index, state, matching_offers, candidates,
      ...(state === "differ" ? { defect_class: "surface-contradicts-challenge" as const } : {}) };
  });
  const agree = rows.filter((row) => row.state === "agree").length;
  const differ = rows.filter((row) => row.state === "differ").length;
  return {
    version: MPP_DISCOVERY_VERSION, spec: MPP_DISCOVERY_SPEC, operation: `GET ${new URL(reads.probed_url).pathname}`,
    openapi: { url: reads.openapi.url, ...openapi }, challenge,
    bookend: { ...bookend, stability: moving ? "moving" : stable ? "stable" : "unmeasured" },
    rows, compared: agree + differ, agree, differ, moving,
    gaps: [
      "Only the exact GET operation in JSON OpenAPI 3.0/3.1 is resolved. Path templates, references, server prefixes and multiple servers are not resolved. Discovery is optional; missing metadata is not a defect.",
      "A null amount is dynamic and an omitted currency makes no assertion; these fields are not compared. Agreement means only the named fields match an advertised alternative, not that a dynamic price was verified.",
      "Advertised alternatives not observed in the challenge are not tested for availability. Unknown or incomplete challenge terms prevent comparison. No amount conversion or currency alias normalization is attempted.",
      "Two matching bookends do not prove terms stayed constant between them. No payment, delivery, settlement, challenge binding or output schema was tested. This comparison does not change the x402 verdict or the frozen MPP Tier 0 battery.",
      ...(openapi.state !== "read" ? [openapi.detail] : []),
      ...(challenge.state !== "read" ? [challenge.detail] : []),
      ...(!stable ? [moving ? "Payment terms moved during the reads; no differences count against the door." : "Stable Payment terms were not observed at both bookends; no differences count against the door."] : []),
    ],
    rule: "Discovery draft-01 is advisory; the live 402 challenge is authoritative. Each observed challenge is compared against every advertised alternative. A difference is counted only if all alternatives differ on at least one named field and the compared terms match at both bookends. Counts are observed challenges, not surfaces or offers; candidate fields retain the evidence. This is a versioned reading rule, not a general MPP conformance verdict. The store's till does not speak MPP.",
  };
}
