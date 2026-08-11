import { Hono } from "hono";
import {
  DIRECTORY_CONTENT_TYPE,
  DIRECTORY_PATH,
  signedDirectory,
} from "@/lib/web-bot-auth";
import {
  CARD_CRITERIA_VERSION,
  checkDirectory,
  directoryUrlFor,
  getSignatureAgentCard,
} from "@/services/bot-auth-card";
import { checkProbeTarget } from "@/lib/probe-target";
import type { Env, HonoEnv } from "@/types";

/**
 * GET /.well-known/http-message-signatures-directory — the Web Bot
 * Auth key directory (draft-meunier-http-message-signatures-
 * directory). This is the document the Signature-Agent header on the
 * store's own outbound probes points back at: an origin that
 * receives a signed request from us fetches this, checks the
 * signature against the listed key, and has verified the caller
 * without ever talking to us directly.
 *
 * The response carries its own proof-of-possession signature (the
 * directory signs its "@authority" with each listed key), built in
 * lib/web-bot-auth.ts beside the request-signing path so the two
 * can never disagree about what the key is.
 *
 * No egress key configured = 404, honestly: an empty directory would
 * claim "this store publishes no keys" with a 200, which is a
 * different statement from "this store has not turned this on."
 */
export const botAuthRoutes = new Hono<HonoEnv>();

botAuthRoutes.get(DIRECTORY_PATH, async (c) => {
  const directory = await signedDirectory(c.env);
  if (!directory) {
    return c.json(
      {
        error:
          "No message-signatures directory is published here yet. The store's outbound requests are unsigned until it is.",
      },
      404,
    );
  }
  return c.json(directory.body, 200, directory.headers);
});

/**
 * THE FREE DESK: POST /api/bot-auth/check — the signature-agent
 * card's exact battery, unsigned, free, no account. Same posture as
 * the preflight beside the Once-Over: the looking is free and always
 * will be; what the paid card adds is the part where somebody else
 * has to believe you.
 */
const CHECKS_PER_MINUTE = 10;
const GLOBAL_CHECKS_PER_MINUTE = 30;
let checkMinute = "";
let checksUsed = 0;

function takeCheckBudget(): boolean {
  const minute = new Date().toISOString().slice(0, 16);
  if (minute !== checkMinute) {
    checkMinute = minute;
    checksUsed = 0;
  }
  if (checksUsed >= CHECKS_PER_MINUTE) {
    return false;
  }
  checksUsed += 1;
  return true;
}

async function takeGlobalCheckBudget(env: Env): Promise<boolean> {
  const minute = new Date().toISOString().slice(0, 16);
  const key = `botauth_budget:${minute}`;
  const used = parseInt((await env.COUNTERS.get(key)) ?? "0", 10);
  if (used >= GLOBAL_CHECKS_PER_MINUTE) {
    return false;
  }
  await env.COUNTERS.put(key, String(used + 1), { expirationTtl: 120 });
  return true;
}

botAuthRoutes.post("/api/bot-auth/check", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error:
          'Body must be JSON: {"url": "https://your-agent.example"} — your origin, or your key directory\'s full URL.',
      },
      400,
    );
  }
  const raw =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["url"]
      : undefined;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return c.json(
      {
        error:
          'Send {"url": "https://your-agent.example"} — a bare origin is checked at /.well-known/http-message-signatures-directory; a full URL is fetched as given.',
      },
      400,
    );
  }
  let directoryUrl: string;
  try {
    directoryUrl = directoryUrlFor(raw.trim());
  } catch {
    return c.json({ error: "That is not a URL this desk can parse." }, 400);
  }
  const target = new URL(directoryUrl);
  const verdict = checkProbeTarget(target, "");
  if (!verdict.ok) {
    return c.json({ error: verdict.reason ?? "refused target" }, 400);
  }
  if (
    target.host.toLowerCase() ===
    new URL(c.env.STORE_BASE_URL).host.toLowerCase()
  ) {
    return c.json(
      {
        error: `That is this store's own directory, which a Worker cannot fetch from inside itself — and you should not want our reading of it anyway. GET ${DIRECTORY_PATH} here and check the proof-of-possession signature yourself; the method is the same one this desk runs on everybody else.`,
      },
      400,
    );
  }
  if (!takeCheckBudget() || !(await takeGlobalCheckBudget(c.env))) {
    return c.json(
      {
        error:
          "The check budget for this minute is spent — a cost bound on our side, not a fact about your directory. Retry next minute.",
      },
      429,
    );
  }
  const outcome = await checkDirectory(c.env, directoryUrl);
  return c.json(
    {
      subject: raw.trim(),
      directory_url: directoryUrl,
      criteria: CARD_CRITERIA_VERSION,
      verdict: outcome.verdict,
      checks: outcome.checks,
      expected_content_type: DIRECTORY_CONTENT_TYPE,
      signed_version: `${c.env.STORE_BASE_URL}/api/buy/signature_agent_card — the same battery with a signature, a certificate binding, and a permanent card URL, for when somebody else has to believe the readout.`,
      what_this_is_not:
        "A dated look at one document at one moment. Not an endorsement, not an identity check on who holds the key, and it says nothing about whether any request was ever actually signed with it.",
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

/**
 * GET /api/bot-auth-card/:card_id — a purchased card, served forever.
 * The Once-Over's report surface, one shelf down the same aisle.
 */
botAuthRoutes.get("/api/bot-auth-card/:card_id", async (c) => {
  const record = await getSignatureAgentCard(c.env, c.req.param("card_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No card under that id. The id is on the purchase response and the certificate; the item is /api/buy/signature_agent_card.",
      },
      404,
    );
  }
  return c.json({
    ...record,
    how_to_verify: [
      "1. Re-serialize every field of `card` above `signature` as canonical JSON, in the order served, and check the ed25519 signature against the key here or at /.well-known/scvd-signing-key.",
      `2. GET /api/verify/${record.cert_id}: the certificate's attests field carries this card's evidence_hash, signed by the store's key — the store's dated word that THIS card is the one that purchase bought.`,
      "3. The battery takes no trust: fetch the directory yourself and compare. A difference is a difference in moments, which is exactly what a dated card is honest about.",
    ],
    what_this_is_not:
      "A dated observation of one directory document at one moment. Not an endorsement of the agent behind it, not a statement about who operates the key, and not evidence that any request was ever signed with it.",
  });
});
