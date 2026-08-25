import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { issueDiscoveryReport, readDiscoveryReport } from "@/discovery";
import { canonicalEvidenceBytes, validateEnvelopePayload } from "@/evidence";
import { verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const ABOUT = "https://shop.example";
const AT = "2026-08-24T21:07:00Z";
const CLOCK = "injected-test-clock";

/**
 * SIGNED DISCOVERY REPORT — the free inventory, wrapped and signed.
 * SKU not priced. The instrument must fire: agree signs, conflict
 * signs, a lonely catalog is refused (not a silent agree).
 */

function catalogFetch(
  bodies: Record<string, { status?: number; body: string }>,
): typeof fetch {
  return async (input) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = new URL(href).pathname;
    const row = bodies[path];
    if (!row) return new Response("", { status: 404 });
    return new Response(row.body, { status: row.status ?? 200 });
  };
}

const AGREEING = {
  "/menu.json": {
    body: JSON.stringify({
      store: { name: "Example Shop" },
      items: [{ id: "hello", buy_url: `${ABOUT}/api/buy/hello` }],
    }),
  },
  "/.well-known/x402.json": {
    body: JSON.stringify({
      serviceName: "Example Shop",
      resources: [{ resourceUrl: `${ABOUT}/api/buy/hello` }],
    }),
  },
};

describe("the signed report is the inventory plus a signature", () => {
  it("signs an agreeing join, persists it, and the GET verifies", async () => {
    const issued = await issueDiscoveryReport({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch(AGREEING),
    });
    expect(issued.status).toBe(200);
    if (issued.status !== 200) throw new Error("expected a report");
    expect(issued.record.about).toBe(ABOUT);
    expect(issued.record.envelope.derived.verdict).toBe("agree");
    expect(issued.record.envelope.authorization.key_registry_url).toContain(
      "scvd.store",
    );
    expect(issued.record.envelope.authorization.key_registry_url).not.toContain(
      "shop.example",
    );
    const check = validateEnvelopePayload(issued.record.envelope);
    expect(check.ok).toBe(true);
    expect(
      await verifyMessageSignature(
        canonicalEvidenceBytes(issued.record.envelope),
        issued.record.envelope.signature,
        issued.record.envelope.observer.key_id,
      ),
    ).toBe(true);
    expect(JSON.stringify(issued.record)).not.toMatch(
      /score|confidence|rating|rank/i,
    );

    const stored = await readDiscoveryReport(
      env as unknown as Env,
      issued.record.report_id,
    );
    expect(stored?.report_id).toBe(issued.record.report_id);

    const response = await SELF.fetch(
      `${BASE}/api/discovery/report/${issued.record.report_id}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { report_id: string };
    expect(body.report_id).toBe(issued.record.report_id);
  });

  it("a planted extra x402 route signs as conflict", async () => {
    const issued = await issueDiscoveryReport({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch({
        ...AGREEING,
        "/.well-known/x402.json": {
          body: JSON.stringify({
            serviceName: "Example Shop",
            resources: [
              { resourceUrl: `${ABOUT}/api/buy/hello` },
              { resourceUrl: `${ABOUT}/api/buy/planted_report` },
            ],
          }),
        },
      }),
    });
    expect(issued.status).toBe(200);
    if (issued.status !== 200) throw new Error("expected a report");
    expect(issued.record.envelope.derived.verdict).toBe("conflict");
  });

  it("refuses to sign a lonely catalog — that is not_observed", async () => {
    const issued = await issueDiscoveryReport({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch({
        "/menu.json": AGREEING["/menu.json"]!,
      }),
    });
    expect(issued.status).toBe(422);
    if (issued.status === 422) {
      expect(issued.error).toContain("not_observed");
    }
  });

  it("404s an id that was never issued", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/discovery/report/drep_nobody`,
    );
    expect(response.status).toBe(404);
  });
});
