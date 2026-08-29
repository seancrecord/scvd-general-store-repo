import { PUBLISHED_LICENCE } from "@/lib/dataset-envelope";
import {
  freeInstrumentPrice,
  surfaceSecurity,
  type SurfaceError,
} from "@/store/surface-contract";
import { Hono, type Context } from "hono";
import {
  BEFORE_YOU_PAY_VERSION,
  beforeYouPay,
  readProfile,
} from "@/services/before-you-pay";
import { SIMULATED_CAP_LABEL } from "@/lib/client-simulator";
import { PREFLIGHT_VERSION } from "@/services/preflight";
import { lifecycleHeaders } from "@/store/api-lifecycle";
import type { HonoEnv } from "@/types";

/**
 * /api/before-you-pay — the buyer's half of the free ladder.
 *
 * The preflight and the conformance desk both point outward at
 * somebody else's work. This one points at the CALLER: given what
 * that door just served, what will your own client do with it. See
 * services/before-you-pay.ts for why that is a different question,
 * and lib/client-simulator.ts for how the replay stays faithful.
 */
export const beforeYouPayRoutes = new Hono<HonoEnv>();

/**
 * THE GET IS THE DOCUMENT, and like the preflight's it deliberately
 * carries the literal strings a stuck developer pastes into a search
 * box at the moment of failure — because the failure this tool
 * catches is SILENT on both sides. The operator sees no demand. The
 * buyer sees an exception from inside a library it did not write.
 * Neither of them has an error message to search for, which is
 * exactly why the phrases belong here.
 */
/**
 * WHAT THIS DOOR ITSELF CAN REFUSE, by name (rule 57.4).
 *
 * `common_failures_this_catches` is about the payment you are about
 * to attempt. These are about THIS call.
 */
const BEFORE_YOU_PAY_ERRORS: readonly SurfaceError[] = [
  {
    code: "missing_url",
    http: 400,
    means: "the request body carried no `url` field, or it was not a string",
    what_to_do:
      'POST {"url": "https://the.door/you-are-about-to-pay"} as JSON. Add client_profile only if you want the answer for a configured client; leaving it off answers for a client configured with nothing, which is the case that loses money quietly.',
  },
  {
    code: "unsupported_url",
    http: 400,
    means:
      "the URL was not https, named a private, loopback or link-local address, or named this store's own hostname",
    what_to_do:
      "Give a public https URL on the open internet. The refusals are the same ones the preflight makes and for the same reasons.",
  },
  {
    code: "bad_client_profile",
    http: 400,
    means:
      "client_profile was present but not an object we could read — a number where a ceiling object belonged, or an unknown shape",
    what_to_do:
      'Send {"max_amount_per_payment_usd": 5} or {"spend_controls_disabled": true}, or omit the field entirely. We do not guess at a profile we cannot parse, because the guess would be the answer.',
  },
  {
    code: "rate_limited",
    http: 429,
    means: "you passed one of the two ceilings this door shares with the preflight",
    what_to_do:
      "Wait and retry. The cap is our cost bound, not a fact about the door you named, and nothing you can buy raises it.",
  },
  {
    code: "unreachable",
    http: 200,
    means:
      "the door did not answer, so there is no challenge to replay the selector over. This is a VERDICT, not an error status",
    what_to_do:
      "Read the reason beside it. There is nothing to configure on your side yet: the question this tool answers only exists once a 402 comes back.",
  },
] as const;

