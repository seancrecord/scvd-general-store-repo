import { comparisonUrls, COMPARISON_OFFER_CAP } from "@/lib/research-comparison-terms";
import { sha256Hex } from "@/lib/idempotency";
import { decodeBase58 } from "@/lib/base58";
import { signJcs } from "@/lib/jcs";
import { signMessage } from "@/lib/signing";
import { heldHalf, type HeldHalf } from "@/services/look";
import { preflightUrl, PREFLIGHT_VERSION_NEXT, type PreflightReport } from "@/services/preflight";
import { SHARED_WALLET_CAVEAT } from "@/services/operator-facts";
import { isRecord, type Env } from "@/types";

export interface ComparisonOffer {
  index: number;
  scheme: string | null;
  network: string | null;
  asset: string | null;
  pay_to: string | null;
  amount_atomic: string | null;
  amount_field: "amount" | "maxAmountRequired" | null;
  comparison: "exact_atomic" | "not_comparable";
  reason: string;
}

const text = (value: unknown): string | null => typeof value === "string" && value.length <= 1024 ? value : null;
const canonicalNetwork = (network: string | null): boolean => !!network && /^(eip155:[1-9]\d*|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(network);
function addressOn(network: string | null, address: string | null): string | null {
  if (!network || !address) return null;
  if (/^eip155:[1-9]\d*$/.test(network) && /^0x[0-9a-fA-F]{40}$/.test(address)) return address.toLowerCase();
  if (network.startsWith("solana:") && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) && decodeBase58(address)?.length === 32) return address;
  return null;
}

/** Unknown decimals never turn an atomic amount into an invented dollar price. */
export function comparisonOffer(value: unknown, index: number): ComparisonOffer {
  const raw = isRecord(value) ? value : {};
  const network = text(raw.network), asset = text(raw.asset);
  const amountField = raw.amount !== undefined ? "amount" : raw.maxAmountRequired !== undefined ? "maxAmountRequired" : null;
  const amount = amountField ? text(raw[amountField]) : null;
  const exact = raw.scheme === "exact" && canonicalNetwork(network) && addressOn(network, asset) !== null &&
    amount !== null && /^\d{1,78}$/.test(amount) &&
    !(raw.amount !== undefined && raw.maxAmountRequired !== undefined && raw.amount !== raw.maxAmountRequired);
  return { index, scheme: text(raw.scheme), network, asset, pay_to: text(raw.payTo),
    amount_atomic: amount, amount_field: amountField, comparison: exact ? "exact_atomic" : "not_comparable",
    reason: exact
      ? "Advertised exact atomic amount. Compare only within the same network and asset; decimals and fiat value are not inferred. This is not a settlement or delivery observation."
      : "Unknown, variable, conflicting or malformed terms. No exact price comparison is inferred; read the preflight findings.",
  };
}

export interface ComparisonRow {
  url: string;
  host: string;
  started_at: string;
  completed_at: string;
  live: PreflightReport | null;
  live_gap: { code: string; retry_after_seconds?: string } | null;
  offers: ComparisonOffer[];
  offers_observed: number;
  offers_included: number;
  offers_truncated: boolean;
  history: HeldHalf | null;
  history_gap: "history_unavailable" | null;
  changes: {
    scope: "same_endpoint" | "different_endpoint" | "no_prior" | "history_unavailable";
    networks: "same" | "changed" | "not_comparable";
    previous: HeldHalf["last_probed_round"];
    price: "not_comparable";
    reason: string;
  };
}

function changes(url: string, history: HeldHalf | null, offers: ComparisonOffer[], complete: boolean): ComparisonRow["changes"] {
  const previous = history?.last_probed_round ?? null;
  const same = previous?.url === url;
  const before = previous?.offer?.networks;
  const after = offers.map(offer => offer.network);
  const comparable = same && complete && !!before?.length && after.length > 0 && [...before, ...after].every(canonicalNetwork);
  const key = (values: (string | null)[]) => JSON.stringify([...new Set(values)].sort());
  return {
    scope: !history ? "history_unavailable" : !previous ? "no_prior" : same ? "same_endpoint" : "different_endpoint",
    networks: comparable ? key(before!) === key(after) ? "same" : "changed" : "not_comparable",
    previous, price: "not_comparable",
    reason: "History describes a host and may concern a different endpoint. Network changes require the same URL and complete comparable observations. Historical price bounds do not retain exact per-asset terms, so no exact price change is claimed. Dates, verdict changes, coverage and gaps remain in history.",
  };
}

export function comparisonGroups(rows: ComparisonRow[]) {
  const quoteGroups = new Map<string, { network: string; asset: string; offers: { url: string; offer_index: number; amount_atomic: string }[] }>();
  const receivers = new Map<string, { network: string; address: string; urls: string[] }>();
  for (const row of rows) for (const offer of row.offers) {
    const asset = addressOn(offer.network, offer.asset);
    if (offer.comparison === "exact_atomic" && asset && offer.network && offer.amount_atomic !== null) {
      const key = JSON.stringify([offer.network, asset]);
      const group = quoteGroups.get(key) ?? { network: offer.network, asset, offers: [] };
      group.offers.push({ url: row.url, offer_index: offer.index, amount_atomic: offer.amount_atomic });
      quoteGroups.set(key, group);
    }
    const address = addressOn(offer.network, offer.pay_to);
    if (address && canonicalNetwork(offer.network)) {
      const key = JSON.stringify([offer.network, address]);
      const group = receivers.get(key) ?? { network: offer.network!, address, urls: [] };
      if (!group.urls.includes(row.url)) group.urls.push(row.url);
      receivers.set(key, group);
    }
  }
  return {
    quote_groups: [...quoteGroups.values()],
    shared_receivers: [...receivers.values()].filter(group => group.urls.length > 1),
  };
}

