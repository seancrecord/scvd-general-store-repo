import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { sha256Hex } from "@/lib/idempotency";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { issuerDid } from "@/lib/did-key";
import { metricsMonth } from "@/lib/metrics";
import { submitDigestToOts } from "@/services/anchor-submit";
import type { OtsAnchor } from "@/services/anchor-log";
import {
  readableMonths,
  storeMonthFigures,
  type StoreMonthFigures,
} from "@/services/store-figures";
import type { Env } from "@/types";

/**
 * THE STORE'S OWN MONTH, SIGNED — the third hash chain.
 *
 * WHAT THIS IS FOR. This store publishes a signed, hash-chained,
 * Bitcoin-anchored record of what it observed at OTHER people's doors
 * and asks strangers to cite it. Its own numbers had no such record:
 * the pulse and the books are live surfaces that move under a reader,
 * the Gazette is prose under the keeper's pen, and the digest's
 * store-buyers section is a page only the keeper sees. So the one
 * party asking to be taken on evidence kept the least evidence about
 * itself. This closes that, on the same terms we ask of everybody
 * else: frozen at a date, signed, linked to the entry before it,
 * stamped into Bitcoin time, free to read and free to cite.
 *
 * WHY MONTHLY AND NOT WEEKLY (2026-09-22, the keeper's ruling). The
 * funnel is recorded by month — `metricsMonth`, the pulse's windows
 * and the signal store's rows are all month-keyed, and nothing
 * records a week. A weekly record would have had to either invent a
 * week bucket that cannot be backfilled, or print month-to-date
 * numbers under a weekly heading, which is precisely the defect the
 * counters project spent a day removing. The window matches the
 * instrument that exists.
 *
 * WHAT IT DOES NOT CLAIM. Every figure is a count off our own
 * counters, which is a claim about our bookkeeping and not an
 * independent audit of it — nobody outside has checked these numbers
 * and this record does not pretend otherwise. `ots.status` is
 * `pending` until a calendar upgrades it, and `pending` means a
 * calendar took the digest, not that Bitcoin confirmed it. The chain
 * proves the rows have not been edited SINCE they were sealed; it
 * cannot prove they were right when they were written.
 */

/** The chain is its own schema, versioned, so a reader can pin it. */
export interface StoreMonthDocument {
  version: 1;
  /** 1-based, contiguous. The chain's position. */
  sequence: number;
  taken_at: string;
  /** The digest this entry extends; null only for the first entry. */
  previous_digest: string | null;
  /** What produced the figures. One source today. */
  source: "store_figures";
  /** The ISO month this entry freezes, e.g. 2026-09. */
  month: string;
  /** Who signed it — did:web, with did:key beside it in the DID document. */
  issuer: string;
  /** The month's figures, verbatim as the instruments reported them. */
  figures: StoreMonthFigures;
}

export interface StoreMonthRecord {
  document: StoreMonthDocument;
  /** sha256 of the canonical document, hex. */
  digest: string;
  /** ed25519 over the canonical document, the store's live key. */
  signature: string;
  public_key: string;
  ots?: OtsAnchor;
}

/**
 * FIXED FIELD ORDER, the same law as the corpus and the anchor log.
 * Everything here comes from the document as published, so a stranger
 * who fetches the entry can reproduce this string byte for byte and
 * check both the digest and the signature with their own tools.
 *
 * `figures` rides as a nested object on purpose: JSON.stringify emits
 * its keys in insertion order, and store-figures.ts builds it in one
 * place with a literal, so the order is fixed there rather than
 * restated here. Restating it would be two field lists to keep in
 * step, which is the failure this store names derive-or-refuse.
 */
export function canonicalizeStoreMonth(document: StoreMonthDocument): string {
  return JSON.stringify({
    version: document.version,
    sequence: document.sequence,
    taken_at: document.taken_at,
    previous_digest: document.previous_digest,
    source: document.source,
    month: document.month,
    issuer: document.issuer,
    figures: document.figures,
  });
}

function storeMonthKey(sequence: number): string {
  return `${KV_KEYS.storeMonthPrefix}${String(sequence).padStart(9, "0")}`;
}

