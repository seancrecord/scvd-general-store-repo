import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  DEFECT_CLASSES,
  DEFECT_VOCABULARY_VERSION,
  defectClass,
  paidOnly,
  unpaidDetectable,
} from "@/store/defect-vocabulary";

/**
 * TWO INSTRUMENTS, ONE VOCABULARY.
 *
 * On 2026-08-23 there were two parties publishing dated conformance
 * findings about the public x402 economy — this store's weekly census
 * and an independent tester walking the same directory. Both signed
 * their results, both refused to audit themselves, and neither could
 * read the other's, because a finding called `replay-accepted` over
 * there and a stage called `replay` over here were two names with no
 * stated relationship.
 *
 * These tests defend the three properties that make the vocabulary
 * worth publishing rather than merely worth having: stable ids, an
 * honest method line, and no scores.
 */

describe("the vocabulary is stable enough to cite", () => {
  it("gives every class a unique, lowercase, citable id", () => {
    const ids = DEFECT_CLASSES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      // Citable means URL-safe and stable: an id somebody puts in a
      // report should never need escaping or renaming.
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("makes every class answer the three questions that make it usable", () => {
    for (const entry of DEFECT_CLASSES) {
      expect(entry.asserts, `${entry.id} asserts nothing`).toBeTruthy();
      expect(entry.costs, `${entry.id} names no cost`).toBeTruthy();
      /*
       * THE EVIDENCE DISCIPLINE, borrowed openly from Cairn's wake-124
       * rule: a claim that cannot be falsified is not a finding, it is
       * an opinion with a name.
       */
      expect(entry.falsified_by, `${entry.id} cannot be falsified`).toBeTruthy();
    }
  });

  it("looks a class up by id and refuses to guess at an unknown one", () => {
    expect(defectClass("replay-accepted")?.detectable).toBe("paid");
    expect(defectClass("no-402")?.detectable).toBe("unpaid");
    expect(defectClass("not-a-real-class")).toBeUndefined();
  });
});

describe("the method line, which is the whole interop", () => {
  it("says of every class whether an unpaid probe can see it", () => {
    for (const entry of DEFECT_CLASSES) {
      expect(["unpaid", "paid"]).toContain(entry.detectable);
    }
    // Both halves are populated, or the distinction is decoration.
    expect(unpaidDetectable().length).toBeGreaterThan(0);
    expect(paidOnly().length).toBeGreaterThan(0);
  });

  it("keeps the defects only money reveals on the paid side", () => {
    /*
     * A free probe never pays, so it cannot see a door that serves the
     * goods twice, errors on a valid payment, or settles and returns
     * nothing. Marking any of these "unpaid" would promise a free
     * check that finds something it structurally cannot.
     */
    for (const id of ["replay-accepted", "settlement-error", "delivered-nothing"]) {
      expect(defectClass(id)?.detectable, id).toBe("paid");
    }
  });

  it("keeps rail-cannot-receive on the UNPAID side, which is the point", () => {
    /*
     * The tester who named this class found it by paying. On Solana it
     * is one unpaid read of a public ledger — so this store detects the
     * deepest published defect class in the market for free, and the
     * vocabulary has to say so or the claim is invisible.
     */
    expect(defectClass("rail-cannot-receive")?.detectable).toBe("unpaid");
    expect(defectClass("rail-cannot-receive")?.our_signal).toBe(
      "solana-rail-receivable",
    );
  });
});

describe("a taxonomy that does not become a scoreboard", () => {
  it("names no operator, host or wallet anywhere in the vocabulary", () => {
    /*
     * Rule 43 survives contact with a taxonomy or the taxonomy goes.
     * Every class describes an observable property of ONE endpoint at
     * ONE moment; the moment a hostname appears here it has become a
     * list of the accused.
     */
    const text = JSON.stringify(DEFECT_CLASSES);
    expect(text).not.toMatch(/https?:\/\/(?!cairnwake\.com)/);
    expect(text).not.toMatch(/\b0x[0-9a-fA-F]{40}\b/);
  });

  it("carries a falsifier on every cross-instrument mapping", () => {
    // A mapping is a claim ABOUT A THIRD PARTY. It ships with the path
    // to check it and what would show it wrong, or it does not ship.
    const mapped = DEFECT_CLASSES.flatMap((entry) => entry.also_known_as ?? []);
    expect(mapped.length).toBeGreaterThan(0);
    for (const foreign of mapped) {
      expect(foreign.instrument).toBeTruthy();
      expect(foreign.verify, `${foreign.as} has no verification path`).toBeTruthy();
      expect(foreign.falsified_by, `${foreign.as} cannot be falsified`).toBeTruthy();
    }
  });
});

describe("published where an instrument can actually fetch it", () => {
  it("serves JSON with the version and every class", async () => {
    const res = await SELF.fetch("https://scvd.store/defects.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: string;
      classes: unknown[];
      the_method_line: string;
    };
    expect(body.version).toBe(DEFECT_VOCABULARY_VERSION);
    expect(body.classes).toHaveLength(DEFECT_CLASSES.length);
    expect(body.the_method_line).toContain("unpaid");
  });

  it("answers markdown when an agent asks for it, and says so in Vary", async () => {
    const res = await SELF.fetch("https://scvd.store/defects", {
      headers: { Accept: "text/markdown" },
    });
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("vary")).toContain("Accept");
    const body = await res.text();
    expect(body).toContain("`rail-cannot-receive`");
    expect(body).toContain("**Falsified by:**");
  });

  it("renders a page for the person deciding whether it is honest", async () => {
    const res = await SELF.fetch("https://scvd.store/defects", {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Not a score, not a ranking");
    expect(body).toContain("detectable");
  });

  it("is named where agents actually read", async () => {
    const llms = await (await SELF.fetch("https://scvd.store/llms.txt")).text();
    expect(llms).toContain("/defects");
    expect(llms).toContain("Named defect classes");
    const devs = await (await SELF.fetch("https://scvd.store/developers")).text();
    expect(devs).toContain("/defects.json");
  });

  it("counts reads on the porch, so nobody has to guess if it is used", async () => {
    const { porchSurface } = await import("@/lib/porch-surface");
    expect(porchSurface("/defects", "GET")).toBe("defects");
    expect(porchSurface("/defects.json", "GET")).toBe("defects.json");
  });
});
