import { NO_VERDICT } from "@/services/case-file";
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

/* ------------------------------------------------------------------ */
/* ROADMAP N3 (2026-09-01): the other flagship specimens.               */
/*                                                                      */
/* Same law as the Once-Over above: constructed against a door that     */
/* cannot exist, produced by the SAME arithmetic the paid artifact      */
/* runs (the watches' pure history builders; the attestation's own      */
/* classifier over a constructed receipt), unsigned, evidence_hash      */
/* withheld, and marked SPECIMEN in the body. A specimen that shows a   */
/* column of ticks teaches nothing, so each one is built to show the   */
/* instrument finding something — and the gaps counted against us.     */
/* ------------------------------------------------------------------ */

import {
  conformanceWatchHistoryOf,
  type ConformancePass,
  type ConformanceWatchHistory,
} from "@/services/conformance-watch";
import {
  watchHistoryOf,
  type StandingWatchRecord,
  type WatchHistory,
  type WatchProbe,
} from "@/services/standing-watch";
import { observeWithFacts, type SignedAttestation } from "@/services/attestation";
import { LAUNCH_CHECK_UA, type LaunchCheckObservation } from "@/services/launch-check";
import { BASE_EVM, TRANSFER_TOPIC } from "@/lib/base-rpc";

export type SampleSlug =
  | "once-over"
  | "conformance-watch"
  | "night-watch"
  | "launch-check"
  | "settlement-attestation"
  | "case-file";

export interface SampleEnvelope<T> {
  specimen: true;
  mark: string;
  what_this_is: string;
  not_signed: string;
  not_about_anyone: string;
  of_item: string;
  price_of_the_real_thing: string;
  buy_url: string;
  sample: T;
}

const SAMPLE_WEEK_START = "2026-08-22T00:00:00.000Z";
const SAMPLE_WEEK_END = "2026-08-29T00:00:00.000Z";
/** Read one hour after the week ended, so `complete` is true. */
const SAMPLE_READ_AT = Date.parse("2026-08-29T01:00:00.000Z");

const NOT_SIGNED_ROWS =
  "This sample is NOT signed and will NOT verify. On the real artifact every row carries its own ed25519 signature and the public key that checks it; here the rows carry neither, and no row here answers anywhere. If you are ever handed one of these as evidence about anybody, the missing signatures are your answer.";

function envelope<T>(
  env: Env,
  itemId: string,
  price: number,
  whatThisIs: string,
  notSigned: string,
  sample: T,
): SampleEnvelope<T> {
  return {
    specimen: true,
    mark: SAMPLE_MARK,
    what_this_is: whatThisIs,
    not_signed: notSigned,
    not_about_anyone: NOT_ABOUT_ANYONE,
    of_item: itemId,
    price_of_the_real_thing: `$${price}`,
    buy_url: `${env.STORE_BASE_URL}/api/buy/${itemId}`,
    sample,
  };
}

type UnsignedPass = Omit<ConformancePass, "signature" | "public_key">;
type UnsignedProbe = Omit<WatchProbe, "signature" | "public_key">;

/** The rows are unsigned by construction; the history builder does not read the signature fields. */
function unsignedRows<T>(rows: T[]): never[] {
  return rows as unknown as never[];
}

