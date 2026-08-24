import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { COLD_SUBJECTS, runColdExport } from "@/services/cold-export";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
/* The binding is optional in the type (a deploy can run without the
 * bucket); these tests exist because it is bound in this environment. */
const bucket = testEnv.CORPUS_R2!;

/**
 * ROADMAP 0.11 — THE ANCHOR CHAIN PROVES INTEGRITY, NOT AVAILABILITY.
 *
 * Every signature, digest and OpenTimestamps proof this store serves
 * answers one question: has the record been ALTERED. None of them
 * answers whether it is still THERE. Bitcoin will happily confirm
 * that a corpus entry existed on a given day, to a reader who no
 * longer has the entry.
 *
 * The exposure is not mainly the corpus — bodies already live in R2
 * as self-contained records, so losing the KV namespace would cost
 * the index rather than the evidence. It is `cert:`. This store
 * publishes that every certificate verifies free FOREVER, and repeats
 * it on every retirement tombstone: "retirement changes the shelf,
 * not the record." That promise was backed by one KV namespace and
 * nothing else.
 */
beforeEach(async () => {
  const listed = await testEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix });
  await Promise.all(listed.keys.map((k) => testEnv.PATRONS.delete(k.name)));
});

describe("the copy that survives losing the namespace", () => {
  it("carries certificates out first, because they cannot be reissued honestly", async () => {
    // The order is the argument: a counter can be recomputed, a
    // certificate names the moment it was written.
    expect(COLD_SUBJECTS[0]!.prefix).toBe(KV_KEYS.certPrefix);
    expect(COLD_SUBJECTS[0]!.stakes).toContain("forever");
  });

  it("writes every certificate into the bundle, with a checkable digest", async () => {
    await testEnv.PATRONS.put(
      KV_KEYS.cert("cert_abc"),
      JSON.stringify({ id: "cert_abc", issued: "2026-08-24" }),
    );
    const report = await runColdExport(testEnv);

    const certs = report.bundles.find((b) => b.prefix === KV_KEYS.certPrefix);
    expect(certs).toBeDefined();
    expect(certs!.keys).toBe(1);
    // A bundle without a digest is a bundle nobody can check on the
    // day they need it.
    expect(certs!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(certs!.truncated).toBe(false);

    const stored = await bucket.get(certs!.r2_key);
    expect(stored).not.toBeNull();
    const body = JSON.parse(await stored!.text()) as {
      rows: Record<string, string>;
    };
    expect(body.rows[KV_KEYS.cert("cert_abc")]).toContain("cert_abc");
  });

  it("writes a manifest naming every bundle it wrote", async () => {
    const report = await runColdExport(testEnv);
    const manifest = await bucket.get(report.manifest_key);
    expect(manifest).not.toBeNull();
    const parsed = JSON.parse(await manifest!.text()) as typeof report;
    expect(parsed.bundles.map((b) => b.r2_key).sort()).toEqual(
      report.bundles.map((b) => b.r2_key).sort(),
    );
  });

  it("says out loud what a copy does not prove", async () => {
    /*
     * The half that gets skipped. Writing the copy is easy; having
     * walked a restore before you need one is the part that matters,
     * and a backup never restored is a belief rather than a backup.
     * Claiming this is an offsite backup would be its own overclaim —
     * both surfaces sit in one account.
     */
    const report = await runColdExport(testEnv);
    const said = report.what_this_does_not_prove.join(" ");
    expect(said).toContain("restore");
    expect(said).toContain("one account");
    expect(said).toContain("truncated");
  });

  it("is idempotent within a day rather than growing a bundle per run", async () => {
    const at = new Date("2026-08-24T11:00:00.000Z");
    const first = await runColdExport(testEnv, at);
    const second = await runColdExport(testEnv, at);
    expect(second.manifest_key).toBe(first.manifest_key);
    expect(second.bundles.map((b) => b.r2_key)).toEqual(
      first.bundles.map((b) => b.r2_key),
    );
  });
});