function doc(base: string) {
  return {
    title: "Before you pay — the x402 payment dry run",
    version: BEFORE_YOU_PAY_VERSION,
    summary: `Send a URL. We knock once, then replay the stock x402 client's own selection logic over what came back, and tell you which accept YOUR client would sign — or that it would refuse on your machine before signing anything, and why. Free, no account, no wallet. Nothing is signed and no payment is made.`,
    method: "POST",
    url: `${base}/api/before-you-pay/${BEFORE_YOU_PAY_VERSION}`,
    request: {
      url: "REQUIRED. The https URL you are about to pay.",
      client_profile:
        "OPTIONAL. What your client is configured with: {\"max_amount_per_payment_usd\": 5} or {\"spend_controls_disabled\": true}. Leave it off and you get the answer for a client configured with NOTHING, which is the case that loses money quietly.",
    },
    the_question_it_answers:
      "Not 'is this endpoint healthy' — that is the preflight, and it is free at the URL below. This answers 'will my client actually pay it, and what will it pick', which is a fact about YOU standing in front of that door rather than about the door.",
    why_that_is_a_different_question: `A door can pass every structural check and still be unpayable by an unconfigured buyer. @x402/core applies a default ceiling of ${SIMULATED_CAP_LABEL} per payment — inside selectPaymentRequirements, BEFORE it picks an accept — and it throws there, on your machine, with no signature and no request to the operator. The operator sees a request for a price followed by silence, indistinguishable from a buyer who changed their mind. This store found thirteen of its OWN priced doors in that state and had been reading the result as apathy.`,
    common_failures_this_catches: {
      client_throws_before_signing: `An agent reports "the endpoint is broken" or "the payment never went through" and the operator's logs show a clean 402 and nothing after. Very often the client refused it: every accept was above the ${SIMULATED_CAP_LABEL} default ceiling and spendControls threw locally. Raise maxAmountPerPayment, or pass spendControls: false if you mean to.`,
      paid_on_a_rail_you_did_not_choose:
        "A door offers three rails at the same price and you assume your client shops among them. It does not. The default selector takes the FIRST accept that survives spend controls, and @x402/fetch pays once — if that payment fails, the other rails are never tried. When the first rail is over your ceiling and a later one is not, you silently pay on a chain you never picked, which is a real finding this tool prints by name.",
      token_dropped_before_price_was_read:
        "A door priced in a token that is not in the scheme's default-asset table is filtered out BEFORE the amount is looked at, so you never see a price complaint — just a refusal naming spendControls. Add an allowedAssets entry, or set allowedAssets: true.",
      escrow_rail_silently_ignored:
        "If a door offers an authorization flow alongside upfront or escrow, the client drops the upfront and escrow accepts whole. An operator who added an escrow rail for buyer safety may find no stock client ever reaches it.",
      window_you_did_not_know_you_had:
        "Every accept carries a signing window. The server library writes 300 seconds onto accepts it builds unless the operator chose otherwise, so most doors quote a number nobody decided. This prints the one that door actually served you.",
    },
    what_it_cannot_tell_you: [
      "Whether the purchase succeeds. This walks selection logic, not settlement — no wallet is touched and nothing is signed.",
      "Whether your wallet holds the funds or the gas.",
      "What a client on a different version of @x402/core does. This models the version THIS STORE has installed, and every answer names it.",
      "Whether the door delivers after payment. No probe or simulation can; that is a fact about the world.",
    ],
    the_ladder: {
      the_door: `${base}/api/preflight/${PREFLIGHT_VERSION} — is their challenge well-formed. Free.`,
      the_artifact: `${base}/api/conformance/v1 — does their signed offer or receipt verify. Free, any issuer.`,
      the_buyer: `${base}/api/before-you-pay/${BEFORE_YOU_PAY_VERSION} — will your client pay it. Free. This tool.`,
      signed: `${base}/api/buy/good_buyer — this exact reading, signed and served forever at its own URL, for the human who asks why their agent spent the money.`,
    },
    our_conflict_of_interest:
      "This store sells x402 goods, so it has an interest in agents being able to pay for things. That cuts against alarmism, not for it: every refusal this tool reports is a sale we did not make. It also runs against our own doors — the reading that named thirteen unpayable listings here is the reading that produced this tool.",

    /* ---- the five answers rule 57 requires (2026-08-29) ---- */

    what_you_can_use_it_for:
      `Anything a dry run of your own payment client is good for. Some obvious ones: finding out why an agent reports 'the endpoint is broken' when the operator's logs show a clean 402 and silence, checking which rail your client would actually pick before it picks one, tuning a spend ceiling against a door you intend to buy from repeatedly, or auditing your own configuration before you point an autonomous buyer at anything. There is no use case we are reserving, and the answer is yours under the same terms as every dataset here: ${PUBLISHED_LICENCE}.`,

    expected_outcome:
      "HTTP 200 and a JSON object saying which accept the stock client would select — or that it would refuse locally before signing, with the control that stopped it named — plus the signing window that accept actually carried and the @x402/core version the answer was modelled against. A refusal is a successful call: the answer is about your configuration standing in front of that door. Only a 4xx or 5xx is a failure of ours.",

    errors: BEFORE_YOU_PAY_ERRORS,

    price: freeInstrumentPrice(base, [
      {
        id: "good_buyer",
        instead:
          "this exact reading, signed and served forever at its own URL — for the human who asks why their agent spent the money, or did not",
      },
    ]),

    security: surfaceSecurity({
      what_this_surface_reads:
        "One HTTPS GET to the URL you name, from our infrastructure, with no credentials of yours and no payment attached — the same knock the preflight makes. The optional client_profile you send is configuration, never a key: this door has no field for a wallet, a seed or a signature, and would have nowhere to put one.",
      what_it_stores_about_you:
        "No account, no cookie, no key, and no wallet — there is nothing here that could hold one. The URL and the verdict are counted for rate limiting and the store's published traffic tallies; the client_profile is used for the one answer and not retained.",
      what_the_data_is:
        "One observation of a PUBLIC endpoint plus a replay of an open-source client's own selection logic over what came back. Nothing is signed, no payment is made, no wallet is touched, and no authentication is bypassed to produce it.",
      integrity:
        "THIS ANSWER IS NOT SIGNED, and it models the @x402/core version THIS STORE has installed — which the response names, because a dry run against a different version is a different answer. If you need something you can hand to somebody else, the signed rung is above. Do not represent a free dry run as a guarantee that a purchase will succeed: this walks selection logic, not settlement.",
    }),
  };
}

function withLifecycle(
  c: Context<HonoEnv>,
  path: string,
): Record<string, string> {
  return lifecycleHeaders(path, c.env.STORE_BASE_URL);
}

beforeYouPayRoutes.get(`/api/before-you-pay/${BEFORE_YOU_PAY_VERSION}`, (c) =>
  c.json(
    doc(c.env.STORE_BASE_URL),
    200,
    withLifecycle(c, `/api/before-you-pay/${BEFORE_YOU_PAY_VERSION}`),
  ),
);
beforeYouPayRoutes.get("/api/before-you-pay", (c) =>
  c.json(doc(c.env.STORE_BASE_URL)),
);

async function handle(c: Context<HonoEnv>) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error:
          'Body must be JSON: {"url": "https://the-door-you-are-about-to-pay/..."} — and optionally {"client_profile": {"max_amount_per_payment_usd": 5}}.',
      },
      400,
    );
  }
  const source =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const result = await beforeYouPay(
    source["url"],
    c.env,
    readProfile(source["client_profile"]),
  );
  return c.json(result.body, result.status as 200, {
    "Cache-Control": "no-store",
    ...withLifecycle(c, `/api/before-you-pay/${BEFORE_YOU_PAY_VERSION}`),
    ...result.headers,
  });
}

beforeYouPayRoutes.post(
  `/api/before-you-pay/${BEFORE_YOU_PAY_VERSION}`,
  handle,
);
beforeYouPayRoutes.post("/api/before-you-pay", handle);
