import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import type { CrowdWalk } from "@/services/crowd-walks";
import { paidWalksOnRecord, preflightUrl } from "@/services/preflight";
import { subjectHistory } from "@/services/subject-history";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import { RECEIPT_ABSENT_CLASS, defectClass } from "@/store/defect-vocabulary";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE CROWD'S ROWS REACH THE PAGE A BUYER OPENS (2026-09-28).
 *
 * The keeper: "it feels I'm paying people to check doors I'm already
 * checking and doing nothing with the feedback they give us." The
 * rows were on every sealed round since 09-04 and on one surface —
 * the board's own totals. Now: each host's history carries its paid
 * walks at their tier, the preflight carries the latest round's rows
 * for the host it just knocked on, and a walker's report that says
 * the receipt was absent is named by the register's class, with the
 * report's own provenance and no more.
 */

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function host(name: string, verdict: WardHostResult["verdict"]): WardHostResult {
  return { host: name, url: `https://${name}/x402`, verdict, failed: [], advisories: [], source: "discovery" };
}

function walk(name: string, claimedAt: string, report?: CrowdWalk["walker_report"], houseVerdict?: NonNullable<CrowdWalk["house_probe"]>["verdict"]): CrowdWalk {
  return {
    tier: "crowd-walked",
    bounty_id: `bty_${name.replace(/\W/g, "")}_${claimedAt.slice(8, 10)}`,
    host: name,
    url: `https://${name}/x402`,
    network: "eip155:8453",
    settlement: { tx_hash: `0x${"ab".repeat(32)}`, block: 1, amount_usd: 0.001, payer_digest: "p", pay_to_digest: "q" },
    claimed_at: claimedAt,
    ...(houseVerdict ? { house_probe: { verdict: houseVerdict, failed: [], advisories: [], at: claimedAt } } : {}),
    ...(report ? { walker_report: report } : {}),
  };
}

function round(week: string, hosts: WardHostResult[], walks: CrowdWalk[]): WardRound {
  return {
    week,
    at: `2026-0${week.slice(-1)}-01T00:00:00.000Z`,
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
    ...(walks.length ? { crowd_walks: walks } : {}),
  };
}

async function chain(rounds: WardRound[]): Promise<void> {
  for (const entry of rounds) {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(entry));
    const pass = await takeCorpusSnapshot(testEnv, okCalendar);
    if (!pass.taken) throw new Error(`seed failed: ${pass.reason}`);
  }
}

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
});

afterEach(() => vi.restoreAllMocks());

const NO_RECEIPT = { status: 200, payment_response: false, body_sha256: "c".repeat(64), latency_ms: 1200 };
const WITH_RECEIPT = { status: 200, payment_response: true, latency_ms: 800 };

describe("a host's history carries the walks strangers paid for", () => {
  it("lists each walk at its tier, with the class the report asserts and nothing the report did not", async () => {
    await chain([
      round("2026-W01", [host("door.example", "ready")], [walk("door.example", "2026-01-03T00:00:00.000Z", WITH_RECEIPT, "ready")]),
      round("2026-W02", [host("door.example", "not_ready")], [
        walk("door.example", "2026-02-02T00:00:00.000Z", NO_RECEIPT, "not_ready"),
        walk("door.example", "2026-02-03T00:00:00.000Z"),
        walk("other.example", "2026-02-03T00:00:00.000Z", NO_RECEIPT),
      ]),
    ]);
    const history = await subjectHistory(testEnv, "door.example", BASE);
    expect(history.crowd_walks).toHaveLength(3);
    expect(history.crowd_walks.every((row) => row.tier === "crowd-walked")).toBe(true);
    expect(history.crowd_walks.map((row) => row.week)).toEqual(["2026-W01", "2026-W02", "2026-W02"]);

    const [seen, absent, bare] = history.crowd_walks;
    expect(seen?.receipt).toBe(true);
    expect(seen?.defect_classes).toEqual([]);
    expect(seen?.house_probe_verdict).toBe("ready");

    expect(absent?.receipt).toBe(false);
    expect(absent?.defect_classes).toEqual([RECEIPT_ABSENT_CLASS]);
    expect(absent?.house_probe_verdict).toBe("not_ready");
    expect(absent?.body_sha256).toBe("c".repeat(64));
    expect(absent?.entry_url).toMatch(/\/corpus\/\d+\.json$/);

    expect(bare?.report).toBe("none");
    expect(bare?.receipt).toBeUndefined();
    expect(bare?.defect_classes).toEqual([]);

    // The note says whose fact each field is, and the limits say so too.
    expect(history.crowd_walks_note).toContain("walker's claim");
    expect(history.what_this_cannot_see.some((line) => line.includes("crowd_walks[].receipt"))).toBe(true);
  });

  it("is empty, not absent, for a host no stranger has paid", async () => {
    await chain([round("2026-W03", [host("quiet.example", "ready")], [])]);
    const history = await subjectHistory(testEnv, "quiet.example", BASE);
    expect(history.crowd_walks).toEqual([]);
  });

  it("renders the rows on the JSON twin, the page and the markdown twin", async () => {
    await chain([round("2026-W04", [host("door.example", "ready")], [walk("door.example", "2026-04-02T00:00:00.000Z", NO_RECEIPT, "ready")])]);
    const json = (await (await SELF.fetch(`${BASE}/corpus/host/door.example.json`)).json()) as Record<string, unknown>;
    const rows = json["crowd_walks"] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["defect_classes"]).toEqual([RECEIPT_ABSENT_CLASS]);

    const page = await (await SELF.fetch(`${BASE}/corpus/host/door.example`)).text();
    expect(page).toContain("Paid walks by strangers");
    expect(page).toContain(`/defects#${RECEIPT_ABSENT_CLASS}`);
    expect(page).toContain("<strong>absent</strong>");

    const markdown = await (await SELF.fetch(`${BASE}/corpus/host/door.example`, { headers: { Accept: "text/markdown" } })).text();
    expect(markdown).toContain("## Paid walks by strangers");
    expect(markdown).toContain(`\`${RECEIPT_ABSENT_CLASS}\``);
    expect(markdown).toContain("**absent**");

    const none = await (await SELF.fetch(`${BASE}/corpus/host/quiet.example`, { headers: { Accept: "text/markdown" } })).text();
    expect(none.includes("None on the chain for this host") || none.includes("never carried")).toBe(true);
  });
});

