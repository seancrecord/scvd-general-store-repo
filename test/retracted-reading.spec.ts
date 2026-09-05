import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { retractionFor } from "@/store/retracted-readings";
import type { WardHostResult } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * A VERDICT WHOSE CHECK WE WITHDREW IS NOT A VERDICT (2026-09-05).
 *
 * The correction of 2026-09-04 retracted three checks for round
 * 2026-W36 on rails this desk could not read. The chain kept the rows,
 * correctly — and every derived surface went on publishing not-ready
 * from them, so the operator of 402signal.com read a public refusal
 * about his door resting on a reading we had already disowned, and had
 * to write and tell us. Rule 56: a claim that loses its check is
 * withdrawn out loud, and that has to reach the derived surfaces too.
 */

const ALGORAND = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
const BASE_CHAIN = "eip155:8453";
const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

describe("the retraction rule, derived from the row's own terms", () => {
  it("withdraws a W36 row that failed only retracted checks on a rail we could not read", () => {
    const finding = retractionFor("2026-W36", ["payto-payable"], [ALGORAND, BASE_CHAIN, SOLANA]);
    expect(finding).not.toBeNull();
    expect(finding!.correction_date).toBe("2026-09-04");
    expect(finding!.checks).toEqual(["payto-payable"]);
  });

  it("leaves a row that failed something the correction never touched", () => {
    // status-402 is a real finding; using a correction to erase it
    // would be the same overreach pointed the other way.
    expect(retractionFor("2026-W36", ["payto-payable", "status-402"], [ALGORAND])).toBeNull();
  });

  it("leaves an EVM-only row alone — that reader was not blind there", () => {
    expect(retractionFor("2026-W36", ["payto-payable"], [BASE_CHAIN, SOLANA])).toBeNull();
  });

  it("leaves other weeks and unrecorded terms alone", () => {
    expect(retractionFor("2026-W35", ["payto-payable"], [ALGORAND])).toBeNull();
    // No recorded rails means we cannot show the reader was blind, and
    // rule 52 points the same way it always does: we do not answer.
    expect(retractionFor("2026-W36", ["payto-payable"], undefined)).toBeNull();
    expect(retractionFor("2026-W36", ["payto-payable"], [])).toBeNull();
    expect(retractionFor("2026-W36", [], [ALGORAND])).toBeNull();
  });
});

async function seedRound(hosts: WardHostResult[], week = "2026-W36"): Promise<void> {
  const round = {
    week,
    at: "2026-09-01T13:27:08.998Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}000000001`,
    JSON.stringify({
      snapshot: {
        version: 1,
        sequence: 1,
        taken_at: "2026-09-01T13:27:08.998Z",
        previous_digest: null,
        source: "ward_round",
        week,
        round,
      },
      digest: "0".repeat(64),
      signature: "0".repeat(128),
      public_key: "0".repeat(64),
    }),
  );
}

function row(host: string, failed: string[], networks: string[]): WardHostResult {
  return {
    host,
    url: `https://${host}/route`,
    verdict: "not_ready",
    failed,
    advisories: [],
    observed_at: "2026-09-01T13:27:08.998Z",
    offer: { networks, schemes: ["exact"], min_usdc: 0.003, max_usdc: 0.003 },
  };
}

describe("the passport stops publishing a withdrawn reading", () => {
  it("refuses with the correction instead of asserting not-ready", async () => {
    await seedRound([
      row("retracted.example", ["payto-payable"], [ALGORAND, BASE_CHAIN, SOLANA]),
      row("really-broken.example", ["status-402"], [BASE_CHAIN]),
    ]);

    const withdrawn = await SELF.fetch(`${BASE}/passport/retracted.example`, {
      headers: { Accept: "application/json" },
    });
    expect(withdrawn.status).toBe(403);
    const body = (await withdrawn.json()) as {
      reason: string;
      detail: string;
      decision: string;
      correction_date?: string;
      corrections_url?: string;
    };
    expect(body.reason).toBe("retracted-reading");
    expect(body.correction_date).toBe("2026-09-04");
    expect(body.corrections_url).toBe(`${BASE}/corrections`);
    // INDETERMINATE, never NOT_READY: we withdrew our reason, we did
    // not acquire a new verdict.
    expect(body.decision).toBe("INDETERMINATE");
    expect(body.detail).toContain("no current verdict");
    expect(body.detail).toContain("2026-09-04");
    // And it never claims the door is fine.
    expect(body.detail).not.toContain("ready side");

    // A door that failed a check nobody retracted still reads not-ready.
    const standing = await SELF.fetch(`${BASE}/passport/really-broken.example`, {
      headers: { Accept: "application/json" },
    });
    expect(standing.status).toBe(403);
    expect(((await standing.json()) as { reason: string }).reason).toBe("not-ready");
  });

  it("still issues no chip for a withdrawn reading — silence, not a green chip", async () => {
    await seedRound([row("retracted.example", ["payto-payable"], [ALGORAND, BASE_CHAIN])]);
    const chip = await SELF.fetch(`${BASE}/badges/passport/retracted.example.svg`);
    expect(chip.status).toBe(403);
  });

  it("says it in words on the HTML page a reader lands on", async () => {
    await seedRound([row("retracted.example", ["amount-atomic"], [ALGORAND])]);
    const page = await SELF.fetch(`${BASE}/passport/retracted.example`, {
      headers: { Accept: "text/html" },
    });
    expect(page.status).toBe(403);
    const text = await page.text();
    expect(text).toContain("INDETERMINATE");
    expect(text).toContain("2026-09-04");
    expect(text).toContain("no current verdict");
  });
});
