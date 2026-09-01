import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  AUDIT_CRITERIA_VERSION,
  performServiceAudit,
} from "@/services/service-audit";
import { CENSUS_BATTERY } from "@/services/ward-round";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/** A well-formed x402 v2 challenge, the shape the store's own till emits. */
function wellFormed402(): Response {
  const challenge = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "5000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1111111111111111111111111111111111111111",
      },
    ],
  };
  return new Response(JSON.stringify({ error: "payment required" }), {
    status: 402,
    headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
  });
}

/**
 * THE ONCE-OVER — marketplace item three, the first Tier 3 product:
 * the free preflight's battery, signed and certificate-bound. What is
 * testable: free refusals before money, the observe-first evidence
 * binding, the report surviving forever at its URL, and the honest
 * unreachable verdict.
 */
describe("the once-over", () => {
  it("sits on the shelf at $5 with url as its one required input", () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "service_audit");
    expect(item?.price_usdc).toBe(5);
    expect(item?.fulfillment).toBe("instant");
    // The listing never claims more than the moment: no endorsement,
    // no uptime, and the free door is named rather than hidden.
    expect(item?.description).toContain("free");
    expect(item?.description?.toLowerCase()).toContain("not an endorsement");
    const schema = buyInputSchema(item!);
    expect(schema.required).toContain("url");
  });

  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses a missing url before any money is asked for", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/service_audit`, {
      headers: buying,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    // The refusal names the free door: same look, no signature.
    expect(body.error).toContain("/api/preflight");
  });

  it("refuses plain http plainly", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/service_audit?url=${encodeURIComponent("http://shop.example/api/buy/x")}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("https only");
  });

  it("refuses a custom port before money moves", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/service_audit?url=${encodeURIComponent("https://shop.example:8443/api/buy/x")}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("port");
  });

  it("refuses to sell an audit of the store itself, with the reason", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/service_audit?url=${encodeURIComponent(`${BASE}/api/buy/hello`)}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    // The instrument must not vouch for itself.
    expect(body.error).toContain("vouching for itself");
  });

  it("answers a bare probe with a price — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/service_audit`);
    expect(response.status).toBe(402);
  });

  it("delivers a signed report, evidence bound into the cert, served forever, paid", async () => {
    // Layer an audited endpoint over the facilitator mock: the target
    // answers a well-formed 402; everything else falls through.
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        let origin = "";
        try {
          origin = new URL(url).origin;
        } catch {
          origin = "";
        }
        // Exact origin, never a prefix — the CodeQL lesson from the
        // sheaf's test, applied before the tool has to say it again.
        if (origin === "https://merchant.example") {
          return wellFormed402();
        }
        return inner(input as never, init as never);
      },
    );

    const target = encodeURIComponent("https://merchant.example/api/buy/thing");
    const challenge = await SELF.fetch(
      `${BASE}/api/buy/service_audit?url=${target}`,
    );
    expect(challenge.status).toBe(402);
    const headerName = [...challenge.headers.keys()].find(
      (name) => name.toLowerCase() === "payment-required",
    )!;
    const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
      accepts: Array<Record<string, unknown>>;
    };
    const paid = await SELF.fetch(
      `${BASE}/api/buy/service_audit?url=${target}`,
      {
        headers: {
          "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0] as never),
        },
      },
    );
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;

    // The report: ready, every check named, signed on its own.
    expect(body.verdict).toBe("ready");
    expect(body.audit_id).toMatch(/^saudit_/);
    expect(body.report_url).toBe(`/api/service-audit/${body.audit_id}`);
    expect(body.audit.url).toBe("https://merchant.example/api/buy/thing");
    expect(body.audit.signature).toBeTruthy();
    expect(body.audit.evidence_hash).toBeTruthy();
    const checkNames = body.audit.checks.map((check: { name: string }) => check.name);
    expect(checkNames).toContain("status-402");
    expect(checkNames).toContain("accepts");
    // The criteria are named ON the artifact, versioned.
    expect(body.audit.criteria).toContain("preflight-v2");

    // The certificate's attests field IS the report's evidence hash:
    // the store's dated word, on the endpoint that already existed.
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)
    ).json()) as Record<string, any>;
    expect(verify.valid).toBe(true);
    expect(verify.certificate.attests).toBe(body.audit.evidence_hash);

    // The report URL serves the record with its honest boundaries.
    const report = (await (
      await SELF.fetch(`${BASE}${body.report_url}`)
    ).json()) as Record<string, any>;
    expect(report.audit.evidence_hash).toBe(body.audit.evidence_hash);
    expect(report.cert_id).toBe(body.certificate.cert_id);
    expect(report.what_this_is_not).toContain("Not an endorsement");
    expect(report.how_to_verify.join(" ")).toContain("attests");
  });
});

