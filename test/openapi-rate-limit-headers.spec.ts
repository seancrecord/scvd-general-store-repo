import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * THE CONTRACT MAY ONLY DECLARE A HEADER THE STORE ACTUALLY SENDS.
 *
 * The spec hung the IETF RateLimit fields on every response the five
 * metered doors can give, including their 400s. Those have never
 * carried them: preflightUrl() returns its validation refusals before
 * either probe bucket is touched, because a malformed request never
 * spent a probe. An outside scan found it from the other end and
 * reported the fields "documented but not observed", having probed
 * only paths that refuse.
 *
 * This is the guard that makes the correction a mechanism rather than
 * a promise: it reads the served contract and the live doors, and
 * fails the build if either drifts from the other.
 */
const BASE = "https://scvd.store";

/** The statuses the limiter meters, and therefore the only ones that may declare the fields. */
const METERED = new Set(["200", "429"]);

const RATE_LIMIT_FIELDS = [
  "RateLimit-Limit",
  "RateLimit-Remaining",
  "RateLimit-Reset",
  "RateLimit-Policy",
  "RateLimit",
];

describe("the RateLimit fields, declared where they are sent", () => {
  it("declares them on the metered statuses and nowhere else", async () => {
    const spec = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as {
      paths: Record<string, Record<string, { responses?: Record<string, { headers?: Record<string, unknown> }> }>>;
      components: { responses: Record<string, { headers?: Record<string, unknown> }> };
    };

    let declared = 0;
    for (const [path, operations] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        for (const [status, raw] of Object.entries(operation?.responses ?? {})) {
          // A response may be a reference into components (the metered 429 is, since 2026-09-19); read what it names.
          const ref = (raw as { $ref?: string })?.$ref;
          const response = ref ? (spec.components.responses[ref.slice("#/components/responses/".length)] ?? raw) : raw;
          const headers = Object.keys(response?.headers ?? {});
          const carries = headers.some((name) => name.toLowerCase().startsWith("ratelimit"));
          if (!carries) continue;
          declared += 1;
          expect(
            METERED.has(status),
            `${method.toUpperCase()} ${path} declares RateLimit headers on ${status}, which the limiter never meters`,
          ).toBe(true);
        }
      }
    }

    // A guard that passes because it found nothing is not a guard.
    expect(declared, "no operation declares the RateLimit fields at all").toBeGreaterThan(0);
  });

  it("sends every declared field on a metered answer", async () => {
    // The store refuses to probe its own host, so this asserts the
    // shape of the refusal path and the header contract around it
    // rather than spending an outbound probe in a test.
    const response = await SELF.fetch(`${BASE}/api/preflight/v1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    // A validation refusal: before either bucket, so no fields.
    expect(response.status).toBe(400);
    for (const field of RATE_LIMIT_FIELDS) {
      expect(
        response.headers.get(field),
        `a 400 must not carry ${field} — it spent no probe`,
      ).toBeNull();
    }
  });

  it("says in prose what it does in headers", async () => {
    const spec = await (await SELF.fetch(`${BASE}/openapi.json`)).text();
    // The claim that used to be here described a header never sent.
    expect(spec).not.toContain("EVERY answer from it carries the IETF RateLimit fields");
    expect(spec).toContain("Every answer the limiter METERED carries the IETF RateLimit fields");

    const developers = await (await SELF.fetch(`${BASE}/developers`)).text();
    expect(developers).not.toContain("EVERY answer from it carries the IETF RateLimit fields");
  });
});
