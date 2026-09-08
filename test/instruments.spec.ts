import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { MetricEvent } from "@/lib/metrics";
import {
  daysCounted,
  freeInstrumentUsage,
  handoffs,
  readInstrumentReading,
  splitUnknown,
  type InstrumentReading,
} from "@/services/instruments";
import type { Observatory } from "@/services/observatory";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };

const NOW = new Date("2026-09-05T21:00:00.000Z");

const sample: Observatory = {
  computed_at: NOW.toISOString(),
  months: [{
    month: "2026-09", organic_visits: 0, truncated: false,
    surfaces: [
      { surface: "mcp:tool:preflight_endpoint", organic: 45, by_channel: { mcp: 45 }, house: 0, infrastructure: 0 },
      { surface: "mcp:tool:check_before_you_pay", organic: 24, by_channel: { mcp: 24 }, house: 0, infrastructure: 0 },
      { surface: "preflight:batch", organic: 3, by_channel: { direct: 3 }, house: 0, infrastructure: 1 },
      { surface: "corpus:host", organic: 100, by_channel: { direct: 60, unknown: 40 }, house: 0, infrastructure: 50 },
      { surface: "verify-receipt", organic: 5, by_channel: { direct: 5 }, house: 0, infrastructure: 0 },
      { surface: "mcp:tool:verify_artifact", organic: 3, by_channel: { mcp: 3 }, house: 0, infrastructure: 0 },
      { surface: "artifact:read", organic: 43, by_channel: { direct: 43 }, house: 0, infrastructure: 184 },
      { surface: "mcp-verifier:tool:preflight_x402_endpoint", organic: 2, by_channel: { mcp: 2 }, house: 0, infrastructure: 0 },
      { surface: "mcp-verifier:tool:get_defect_definition", organic: 1, by_channel: { mcp: 1 }, house: 0, infrastructure: 0 },
      { surface: "mcp-verifier:initialize", organic: 9, by_channel: { mcp: 9 }, house: 0, infrastructure: 0 },
      { surface: "mcp-docs:tool:read_docs", organic: 4, by_channel: { mcp: 4 }, house: 0, infrastructure: 0 },
      { surface: "mcp-docs:initialize", organic: 6, by_channel: { mcp: 6 }, house: 0, infrastructure: 0 },
      { surface: "mcp:tool:buy_observation", organic: 18, by_channel: { mcp: 18 }, house: 0, infrastructure: 0 },
      { surface: "menu.json", organic: 885, by_channel: { direct: 169 }, house: 0, infrastructure: 291 },
      { surface: "mcp:initialize", organic: 1613, by_channel: { mcp: 1613 }, house: 0, infrastructure: 0 },
    ],
  }, {
    month: "2026-08", organic_visits: 0, truncated: false,
    surfaces: [
      { surface: "corpus:host", organic: 300, by_channel: { direct: 300 }, house: 0, infrastructure: 0 },
    ],
  }],
  counted_paths: {}, floors: { porch_writes_per_minute: 0, ledger_key_cap: 0, note: "" },
  house_flag_policy: "", what_this_is: "", what_this_is_not: "", corrections: "",
};

