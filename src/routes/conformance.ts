import { Hono } from "hono";
import type { Context } from "hono";
import {
  checkConformance,
  conformanceDoc,
  CONFORMANCE_VERSION,
} from "@/services/conformance";
import type { ConformanceRequest } from "@/services/conformance";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { isRecord } from "@/types";
import { lifecycleHeaders } from "@/store/api-lifecycle";
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

/**
 * THE LIFECYCLE HEADERS ON THE PINNED PATH.
 *
 * The desk's whole pitch to a CI pipeline is "pin the versioned path,
 * that contract is frozen" — which is a promise about the future, and
 * a promise about the future is worth exactly what its notice
 * mechanism is worth. store/api-lifecycle.ts holds the table; this
 * asks it, on every answer, whether this path has a sunset date yet.
 * None today, so nothing goes on the wire today.
 */
conformanceRoutes.use(`/api/conformance/${CONFORMANCE_VERSION}`, async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(
    lifecycleHeaders(`/api/conformance/${CONFORMANCE_VERSION}`, c.env.STORE_BASE_URL),
  )) {
    c.header(name, value);
  }
});

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

  /**
   * env rides along so the desk can resolve OUR OWN did:web without a
   * network round-trip Cloudflare would kill — a Worker cannot fetch
   * its own hostname (522), and the issuer that hits that wall is the
   * one every happy-path caller checks first: us.
   */
  const result = await checkConformance(body as ConformanceRequest, c.env);
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

/**
 * THE READABLE TWIN, and it exists for the reason /pulse's does: a
 * surface only machines can read is the one place a person has to
 * take our word. This desk's whole argument is "check it yourself
 * rather than trust us," which would be a half-claim if the
 * explanation of it were only available as JSON.
 *
 * It is also the link a human can be handed. The endpoint is the
 * product; a curl invocation is not something anybody reads in a
 * chat window and decides to try.
 */
function docHtml(base: string): string {
  const doc = conformanceDoc(base);
  const list = (lines: readonly string[]): string =>
    lines
      .map((line) => `<p class="menu-desc">${escapeHtml(line)}</p>`)
      .join("\n");
  const params = Object.entries(doc.request)
    .map(
      ([name, note]) =>
        `<div class="menu-item">
          <div class="menu-line"><span class="menu-name"><code>${escapeHtml(name)}</code></span></div>
          <p class="menu-desc">${escapeHtml(String(note))}</p>
        </div>`,
    )
    .join("\n");
  const curl = `curl -sS ${base}/api/conformance/${CONFORMANCE_VERSION} \\
  -H 'Content-Type: application/json' \\
  -d '{"artifact":"<compact JWS>"}'`;
  return `<section>
      <p class="menu-desc">${escapeHtml(doc.summary)}</p>
      <p class="menu-desc"><strong>${escapeHtml(String(doc.why_it_is_free))}</strong></p>
    </section>
    <section>
      <h2>Calling it</h2>
      <pre class="menu-desc"><code>${escapeHtml(curl)}</code></pre>
      ${params}
    </section>
    <section>
      <h2>What it checks</h2>
      ${list(doc.what_it_checks)}
    </section>
    <section>
      <h2>What it cannot tell you</h2>
      ${list(doc.what_it_cannot_tell_you)}
    </section>
    <section>
      <h2>Why you should not trust this page</h2>
      <p class="menu-desc">${escapeHtml(doc.our_conflict_of_interest)}</p>
      <p class="menu-desc">${escapeHtml(doc.run_it_yourself)}</p>
    </section>
    <section>
      <p class="menu-meta">${escapeHtml(String(doc.contract))}</p>
      <p class="menu-meta">${escapeHtml(String(doc.rate_limit))}</p>
    </section>`;
}

conformanceRoutes.get(`/api/conformance/${CONFORMANCE_VERSION}`, (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(
      renderSimplePage({
        title: "The conformance desk",
        description:
          "Free, hosted x402 artifact checking. Send any issuer's signed offer or receipt and get a structured verdict: parse, schema, signature, liveness.",
        path: `/api/conformance/${CONFORMANCE_VERSION}`,
        bodyHtml: docHtml(base),
      }),
    );
  }
  return c.json(conformanceDoc(base));
});
conformanceRoutes.post(`/api/conformance/${CONFORMANCE_VERSION}`, handleCheck);

/**
 * THE FIXTURES DESK — complete signed artifacts for building a
 * fail-closed integration without paying anything. Reasoning and the
 * serve-time self-check live in lib/conformance-fixtures.ts; this is
 * the door. A self-check failure is an honest 500 naming the fixture,
 * never a stale fixture served with a straight face.
 */
conformanceRoutes.get(
  `/api/conformance/${CONFORMANCE_VERSION}/fixtures`,
  async (c) => {
    try {
      const { buildFixtureSet } = await import("@/lib/conformance-fixtures");
      const set = await buildFixtureSet(c.env);
      c.header("Cache-Control", "public, max-age=300");
      return c.json(set as unknown as Record<string, unknown>);
    } catch (error) {
      return c.json(
        {
          error:
            "The fixture set failed its own self-check against the live desk, so nothing was served — a wrong fixture is worse than none. Tell the keeper; the mailbox is free.",
          detail: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
);

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
