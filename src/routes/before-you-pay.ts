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
