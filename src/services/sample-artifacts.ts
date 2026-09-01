import { PREFLIGHT_BATTERY, probeOnce, runChecks } from "@/services/preflight";
import {
  AUDIT_CRITERIA_VERSION,
  AUDIT_SCOPE,
  auditCriteriaNote,
  type ServiceAuditObservation,
} from "@/services/service-audit";
import type { Env } from "@/types";

/**
 * THE FREE SAMPLE OF A PAID ARTIFACT (#31, 2026-08-29).
 *
 * THE GAP. Every paid artifact here is described in prose and shown
 * to nobody. A buyer deciding whether $5 is worth it can read what
 * the Once-Over claims to be and cannot read one. Exactly one item on
 * the shelf has ever had a sample — the luckies card, which serves a
 * watermarked SPECIMEN at /luckies/sample.svg — and the pattern was
 * never extended to the artifacts anybody actually evaluates.
 *
 * THE DANGEROUS WAY TO BUILD THIS, WHICH WAS THE FIRST DESIGN AND WAS
 * WRONG. The obvious move is to call `performServiceAudit` against a
 * canned response: same code path, guaranteed no drift, one line.
 * That function SIGNS. It signs unconditionally, at the end, with the
 * store's live key — so the "sample" would have been a genuine
 * ed25519 signature from this store over an observation of a probe we
 * never made, published free, at a stable URL. That artifact would
 * verify. Anybody could hand it to anybody. It is difficult to think
 * of a worse thing for an evidence observatory to publish.
 *
 * So the sample is built from the machinery BELOW the signature —
 * `probeOnce` and `runChecks`, the same two functions the paid audit
 * runs — and the signing step simply does not exist on this path.
 * There is no flag to get wrong. The specimen cannot be signed
 * because nothing here can sign.
 *
 * THE SAMPLE DOOR FAILS ON PURPOSE. A specimen where every check
 * passes shows a reader a column of green ticks and teaches them
 * nothing about what they are buying — the instrument's value is
 * entirely in what it catches. So the canned door below answers a 402
 * that is wrong in a way real doors are wrong, and the sample shows
 * the finding, named, in the vocabulary the paid artifact uses.
 *
 * FIXED IN TIME, so the bytes are stable: a sample that churned every
 * request would be uncacheable, undiffable, and would imply a probe
 * was run for the reader, which is exactly the impression this file
 * exists to avoid giving.
 */

/**
 * `.example` is IANA-reserved (RFC 2606) and can never resolve, so
 * this cannot be mistaken for an observation about a real operator —
 * and no amount of misreading turns it into one. The store's
 * probe-target law is never invoked: nothing is dialled.
 */
export const SAMPLE_SUBJECT_URL =
  "https://a-shop-that-sells-widgets.example/api/widget";

/** The moment the specimen is frozen at. Not now, deliberately. */
export const SAMPLE_OBSERVED_AT = "2026-08-29T00:00:00.000Z";

/** An id no lookup will ever resolve, and which says so in itself. */
export const SAMPLE_AUDIT_ID = "saudit_specimen_not_a_real_audit";

export const SAMPLE_MARK = "SPECIMEN";

const NOT_SIGNED =
  "This sample is NOT signed and will NOT verify, and that is the difference between it and the thing it is a sample of. A purchased Once-Over carries an ed25519 signature over its own bytes plus the public key that checks it, and answers at /api/verify/{id} forever. This carries neither and answers nowhere. If you are ever handed one of these as evidence about anybody, the missing signature is your answer.";

const NOT_ABOUT_ANYONE =
  "The endpoint named here does not exist and cannot: .example is a reserved domain (RFC 2606) that never resolves. No request was made to produce this, no host was contacted, and nothing here is an observation about any real operator. The failures shown are constructed to demonstrate what the instrument reports when it finds something.";

/**
 * A 402 THAT IS WRONG IN THE MOST INSTRUCTIVE WAY WE KNOW.
 *
 * The first draft of this door had no PAYMENT-REQUIRED header at all.
 * The battery short-circuits there — correctly, since a body-only
 * challenge fails every standard client — and the sample came out two
 * rows long. Two rows tells a buyer nothing about a battery's depth,
 * so the sample was demonstrating the instrument's exit path rather
 * than its work. The differential test caught the thinness; the fix
 * was to move the defect deeper.
 *
 * So this door is structurally correct all the way down and then
 * prices itself in DECIMALS — `maxAmountRequired: "0.01"` where the
 * scheme requires atomic units. That is a real defect the census
 * finds in the wild, and it is the most useful one this sample could
 * carry, because of where the two batteries land on it: v1's frozen
 * core passes the door, and v2 (the paid headline since 2026-09-01)
 * catches it. One artifact, two verdicts, disagreeing — which is
 * exactly the property a buyer is paying $5 to have somebody run
 * for them, and the thing a prose description of this product has
 * never been able to show.
 */
