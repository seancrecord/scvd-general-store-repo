/**
 * advertised-version-unpayable, the paid-side detector.
 *
 * A door answers a correctly signed payment — presented in the
 * protocol version its OWN challenge advertised — by re-serving that
 * same offer, as though nothing had been presented. The buyer that
 * followed the instructions is the one that cannot pay, no money
 * moves, and the door has no failed payment to look at.
 *
 * Found by paying, on the 2026-09-12 walk. The class and its falsifier
 * are in docs/DEFECT_CANDIDATE_ADVERTISED_VERSION_2026-09.md; the
 * research-side reading lives in scripts/lib/walkabout.mjs and this is
 * the same rule for the paid instrument, so a buyer can obtain the
 * finding rather than read about it in our field notes.
 *
 * THE COMPARISON IS THE FIVE MATERIAL TERMS, NOT THE WHOLE OFFER.
 * That narrowing is the operator's correction, taken: comparing
 * accepts[] whole would score clean on any door carrying a per-request
 * nonce, expiry or rotating timeout — the more careful half of the
 * ecosystem — so everything outside scheme, network, payTo, asset and
 * amount is allowed to vary, the way the error prose already was.
 *
 * NOTHING HERE EVER RETURNS A QUIET CLEAN. Every answer says whether
 * the question could be asked at all: `checked: false` means this
 * reading proves nothing about the door, and is a different fact from
 * `present: false`. An instrument that reads nothing and reports fine
 * gets believed.
 */

export type MaterialTerms = {
  scheme: string | null;
  network: string | null;
  payTo: string | null;
  asset: string | null;
  amount: string | null;
};

export type AdvertisedVersionReading =
  | { checked: false; present: null; reason: string }
  | { checked: true; present: boolean; reason: string };

type Accept = {
  scheme?: unknown;
  network?: unknown;
  payTo?: unknown;
  asset?: unknown;
  amount?: unknown;
  maxAmountRequired?: unknown;
};

const lower = (value: unknown): string | null =>
  typeof value === "string" && value ? value.toLowerCase() : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number" ? String(value) : null;

/** The five terms a buyer's signature actually commits to. */
export function materialTerms(accept: Accept | null | undefined): MaterialTerms {
  return {
    scheme: typeof accept?.scheme === "string" ? accept.scheme : null,
    network: lower(accept?.network),
    payTo: lower(accept?.payTo),
    asset: lower(accept?.asset),
    amount: asString(accept?.amount) ?? asString(accept?.maxAmountRequired),
  };
}

export function advertisedVersionUnpayable({
  paymentSubmitted,
  paidStatus,
  unpaidAccepts,
  paidAccepts,
}: {
  paymentSubmitted: boolean;
  paidStatus: number | null;
  unpaidAccepts: Accept[] | null | undefined;
  paidAccepts: Accept[] | null | undefined;
}): AdvertisedVersionReading {
  if (!paymentSubmitted) {
    return { checked: false, present: null, reason: "no payment was presented on this attempt" };
  }
  if (typeof paidStatus !== "number") {
    return { checked: false, present: null, reason: "no status recorded for the paid attempt" };
  }
  if (paidStatus < 400) {
    return {
      checked: true,
      present: false,
      reason: `the door answered ${paidStatus} to the presented payment, not a refusal`,
    };
  }
  if (!Array.isArray(unpaidAccepts) || unpaidAccepts.length === 0) {
    return { checked: false, present: null, reason: "no unpaid challenge recorded to compare against" };
  }
  if (!Array.isArray(paidAccepts) || paidAccepts.length === 0) {
    return {
      checked: true,
      present: false,
      reason: "the refusal carried no offer, so the door said something about the payment rather than re-serving its terms",
    };
  }
  const terms = (list: Accept[]) => JSON.stringify(list.map(materialTerms));
  if (terms(unpaidAccepts) !== terms(paidAccepts)) {
    return {
      checked: true,
      present: false,
      reason: "the refusal carried different material terms, so the door re-quoted rather than ignoring the payment",
    };
  }
  return {
    checked: true,
    present: true,
    reason: `the door answered the presented payment with ${paidStatus} and the same material terms it offered unpaid (scheme, network, payTo, asset, amount), so the payment was not read`,
  };
}

/**
 * The stage line. It is written for the buyer holding the report, so
 * it names what the door did and what it does NOT establish — in
 * particular the variant this class deliberately does not claim: a
 * door that accepts the newer version, settles, delivers, and logs
 * nothing because its request log keys on the older header. Nothing
 * buyer-side can observe that one.
 */
export function advertisedVersionDetail(reading: AdvertisedVersionReading): string {
  if (!reading.checked) {
    return `advertised-version-unpayable: not checked — ${reading.reason}. This is a gap in this walk, not a clean reading of the door.`;
  }
  if (!reading.present) {
    return `advertised-version-unpayable: not present — ${reading.reason}.`;
  }
  return `advertised-version-unpayable: PRESENT — ${reading.reason}. The payment was signed against this door's own advertised terms in the version its challenge named, so a buyer following the instructions cannot pay and the seller sees no failed payment to investigate. See https://scvd.store/defects/advertised-version-unpayable.`;
}
