import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_NETWORK } from "@/lib/payments";
import { newCertId } from "@/lib/ids";
import { signCertificate } from "@/lib/signing";
import { makerMarkFor } from "@/store/provenance";
import type {
  Certificate,
  CertificateRecord,
  Env,
  PatronRecord,
} from "@/types";

/**
 * Every purchase mints: a sequential patron number, a signed certificate,
 * and a badge URL. Stored in PATRONS, verifiable at /api/verify/:cert_id.
 *
 * KV has no atomic increment, so patron numbers are allocated by claiming
 * the patron record itself: write the record at the candidate number, read
 * it back, and walk forward if another purchase won the slot. Same-colo KV
 * reads see their own writes, which closes the common race window; the
 * rarer cross-colo window is documented in the README.
 */

export interface MintedCertificate {
  certificate: Certificate;
  signature: string;
  publicKey: string;
  patronNumber: number;
  badgeUrl: string;
  verifyUrl: string;
}

const PATRON_CLAIM_RETRIES = 8;

async function claimPatronNumber(
  env: Env,
  record: Omit<PatronRecord, "patron_number">,
): Promise<number> {
  const current = await env.COUNTERS.get(KV_KEYS.patronNumber);
  let candidate = (current ? parseInt(current, 10) : 0) + 1;

  for (let attempt = 0; attempt < PATRON_CLAIM_RETRIES; attempt += 1) {
    const existing = await env.PATRONS.get<PatronRecord>(
      KV_KEYS.patron(candidate),
      "json",
    );
    if (existing && existing.cert_id !== record.cert_id) {
      candidate += 1;
      continue;
    }
    await env.PATRONS.put(
      KV_KEYS.patron(candidate),
      JSON.stringify({ ...record, patron_number: candidate }),
    );
    const readback = await env.PATRONS.get<PatronRecord>(
      KV_KEYS.patron(candidate),
      "json",
    );
    if (readback && readback.cert_id === record.cert_id) {
      await env.COUNTERS.put(KV_KEYS.patronNumber, String(candidate));
      return candidate;
    }
    candidate += 1;
  }
  // Retries exhausted under heavy contention: take the slot anyway rather
  // than turn a paying customer away. Worst case two badges share a number.
  await env.PATRONS.put(
    KV_KEYS.patron(candidate),
    JSON.stringify({ ...record, patron_number: candidate }),
  );
  await env.COUNTERS.put(KV_KEYS.patronNumber, String(candidate));
  return candidate;
}

export interface MintOptions {
  itemId: string;
  agentName?: string;
  tipUsdc?: number;
  /** certificate_of_patronage: the badge gets nicer. */
  patronage?: boolean;
  /** Purchase fell in the item's first listed week; the cert says so. */
  witness?: boolean;
  /** coffees_for_closers: the buyer's win, recorded verbatim. */
  win?: string;
  /** graffiti_on_a_train: the buyer's tag, recorded verbatim. */
  tag?: string;
  /**
   * settlement_attestation: the observation's evidence hash, bound
   * into the certificate so /api/verify covers the attestation too.
   * No new verification endpoint: the one that already exists now
   * answers for this artifact as well.
   */
  attests?: string;
  /**
   * WHAT WAS ACTUALLY PAID, and by whom. Passed straight from the
   * settled payment rather than reconstructed from the item's list
   * price: an item's price can change, and a receipt that recomputes
   * the amount from today's menu would quietly restate history.
   */
  paidUsdc?: number;
  payer?: string;
  settlementTx?: string;
}

/** Shelf witness mark. Catalog history, not a trophy. */
export const WITNESS_NOTE = "Witness to first week of availability.";

export async function mintCertificate(
  env: Env,
  options: MintOptions,
): Promise<MintedCertificate> {
  const certId = newCertId();
  const date = new Date().toISOString();

  const patronStub: Omit<PatronRecord, "patron_number"> = {
    cert_id: certId,
    item: options.itemId,
    date,
    ...(options.agentName ? { name: options.agentName } : {}),
    ...(options.patronage ? { patronage: true } : {}),
  };
  const patronNumber = await claimPatronNumber(env, patronStub);

  const certificate: Certificate = {
    cert_id: certId,
    item: options.itemId,
    patron_number: patronNumber,
    date,
  };
  if (options.agentName) {
    certificate.name = options.agentName;
  }
  if (options.tipUsdc && options.tipUsdc > 0) {
    certificate.tip_usdc = options.tipUsdc;
  }
  /**
   * The money rides only where money actually moved. Free-shelf
   * artifacts get no payment fields at all rather than a zero, because
   * a zero is a claim that nothing was paid and an absence is a claim
   * that this was never a purchase — different facts, and the free
   * shelf is the second one.
   */
  if (options.paidUsdc !== undefined && options.paidUsdc > 0) {
    certificate.paid_usdc = options.paidUsdc;
    certificate.asset = "USDC";
    certificate.network = BASE_NETWORK;
  }
  if (options.payer) {
    certificate.payer = options.payer;
  }
  if (options.settlementTx) {
    certificate.settlement_tx = options.settlementTx;
  }
  if (options.witness) {
    certificate.note = WITNESS_NOTE;
  }
  if (options.win) {
    certificate.win = options.win;
  }
  if (options.tag) {
    certificate.tag = options.tag;
  }
  if (options.attests) {
    certificate.attests = options.attests;
  }
  /**
   * THE MAKER'S MARK IS DERIVED, NEVER PASSED IN. A provenance claim a
   * caller could supply is a provenance claim a caller could get wrong,
   * and this field's whole job is to be the thing nobody has to take on
   * trust. It comes from one table keyed by item id, so a shelf cannot
   * mark itself and the answer is the same on every code path that
   * mints for that item.
   */
  const mark = makerMarkFor(options.itemId);
  if (mark) {
    certificate.made_by = mark;
  }

  const { signature, publicKey } = await signCertificate(
    certificate,
    env.SIGNING_KEY,
  );
  const certRecord: CertificateRecord = {
    certificate,
    signature,
    public_key: publicKey,
  };
  await env.PATRONS.put(KV_KEYS.cert(certId), JSON.stringify(certRecord));

  return {
    certificate,
    signature,
    publicKey,
    patronNumber,
    badgeUrl: `${env.STORE_BASE_URL}/badges/${patronNumber}.svg`,
    verifyUrl: `${env.STORE_BASE_URL}/api/verify/${certId}`,
  };
}

export async function getCertificate(
  env: Env,
  certId: string,
): Promise<CertificateRecord | null> {
  return env.PATRONS.get<CertificateRecord>(KV_KEYS.cert(certId), "json");
}

export async function getPatron(
  env: Env,
  patronNumber: number,
): Promise<PatronRecord | null> {
  return env.PATRONS.get<PatronRecord>(KV_KEYS.patron(patronNumber), "json");
}