function cannedChallenge(): Response {
  const challenge = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        /* Decimal dollars where atomic units belong: the whole point. */
        amount: "0.01",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x00000000000000000000000000000000000000ff",
        resource: SAMPLE_SUBJECT_URL,
        description: "One widget",
        mimeType: "application/json",
        maxTimeoutSeconds: 300,
      },
    ],
  };
  return new Response(JSON.stringify(challenge), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)),
    },
  });
}

export interface SampleArtifact {
  specimen: true;
  mark: string;
  what_this_is: string;
  not_signed: string;
  not_about_anyone: string;
  of_item: string;
  price_of_the_real_thing: string;
  buy_url: string;
  sample: Omit<ServiceAuditObservation, "evidence_hash">;
}

const WHAT_THIS_IS =
  "A free, unsigned sample of the Once-Over — the $5 signed audit of one x402 endpoint at one moment. Every field below is the field a buyer gets, produced by the same check battery the paid artifact runs, against a constructed door that fails on purpose so the sample shows the instrument finding something rather than a column of ticks.";

/**
 * Build the specimen. Takes `env` only because the check battery does;
 * nothing is read from KV and nothing is written anywhere.
 */
export async function sampleOnceOver(
  env: Env,
  price: number,
): Promise<SampleArtifact> {
  const outcome = await probeOnce(
    SAMPLE_SUBJECT_URL,
    (async () => cannedChallenge()) as unknown as typeof fetch,
    "",
    env,
  );
  const ran = runChecks(
    outcome.response,
    outcome.bodyOverLimit,
    outcome.body,
    SAMPLE_SUBJECT_URL,
  );
  const v1Verdict = ran.checks.every((check) => check.ok) ? "ready" : "not_ready";
  const v2Checks = [...ran.checks, ...(ran.l3b ?? [])];
  const v2Verdict = v2Checks.every((check) => check.ok) ? "ready" : "not_ready";
  return {
    specimen: true,
    mark: SAMPLE_MARK,
    what_this_is: WHAT_THIS_IS,
    not_signed: NOT_SIGNED,
    not_about_anyone: NOT_ABOUT_ANYONE,
    of_item: "service_audit",
    price_of_the_real_thing: `$${price}`,
    buy_url: `${env.STORE_BASE_URL}/api/buy/service_audit`,
    sample: {
      audit_id: SAMPLE_AUDIT_ID,
      url: SAMPLE_SUBJECT_URL,
      observed_at: SAMPLE_OBSERVED_AT,
      /* The same sentence the paid artifact prints, not a copy of it. */
      criteria: auditCriteriaNote(env.STORE_BASE_URL),
      verdict: v2Verdict,
      checks: v2Checks,
      advisories: ran.advisories,
      /*
       * THE SECOND READING, and the differential test is what put it
       * here — the sample shipped without it and the paid artifact
       * has carried it since 2026-08-28. Omitting it would have made
       * the sample quietly cheaper than the product, on the one field
       * that shows why the two batteries exist.
       *
       * Computed from the L3b trio only. The paid version also folds
       * the Solana rail read, which is a NETWORK call; nothing is
       * dialled to build a specimen, so the difference line says so
       * rather than implying a read we did not do.
       */
      also_under: {
        battery: PREFLIGHT_BATTERY,
        verdict: v1Verdict,
        difference: `${AUDIT_CRITERIA_VERSION} folds the L3b consistency trio into the verdict; ${PREFLIGHT_BATTERY} reports the same observations as advisories. On this constructed probe the two batteries ${v1Verdict === v2Verdict ? "agreed" : "DISAGREED"} \u2014 which is the whole reason a purchased report carries both. On a REAL purchase the ${AUDIT_CRITERIA_VERSION} reading also folds the Solana rail read; no network call was made to build this specimen, so that check is absent here and present there.`,
      },
      scope: AUDIT_SCOPE,
    },
  };
}
