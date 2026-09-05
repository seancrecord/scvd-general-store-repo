import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { TRADE_SANDBOX_ID, TRADE_SANDBOX_SECRET } from "@/store/trade-counter";
import { operationIdFor } from "@/routes/openapi";

/**
 * THE ONE SANDBOX, VERIFIABLE FROM OUTSIDE (2026-09-05).
 *
 * A readiness scan read the developers page's mention of a sandbox,
 * followed the link with a GET, got a 404 saying the path was never
 * a door, and reported that no sandbox surface could be verified.
 * The x402 till has none on purpose (the declined position says so);
 * the trade counter has a real one with a published secret. What
 * this file holds: a GET on the check desk describes it instead of
 * denying it, the sandbox's secret rides that answer, and the
 * contract names the sandbox's paths literally rather than only as a
 * template with a public value nobody could learn from it.
 */

const BASE = "https://scvd.store";

describe("a GET on the check desk is a question, not a missing door", () => {
  it("answers 405 with Allow and the desk described in-band", async () => {
    const response = await SELF.fetch(`${BASE}/api/trade/${TRADE_SANDBOX_ID}/check`);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    const body = (await response.json()) as Record<string, any>;
    expect(body.allow).toEqual(["POST"]);
    expect(body.account).toBe(TRADE_SANDBOX_ID);
    expect(body.sandbox.secret).toBe(TRADE_SANDBOX_SECRET);
    expect(body.sandbox.check_desk).toBe(`${BASE}/api/trade/${TRADE_SANDBOX_ID}/check`);
    expect(body.worked_example).toBeTruthy();
    expect(body.contract).toBe(`${BASE}/api/trade/contract`);
  });

  it("names an account it does not hold, and never a secret for one it does", async () => {
    const unknown = await SELF.fetch(`${BASE}/api/trade/no-such-account/check`);
    expect(unknown.status).toBe(404);
    // Any provisioned account other than the sandbox carries no
    // published block: the secret is a Worker secret, never echoed.
    const contract = (await (await SELF.fetch(`${BASE}/api/trade/contract`)).json()) as {
      accounts: Array<{ account: string }>;
    };
    for (const row of contract.accounts.filter((a) => a.account !== TRADE_SANDBOX_ID)) {
      const response = await SELF.fetch(`${BASE}/api/trade/${row.account}/check`);
      expect(response.status, row.account).toBe(405);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body["sandbox"], row.account).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(TRADE_SANDBOX_SECRET);
    }
  });
});

describe("the contract names the sandbox by its real paths", () => {
  it("carries the sandbox's check desk and order door beside the templates, each with its own operation id", async () => {
    const spec = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    const check = spec.paths[`/api/trade/${TRADE_SANDBOX_ID}/check`]?.post;
    const order = spec.paths[`/api/trade/${TRADE_SANDBOX_ID}/{item_id}`]?.post;
    expect(check).toBeTruthy();
    expect(order).toBeTruthy();
    for (const op of [check!, order!]) {
      expect(String(op["description"])).toContain("THIS PATH IS THE SANDBOX");
      const names = (op["parameters"] as Array<{ name: string }>).map((p) => p.name);
      expect(names).not.toContain("partner");
    }
    expect((order!["parameters"] as Array<{ name: string }>).map((p) => p.name)).toContain("item_id");
    expect(check!["operationId"]).toBe(operationIdFor("post", `/api/trade/${TRADE_SANDBOX_ID}/check`));
    // The templates stay: an account that is not the sandbox is still a door.
    expect(spec.paths["/api/trade/{partner}/check"]?.post).toBeTruthy();
    expect(spec.paths["/api/trade/{partner}/{item_id}"]?.post).toBeTruthy();
  });
});
