import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { performOnpageAudit } from "@/services/onpage-audit";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const SITE = "https://site.example";

beforeAll(() => {
  installFacilitatorMock();
});

const GOOD_PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>A well-shaped page</title>
  <meta name="description" content="One sentence a machine can quote.">
  <link rel="canonical" href="${SITE}/page">
  <script type="application/ld+json">{"@type":"WebPage"}</script>
</head>
<body><h1>The heading</h1></body>
</html>`;

/** Serve the stub site; everything else falls through. */
function stubSite(html: string): void {
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
      if (origin === SITE) {
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return inner(input as never, init as never);
    },
  );
}

/**
 * THE SHOP WINDOW — the Once-Over's discipline pointed at a page.
 * Testable: the shelf listing, the free refusals before money, the
 * signed report with its evidence binding and blind spots, and the
 * report surviving at its URL.
 */
describe("the on-page audit", () => {
  it("sits on the shelf with url as its one required input", async () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "onpage_audit");
    expect(item?.fulfillment).toBe("instant");
    // The free door is named on the listing, the blind spot is
    // printed on it, and it never claims a rank or a grade.
    expect(item?.description).toContain("/api/onpage/v1");
    expect(item?.description).toContain("script");
    expect(item?.description).toContain("Not an SEO grade");
    const schema = buyInputSchema(item!);
    expect(schema.required).toContain("url");
  });

  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses a missing url before money, naming the free door", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/onpage_audit`, {
      headers: buying,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("/api/onpage/v1");
  });

  it("refuses plain http plainly", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/onpage_audit?url=${encodeURIComponent("http://site.example/page")}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("https");
  });

  it("refuses an audit of the store's own pages, with the reason", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/onpage_audit?url=${encodeURIComponent(`${BASE}/what`)}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("vouching for itself");
  });

  it("answers a bare probe with a price — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/onpage_audit`);
    expect(response.status).toBe(402);
  });

  it("delivers a signed ready report, evidence bound into the cert, served forever, paid", async () => {
    stubSite(GOOD_PAGE);
    try {
      const target = encodeURIComponent(`${SITE}/page`);
      const challenge = await SELF.fetch(
        `${BASE}/api/buy/onpage_audit?url=${target}`,
      );
      expect(challenge.status).toBe(402);
      const headerName = [...challenge.headers.keys()].find(
        (name) => name.toLowerCase() === "payment-required",
      )!;
      const required = JSON.parse(
        atob(challenge.headers.get(headerName)!),
      ) as { accepts: Array<Record<string, unknown>> };
      const paid = await SELF.fetch(
        `${BASE}/api/buy/onpage_audit?url=${target}`,
        {
          headers: {
            "PAYMENT-SIGNATURE": buildPaymentSignature(
              required.accepts[0] as never,
            ),
          },
        },
      );
      expect(paid.status).toBe(200);
      const body = (await paid.json()) as Record<string, any>;

      expect(body.verdict).toBe("ready");
      expect(body.audit_id).toMatch(/^opage_/);
      expect(body.report_url).toBe(`/api/onpage-audit/${body.audit_id}`);
      expect(body.audit.url).toBe(`${SITE}/page`);
      expect(body.audit.signature).toBeTruthy();
      expect(body.audit.evidence_hash).toBeTruthy();
      expect(body.audit.criteria).toContain("onpage-v1");
      // The blind spots are ON the signed artifact, not beside it.
      expect(JSON.stringify(body.audit.blind_spots)).toContain("script");

      // The certificate's attests field IS the report's evidence hash.
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
    } finally {
      vi.unstubAllGlobals();
      installFacilitatorMock();
    }
  });

  it("signs a not_ready verdict that names the failing check", async () => {
    const audit = await performOnpageAudit(testEnv, `${SITE}/bare`, {
      fetch: (async () =>
        new Response("<html><head></head><body>nothing</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })) as typeof fetch,
    });
    expect(audit.verdict).toBe("not_ready");
    const title = audit.checks.find((check) => check.name === "title");
    expect(title?.ok).toBe(false);
    expect(audit.signature).toBeTruthy();
  });

  it("signs an unreachable moment rather than throwing", async () => {
    const audit = await performOnpageAudit(testEnv, `${SITE}/dark`, {
      fetch: (async () => {
        throw new Error("connection refused");
      }) as typeof fetch,
    });
    expect(audit.verdict).toBe("unreachable");
    expect(audit.checks[0]?.name).toBe("reachable");
    expect(audit.checks[0]?.detail).toContain("does not prove the page is down");
    expect(audit.signature).toBeTruthy();
  });
});
