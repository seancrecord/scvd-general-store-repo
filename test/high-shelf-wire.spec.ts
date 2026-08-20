import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HIGH_SHELF_FLOOR_USDC,
  highShelf,
  offerFacts,
} from "@/services/market";
import {
  clearStatuses,
  contactEmail,
  wireNote,
  type OutreachLedger,
  type Prospect,
} from "@/services/outreach";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

vi.mock("@/services/ward-round", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/ward-round")>();
  return {
    ...original,
    probeHost: vi.fn(async () => ({
      verdict: "not_ready" as const,
      failed: ["no accepts entry priced in USDC"],
      advisories: [],
    })),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function challenge(accepts: Record<string, unknown>[]): Response {
  return new Response(null, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 2, accepts })),
    },
  });
}

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

describe("the offer capture keeps the top of the market, not just the floor", () => {
  it("records min, max, and payTo from the door's own accepts", () => {
    const facts = offerFacts(
      challenge([
        {
          network: "eip155:8453",
          scheme: "exact",
          asset: USDC_BASE,
          amount: "1000000",
          payTo: "0xAbCd000000000000000000000000000000000001",
        },
        {
          network: "eip155:8453",
          scheme: "exact",
          asset: USDC_BASE,
          amount: "250000000",
          payTo: "0xAbCd000000000000000000000000000000000001",
        },
      ]),
    )!;
    expect(facts.min_usdc).toBe(1);
    expect(facts.max_usdc).toBe(250);
    // 0x addresses fold to lowercase; the base58 law would keep a
    // solana payTo verbatim.
    expect(facts.pay_to).toEqual([
      "0xabcd000000000000000000000000000000000001",
    ]);
  });
});

