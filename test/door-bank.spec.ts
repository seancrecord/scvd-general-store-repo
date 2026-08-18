import { describe, expect, it } from "vitest";
import {
  DOOR_BANK_CAP,
  mergeDoors,
  pickRevisits,
  type DoorBank,
} from "@/services/door-bank";

/**
 * THE DOOR BANK — the ward's memory of declared doors. Built off the
 * 2026-W33 numbers: a broken discovery feed naming 100 rows with
 * coverage suspect, 60 of 200 cap slots used, 0.7% of the known
 * population walked. The bank's whole job is that a door the
 * directory declared once stays reachable to the instrument even when
 * the feed's pagination eats the listing.
 */

const empty: DoorBank = { doors: {}, cursor: null };

function bankOf(hosts: string[], week = "2026-W30"): DoorBank {
  const doors: DoorBank["doors"] = {};
  for (const host of hosts) {
    doors[host] = {
      url: `https://${host}/api/pay`,
      first_listed: week,
      last_listed: week,
    };
  }
  return { doors, cursor: null };
}

describe("merging a round's declared doors", () => {
  it("remembers a new door and refreshes a known one, keeping first_listed", () => {
    const first = mergeDoors(
      empty,
      [{ host: "a.example", url: "https://a.example/api/pay" }],
      "2026-W30",
    );
    const second = mergeDoors(
      first.bank,
      [{ host: "a.example", url: "https://a.example/api/pay2" }],
      "2026-W33",
    );
    const door = second.bank.doors["a.example"]!;
    // The URL follows the latest declaration; the history keeps its
    // starting point.
    expect(door.url).toBe("https://a.example/api/pay2");
    expect(door.first_listed).toBe("2026-W30");
    expect(door.last_listed).toBe("2026-W33");
  });

  it("evicts the longest-unlisted past the cap, and says how many", () => {
    const old = bankOf(
      Array.from({ length: DOOR_BANK_CAP }, (_, i) => `old-${i}.example`),
      "2026-W20",
    );
    const { bank, evicted } = mergeDoors(
      old,
      [
        { host: "fresh-1.example", url: "https://fresh-1.example/api" },
        { host: "fresh-2.example", url: "https://fresh-2.example/api" },
      ],
      "2026-W33",
    );
    expect(evicted).toBe(2);
    expect(Object.keys(bank.doors)).toHaveLength(DOOR_BANK_CAP);
    // The fresh declarations survive; the oldest weeks paid for them.
    expect(bank.doors["fresh-1.example"]).toBeDefined();
    expect(bank.doors["fresh-2.example"]).toBeDefined();
  });
});

describe("the rotation", () => {
  it("hands out doors after the cursor and wraps at the end", () => {
    const bank = { ...bankOf(["a.example", "b.example", "c.example"]), cursor: "b.example" };
    const { picks, cursor } = pickRevisits(bank, new Set(), 2);
    expect(picks.map((p) => p.host)).toEqual(["c.example", "a.example"]);
    expect(cursor).toBe("a.example");
  });

  it("skips hosts the round already has — one knock per host per week", () => {
    const bank = bankOf(["a.example", "b.example", "c.example"]);
    const { picks } = pickRevisits(bank, new Set(["b.example"]), 3);
    expect(picks.map((p) => p.host)).toEqual(["a.example", "c.example"]);
  });

  it("gives nothing when the cap is already spent, and holds the cursor", () => {
    const bank = { ...bankOf(["a.example"]), cursor: "a.example" };
    const zero = pickRevisits(bank, new Set(), 0);
    expect(zero.picks).toEqual([]);
    expect(zero.cursor).toBe("a.example");
  });

  it("never hands out more than the bank holds, even with slots to spare", () => {
    const bank = bankOf(["a.example", "b.example"]);
    const { picks } = pickRevisits(bank, new Set(), 50);
    expect(picks).toHaveLength(2);
    // No host twice: spare slots stay spare rather than double-knocking.
    expect(new Set(picks.map((p) => p.host)).size).toBe(2);
  });
});