export function sampleConformanceWatch(
  env: Env,
  price: number,
): SampleEnvelope<ConformanceWatchHistory> {
  const day = (n: number): string =>
    new Date(Date.parse(SAMPLE_WEEK_START) + n * 24 * 3600_000 + 7 * 3600_000).toISOString();
  const passes: UnsignedPass[] = [
    { at: day(0), verdict: "ready", status: 402, failed: [], advisories: [], battery: "v1" },
    { at: day(1), verdict: "ready", status: 402, failed: [], advisories: [], battery: "v1" },
    { at: day(2), verdict: "ready", status: 402, failed: [], advisories: [], battery: "v1" },
    // Tuesday's deploy: the accepts amount became a decimal — the exact
    // defect the watch exists to catch mid-week.
    { at: day(3), verdict: "not_ready", status: 402, failed: ["amount-atomic-units"], advisories: [], battery: "v1" },
    // Day 4 is missing on purpose: our missed pass, counted against us.
    { at: day(5), verdict: "not_ready", status: 402, failed: ["amount-atomic-units"], advisories: [], battery: "v1" },
    { at: day(6), verdict: "ready", status: 402, failed: [], advisories: ["signed-offer-absent"], battery: "v1" },
  ];
  const history = conformanceWatchHistoryOf(
    {
      watch_id: "cwatch_specimen_not_a_real_watch",
      url: SAMPLE_SUBJECT_URL,
      started_at: SAMPLE_WEEK_START,
      ends_at: SAMPLE_WEEK_END,
      passes: unsignedRows(passes),
    },
    SAMPLE_READ_AT,
  );
  return envelope(
    env,
    "conformance_watch",
    price,
    "A free, unsigned sample of the Conformance Watch — seven days of signed daily checks on one x402 endpoint. Every field below is the field a buyer gets, derived by the same arithmetic the served history runs, over a constructed week in which a deploy broke the door on day four and the store itself missed day five.",
    NOT_SIGNED_ROWS,
    history,
  );
}

export function sampleNightWatch(env: Env, price: number): SampleEnvelope<WatchHistory> {
  const probes: UnsignedProbe[] = [];
  const start = Date.parse(SAMPLE_WEEK_START);
  for (let hour = 0; hour < 168; hour += 1) {
    // Hours 40–43: nothing probed at all — the store's own missed
    // rounds, derived at read and counted against the watcher.
    if (hour >= 40 && hour <= 43) continue;
    const at = new Date(start + hour * 3600_000).toISOString();
    // Hours 100–102: the door did not answer.
    if (hour >= 100 && hour <= 102) {
      probes.push({ at, verdict: "unreachable", failed: [], battery: "v1" });
      continue;
    }
    // Hour 120: the door answered, but its challenge no longer parsed.
    if (hour === 120) {
      probes.push({ at, verdict: "not_ready", status: 402, latency_ms: 412, failed: ["challenge-parses"], battery: "v1" });
      continue;
    }
    // Hour 64: a burst — the tick's three probes disagreed.
    if (hour === 64) {
      probes.push({
        at,
        verdict: "ready",
        status: 402,
        latency_ms: 233,
        failed: [],
        battery: "v1",
        burst: [
          { at, verdict: "ready", status: 402, latency_ms: 233 },
          { at: new Date(start + hour * 3600_000 + 4000).toISOString(), verdict: "unreachable" },
          { at: new Date(start + hour * 3600_000 + 8000).toISOString(), verdict: "ready", status: 402, latency_ms: 251 },
        ] as unknown as WatchProbe["burst"],
        burst_agreed: false,
      });
      continue;
    }
    probes.push({ at, verdict: "ready", status: 402, latency_ms: 180 + ((hour * 37) % 90), failed: [], battery: "v1" });
  }
  const record: StandingWatchRecord = {
    watch_id: "watch_specimen_not_a_real_watch",
    url: SAMPLE_SUBJECT_URL,
    started_at: SAMPLE_WEEK_START,
    ends_at: SAMPLE_WEEK_END,
    probes: unsignedRows(probes),
  };
  const history = watchHistoryOf(record, SAMPLE_READ_AT, env.STORE_BASE_URL);
  return envelope(
    env,
    "standing_watch",
    price,
    "A free, unsigned sample of the Night Watch — seven days of signed hourly probes on one x402 endpoint. Every field below is the field a buyer gets, derived by the same arithmetic the served history runs, over a constructed week with four hours nobody probed, three hours the door did not answer, one hour its challenge stopped parsing, and one burst whose three probes disagreed.",
    NOT_SIGNED_ROWS,
    history,
  );
}

const SAMPLE_TX_HASH = `0x${"0".repeat(60)}beef`;
/** The constructed purchase, in dollars and in USDC atomic units — one number, two spellings. */
const SAMPLE_PAID_USD = 0.005;
const SAMPLE_PAID_UNITS = BigInt(Math.round(SAMPLE_PAID_USD * 1_000_000));
const SAMPLE_PAYER = "0x00000000000000000000000000000000000000fe";
const SAMPLE_PAY_TO = "0x00000000000000000000000000000000000000ff";