describe("the free instruments, sorted out of the observatory", () => {
  it("counts the free roster and the paid tools, and nothing else", () => {
    const u = freeInstrumentUsage(sample, { now: NOW });
    const m = u.months[0]!;
    expect(m.free.map((s) => s.surface)).toEqual([
      "corpus:host", "mcp:tool:preflight_endpoint", "artifact:read", "mcp:tool:check_before_you_pay", "verify-receipt",
      "mcp-docs:tool:read_docs", "preflight:batch", "mcp:tool:verify_artifact",
      "mcp-verifier:tool:preflight_x402_endpoint", "mcp-verifier:tool:get_defect_definition",
    ]);
    expect(m.free_total).toBe(230);
    expect(m.free_by_channel).toEqual({ mcp: 79, direct: 111, unknown: 40 });
    // Every door's handshake in the denominator, no door's handshake on the roster.
    expect(m.mcp_handshakes).toBe(1628);
    expect(JSON.stringify(m.free)).not.toContain("mcp-verifier:initialize");
    expect(JSON.stringify(m.free)).not.toContain("mcp-docs:initialize");
    expect(m.paid_tool_calls).toBe(18);
    // Handshakes and the menu are neither: the noise stays out.
    expect(JSON.stringify(m)).not.toContain("mcp:initialize");
  });

  it("splits the free uses into the ones that carried an argument and the ones that were reads", () => {
    const m = freeInstrumentUsage(sample, { now: NOW }).months[0]!;
    expect(m.argument_uses).toBe(82);
    expect(m.read_uses).toBe(148);
    // The documentation door hands back reference material: a read, counted from the day it opened.
    expect(m.free.find((s) => s.surface === "mcp-docs:tool:read_docs")?.kind).toBe("read");
    expect(m.free.find((s) => s.surface === "mcp-docs:tool:read_docs")?.logged_since).toBe("2026-09-05");
    // The verifier's task-shaped names: a preflight needs a URL; the vocabulary is a read.
    expect(m.free.find((s) => s.surface === "mcp-verifier:tool:preflight_x402_endpoint")?.logged_since).toBe("2026-09-05");
    expect(m.free.find((s) => s.surface === "mcp-verifier:tool:get_defect_definition")?.kind).toBe("read");
    expect(m.free.find((s) => s.surface === "corpus:host")?.kind).toBe("read");
    expect(m.free.find((s) => s.surface === "preflight:batch")?.kind).toBe("argument");
  });

  it("carries each line's logged-since date and divides by the days it existed", () => {
    const m = freeInstrumentUsage(sample, { now: NOW }).months[0]!;
    const batch = m.free.find((s) => s.surface === "preflight:batch")!;
    // The doors got their porch line on the 4th; on the 5th that is two days counted.
    expect(batch.logged_since).toBe("2026-09-04");
    expect(batch.days_counted).toBe(2);
    expect(batch.per_day).toBe(1.5);
    const corpus = m.free.find((s) => s.surface === "corpus:host")!;
    expect(corpus.logged_since).toBe("2026-08-21");
    expect(corpus.days_counted).toBe(5);
    expect(corpus.per_day).toBe(20);
  });

  it("counts zero days for a line that did not exist yet, and never divides by it", () => {
    expect(daysCounted("2026-08", "2026-09-04", NOW)).toBe(0);
    expect(daysCounted("2026-08", "2026-08-21", NOW)).toBe(11);
    expect(daysCounted("2026-10", "2026-08-21", NOW)).toBe(0);
    const august = freeInstrumentUsage(sample, { now: NOW }).months[1]!;
    expect(august.free[0]!.days_counted).toBe(11);
    expect(august.since).toBeNull();
  });

  it("puts settled sales and re-checks beside the paid calls when the route has them, and null when it does not", () => {
    const withPulse = freeInstrumentUsage(sample, { now: NOW, settled: { "2026-09": 7 }, rechecks: { "2026-09": 116 }, declines: { "2026-09": 31 } }).months[0]!;
    expect(withPulse.settled).toBe(7);
    expect(withPulse.rechecks).toBe(116);
    expect(withPulse.declines).toBe(31);
    // The after-the-sale half through the roster's own doors: the receipt door and the MCP verify tool.
    expect(withPulse.receipts_verified).toBe(8);
    const bare = freeInstrumentUsage(sample, { now: NOW }).months[0]!;
    expect(bare.settled).toBeNull();
    expect(bare.rechecks).toBeNull();
    expect(bare.declines).toBeNull();
  });

  it("prints the slope against the stored reading, and stores this one for the next", () => {
    const last: InstrumentReading = {
      at: "2026-09-04T21:00:00.000Z",
      month: "2026-09",
      free: { "mcp:tool:preflight_endpoint": 40, "corpus:host": 90 },
      paid: { "mcp:tool:buy_observation": 10 },
    };
    const u = freeInstrumentUsage(sample, { now: NOW, last });
    const m = u.months[0]!;
    expect(m.since).toBe(last.at);
    expect(m.free.find((s) => s.surface === "mcp:tool:preflight_endpoint")?.delta).toBe(5);
    expect(m.free.find((s) => s.surface === "corpus:host")?.delta).toBe(10);
    // A row the last reading never saw is all new.
    expect(m.free.find((s) => s.surface === "preflight:batch")?.delta).toBe(3);
    expect(m.paid_tools[0]?.delta).toBe(8);
    // A reading for another month is not this month's baseline.
    expect(freeInstrumentUsage(sample, { now: NOW, last: { ...last, month: "2026-08" } }).months[0]!.since).toBeNull();
    expect(u.reading).toEqual({
      at: NOW.toISOString(),
      month: "2026-09",
      free: {
        "corpus:host": 100, "mcp:tool:preflight_endpoint": 45, "artifact:read": 43, "mcp:tool:check_before_you_pay": 24,
        "verify-receipt": 5, "mcp:tool:verify_artifact": 3, "preflight:batch": 3,
        "mcp-verifier:tool:preflight_x402_endpoint": 2, "mcp-verifier:tool:get_defect_definition": 1,
        "mcp-docs:tool:read_docs": 4,
      },
      paid: { "mcp:tool:buy_observation": 18 },
    });
  });

  it("splits unknown into no-user-agent, self-referred and referred, naming the referring hosts", () => {
    const row = (item: string, extra: Partial<MetricEvent> = {}): MetricEvent => ({
      kind: "porch", item, channel: "unknown", house: false, at: "2026-09-05T10:00:00.000Z", ...extra,
    });
    const events: MetricEvent[] = [
      row("corpus:host"),
      row("corpus:host"),
      row("corpus:host", { referrer: "https://example.org/some/page", user_agent: "Mozilla/5.0" }),
      row("preflight", { referrer: "https://example.org/other", user_agent: "Mozilla/5.0" }),
      row("corpus:week", { referrer: "not a url", user_agent: "curl/8" }),
      // Our own pages linking to our own rooms: a reader, not a stranger.
      row("corpus:host", { referrer: "https://scvd.store/corpus", user_agent: "Mozilla/5.0" }),
      row("corpus:host", { referrer: "https://SCVD.store/", user_agent: "Mozilla/5.0" }),
      // Out: house, another channel, another month, a surface off the roster, another kind.
      row("corpus:host", { house: true }),
      row("corpus:host", { channel: "direct", user_agent: "curl/8" }),
      row("corpus:host", { at: "2026-08-30T10:00:00.000Z" }),
      row("menu.json"),
      row("corpus:host", { kind: "challenge" }),
    ];
    const split = splitUnknown(events, "2026-09", 12, true, "scvd.store");
    expect(split.no_user_agent).toBe(2);
    expect(split.self_referred).toBe(2);
    expect(split.referred).toBe(3);
    expect(split.referrer_hosts).toEqual([{ host: "example.org", visits: 2 }, { host: "not a url", visits: 1 }]);
    expect(split.no_user_agent_by_surface).toEqual([{ surface: "corpus:host", visits: 2 }]);
    expect(split.rows_scanned).toBe(12);
    // Without a self host, our own pages count as referrers like any other.
    expect(splitUnknown(events, "2026-09", 12, true).referred).toBe(5);
    expect(split.complete).toBe(true);
    // The split only lands on the month being read now.
    const u = freeInstrumentUsage(sample, { now: NOW, unknown: split });
    expect(u.months[0]!.unknown).toBe(split);
    expect(u.months[1]!.unknown).toBeNull();
  });

  it("counts the handoff from a free check to a price and a sale, by client, inside the window", () => {
    const at = (minute: number): string => new Date(Date.UTC(2026, 8, 5, 12, minute)).toISOString();
    const ev = (kind: MetricEvent["kind"], item: string, ua: string | undefined, minute: number, extra: Partial<MetricEvent> = {}): MetricEvent => ({
      kind, item, channel: "direct", house: false, at: at(minute), ...(ua ? { user_agent: ua } : {}), ...extra,
    });
    const events: MetricEvent[] = [
      // A: checks a door, is priced 5 minutes later, settles 8 minutes later. One checker, priced, settled.
      ev("porch", "mcp:tool:preflight_endpoint", "agent-a/1", 0),
      ev("challenge", "observation", "agent-a/1", 5),
      ev("settle", "observation", "agent-a/1", 8),
      // B: checks twice, priced for two items inside the window, never settles.
      ev("porch", "preflight:batch", "agent-b/1", 0),
      ev("porch", "conformance", "agent-b/1", 20),
      ev("challenge", "observation", "agent-b/1", 25),
      ev("challenge", "simple", "agent-b/1", 40),
      // C: priced BEFORE its check, and again 31 minutes after: neither is a handoff.
      ev("porch", "look", "agent-c/1", 10),
      ev("challenge", "observation", "agent-c/1", 5),
      ev("challenge", "observation", "agent-c/1", 41),
      // D: only reads the corpus, then is priced: a read is not a check.
      ev("porch", "corpus:host", "agent-d/1", 0),
      ev("challenge", "observation", "agent-d/1", 1),
      // E: no user-agent at all, keyed together like the census does.
      ev("porch", "conformance", undefined, 0),
      ev("challenge", "observation", undefined, 2),
      // Out: house, and last month.
      ev("porch", "preflight", "agent-h/1", 0, { house: true }),
      ev("challenge", "observation", "agent-h/1", 1, { house: true }),
      ev("porch", "preflight", "agent-old/1", 0, { at: "2026-08-30T12:00:00.000Z" }),
      // Out: INFRASTRUCTURE. A peer observatory that checks, is priced
      // and signs is still the noise floor, and counting it as a client
      // that failed to convert invents a conversion problem. Counted
      // separately so the exclusion is visible rather than silent.
      ev("porch", "conformance", "vet402-observatory-l1/1.0", 0, { channel: "infrastructure" }),
      ev("challenge", "observation", "vet402-observatory-l1/1.0", 5, { channel: "infrastructure" }),
      ev("porch", "preflight", "x402-conformance-monitor/0.1", 0, { channel: "infrastructure" }),
    ];
    const h = handoffs(events, "2026-09");
    expect(h.window_minutes).toBe(30);
    expect(h.checkers).toBe(4);
    expect(h.then_priced).toBe(3);
    expect(h.then_settled).toBe(1);
    expect(h.items_after_check).toEqual([{ item: "observation", clients: 3 }, { item: "simple", clients: 1 }]);
    // The noise floor is named, not netted away.
    expect(h.infrastructure_checkers).toBe(2);
    // The counts can be traced instead of believed.
    expect(h.checker_clients).toEqual(["(no user-agent)", "agent-a/1", "agent-b/1", "agent-c/1"]);
    expect(h.priced_clients).toEqual(["(no user-agent)", "agent-a/1", "agent-b/1"]);
    // An infrastructure client never appears in either list.
    expect(h.checker_clients.join(" ")).not.toContain("observatory");
    expect(h.priced_clients.join(" ")).not.toContain("monitor");
    // Lands on the month being read, and nowhere else.
    const u = freeInstrumentUsage(sample, { now: NOW, handoff: h });
    expect(u.months[0]!.handoff).toBe(h);
    expect(u.months[1]!.handoff).toBeNull();
  });

  it("excludes an infrastructure client from the handoff on every row, not just the infra ones", () => {
    /**
     * THE MIXED-CHANNEL CASE, which a per-event filter gets wrong. A
     * 402 and its check are two different HTTP requests and can carry
     * different headers, so one client's rows land in different
     * channels — the item lookup says so in its own footnote. A filter
     * that tested each row would keep this monitor's organic-looking
     * check, drop its infrastructure price, and report it as a client
     * that checked and then declined to buy: a false conversion story
     * reached from the other side. Naming the CLIENT is the fix.
     */
    const at = (minute: number): string => new Date(Date.UTC(2026, 8, 5, 12, minute)).toISOString();
    const ev = (kind: MetricEvent["kind"], item: string, ua: string, minute: number, channel: MetricEvent["channel"]): MetricEvent => ({
      kind, item, channel, house: false, at: at(minute), user_agent: ua,
    });
    const events: MetricEvent[] = [
      // The monitor: checked on a request that inferred as direct, priced on one that inferred as infrastructure.
      ev("porch", "conformance", "x402-conformance-monitor/0.1", 0, "direct"),
      ev("challenge", "observation", "x402-conformance-monitor/0.1", 5, "infrastructure"),
      // A real client beside it, so the exclusion is not just "everything".
      ev("porch", "conformance", "buyer/1", 0, "direct"),
      ev("challenge", "observation", "buyer/1", 5, "direct"),
    ];
    const h = handoffs(events, "2026-09");
    expect(h.checkers).toBe(1);
    expect(h.then_priced).toBe(1);
    expect(h.checker_clients).toEqual(["buyer/1"]);
    expect(h.infrastructure_checkers).toBe(1);
    // The monitor is nowhere in the organic counts, by either row.
    expect(h.checker_clients.join(" ")).not.toContain("monitor");
    expect(h.items_after_check).toEqual([{ item: "observation", clients: 1 }]);
  });

  it("excludes a monitor whose stored channel still says mcp, from before the classifier was fixed", () => {
    /**
     * THE ROWS ALREADY ON THE BOOKS. inferChannel short-circuited on
     * viaMcp before it read the crawler table until 2026-09-08, so
     * every self-identifying prober that came through /mcp was stamped
     * `mcp` and never `infrastructure`. The classifier is fixed; the
     * stamps are not, because a stamp is written once at the door. A
     * filter trusting the stored channel would exclude the monitors
     * arriving from now on and keep counting the ones already booked —
     * the worse half of the bug, and the half nobody would notice.
     */
    const at = (minute: number): string => new Date(Date.UTC(2026, 8, 5, 12, minute)).toISOString();
    const ev = (kind: MetricEvent["kind"], item: string, ua: string, minute: number): MetricEvent => ({
      // Stamped `mcp` at the door, as every pre-fix row was.
      kind, item, channel: "mcp", house: false, at: at(minute), user_agent: ua,
    });
    const events: MetricEvent[] = [
      ev("porch", "mcp:tool:check_conformance", "x402-conformance-monitor/0.1", 0),
      ev("challenge", "observation", "x402-conformance-monitor/0.1", 5),
      // A real MCP client on a generic SDK string stays counted: the
      // table names machinery, and `mcp` alone is a transport.
      ev("porch", "mcp:tool:preflight_endpoint", "node", 0),
      ev("challenge", "observation", "node", 5),
    ];
    const h = handoffs(events, "2026-09");
    expect(h.checkers).toBe(1);
    expect(h.checker_clients).toEqual(["node"]);
    expect(h.infrastructure_checkers).toBe(1);
    expect(h.then_priced).toBe(1);
  });

  it("renders behind the keeper's door and stores the reading for next time", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.instrumentsReading);
    const page = await SELF.fetch("https://scvd.store/admin/instruments", { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Free instruments");
    expect(html).toContain("Read the gaps as gaps");
    expect(html).toContain("logged since");
    expect(html).toContain("After the sale");
    expect(html).toContain("The handoff");
    // The till line points at the desk AND says why the two can disagree.
    expect(html).toContain("At the till");
    expect(html).toContain("THE TWO READ DIFFERENT THINGS");
    const stored = await readInstrumentReading(testEnv);
    expect(stored?.month).toBe(new Date().toISOString().slice(0, 7));
  });
});