export interface ResearchComparisonRecord {
  artifact: "research_comparison";
  version: "v1";
  comparison_id: string;
  started_at: string;
  completed_at: string;
  rows: ComparisonRow[];
  counts: { requested: number; live_reports: number; live_gaps: number; histories_read: number; history_gaps: number; hosts_never_met: number };
  quote_groups: ReturnType<typeof comparisonGroups>["quote_groups"];
  shared_receivers: ReturnType<typeof comparisonGroups>["shared_receivers"];
  limits: string[];
  free_sources: string[];
}
export interface SignedResearchComparison {
  record: ResearchComparisonRecord;
  evidence_hash: string;
  signed_payload: string;
  signature: string;
  signature_jcs: string;
  public_key: string;
}

export class ResearchComparisonUnavailable extends Error {}

export async function performResearchComparison(env: Env, rawUrls: unknown): Promise<SignedResearchComparison> {
  const urls = comparisonUrls(rawUrls, env.STORE_BASE_URL);
  const startedAt = new Date().toISOString();
  const rows: ComparisonRow[] = [];
  // Keep the shared preflight budget sequential. The history and live read are
  // independent; an unavailable archive must not erase a successful probe.
  for (const url of urls) {
    const host = new URL(url).host, started = new Date();
    const [probe, archive] = await Promise.allSettled([
      preflightUrl(url, env, PREFLIGHT_VERSION_NEXT), heldHalf(env, host, started),
    ]);
    const reading = probe.status === "fulfilled" ? probe.value : null;
    const live = reading?.status === 200 && "verdict" in reading.body ? reading.body : null;
    const accepts = reading?.accepts ?? [];
    const offers = accepts.slice(0, COMPARISON_OFFER_CAP).map(comparisonOffer);
    const history = archive.status === "fulfilled" ? archive.value : null;
    const gapCode = reading && "code" in reading.body ? reading.body.code : undefined;
    rows.push({ url, host, started_at: started.toISOString(), completed_at: new Date().toISOString(), live,
      live_gap: live ? null : { code: gapCode ?? "instrument_unavailable",
        ...(reading?.headers?.["Retry-After"] ? { retry_after_seconds: reading.headers["Retry-After"] } : {}),
      },
      offers, offers_observed: accepts.length, offers_included: offers.length, offers_truncated: accepts.length > offers.length,
      history, history_gap: history ? null : "history_unavailable",
      changes: changes(url, history, offers, live !== null && accepts.length === offers.length),
    });
  }
  // Service-side refusals are not paid observations of providers. A wholly
  // unavailable instrument cannot reach the settlement line.
  const liveReports = rows.filter(row => row.live !== null).length;
  if (liveReports === 0) throw new ResearchComparisonUnavailable("No comparison probes completed. Nothing settled.");
  const record: ResearchComparisonRecord = {
    artifact: "research_comparison", version: "v1", comparison_id: `comparison_${crypto.randomUUID()}`,
    started_at: startedAt, completed_at: new Date().toISOString(), rows,
    counts: { requested: urls.length, live_reports: liveReports, live_gaps: rows.length - liveReports,
      histories_read: rows.filter(row => row.history !== null).length,
      history_gaps: rows.filter(row => row.history === null).length,
      hosts_never_met: new Set(rows.filter(row => row.history?.never_met).map(row => row.host)).size },
    ...comparisonGroups(rows),
    limits: [
      "One unauthenticated preflight per URL in the stated observation window; no research bought, no wallet connection, no ranking or recommendation. Ready describes the x402 challenge only.",
      "Quoted atomic amounts are grouped only by matching network and asset. Token decimals, exchange rates, total research cost and settlement success are not inferred. Variable or unknown terms remain not_comparable.",
      `At most ${COMPARISON_OFFER_CAP} offers are included per endpoint; truncation and both counts are explicit. Missing quotes or shared-address matches are not evidence of absence.`,
      SHARED_WALLET_CAVEAT,
      "A shared receiver is an advertised address match on the same network, not proof of common ownership or common underlying research sources. Different receivers do not prove independence.",
      "Host history is sampled, may concern another URL, and may be cached; derived_at, held_for_seconds and gaps travel with it. No history is a coverage limit, not a provider verdict.",
      "We did not inspect paid research, its accuracy, freshness, licensing or suitability for a trade. No investment advice or claimed Coinbase integration.",
      "Submitted URLs and signed observations are retained privately for purchase recovery. Do not include credentials, private prompts or trade intent. Requests do not populate the public corpus or a partner feed.",
    ],
    free_sources: [`${env.STORE_BASE_URL}/api/preflight/${PREFLIGHT_VERSION_NEXT}`, `${env.STORE_BASE_URL}/api/look/v1`,
      ...[...new Set(rows.map(row => row.host))].map(host => `${env.STORE_BASE_URL}/corpus/host/${encodeURIComponent(host)}.json`)],
  };
  const signedPayload = JSON.stringify(record);
  const signed = await signMessage(signedPayload, env.SIGNING_KEY);
  return { record, signed_payload: signedPayload, evidence_hash: await sha256Hex(signedPayload),
    signature: signed.signature, public_key: signed.publicKey,
    signature_jcs: await signJcs({ ...record }, env.SIGNING_KEY) };
}