describe("the audit's honest boundaries", () => {
  it("signs an unreachable moment as exactly that, never a throw", async () => {
    const audit = await performServiceAudit(
      testEnv,
      "https://nowhere.example/api/buy/thing",
      {
        fetch: (async () => {
          throw new Error("connection refused");
        }) as unknown as typeof fetch,
      },
    );
    expect(audit.verdict).toBe("unreachable");
    // Still a complete artifact: signed, dated, hashed — the buyer
    // paid for the dated record of the knock, and got it.
    expect(audit.signature).toBeTruthy();
    expect(audit.evidence_hash).toBeTruthy();
    expect(audit.checks[0]?.name).toBe("reachable");
    expect(audit.checks[0]?.detail).toContain("does not prove the endpoint is down");
  });

  it("a v1-only door fails the paid headline — #82", async () => {
    /*
     * Same GET, same bytes, different headline — until today. A door
     * with a dollar-typed amount passes every v1 structural check and
     * cannot be paid at its asked price. The $5 artifact used to sign
     * ready while the census and free /api/preflight/v2 called the
     * same door not_ready. The paid headline now cites the census
     * battery; v1 rides in also_under so the overlap stays visible.
     *
     * This is the acceptance pin: a v1-only fixture fails the paid
     * door. Deleting the fold turns this green in the wrong direction.
     */
    expect(AUDIT_CRITERIA_VERSION).toBe(CENSUS_BATTERY);
    const decimalDoor = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "0.005",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1111111111111111111111111111111111111111",
        },
      ],
    };
    const audit = await performServiceAudit(
      testEnv,
      "https://decimal.example/api/buy/thing",
      {
        fetch: (async () =>
          new Response("{}", {
            status: 402,
            headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(decimalDoor)) },
          })) as unknown as typeof fetch,
      },
    );
    expect(audit.verdict).toBe("not_ready");
    expect(audit.criteria).toContain("preflight-v2");
    expect(audit.also_under).toBeDefined();
    expect(audit.also_under!.battery).toBe("preflight-v1");
    expect(audit.also_under!.verdict).toBe("ready");
    expect(audit.also_under!.difference).toContain("DISAGREED");
    expect(audit.checks.map((check) => check.name)).toContain("amount-atomic");
  });

  it("no battery ran, no also_under — an unreachable audit does not invent a second verdict", async () => {
    const audit = await performServiceAudit(
      testEnv,
      "https://nowhere.example/api/buy/thing",
      {
        fetch: (async () => {
          throw new Error("connection refused");
        }) as unknown as typeof fetch,
      },
    );
    expect(audit.also_under).toBeUndefined();
  });

  it("marks a shaped-wrong endpoint not_ready with the failing check named", async () => {
    const audit = await performServiceAudit(
      testEnv,
      "https://plain.example/api/thing",
      {
        fetch: (async () =>
          new Response("ok", { status: 200 })) as unknown as typeof fetch,
      },
    );
    expect(audit.verdict).toBe("not_ready");
    const status = audit.checks.find((check) => check.name === "status-402");
    expect(status?.ok).toBe(false);
    expect(status?.detail).toContain("200");
  });
});
