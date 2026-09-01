import { recoverMessageAddress } from "viem";
import { signJcs } from "@/lib/jcs";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { normalizePayTo, payToDigest } from "@/lib/pay-to-digest";
import { signMessage } from "@/lib/signing";
import { listCorpus, type CorpusRecord } from "@/services/corpus";
import { SHARED_WALLET_CAVEAT } from "@/services/operator-facts";
import { noteFor, type StandingNote } from "@/services/standing-note";
import type { WardHostResult } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE COMPANY AN ADDRESS KEEPS — the provenance check (roadmap N4;
 * spec docs/PROVENANCE_CHECK_SPEC_2026-08.md; the G2 ruling's tier-3
 * lane; shelf copy the keeper's, approved 2026-09-01).
 *
 * One question, answered with evidence: what does the signed chain
 * hold about this receiving address? The public tiers count and
 * never name (T1 counts, T2 per-host facts); this is the NAMED join,
 * delivered to the buyer inside a signed, dated artifact, every fact
 * naming the snapshot digest it derives from. Never published by us;
 * never a score; no `operator` field — pairings and dates only.
 *
 * The rules the ruling carries, in code rather than in a footnote:
 *   1. Delivered to the buyer; the artifact existing creates no
 *      public record keyed to the subject.
 *   2. No score, no operator field, no identity assertion.
 *   3. The subject's standing note always rides, verbatim.
 *   4. The shared-wallet caveat is inline.
 *   5. Nothing private feeds this — every input is already on the
 *      public chain as a digest, or in the subject's own 402s.
 *
 * THE SELF-AUDIT IS FREE, and we count the ask, not the asker: a
 * weekly integer of self-audits run — no address, no wallet, no
 * timestamp finer than the week. The free answer ends with the
 * consent offer, in the open, with a yes required: a standing note,
 * which is a public statement by the proved party and the only
 * "listing" this store keeps.
 */

export interface ProvenanceDoor {
  host: string;
  verdict: WardHostResult["verdict"];
  networks?: string[];
  min_usdc?: number;
  max_usdc?: number;
}

export interface ProvenanceWeek {
  week: string;
  sequence: number;
  digest: string;
  taken_at: string;
  doors: ProvenanceDoor[];
}

export interface ProvenanceDrift {
  week: string;
  host: string;
  change: "door_appeared" | "door_disappeared" | "terms_changed" | "verdict_changed";
  from?: unknown;
  to?: unknown;
}

export interface ProvenanceRecord {
  artifact: "provenance_check";
  provenance_id: string;
  asked_at: string;
  subject: {
    kind: "address";
    /** Verbatim, as the buyer supplied it. */
    address: string;
    /** The salted digest the corpus keys on (v1). */
    digest: string;
  };
  never_seen: boolean;
  weeks: ProvenanceWeek[];
  drift: ProvenanceDrift[];
  standing_note: StandingNote | null;
  shared_wallet_caveat: string;
  honest_limits: string[];
  how_to_rederive: string;
  what_this_is: string;
  what_this_is_not: string;
}

export interface SignedProvenanceCheck {
  record: ProvenanceRecord;
  evidence_hash: string;
  signed_payload: string;
  signature: string;
  signature_jcs: string;
  public_key: string;
}

export class ProvenanceRefused extends Error {}

const WHAT_THIS_IS =
  "A dated, signed answer to the question the free surfaces count but never name: which doors have advertised this receiving address, and when. The hosts, the signed weeks, each week's verdict, drift in the door's own terms, and the snapshot digest behind every line. Rebuild it from the public chain without our word.";

const WHAT_THIS_IS_NOT =
  "No judgment: shared addresses are ordinary, custodians are common, and this store does not grade operators. Not a risk score, not an identity assertion, not a compliance verdict. Delivered to whoever asked; never published by us, and the artifact existing creates no public record keyed to the address.";

export const HONEST_LIMITS: readonly string[] = [
  "Weekly cadence: the chain holds one signed round a week, and nothing is claimed between rounds.",
  "Only doors our feeds listed and our rounds walked; each round's own coverage caveats apply and are carried on the snapshot named.",
  "An address the chain has never seen yields exactly that answer — never_seen — because you paid for the answer and that is the answer.",
  "The 402s the rounds read are the doors' own; whether an address is custodial, shared, or one operator's is not something an observation can say.",
];

function hostsOf(record: CorpusRecord): WardHostResult[] {
  return (record.snapshot.round.hosts ?? []) as WardHostResult[];
}

/** An EVM address or a Solana base58 pubkey — the payTo shapes the corpus digests. */
export function validSubjectAddress(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return value;
  return null;
}

async function digestsOf(host: WardHostResult): Promise<string[]> {
  const offer = host.offer;
  if (!offer) return [];
  if (offer.pay_to_digest && offer.pay_to_digest.length > 0) return offer.pay_to_digest;
  if (offer.pay_to && offer.pay_to.length > 0) {
    return Promise.all(offer.pay_to.map(payToDigest));
  }
  return [];
}

function doorOf(host: WardHostResult): ProvenanceDoor {
  const offer = host.offer;
  return {
    host: host.host,
    verdict: host.verdict,
    ...(offer?.networks ? { networks: [...offer.networks].sort() } : {}),
    ...(offer?.min_usdc !== undefined ? { min_usdc: offer.min_usdc } : {}),
    ...(offer?.max_usdc !== undefined ? { max_usdc: offer.max_usdc } : {}),
  };
}

function termsOf(door: ProvenanceDoor): string {
  return JSON.stringify([door.networks ?? null, door.min_usdc ?? null, door.max_usdc ?? null]);
}

/**
 * The named join, derived at read from the signed chain and nothing
 * else. Pure over the records so a test can hand it a chain and read
 * the answer back without the store in the way.
 */
export async function deriveProvenance(
  records: CorpusRecord[],
  digest: string,
): Promise<{ weeks: ProvenanceWeek[]; drift: ProvenanceDrift[] }> {
  const weeks: ProvenanceWeek[] = [];
  for (const record of records) {
    const doors: ProvenanceDoor[] = [];
    for (const host of hostsOf(record)) {
      if ((await digestsOf(host)).includes(digest)) doors.push(doorOf(host));
    }
    if (doors.length === 0) continue;
    doors.sort((a, b) => a.host.localeCompare(b.host));
    weeks.push({
      week: record.snapshot.week,
      sequence: record.snapshot.sequence,
      digest: record.digest,
      taken_at: record.snapshot.taken_at,
      doors,
    });
  }
  const drift: ProvenanceDrift[] = [];
  for (let i = 1; i < weeks.length; i += 1) {
    const before = new Map(weeks[i - 1]!.doors.map((door) => [door.host, door]));
    const after = new Map(weeks[i]!.doors.map((door) => [door.host, door]));
    const week = weeks[i]!.week;
    for (const [host, door] of after) {
      const prior = before.get(host);
      if (!prior) {
        drift.push({ week, host, change: "door_appeared" });
        continue;
      }
      if (prior.verdict !== door.verdict) {
        drift.push({ week, host, change: "verdict_changed", from: prior.verdict, to: door.verdict });
      }
      if (termsOf(prior) !== termsOf(door)) {
        drift.push({
          week,
          host,
          change: "terms_changed",
          from: { networks: prior.networks, min_usdc: prior.min_usdc, max_usdc: prior.max_usdc },
          to: { networks: door.networks, min_usdc: door.min_usdc, max_usdc: door.max_usdc },
        });
      }
    }
    for (const host of before.keys()) {
      if (!after.has(host)) drift.push({ week, host, change: "door_disappeared" });
    }
  }
  return { weeks, drift };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildProvenanceRecord(
  env: Env,
  address: string,
  records?: CorpusRecord[],
): Promise<ProvenanceRecord> {
  const chain = records ?? (await listCorpus(env));
  const digest = await payToDigest(address);
  const { weeks, drift } = await deriveProvenance(chain, digest);
  const base = env.STORE_BASE_URL;
  return {
    artifact: "provenance_check",
    provenance_id: `prov_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    asked_at: new Date().toISOString(),
    subject: { kind: "address", address, digest },
    never_seen: weeks.length === 0,
    weeks,
    drift,
    standing_note: await noteFor(env, `wallet:${digest}`),
    shared_wallet_caveat: SHARED_WALLET_CAVEAT,
    honest_limits: [...HONEST_LIMITS],
    how_to_rederive: `Salt-digest the address as ${base}/corpus.json documents (scvd:payto:v1), fetch ${base}/corpus/{sequence}.json for each week named above, find the rows whose offer carries that digest, and compare the snapshot digests against the chain. Nothing here exists outside those signed entries.`,
    what_this_is: WHAT_THIS_IS,
    what_this_is_not: WHAT_THIS_IS_NOT,
  };
}

export async function performProvenanceCheck(
  env: Env,
  rawAddress: string,
): Promise<SignedProvenanceCheck> {
  const address = validSubjectAddress(rawAddress);
  if (!address) {
    throw new ProvenanceRefused(
      "Give a receiving address in the address query parameter — an EVM address (0x + 40 hex) or a Solana pubkey (base58). No address, no charge.",
    );
  }
  const record = await buildProvenanceRecord(env, address);
  const signedPayload = JSON.stringify(record);
  const { signature, publicKey } = await signMessage(signedPayload, env.SIGNING_KEY);
  return {
    record,
    evidence_hash: await sha256Hex(signedPayload),
    signed_payload: signedPayload,
    signature,
    signature_jcs: await signJcs(record as unknown as Record<string, unknown>, env.SIGNING_KEY),
    public_key: publicKey,
  };
}

export interface ProvenanceCheckStored {
  check: SignedProvenanceCheck;
  cert_id: string;
  created_at: string;
}

export async function storeProvenanceCheck(
  env: Env,
  check: SignedProvenanceCheck,
  certId: string,
): Promise<void> {
  await kvPut(
    env.PATRONS,
    KV_KEYS.provenanceCheck(check.record.provenance_id),
    JSON.stringify({ check, cert_id: certId, created_at: new Date().toISOString() }),
  );
}

export async function getProvenanceCheck(
  env: Env,
  id: string,
): Promise<ProvenanceCheckStored | null> {
  return kvGetJson<ProvenanceCheckStored>(env.PATRONS, KV_KEYS.provenanceCheck(id), "json");
}

/* ---------------------------------------------------------------- */
/* The free self-audit: proved-own, counted as an ask, never logged. */
/* ---------------------------------------------------------------- */

export function selfAuditChallengeText(address: string, week: string): string {
  return [
    "scvd.store provenance self-audit v1",
    `wallet: ${normalizePayTo(address)}`,
    `week: ${week}`,
    "",
    "Signing this proves control of the wallet and asks scvd.store what the signed chain holds about it. The answer is free, delivered to you, and never published.",
  ].join("\n");
}

export const CONSENT_OFFER = {
  what: "You have read what the chain holds about your address. If you want that pairing said in your own words, in public, beside every observation of your doors, you may attach a standing note.",
  what_a_note_is:
    "A statement by the party who proved control of the subject, at most 500 characters, served verbatim on every surface that shows the observation — the corpus host pages, the passport, and any purchased artifact about the address. Beside the observation, never instead of it.",
  it_is_public: true,
  declining_costs: "Nothing. The answer above is already yours; no note, no listing, and nothing about this request is kept beyond a weekly count of self-audits run.",
  how_to_say_yes: "POST /api/standing-note with the wallet lane: address, statement, and an EIP-191 signature over the challenge GET /api/standing-note describes.",
  a_yes_is_required: true,
} as const;

/** ISO week, the grain of the ask counter. */
function isoWeek(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function currentSelfAuditWeek(now: Date = new Date()): string {
  return isoWeek(now);
}

/** Count the ask, not the asker: one integer per week. */
export async function countSelfAudit(env: Env, week: string): Promise<number> {
  const key = KV_KEYS.provenanceSelfAudits(week);
  const current = (await kvGetJson<number>(env.COUNTERS, key, "json")) ?? 0;
  const next = current + 1;
  await kvPut(env.COUNTERS, key, JSON.stringify(next));
  return next;
}

export async function readSelfAudits(env: Env, week: string): Promise<number> {
  return (await kvGetJson<number>(env.COUNTERS, KV_KEYS.provenanceSelfAudits(week), "json")) ?? 0;
}

export async function verifySelfAudit(
  address: string,
  signature: string,
  week: string,
): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: selfAuditChallengeText(address, week),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}
