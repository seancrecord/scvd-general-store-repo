import { Hono, type Context } from "hono";
import { LOOK_HOLD_SECONDS, LOOK_VERSION, NOT_A_SCORE, lookAtDoor } from "@/services/look";
import { PREFLIGHT_VERSION_NEXT } from "@/services/preflight";
import { lifecycleHeaders } from "@/store/api-lifecycle";
import { PROBE_DOOR_ERRORS, securityBlock } from "@/store/surface-contract";
import { ladderRung } from "@/services/menu-markdown";
import type { HonoEnv } from "@/types";

/**
 * /api/look — "what do you hold about this door?" (roadmap L6, named
 * by the keeper 2026-09-02). One live probe folded with everything
 * the signed chain holds about the host. See services/look.ts for
 * the two halves and why they are kept apart.
 */
export const lookRoutes = new Hono<HonoEnv>();

/** THE GET IS THE DOCUMENT, like the preflight's and the dry run's. */
function doc(base: string) {
  return {
    title: "The look — what this store holds about one x402 door",
    version: LOOK_VERSION,
    summary: `Send a URL. We knock once — the same single probe the free preflight makes, under the same limiter — and fold the answer with everything the signed chain already holds about that host: the rounds since we first met it, the tier with its fraction and its rows, the last probed round with its failed checks and the catalog's agreement, the passport decision, the shared-wallet fact. Two halves, kept apart: what the door said just now, and what we held before you asked. Free.`,
    method: "POST",
    url: `${base}/api/look/${LOOK_VERSION}`,
    request: {
      url: "REQUIRED. The https x402 door you are asking about.",
    },
    the_question_it_answers:
      "Not 'is this door shaped right' alone — that is the preflight, and it rides inside this answer whole. Not 'what does the chain say' alone — that is the per-host history and the passport, and they ride inside too. This answers the question an agent holds with a URL in one hand and a wallet in the other: what does this store hold about this door, now and before now, in one call.",
    why_it_is_not_a_score: NOT_A_SCORE,
    what_it_cannot_tell_you: [
      "Whether to pay. The reader draws that line; this store does not, and sells nothing that would.",
      "Whether the door delivers after payment. No probe and no history can; that is a fact about the world.",
      "Whether your own client will sign what the door serves — that is the payment dry run, free, named in next_steps.",
      "Anything about a host the chain never met, beyond that it never met it. Thin history is a fact about our coverage, not about the door, and the gaps are counted against us by reason.",
      `Anything newer than the hold on the held half: the chain's fold for a host is re-derived at most every ${LOOK_HOLD_SECONDS} seconds, and the artifact says when it was taken.`,
    ],
    the_ladder: {
      free_first: {
        the_door: `${base}/api/preflight/${PREFLIGHT_VERSION_NEXT} — the live half on its own. Free.`,
        the_history: `${base}/corpus/host/{host}.json — the held half's rows. Free.`,
        the_buyer: `${base}/api/before-you-pay/v1 — will your client pay it. Free.`,
        this_door: `${base}/api/look/${LOOK_VERSION} — both halves in one call. Free. This tool.`,
      },
      /* Priced from the shelf, never typed here (rule 57.3). */
      paid: [
        ladderRung(
          base,
          "service_audit",
          "the live probe as a signed, dated artifact at its own URL, with the door's other surfaces read beside the 402",
        ),
        ladderRung(
          base,
          "passport_refresh",
          "a census look at this host now rather than Sunday, folded into the passport the same hour",
        ),
      ].filter(Boolean),
    },
    expected_outcome:
      "HTTP 200 and a report with a `now` half (the preflight verdict and the whole preflight), a `held` half (counts with their denominators, the tier line with its fraction and rows, the last probed round, the passport decision), and `now_against_held` stating same, changed, no_prior or not_comparable with both sides named. A host the chain never met comes back with never_met true and no tier read from nothing.",
    errors: PROBE_DOOR_ERRORS,
    security: securityBlock(base, {
      does_in_your_name:
        "One outbound GET to the URL you supplied — the same single unauthenticated probe the free preflight makes, metered on the same budget — and then a read of this store's own signed chain. NOTHING IS SIGNED for you, no wallet is touched, no payment is presented and no key of yours is asked for or could be given. Private, loopback and link-local addresses are refused before any request leaves, and so is this store's own hostname.",
      stores:
        "Nothing keyed to you. The chain's fold for the host you asked about is held briefly under the host's name so the next caller does not pay for the same fold; it holds nothing about who asked. The call is counted for rate limiting and for the store's published traffic tallies; there is no account, no cookie and no caller identifier.",
    }),
    our_conflict_of_interest:
      "This store sells signed observations of doors like the one you are asking about, so it has an interest in you wanting more than the free answer. That cuts against padding the free answer, not for it: everything the chain holds about a host is served here and at /corpus/host/{host}.json for nothing, and the paid rungs buy a signature and a fresh look, never a better verdict.",
  };
}

function withLifecycle(c: Context<HonoEnv>, path: string): Record<string, string> {
  return lifecycleHeaders(path, c.env.STORE_BASE_URL);
}

lookRoutes.get(`/api/look/${LOOK_VERSION}`, (c) =>
  c.json(doc(c.env.STORE_BASE_URL), 200, withLifecycle(c, `/api/look/${LOOK_VERSION}`)),
);
lookRoutes.get("/api/look", (c) => c.json(doc(c.env.STORE_BASE_URL)));

async function handle(c: Context<HonoEnv>) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Body must be JSON: {"url": "https://the-door-you-are-asking-about/..."}' }, 400);
  }
  const source = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const result = await lookAtDoor(source["url"], c.env);
  return c.json(result.body, result.status as 200, {
    "Cache-Control": "no-store",
    ...withLifecycle(c, `/api/look/${LOOK_VERSION}`),
    ...result.headers,
  });
}

lookRoutes.post(`/api/look/${LOOK_VERSION}`, handle);
lookRoutes.post("/api/look", handle);