export function sampleLaunchCheck(env: Env, price: number): SampleEnvelope<LaunchCheckObservation> {
  const walk: LaunchCheckObservation = {
    check_id: "lcheck_specimen_not_a_real_check",
    url: SAMPLE_SUBJECT_URL,
    observed_at: SAMPLE_OBSERVED_AT,
    ua_sent: LAUNCH_CHECK_UA,
    verdict: "settled",
    stages: [
      { stage: "approach", ok: true, detail: "One unpaid GET with the declared User-Agent; the door answered 402 in 188 ms." },
      { stage: "challenge", ok: true, detail: "PAYMENT-REQUIRED parsed: x402 v2, one accepts entry, exact scheme on eip155:8453." },
      { stage: "terms", ok: true, detail: `Cheapest rail Base USDC at $${SAMPLE_PAID_USD}; under the field spend cap; assetTransferMethod absent, read as eip3009.` },
      { stage: "screen", ok: true, detail: "payTo screened against the on-chain sanctions oracle: not listed." },
      { stage: "payment", ok: true, detail: "EIP-3009 authorization signed by the field wallet and presented in the PAYMENT-SIGNATURE header." },
      { stage: "settle", ok: true, detail: "The till answered 200 with a PAYMENT-RESPONSE naming a settlement transaction." },
      { stage: "delivery", ok: true, detail: "A JSON body arrived with the goods; the same payment presented again was refused, so nothing reached the seller twice." },
    ],
    paid_usd: SAMPLE_PAID_USD,
    pay_to: SAMPLE_PAY_TO,
    tx_hash: SAMPLE_TX_HASH,
    tx_hash_status: "confirmed_on_chain",
    tx_verification: {
      read: "receipt",
      chain: BASE_EVM.caip2,
      chain_status: "0x1",
      block_height: 34_000_000,
      confirmations: 12,
      observed_payer: SAMPLE_PAYER,
      observed_recipient: SAMPLE_PAY_TO,
      observed_amount_usdc: SAMPLE_PAID_USD,
      read_at: SAMPLE_OBSERVED_AT,
      detail: "Constructed for the specimen: on a real walk this is the store's own read of the chain, and the chain's copy is nobody's to edit.",
    },
    field_wallet: SAMPLE_PAYER,
  } as LaunchCheckObservation;
  return envelope(
    env,
    "launch_check",
    price,
    "A free, unsigned sample of the Launch Check — one real purchase attempt at one x402 endpoint, from the store's declared field wallet, recorded stage by stage. Every field below is the field a buyer gets; this walk is constructed to show a door that settles cleanly, so the seven stages read in order.",
    NOT_SIGNED,
    walk,
  );
}

type UnsignedAttestation = Omit<
  SignedAttestation,
  "signature" | "public_key" | "signature_covers" | "signature_jcs" | "signature_jcs_covers" | "evidence_hash"
>;

export async function sampleSettlementAttestation(
  env: Env,
  price: number,
): Promise<SampleEnvelope<UnsignedAttestation>> {
  const pad = (address: string): string => `0x${address.slice(2).padStart(64, "0")}`;
  const amount = SAMPLE_PAID_UNITS;
  const receipt = {
    status: "0x1",
    blockNumber: `0x${(34_000_000).toString(16)}`,
    logs: [
      {
        address: BASE_EVM.usdc,
        topics: [TRANSFER_TOPIC, pad(SAMPLE_PAYER), pad(SAMPLE_PAY_TO)],
        data: `0x${amount.toString(16).padStart(64, "0")}`,
      },
    ],
  };
  const signed = await observeWithFacts(
    env,
    { txHash: SAMPLE_TX_HASH },
    receipt,
    34_000_012,
    BASE_EVM,
    {},
    new Date(SAMPLE_OBSERVED_AT),
  );
  // Everything the classifier and the readings produced stays; the
  // signature material and the evidence hash go, because a specimen
  // must never look checkable.
  const {
    signature: _s,
    public_key: _k,
    signature_covers: _c,
    signature_jcs: _j,
    signature_jcs_covers: _jc,
    evidence_hash: _e,
    ...unsigned
  } = signed;
  return envelope(
    env,
    "settlement_attestation",
    price,
    "A free, unsigned sample of the Settlement Attestation — one signed observation of whether an x402 payment settled on chain. Every field below is the field a buyer gets, produced by the same classifier the paid artifact runs, over a constructed receipt that carries one USDC transfer, so the reading says SETTLED and names what that does and does not mean.",
    NOT_SIGNED.replace("Once-Over", "Settlement Attestation"),
    unsigned,
  );
}

