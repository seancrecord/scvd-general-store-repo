import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buyRouteDescription,
  ROUTE_DESCRIPTION_CAP,
} from "@/lib/payments";
import { isInfrastructureUserAgent } from "@/lib/channel";
import {
  escalateSharedReasons,
  readDeclines,
  readReason,
  sharedReasons,
  SHARED_REASON_ESCALATION,
  type DeclineReport,
} from "@/lib/declines";
import { getMenuItem } from "@/store/menu";
import type { MenuItem } from "@/types";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

let seq = 0;
async function seedIndexRow(event: MetricEvent): Promise<void> {
  seq += 1;
  const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(14, "0");
  await testEnv.COUNTERS.put(
    `declevt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
    JSON.stringify(event),
  );
}

function decline(partial: Partial<MetricEvent>): MetricEvent {
  return {
    kind: "decline",
    item: "settlement_attestation",
    channel: "direct",
    house: false,
    at: new Date().toISOString(),
    ...partial,
  };
}

async function clear(): Promise<void> {
  for (const prefix of ["declevt:", "evt:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
}

beforeEach(clear);

/**
 * THE RULE THE DESK PRINTED AND COULD NEVER APPLY.
 *
 * readReason's missing-input clause has always ended "the same thing
 * from DIFFERENT clients means the requirement is not discoverable
 * from the header alone, and that would be ours to fix in the
 * challenge". readReason takes one string and cannot count clients,
 * so the sentence sat beside a hardcoded `buyer` and the escalation
 * never once fired — through five consecutive days of
 * local:input_missing:tx_hash refusing three separate implementations.
 */
describe("a reason seen from more than one client", () => {
  it("stays theirs for one client, however many times it repeats", async () => {
    for (let i = 0; i < 5; i += 1) {
      await seedIndexRow(
        decline({
          note: "local:input_missing:tx_hash",
          user_agent: "python-httpx/0.28.1",
        }),
      );
    }
    const report = await readDeclines(testEnv);
    expect(report.declines).toHaveLength(5);
    for (const row of report.declines) {
      expect(row.fault).toBe("buyer");
    }
    expect(sharedReasons(report)).toHaveLength(0);
  });

  it("becomes OURS the moment a second client hits the same code", async () => {
    await seedIndexRow(
      decline({ note: "local:input_missing:tx_hash", user_agent: "python-httpx/0.28.1" }),
    );
    await seedIndexRow(
      decline({ note: "local:input_missing:tx_hash", user_agent: "node" }),
    );

    const report = await readDeclines(testEnv);
    for (const row of report.declines) {
      expect(row.fault).toBe("ours");
      expect(row.reading).toContain("ESCALATED BY THE DESK");
    }

    const shared = sharedReasons(report);
    expect(shared).toHaveLength(1);
    expect(shared[0]!.escalated).toBe(true);
    // The clients are NAMED: a verdict the reader cannot check is the
    // one thing this desk exists not to print.
    expect(shared[0]!.clients).toContain("node");
    expect(shared[0]!.clients).toContain("python-httpx/0.28.1");
  });

  /**
   * The count that proves the challenge is unreadable must include
   * machinery. A conformance crawler that read our 402 and could not
   * find a required input is evidence about the CHALLENGE, whatever
   * it ever intended to spend — while the demand columns beside it
   * stay clean.
   */
  it("counts the noise floor for discoverability and nowhere else", async () => {
    await seedIndexRow(
      decline({ note: "local:input_missing:tx_hash", user_agent: "python-httpx/0.28.1" }),
    );
    await seedIndexRow(
      decline({
        note: "local:input_missing:tx_hash",
        channel: "infrastructure",
        user_agent: "vet402-observatory-l1/1.0 (+https://vet402.com/observatory/methodology)",
      }),
    );

    const report = await readDeclines(testEnv);
    expect(sharedReasons(report)).toHaveLength(1);
    for (const row of report.declines) {
      expect(row.fault).toBe("ours");
    }
    // The demand columns are untouched by the crawler.
    expect(report.outside_count).toBe(1);
    expect(report.infrastructure_count).toBe(1);
    expect(report.by_reason["local:input_missing:tx_hash"]).toBe(1);
  });

  it("never counts the house — family reading our own challenge proves nothing", async () => {
    await seedIndexRow(
      decline({ note: "local:input_missing:tx_hash", user_agent: "python-httpx/0.28.1" }),
    );
    await seedIndexRow(
      decline({ note: "local:input_missing:tx_hash", house: true, user_agent: "scvd-walkabout" }),
    );
    const report = await readDeclines(testEnv);
    expect(sharedReasons(report)).toHaveLength(0);
  });

  /**
   * A rail nobody offered and a v1 envelope both say "DIFFERENT
   * clients" too, and neither is a fault we own — one is demand for a
   * rail, the other is the ecosystem's tail. Those get the count, not
   * the verdict.
   */
  it("annotates the rail and v1 cases without moving their fault", () => {
    const report = {
      declines: [
        { reason: "local:payload_v1_envelope", fault: "buyer", reading: "x" },
        { reason: "local:requirement_mismatch:network:eip155:10", fault: "buyer", reading: "y" },
      ],
      clients_by_reason: {
        "local:payload_v1_envelope": ["alpha", "beta"],
        "local:requirement_mismatch:network:eip155:10": ["alpha", "beta"],
      },
    } as unknown as DeclineReport;

    const shared = escalateSharedReasons(report);
    expect(shared).toHaveLength(2);
    for (const row of shared) expect(row.escalated).toBe(false);
    for (const row of report.declines) {
      expect(row.fault).toBe("buyer");
      expect(row.reading).toContain("DIFFERENT CLIENTS");
    }
  });

  it("takes two to escalate, and says so as a named constant", () => {
    expect(SHARED_REASON_ESCALATION).toBe(2);
  });
});

/**
 * THE REQUIREMENT THE HEADER NEVER CARRIED. required_params went out
 * in the 402's JSON body and in a nonstandard discovery extension;
 * a stock x402 client reads neither. `description` rides the header.
 */
describe("a required input, in the challenge a client actually reads", () => {
  const fakeEnv = { STORE_BASE_URL: "https://scvd.store" } as unknown as Env;

  it("names the parameter in the route description", () => {
    const item = getMenuItem("settlement_attestation") as MenuItem;
    const description = buyRouteDescription(item, fakeEnv);
    expect(description).toContain("?tx_hash=");
    expect(description).toContain("refused before the gate");
  });

  /**
   * The cap truncates the SALES COPY, never the sentence that decides
   * whether the payment can succeed — which is why it goes first.
   */
  it("keeps the requirement ahead of the pitch, inside the cap", async () => {
    const { MENU_ITEMS } = await import("@/store");
    for (const item of MENU_ITEMS) {
      const description = buyRouteDescription(item, fakeEnv);
      expect(description.length, item.id).toBeLessThanOrEqual(ROUTE_DESCRIPTION_CAP);
      const { buyInputSchema } = await import("@/lib/bazaar-discovery");
      const required = buyInputSchema(item).required ?? [];
      for (const name of required) {
        expect(description, item.id).toContain(`?${name}=`);
      }
    }
  });
});

/** A linter lints. Same verb as validator, verifier, checker, inspector. */
describe("x402lint is machinery", () => {
  it("reads as the noise floor, like the observatory beside it", () => {
    expect(isInfrastructureUserAgent("x402lint/0.1 (+https://x402lint.dev)")).toBe(true);
  });

  it("does not catch a real buyer's SDK", () => {
    for (const ua of ["node", "python-httpx/0.28.1", "curl/8.5.0", "axios/1.7.2", "Deno/1.44"]) {
      expect(isInfrastructureUserAgent(ua), ua).toBe(false);
    }
  });
});

/**
 * The one row in the window that reached the facilitator at all.
 *
 * The first version of this reading told the keeper to "read the payer
 * off the row before anything else" — and a decline row carried no
 * payer, because gateSignals never opened the payload. Corrected
 * 2026-09-16 alongside the fix that books one: a payer equal to any
 * payTo is now classified house automatically, so the reading names
 * the rule and what is left to check rather than sending the keeper
 * after a field that was not there.
 */
describe("self_send_not_allowed", () => {
  it("has a reading, and names the rule that now classifies it", () => {
    const { fault, reading } = readReason("self_send_not_allowed");
    expect(reading).not.toContain("No reading written");
    expect(reading).toContain("isHouseTraffic");
    expect(fault).toBe("unknown");
  });

  /** A row older than the fix carries no payer, and the reading says so. */
  it("does not promise a payer on rows booked before one was written", () => {
    const { reading } = readReason("self_send_not_allowed");
    expect(reading).toContain("BEFORE");
    expect(reading.toLowerCase()).toContain("browser till");
  });
});