function host(
  name: string,
  minUsdc: number | undefined,
  maxUsdc?: number,
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/x`,
    verdict: "ready",
    failed: [],
    advisories: [],
    ...(minUsdc !== undefined
      ? {
          offer: {
            networks: ["eip155:8453"],
            schemes: ["exact"],
            min_usdc: minUsdc,
            ...(maxUsdc !== undefined ? { max_usdc: maxUsdc } : {}),
          },
        }
      : {}),
  };
}

function round(hosts: WardHostResult[]): WardRound {
  return {
    week: "2026-W34",
    at: "2026-08-19T17:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

describe("the high shelf", () => {
  it("lists doors whose top ask clears the floor, dearest first", () => {
    const shelf = highShelf(
      round([
        host("cheap.example", 0.01),
        host("tiered.example", 1, 120), // min under the floor, max over —
        // exactly the door min-only capture used to hide
        host("premium.example", 75),
        host("silent.example", undefined),
      ]),
    );
    expect(shelf.rows.map((row) => row.host)).toEqual([
      "tiered.example",
      "premium.example",
    ]);
    expect(shelf.rows[0]!.ask_max).toBe(120);
    expect(shelf.truncated).toBe(false);
    expect(HIGH_SHELF_FLOOR_USDC).toBe(50);
  });
});

describe("the wire holds the verified-fact law", () => {
  const prospect: Prospect = {
    host: "broken.example",
    url: "https://broken.example/api/x",
    verdict: "not_ready",
    failed: ["stale finding from the round"],
    week: "2026-W34",
    observed_at: "2026-08-19T17:00:00.000Z",
    newly_failing: false,
    reason: "answers, but not as an x402 door",
  };

  it("refuses a host that already got its one note", async () => {
    const ledger: OutreachLedger = {
      version: 1,
      hosts: {
        "broken.example": {
          status: "sent",
          wired: true,
          sent_to: "sec@broken.example",
        },
      },
    };
    const outcome = await wireNote(testEnv, "broken.example", [prospect], ledger);
    expect(outcome.sent).toBe(false);
    expect(!outcome.sent && outcome.reason).toBe("already-sent");
  });

  it("refuses hosts with no published email — hand delivery only", async () => {
    const ledger: OutreachLedger = {
      version: 1,
      hosts: {
        "broken.example": { contacts: ["https://broken.example/contact-form"] },
      },
    };
    const outcome = await wireNote(testEnv, "broken.example", [prospect], ledger);
    expect(!outcome.sent && outcome.reason).toBe("no-email-contact");
  });

  it("sends the live finding, not the stored one, and stamps a permanent wire record", async () => {
    const withKey = { ...testEnv, RESEND_API_KEY: "test-key" } as Env;
    const ledger: OutreachLedger = {
      version: 1,
      hosts: { "broken.example": { contacts: ["mailto:sec@broken.example"] } },
    };
    const sends: string[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        sends.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
      });
    const outcome = await wireNote(withKey, "broken.example", [prospect], ledger);
    fetchSpy.mockRestore();

    expect(outcome.sent).toBe(true);
    expect(outcome.sent && outcome.to).toBe("sec@broken.example");
    // The verified-fact law: the email body carries the LIVE probe's
    // finding and the re-verified line — never the round's stale one.
    expect(sends[0]).toContain("no accepts entry priced in USDC");
    expect(sends[0]).not.toContain("stale finding from the round");
    expect(sends[0]).toContain("re-checked seconds before this note was sent");

    const entry = ledger.hosts["broken.example"]!;
    expect(entry.status).toBe("sent");
    expect(entry.wired).toBe(true);
    expect(entry.sent_to).toBe("sec@broken.example");
    // The mispress-recovery lever must not re-arm a wire that fired.
    expect(clearStatuses(ledger)).toBe(0);
    expect(entry.status).toBe("sent");
  });

  it("marks a healed door fixed and sends nothing", async () => {
    const { probeHost } = await import("@/services/ward-round");
    (probeHost as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      verdict: "ready",
      failed: [],
      advisories: [],
    });
    const withKey = { ...testEnv, RESEND_API_KEY: "test-key" } as Env;
    const ledger: OutreachLedger = {
      version: 1,
      hosts: { "broken.example": { contacts: ["sec@broken.example"] } },
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const outcome = await wireNote(withKey, "broken.example", [prospect], ledger);
    expect(!outcome.sent && outcome.reason).toBe("door-healed");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ledger.hosts["broken.example"]!.status).toBe("fixed");
    fetchSpy.mockRestore();
  });
});

describe("the batch wire: one press, ten verified sends, nothing on a clock", () => {
  const mkProspect = (name: string): Prospect => ({
    host: name,
    url: `https://${name}/api/x`,
    verdict: "not_ready",
    failed: ["stale finding from the round"],
    week: "2026-W34",
    observed_at: "2026-08-19T17:00:00.000Z",
    newly_failing: false,
    reason: "answers, but not as an x402 door",
  });
  const mkLedger = (hosts: string[]): OutreachLedger => ({
    version: 1,
    hosts: Object.fromEntries(
      hosts.map((h) => [h, { contacts: [`sec@${h}`] }]),
    ),
  });

  it("caps at ten per press and says how many the cap left", async () => {
    const { wireAllScouted, WIRE_BATCH_CAP } = await import(
      "@/services/outreach"
    );
    expect(WIRE_BATCH_CAP).toBe(10);
    const names = Array.from({ length: 12 }, (_, i) => `door${i}.example`);
    const prospects = names.map(mkProspect);
    const ledger = mkLedger(names);
    const withKey = { ...testEnv, RESEND_API_KEY: "test-key" } as Env;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
      );
    const report = await wireAllScouted(withKey, prospects, ledger);
    fetchSpy.mockRestore();
    expect(report.sent.length).toBe(10);
    expect(report.remaining).toBe(2);
    // Every send stamped permanently; the two beyond the cap untouched.
    expect(ledger.hosts["door0.example"]!.wired).toBe(true);
    expect(ledger.hosts["door11.example"]!.status).toBeUndefined();
  });

  it("eligibility is the card button's own: no email or already sent means not in the batch", async () => {
    const { wireAllScouted } = await import("@/services/outreach");
    const prospects = ["a.example", "b.example", "c.example"].map(mkProspect);
    const ledger: OutreachLedger = {
      version: 1,
      hosts: {
        "a.example": { contacts: ["https://a.example/form"] },
        "b.example": { contacts: ["sec@b.example"], status: "sent", wired: true },
        "c.example": { contacts: ["sec@c.example"] },
      },
    };
    const withKey = { ...testEnv, RESEND_API_KEY: "test-key" } as Env;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
      );
    const report = await wireAllScouted(withKey, prospects, ledger);
    fetchSpy.mockRestore();
    expect(report.sent.map((s) => s.host)).toEqual(["c.example"]);
    expect(report.remaining).toBe(0);
    // The form-only and already-sent hosts were never even refusals —
    // they were simply not the batch's business.
    expect(report.refused).toEqual([]);
  });

  it("a healed door inside the batch is skipped and marked, the rest still send", async () => {
    const { wireAllScouted } = await import("@/services/outreach");
    const { probeHost } = await import("@/services/ward-round");
    (probeHost as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      verdict: "ready",
      failed: [],
      advisories: [],
    });
    const prospects = ["healed.example", "still-broken.example"].map(mkProspect);
    const ledger = mkLedger(["healed.example", "still-broken.example"]);
    const withKey = { ...testEnv, RESEND_API_KEY: "test-key" } as Env;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
      );
    const report = await wireAllScouted(withKey, prospects, ledger);
    fetchSpy.mockRestore();
    expect(report.healed).toEqual(["healed.example"]);
    expect(report.sent.map((s) => s.host)).toEqual(["still-broken.example"]);
    expect(ledger.hosts["healed.example"]!.status).toBe("fixed");
  });

  it("a wire that cannot send stops after the first refusal instead of logging it ten times", async () => {
    const { wireAllScouted } = await import("@/services/outreach");
    const names = ["a.example", "b.example", "c.example"];
    const report = await wireAllScouted(
      { ...testEnv, RESEND_API_KEY: undefined } as unknown as Env,
      names.map(mkProspect),
      mkLedger(names),
    );
    expect(report.sent).toEqual([]);
    expect(report.refused.length).toBe(1);
    expect(report.refused[0]!.reason).toContain("RESEND_API_KEY");
  });
});

describe("contactEmail reads only email-shaped contacts", () => {
  it("takes mailto: and bare addresses, skips URLs", () => {
    expect(contactEmail({ contacts: ["mailto:a@b.example"] })).toBe("a@b.example");
    expect(contactEmail({ contacts: ["https://x.example/form", "sec@x.example"] })).toBe(
      "sec@x.example",
    );
    expect(contactEmail({ contacts: ["https://x.example/form"] })).toBeNull();
    expect(contactEmail(undefined)).toBeNull();
  });
});
