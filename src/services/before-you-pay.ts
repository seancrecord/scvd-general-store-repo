import {
  PREFLIGHT_VERSION,
  preflightUrl,
  type PreflightReport,
} from "@/services/preflight";
import {
  simulatePayment,
  SIMULATED_CAP_LABEL,
  type ClientProfile,
  type SimulatedPayment,
} from "@/lib/client-simulator";
import type { Env } from "@/types";

/**
 * THE PAYMENT DRY RUN, AS A DOOR (#96, 2026-08-28).
 *
 * THE HOLE THIS CLOSES. Every free instrument this store offers asks
 * a question about somebody else's ENDPOINT — does it answer, is the
 * challenge well-formed, does the artifact verify. Nothing asked the
 * question a buyer actually has at the moment of spending: *will my
 * client pay this, and what will it pick?*
 *
 * A door can pass the whole preflight and still be unpayable by the
 * agent reading the verdict — that is not a hypothetical, it is the
 * finding of 2026-08-28 restated. Thirteen of this store's own
 * priced doors were in exactly that state, and the shape of it in
 * our books was apathy: a challenge served, and then nothing.
 *
 * ONE PROBE, TWO READINGS. This makes no request of its own. It
 * calls `preflightUrl`, which knocks once under the shared limiter
 * and the shared target law, and hands back the accepts it parsed —
 * and the simulation runs on THOSE bytes. Knocking twice would be
 * two moments, and a door that changed between them would have this
 * store publishing a shape check and a payability reading that
 * quietly describe different doors. The same discipline that makes
 * preflight v1 and v2 share an observation and differ only in what
 * they count.
 *
 * IT IS FREE, AND THAT IS THE POSITIONING, NOT A PROMOTION. The
 * keeper's ruling of 2026-08-28 on the paid-MCP question: the checks
 * stay free, the convenience is what is paid. What makes any verdict
 * here worth reading is that we run the instruments on anyone,
 * including our competitors, for nothing. Putting buyer-competence
 * behind a till would have bought a small revenue line with the
 * asset the whole observatory rests on.
 *
 * WHAT IS SOLD IS THE ARTIFACT. `good_buyer` is the same reading,
 * signed, dated and served at a permanent URL — the thing an agent
 * hands the human who asked why it spent the money. Evidence, not
 * access.
 */

export const BEFORE_YOU_PAY_VERSION = "v1";

export interface BeforeYouPayReport {
  version: string;
  url: string;
  /**
   * THE HEADLINE, and it is deliberately about the BUYER rather than
   * the door: the one sentence an agent should act on. `would_sign`
   * does not mean the purchase will succeed — nothing short of
   * paying establishes that — it means the client gets as far as a
   * signature instead of refusing on its own machine.
   */
  will_your_client_pay: SimulatedPayment["outcome"];
  your_client: SimulatedPayment;
  /**
   * The door's own shape, from the same probe. Carried whole rather
   * than summarized so this answer and the free preflight can never
   * be quoted against each other — they are the same bytes.
   */
  the_door: PreflightReport;
  /**
   * The distinction the whole tool exists to draw, said in the
   * response so nobody has to infer it from two verdicts.
   */
  these_are_different_questions: string;
  what_this_is_not: string;
  next_steps: Record<string, string>;
}

/**
 * The buyer's declared configuration, read defensively: this is a
 * body a stranger sent, and a field of the wrong type must narrow the
 * reading rather than throw. An unreadable profile is treated as no
 * profile, which produces the unconfigured-client answer — the
 * conservative direction, and the one the caveats already cover.
 */
export function readProfile(raw: unknown): ClientProfile {
  if (raw === null || typeof raw !== "object") {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const cap = source["max_amount_per_payment_usd"];
  const off = source["spend_controls_disabled"];
  return {
    ...(typeof cap === "number" && Number.isFinite(cap) && cap > 0
      ? { max_amount_per_payment_usd: cap }
      : cap === false
        ? { max_amount_per_payment_usd: false as const }
        : {}),
    ...(off === true ? { spend_controls_disabled: true } : {}),
  };
}

/**
 * The sentence that keeps two instruments from being read as one.
 * Published on every answer because the failure mode is a buyer who
 * reads `ready` and concludes "so I can pay it", which is precisely
 * the inference this store spent August learning is false.
 */
const TWO_QUESTIONS =
  "The preflight asks whether this DOOR serves a well-formed x402 challenge. This asks whether YOUR CLIENT will pay it. They are different questions with different answers: a door can be perfectly shaped and still unpayable by an unconfigured buyer, because the refusal happens on your machine before a signature exists — which means the operator never learns you tried, and sees only a request for a price followed by silence.";

const NOT =
  "Not a guarantee that the purchase succeeds. This walks your client's selection logic over the bytes that door served at one moment; it never touches a wallet, signs nothing, and cannot know whether the resource behind the 402 delivers. A would_sign quoted as 'this endpoint works' is a misquote, exactly as a passing preflight quoted as uptime is.";

export async function beforeYouPay(
  rawUrl: unknown,
  env: Env,
  profile: ClientProfile = {},
): Promise<{
  status: number;
  body: BeforeYouPayReport | { error: string };
  headers?: Record<string, string>;
}> {
  const base = env.STORE_BASE_URL;
  /*
   * EVERY REFUSAL IS THE PREFLIGHT'S REFUSAL, unchanged and
   * unrewritten: the URL validation, the private-address law, the
   * own-host answer, the rate limit and its Retry-After. A second
   * door with its own opinions about which targets are probeable is
   * how the private-address hole got in the first time; the fix then
   * was one law in one place, and this door inherits it rather than
   * agreeing with it.
   */
  const preflight = await preflightUrl(rawUrl, env, PREFLIGHT_VERSION);
  if (preflight.status !== 200 || !("verdict" in preflight.body)) {
    return {
      status: preflight.status,
      body: preflight.body as { error: string },
      ...(preflight.headers ? { headers: preflight.headers } : {}),
    };
  }

  /*
   * NO ACCEPTS MEANS THE DOOR NEVER GOT THAT FAR, and the honest
   * answer is `cannot_simulate` with the preflight's own finding
   * riding along — never a manufactured verdict about a client's
   * behaviour on bytes that do not exist.
   */
  const simulation = simulatePayment(preflight.accepts ?? [], profile);

  return {
    status: 200,
    ...(preflight.headers ? { headers: preflight.headers } : {}),
    body: {
      version: BEFORE_YOU_PAY_VERSION,
      url: String(rawUrl),
      will_your_client_pay: simulation.outcome,
      your_client: simulation,
      the_door: preflight.body,
      these_are_different_questions: TWO_QUESTIONS,
      what_this_is_not: NOT,
      next_steps: {
        signed_version: `${base}/api/buy/good_buyer — this exact reading, signed and bound into a certificate at a permanent URL, for handing to the human who asked why their agent spent the money.`,
        the_door_alone: `${base}/api/preflight/${PREFLIGHT_VERSION} — the shape check on its own, free, if the client half is not what you need.`,
        the_ceiling_explained: `${base}/pricing — why the stock client's ${SIMULATED_CAP_LABEL} ceiling exists, what this store does about its own over-cap doors, and the three legitimate answers to it.`,
      },
    },
  };
}