describe("the preflight carries what a real wallet saw at the host it knocked on", () => {
  it("reads the latest sealed round's rows for that host, at their tier, and says what they are", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round("2026-W05", [host("door.example", "ready")], [
        walk("door.example", "2026-05-02T00:00:00.000Z", NO_RECEIPT, "ready"),
        walk("other.example", "2026-05-02T00:00:00.000Z", WITH_RECEIPT),
      ])),
    );
    const record = await paidWalksOnRecord(testEnv, "DOOR.example", BASE);
    expect(record?.tier).toBe("crowd-walked");
    expect(record?.round_week).toBe("2026-W05");
    expect(record?.walks).toHaveLength(1);
    expect(record?.walks[0]?.receipt).toBe(false);
    expect(record?.walks[0]?.defect_classes).toEqual([RECEIPT_ABSENT_CLASS]);
    expect(record?.history_url).toBe(`${BASE}/corpus/host/door.example.json`);
    expect(record?.scope).toContain("never verified here");

    const empty = await paidWalksOnRecord(testEnv, "nobody.example", BASE);
    expect(empty?.walks).toEqual([]);
    expect(empty?.scope).toContain("absence of rows");
  });

  it("is absent, and the probe still answers, when no round can be read", async () => {
    expect(await paidWalksOnRecord(testEnv, "door.example", BASE)).toBeNull();
  });

  it("rides every report the probe produces, including an unreachable one", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round("2026-W06", [host("dark.example", "unreachable")], [walk("dark.example", "2026-06-02T00:00:00.000Z", WITH_RECEIPT, "unreachable")])),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("connection refused");
    });
    const outcome = await preflightUrl("https://dark.example/x402", testEnv);
    expect("verdict" in outcome.body && outcome.body.verdict).toBe("unreachable");
    const walks = "verdict" in outcome.body ? outcome.body.paid_walks_on_record : undefined;
    expect(walks?.walks).toHaveLength(1);
    expect(walks?.walks[0]?.house_probe_verdict).toBe("unreachable");
    expect(walks?.walks[0]?.receipt).toBe(true);
  });
});

describe("the register names what the crowd reports", () => {
  it("carries receipt-absent-on-paid-response as a paid class whose signal is the walkers' claim", () => {
    const entry = defectClass(RECEIPT_ABSENT_CLASS);
    expect(entry?.detectable).toBe("paid");
    expect(entry?.our_signal).toContain("crowd-walked");
    expect(entry?.our_signal).toContain("never verified");
    expect(entry?.falsified_by).toContain("PAYMENT-RESPONSE");
  });

  it("names the class beside the board's count", async () => {
    const board = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as Record<string, unknown>;
    const findings = board["what_the_walks_show"] as { reports: Record<string, unknown> };
    expect(findings.reports["receipt_absent_class"]).toBe(RECEIPT_ABSENT_CLASS);
  });
});
