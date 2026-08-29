import { describe, expect, it } from "vitest";
import {
  batteryDelta,
  V2_ONLY_CHECKS,
  type ScoredRow,
} from "@/services/battery-delta";
import {
  BATTERY_ADDS,
  BATTERY_CHECK_NAMES,
  PREFLIGHT_VERSION_NEXT,
} from "@/services/preflight";

/**
 * THE TALLY THAT MAKES THE KEEPER'S DEFERRAL DECIDABLE.
 *
 * He held the v2-everywhere call and said why: "we are monitoring to
 * see if v2 is more effective then we should just enhance it." We
 * were not monitoring — `also_under` said it per-door and nothing
 * added it up. This counts it, from rows already sealed.
 *
 * The cases below are chosen for the ways a naive counter gets this
 * wrong, and every one of them is a way that would have INFLATED our
 * own new battery's case:
 *
 *   - a row failing BOTH a v1 check and a v2 check is NOT a
 *     disagreement. Both batteries called it not_ready; v2 merely had
 *     more to say. Counting it would credit v2 with catching a door
 *     v1 had already caught.
 *   - unreachable and not_probed rows are NOT agreement. No battery
 *     scored them. Counting them would pad the denominator with doors
 *     nobody judged and drive the disagreement rate toward zero.
 *   - a clean row IS agreement, and belongs in the denominator.
 */

const V1_CHECK = BATTERY_CHECK_NAMES[0]!;
const V2_CHECK = BATTERY_ADDS[PREFLIGHT_VERSION_NEXT][0]!;

function row(verdict: string, failed: string[] = []): ScoredRow {
  return { verdict, failed };
}

describe("what v2 catches that v1 misses", () => {
  it("takes the v2-only names from the battery registry, never a copy", () => {
    // Retyping this list is how the tally would come to disagree with
    // the battery it is measuring — the exact defect the store keeps
    // finding elsewhere.
    expect(V2_ONLY_CHECKS).toEqual(BATTERY_ADDS[PREFLIGHT_VERSION_NEXT]);
    expect(V2_ONLY_CHECKS.length).toBeGreaterThan(0);
  });

  it("counts a door only v2 failed as the catch it is", () => {
    const delta = batteryDelta([row("not_ready", [V2_CHECK])]);
    expect(delta.scored).toBe(1);
    expect(delta.caught_by_v2_only).toBe(1);
    expect(delta.agreed).toBe(0);
    expect(delta.by_check[V2_CHECK]).toBe(1);
  });

  /**
   * THE CASE THAT DECIDES WHETHER THIS NUMBER IS HONEST. Both
   * batteries rejected this door. Crediting v2 with it would make the
   * stricter battery look more effective than it is, using a door the
   * old one had already stopped — and we would be doing it in our own
   * favour, about our own instrument, in public.
   */
  it("does not credit v2 for a door v1 had already failed", () => {
    const delta = batteryDelta([row("not_ready", [V1_CHECK, V2_CHECK])]);
    expect(delta.scored).toBe(1);
    expect(delta.caught_by_v2_only).toBe(0);
    expect(delta.agreed).toBe(1);
    expect(delta.by_check).toEqual({});
  });

  it("counts a clean door as agreement", () => {
    const delta = batteryDelta([row("ready")]);
    expect(delta).toMatchObject({ scored: 1, agreed: 1, caught_by_v2_only: 0 });
  });

  /**
   * A door nobody scored is not a door the batteries agreed about.
   * Padding the denominator with unreachables would drive the
   * disagreement rate toward zero and quietly argue for leaving
   * things as they are.
   */
  it("keeps unscored doors out of the denominator entirely", () => {
    const delta = batteryDelta([
      row("unreachable"),
      row("not_probed"),
      row("ready"),
    ]);
    expect(delta.scored).toBe(1);
    expect(delta.agreed).toBe(1);
  });

  it("adds up over a mixed week and keeps the arithmetic closed", () => {
    const delta = batteryDelta([
      row("ready"),
      row("ready"),
      row("not_ready", [V2_CHECK]),
      row("not_ready", [V1_CHECK]),
      row("not_ready", [V1_CHECK, V2_CHECK]),
      row("unreachable"),
    ]);
    expect(delta.scored).toBe(5);
    expect(delta.caught_by_v2_only).toBe(1);
    // agreed + caught must equal scored, always — a tally whose parts
    // do not sum to its denominator is a tally nobody should quote.
    expect(delta.agreed + delta.caught_by_v2_only).toBe(delta.scored);
  });

  it("names both batteries and publishes what it does not settle", () => {
    const delta = batteryDelta([row("ready")]);
    expect(delta.batteries.baseline).toBe("v1");
    expect(delta.batteries.compared).toBe("v2");
    // The number is an input to the keeper's call, and says so rather
    // than being quoted as the call.
    expect(delta.what_this_does_not_settle).toContain("keeper's");
  });

  /**
   * THE STRUCTURAL CLAIM THE WHOLE READING RESTS ON: v2's check set is
   * v1's plus BATTERY_ADDS.v2, so v2 can never pass a door v1 failed
   * and "disagreement" has exactly one direction. If that superset
   * relation ever breaks — a v2 that DROPS a v1 check — the one-way
   * assumption is false, this tally silently means something else,
   * and the argument in battery-delta.ts is wrong. So it is asserted
   * rather than believed.
   */
  it("holds the superset relation the one-way reading depends on", () => {
    const v1 = new Set<string>(BATTERY_CHECK_NAMES);
    const overlap = BATTERY_ADDS[PREFLIGHT_VERSION_NEXT].filter((name) =>
      v1.has(name),
    );
    expect(
      overlap,
      "a v2 addition is already in v1's core, so the two sets are not baseline-plus-extras and the one-way disagreement argument no longer holds",
    ).toEqual([]);
  });
});
