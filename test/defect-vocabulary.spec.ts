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
      // v4 and v10: the remediation, both halves, on every class.
      expect(entry.repair_hint, `${entry.id} tells the operator nothing`).toBeTruthy();
      expect(entry.buyer_hint, `${entry.id} tells the buyer nothing`).toBeTruthy();
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
  it("payto-moved is unpaid, a property of a series, and credits who named it", () => {
    const moved = defectClass("payto-moved");
    expect(moved?.detectable).toBe("unpaid");
    expect(moved?.our_signal).toContain("payto_changes");
    expect(moved?.sourced_by).toContain("x402 Trust");
    expect(moved?.registered).toBe("2026-09-01");
    // Not folded anywhere: no battery can see two moments at once.
    expect(moved?.our_signal).not.toContain("battery");
  });

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
    expect(body).toContain("Not a ranking, not a list of anybody");
    expect(body).toContain("detectable");
  });

  it("is named where agents actually read", async () => {
    const llms = await (await SELF.fetch("https://scvd.store/llms-full.txt")).text();
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

/**
 * THE SECOND REGISTER, AND WHY IT IS SECOND.
 *
 * 2026-08-24. Both instruments publishing dated findings in this
 * market had been making listing-backed claims for weeks with no name
 * for what made them weaker than walk-backed ones. This store found
 * that the hard way — /corpus/host pages reporting rounds we never
 * probed with the friendliest available reason — and fixed the
 * mechanism the same morning. The missing WORD took an outside
 * instrument to supply.
 *
 * The tests below hold the two properties that make a shared
 * vocabulary worth using: the registers stay SEPARATE, and no
 * definition can be quietly changed once other people build on it.
 */
describe("evidence labels are not defect classes", () => {
  it("keeps the two registers disjoint", async () => {
    const { DEFECT_CLASSES, EVIDENCE_LABELS } = await import(
      "@/store/defect-vocabulary"
    );
    const defects = new Set(DEFECT_CLASSES.map((entry) => entry.id));
    for (const label of EVIDENCE_LABELS) {
      // An id in both registers means a reader cannot tell whether a
      // finding is about the door or about our own coverage of it.
      expect(defects.has(label.id)).toBe(false);
    }
  });

  it("makes listed-not-walked say nothing about the service", async () => {
    /*
     * The misreading the label exists to block. "We did not look" read
     * as "we looked and it was suspect" would turn our own coverage
     * gaps into marks against operators — which is rule 43 inverted.
     */
    const { evidenceLabel } = await import("@/store/defect-vocabulary");
    const entry = evidenceLabel("listed-not-walked")!;
    expect(entry).toBeDefined();
    expect(entry.does_not_assert).toContain("never about the operator");
    expect(entry.falsified_by).toBeTruthy();
  });

  it("names an outside author rather than absorbing the definition", async () => {
    // A registrar that quietly becomes the author is a registrar
    // nobody else can afford to send definitions to.
    const { evidenceLabel } = await import("@/store/defect-vocabulary");
    const entry = evidenceLabel("listed-not-walked")!;
    expect(entry.authored_by).toContain("Cairn");
    expect(entry.registered).toBe("2026-08-24");
  });
});

describe("the vocabulary is governed, not merely open", () => {
  it("carries a changelog entry for the current version", async () => {
    const { DEFECT_VOCABULARY_VERSION, VOCABULARY_CHANGELOG } = await import(
      "@/store/defect-vocabulary"
    );
    const current = VOCABULARY_CHANGELOG.at(-1)!;
    expect(current.version).toBe(DEFECT_VOCABULARY_VERSION);
    // Who asked is part of the record: a definition that moved at an
    // outside party's request reads differently from one we changed.
    expect(current.at_the_instigation_of).toBeTruthy();
    expect(current.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("never drops an older version from the changelog", async () => {
    const { VOCABULARY_CHANGELOG } = await import("@/store/defect-vocabulary");
    const versions = VOCABULARY_CHANGELOG.map((entry) => entry.version);
    expect(versions).toContain("1");
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("publishes both registers and the changelog at /defects.json", async () => {
    const response = await SELF.fetch("https://scvd.store/defects.json");
    const body = (await response.json()) as Record<string, unknown>;
    expect(Array.isArray(body["classes"])).toBe(true);
    expect(Array.isArray(body["evidence_labels"])).toBe(true);
    expect(Array.isArray(body["changelog"])).toBe(true);
    expect(String(body["governance"])).toContain("never edited in place");
  });
});
