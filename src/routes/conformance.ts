import { Hono } from "hono";
import type { Context } from "hono";
import {
  checkConformance,
  conformanceDoc,
  CONFORMANCE_VERSION,
} from "@/services/conformance";
import type { ConformanceRequest } from "@/services/conformance";
import { isRecord } from "@/types";
import type { HonoEnv } from "@/types";

/**
 * /api/conformance — the free conformance desk.
 *
 * The reasoning lives in src/services/conformance.ts. This file is the
 * door, and the door has two addresses on purpose.
 *
 * THE VERSIONED PATH IS THE CONTRACT. /api/conformance/v1 is frozen:
 * fields are never removed and never change type, only added, and
 * anything that cannot be done additively becomes /v2 while v1 keeps
 * answering. That is FM4 in PROBLEMS.md — if a framework hardcodes a
 * free endpoint into CI, every PR across dozens of repositories hits
 * our edge, and a schema change breaks hundreds of builds globally.
 * Devs then flag us as an unstable dependency, which costs more than
 * the traffic was ever worth. Stable-by-contract, not stable-by-luck.
 *
 * THE UNVERSIONED PATH IS A CONVENIENCE and says so in its own body:
 * it points at the current version for a human poking at it, and
 * tells anybody automating to pin the versioned one instead.
 */
export const conformanceRoutes = new Hono<HonoEnv>();

async function handleCheck(c: Context<HonoEnv>) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error:
          "Body must be JSON. Send {\"artifact\": \"<compact JWS>\"} — see GET /api/conformance/v1 for the whole shape.",
      },
      400,
    );
  }
  if (!isRecord(body)) {
    return c.json(
      { error: "Body must be a JSON object, not an array or a bare value." },
      400,
    );
  }

  const result = await checkConformance(body as ConformanceRequest);
  if (result.error) {
    return c.json({ error: result.error }, result.status as 400);
  }
  /**
   * NO-STORE, deliberately. Somebody checking an artifact they do not
   * trust should not have the answer served to the next caller from a
   * cache, and a verdict is cheap enough to recompute that caching it
   * buys nothing worth that ambiguity.
   */
  return c.json(result.verdict, 200, { "Cache-Control": "no-store" });
}

conformanceRoutes.get(`/api/conformance/${CONFORMANCE_VERSION}`, (c) =>
  c.json(conformanceDoc(c.env.STORE_BASE_URL)),
);
conformanceRoutes.post(`/api/conformance/${CONFORMANCE_VERSION}`, handleCheck);

/**
 * The unversioned door. It works — refusing it would be pointless
 * friction for somebody exploring — but it names the pinned path and
 * says which one an automated caller should be using.
 */
conformanceRoutes.get("/api/conformance", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    ...conformanceDoc(base),
    pin_this_instead: `${base}/api/conformance/${CONFORMANCE_VERSION}`,
    why: `This unversioned path answers today and is a convenience for a human poking at the desk. If anything you are building calls this on a schedule or in CI, pin ${CONFORMANCE_VERSION}: that contract is frozen, and this one is only promised to point at whatever is current.`,
  });
});
conformanceRoutes.post("/api/conformance", handleCheck);
