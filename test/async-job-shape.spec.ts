import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { markKeeperPresent } from "./helpers/keeper";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { TERMINAL_ORDER_STATUSES, type Env } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE ASYNC JOB, ON THE WIRE AND IN THE CONTRACT.
 *
 * The store has always handled long-running work correctly in
 * substance — a human-labor purchase hands back an order id, a queued
 * status, the SLA and a poll URL. What it did not do until 2026-08-31
 * was say so in the two places a generic HTTP client looks: the status
 * line and Location. A scan read the paid doors and reported no async
 * pattern, and it was reading the wire honestly — the wire said "200
 * OK, here is your finished thing" about work nobody had started.
 *
 * The fence matters as much as the change, so both halves are here:
 * queued work says 202, and finished work still says 200.
 */
describe("the async job pattern", () => {
  beforeAll(async () => {
    installFacilitatorMock();
    await markKeeperPresent(env as unknown as Env);
  });

  /** A real settled purchase: quote, sign the first tier, present it. */
  async function buy(itemId: string, query = ""): Promise<Response> {
    const challenge = await SELF.fetch(`${BASE}/api/buy/${itemId}${query}`);
    expect(challenge.status).toBe(402);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    return SELF.fetch(`${BASE}/api/buy/${itemId}${query}`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
  }

  it("declares 202 with Location and Retry-After on every paid door", async () => {
    const spec = (await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json()) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };

    const paid = Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([, operation]) => (operation as Record<string, unknown>)["x-payment"])
        .map(([method, operation]) => ({ path, method, operation })),
    );
    expect(paid.length).toBeGreaterThan(0);

    for (const entry of paid) {
      const responses = entry.operation["responses"] as Record<string, unknown>;
      const accepted = responses["202"] as Record<string, unknown> | undefined;
      expect(
        accepted,
        `${entry.method} ${entry.path} declares no 202, so a generated client cannot know a purchase may come back unfinished`,
      ).toBeTruthy();
      const headers = accepted!["headers"] as Record<string, unknown>;
      expect(headers["Location"]).toBeTruthy();
      expect(headers["Retry-After"]).toBeTruthy();
    }
  });

  it("answers a queued purchase with 202 and the way to follow it", async () => {
    const response = await buy("the_collab", "?detail=Ship+or+refactor%3F");
    expect(response.status).toBe(202);

    const body = (await response.json()) as Record<string, unknown>;
    const orderUrl = String(body["order_url"]);

    // Location repeats the body's poll URL rather than inventing one.
    expect(response.headers.get("Location")).toBe(orderUrl);
    // Retry-After is the item's own promise, not a typed guess.
    expect(Number(response.headers.get("Retry-After"))).toBe(
      Number(body["sla_hours"]) * 3600,
    );

    // And the URL it points at actually answers, with a status from
    // the same enum the contract publishes.
    const poll = (await (await SELF.fetch(orderUrl)).json()) as {
      status: string;
    };
    expect(poll.status).toBe("queued");
    expect(TERMINAL_ORDER_STATUSES).not.toContain(poll.status);
  });

  it("still says 200 when the work really is finished", async () => {
    /*
     * THE FENCE. An instant item completes inside the request, and
     * calling that "Accepted" would be the same defect in the other
     * direction — a client told to poll a job that is already done.
     * The body's own `status` field decides, so the code and the body
     * cannot come to disagree.
     */
    const response = await buy("hello");
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });
});