/**
 * THE CASE FILE SPECIMEN (roadmap N8): the settlement specimen above,
 * assembled into the file's shape with every other section absent
 * and its reason stated — which is the honest picture of the usual
 * case, where this store observed the money and nothing else.
 */
export async function sampleCaseFile(
  env: Env,
  price: number,
): Promise<SampleEnvelope<Record<string, unknown>>> {
  const settlement = await sampleSettlementAttestation(env, price);
  const gaps = [
    { section: "reconciliation", reason: "the specimen's constructed receipt carries a transfer and no ceiling; the real desk reads both off the receipt" },
    { section: "mandate", reason: "no mandate_id was given; nothing was cited" },
    { section: "door", reason: "no endpoint url was given, so there is no door to look up" },
    { section: "delivery", reason: "delivery not observed by this store. This is the section a dispute usually turns on, and this store usually does not have it: nothing here saw what the seller sent after the money moved." },
  ];
  const sample: Record<string, unknown> = {
    artifact: "case_file",
    case_id: "case_specimen0000",
    assembled_at: SAMPLE_OBSERVED_AT,
    query: { tx_hash: SAMPLE_TX_HASH, chain: "evm", mandate_id: null, endpoint_url: null, launch_check_id: null },
    declared: {
      claim: "I paid and the tool returned an empty body.",
      expected_amount_usdc: null,
      payer: null,
      recipient: null,
      note: "The buyer's own inputs, stored verbatim and marked declared. Never checked, and never allowed to change what the chain or this store's records answered.",
    },
    settlement: { presence: { present: true }, attestation: settlement.sample },
    reconciliation: { presence: { present: false, reason: gaps[0]!.reason } },
    mandate: { presence: { present: false, reason: gaps[1]!.reason } },
    door: { presence: { present: false, reason: gaps[2]!.reason } },
    delivery: { presence: { present: false, reason: gaps[3]!.reason } },
    gaps,
    no_verdict: NO_VERDICT,
  };
  return envelope(
    env,
    "the_case_file",
    price,
    "A free, unsigned sample of the Case File — one signed assembly of everything this store observed about one purchase. This specimen carries the settlement section (the Settlement Attestation specimen, same classifier) and every other section absent with its reason, which is the usual shape: the store observed the money and nothing else, and says so. The real artifact is signed as a whole and each observed section is signed on its own.",
    NOT_SIGNED.replace("Once-Over", "Case File"),
    sample,
  );
}

export interface SampleListing {
  slug: SampleSlug;
  item: string;
  build: (env: Env, price: number) => Promise<SampleEnvelope<unknown>> | SampleEnvelope<unknown>;
}

/** Every specimen, once — the routes, the index and the item pages read this. */
export const SAMPLES: readonly SampleListing[] = [
  { slug: "once-over", item: "service_audit", build: (env, price) => sampleOnceOver(env, price) },
  { slug: "conformance-watch", item: "conformance_watch", build: (env, price) => sampleConformanceWatch(env, price) },
  { slug: "night-watch", item: "standing_watch", build: (env, price) => sampleNightWatch(env, price) },
  { slug: "launch-check", item: "launch_check", build: (env, price) => sampleLaunchCheck(env, price) },
  { slug: "settlement-attestation", item: "settlement_attestation", build: (env, price) => sampleSettlementAttestation(env, price) },
  { slug: "case-file", item: "the_case_file", build: (env, price) => sampleCaseFile(env, price) },
];

export function sampleForItem(itemId: string): SampleListing | undefined {
  return SAMPLES.find((entry) => entry.item === itemId);
}