/**
 * Ceiling on a chain scan. Named because an unnamed cap is a silent
 * one: at one entry a month this outlives the store by centuries, but
 * the number is here to be read rather than discovered.
 */
export const STORE_MONTH_SCAN_CAP = 1000;

/**
 * The whole chain, in sequence order, and whether the scan saw all of
 * it. `truncated` travels with the rows rather than being dropped: a
 * chain read to its cap and reported as whole is a verifier saying
 * "intact" about entries it never looked at.
 */
export interface StoreMonthChain {
  records: StoreMonthRecord[];
  truncated: boolean;
}

export async function listStoreMonths(env: Env): Promise<StoreMonthChain> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.storeMonthPrefix,
    cap: STORE_MONTH_SCAN_CAP,
  });
  const found = await bulkGetJson<StoreMonthRecord>(env.COUNTERS, listed.names);
  const records = listed.names
    .map((name) => found.get(name))
    .filter((record): record is StoreMonthRecord => Boolean(record))
    .sort((a, b) => a.document.sequence - b.document.sequence);
  return { records, truncated: listed.truncated };
}

export async function latestStoreMonth(
  env: Env,
): Promise<StoreMonthRecord | null> {
  const { records } = await listStoreMonths(env);
  return records[records.length - 1] ?? null;
}

export async function getStoreMonth(
  env: Env,
  month: string,
): Promise<StoreMonthRecord | null> {
  const { records } = await listStoreMonths(env);
  return records.find((record) => record.document.month === month) ?? null;
}

export type StoreMonthPass =
  | { sealed: true; record: StoreMonthRecord }
  | { sealed: false; reason: string };

export interface SealOptions {
  now?: Date;
  /** Injected in tests; the real one talks to the OTS calendars. */
  submit?: typeof submitDigestToOts;
  /** Skip the calendar round trip entirely (the cron does not wait on it). */
  anchor?: boolean;
}

/**
 * Seal one month into the chain.
 *
 * IDEMPOTENT PER MONTH — the cron can call this every Sunday and the
 * chain grows by at most one entry per month, because the month is the
 * identity. This differs from the corpus, whose identity is the
 * round's own stamp so a hand-run and a cron run both stand: there is
 * only one September, and a second September entry would be a second
 * answer to a question with one answer.
 *
 * REFUSES THE MONTH IN PROGRESS. A record that freezes a month still
 * being written is a snapshot of a number that will be wrong tomorrow,
 * signed as though it were final. The digest's store-buyers section is
 * where a month-to-date reading belongs, and it says so on its face.
 *
 * REFUSES A MONTH THE PULSE CANNOT SEE. The pulse keeps a trailing
 * window; past it, `storeMonthFigures` returns zeros because there is
 * nothing to read, and sealing that would sign an absence as an
 * observation. The refusal names the months that can still be sealed.
 *
 * THE OTS SUBMISSION FAILS SOFT, same discipline as the other two
 * chains: the record is ours and already stored by the time any
 * calendar can disappoint us, and a failed stamp is a recorded state
 * the next pass can retry rather than a thrown one that loses the
 * month.
 */
export async function sealStoreMonth(
  env: Env,
  month: string,
  options: SealOptions = {},
): Promise<StoreMonthPass> {
  const now = options.now ?? new Date();
  if (month === metricsMonth(now)) {
    return {
      sealed: false,
      reason: `${month} is the month in progress — a month is sealed once it has closed`,
    };
  }
  const existing = await getStoreMonth(env, month);
  if (existing) {
    return { sealed: false, reason: `${month} is already sealed` };
  }
  const readable = await readableMonths(env);
  if (!readable.includes(month)) {
    return {
      sealed: false,
      reason: `the pulse no longer carries ${month} — it carries ${readable.join(", ") || "nothing"}`,
    };
  }
  const { records } = await listStoreMonths(env);
  const previous = records[records.length - 1];
  const document: StoreMonthDocument = {
    version: 1,
    sequence: (previous?.document.sequence ?? 0) + 1,
    taken_at: now.toISOString(),
    previous_digest: previous?.digest ?? null,
    source: "store_figures",
    month,
    issuer: issuerDid(env.STORE_BASE_URL),
    figures: await storeMonthFigures(env, month),
  };
  const canonical = canonicalizeStoreMonth(document);
  const digest = await sha256Hex(canonical);
  const { signature, publicKey } = await signMessage(canonical, env.SIGNING_KEY);
  const record: StoreMonthRecord = {
    document,
    digest,
    signature,
    public_key: publicKey,
  };
  // Stored BEFORE the calendar is asked, so a calendar that hangs or
  // refuses cannot cost us the month.
  await kvPut(
    env.COUNTERS,
    storeMonthKey(document.sequence),
    JSON.stringify(record),
  );
  if (options.anchor === false) return { sealed: true, record };
  const submit = options.submit ?? submitDigestToOts;
  const stamped: StoreMonthRecord = {
    ...record,
    ots: await submit(digest, { now }),
  };
  await kvPut(
    env.COUNTERS,
    storeMonthKey(document.sequence),
    JSON.stringify(stamped),
  );
  return { sealed: true, record: stamped };
}

/** One entry's verdict, and why. */
export interface StoreMonthCheck {
  sequence: number;
  month: string;
  digest_matches: boolean;
  signature_valid: boolean;
  links_to_previous: boolean;
}

export interface StoreMonthVerdict {
  entries: number;
  intact: boolean;
  checks: StoreMonthCheck[];
  /** Every way this chain is not whole, named. Empty when it is. */
  faults: string[];
}

/**
 * Verify the chain the way a stranger would: recompute every digest
 * from the published document, check every signature against the key
 * the entry names, and walk the links.
 *
 * A DIGEST THAT DOES NOT MATCH IS NOT A SIGNATURE FAILURE, and both
 * are reported per entry rather than collapsed into one boolean,
 * because the three faults mean three different things: an edited
 * document, a key that did not sign it, and an entry spliced out of
 * the middle.
 */
export async function verifyStoreMonthChain(
  env: Env,
): Promise<StoreMonthVerdict> {
  const { records, truncated } = await listStoreMonths(env);
  const checks: StoreMonthCheck[] = [];
  const faults: string[] = [];
  if (truncated) {
    faults.push(
      `the chain scan stopped at its ${STORE_MONTH_SCAN_CAP}-entry cap — entries past it were not checked`,
    );
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const document = record.document;
    const canonical = canonicalizeStoreMonth(document);
    const digest = await sha256Hex(canonical);
    const digestMatches = digest === record.digest;
    const signatureValid = await verifyMessageSignature(
      canonical,
      record.signature,
      record.public_key,
    );
    const expectedPrevious = index === 0 ? null : records[index - 1]!.digest;
    const linksToPrevious = document.previous_digest === expectedPrevious;
    if (!digestMatches) {
      faults.push(
        `${document.month} (#${document.sequence}): the document does not hash to its recorded digest`,
      );
    }
    if (!signatureValid) {
      faults.push(
        `${document.month} (#${document.sequence}): the signature does not verify against the key the entry names`,
      );
    }
    if (!linksToPrevious) {
      faults.push(
        `${document.month} (#${document.sequence}): previous_digest does not name the entry before it`,
      );
    }
    if (document.sequence !== index + 1) {
      faults.push(
        `${document.month}: sequence ${document.sequence} sits at position ${index + 1} — the chain is not contiguous`,
      );
    }
    checks.push({
      sequence: document.sequence,
      month: document.month,
      digest_matches: digestMatches,
      signature_valid: signatureValid,
      links_to_previous: linksToPrevious,
    });
  }
  return {
    entries: records.length,
    intact: faults.length === 0,
    checks,
    faults,
  };
}

/**
 * Every closed month the pulse can still see and the chain has not
 * sealed. The cron seals these oldest first, so a month missed while
 * the store was down is picked up on the next pass rather than lost —
 * the hole the registry press created for W36 and had to backfill by
 * hand.
 */
export async function unsealedMonths(
  env: Env,
  now: Date = new Date(),
): Promise<string[]> {
  const current = metricsMonth(now);
  const [readable, chain] = await Promise.all([
    readableMonths(env),
    listStoreMonths(env),
  ]);
  const sealed = new Set(chain.records.map((record) => record.document.month));
  return readable
    .filter((month) => month !== current && !sealed.has(month))
    .sort();
}
