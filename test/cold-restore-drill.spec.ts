import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { runColdExport } from "@/services/cold-export";
import { planRestore, restoreBundle } from "@/services/cold-restore";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const bucket = testEnv.CORPUS_R2!;

/**
 * ROADMAP 0.11, THE OTHER HALF — A BACKUP NEVER RESTORED IS A BELIEF.
 *
 * The weekly cold export has shipped since 2026-08-24 and its own
 * header admits the gap it could not close from inside itself: "the
 * half that matters is having walked a restore before you need one."
 * The roadmap row stayed `[~]` for exactly that reason.
 *
 * This file walks one. Not a described procedure in a document that
 * drifts from the code — an actual round trip on every build: seed
 * evidence, export it, destroy the live copy, plan the restore, run
 * it, and compare bytes. The documented drill is the same two calls a
 * keeper makes against production, which is the only kind of drill
 * that gets run.
 *
 * WHAT A GREEN RUN HERE DOES NOT LICENCE ANYONE TO SAY. It proves the
 * mechanism, in this environment, against these bindings. It does not
 * prove the production bucket is intact today, that the account
 * survives, or that anyone remembers where the manifest lives. The
 * drill reports its own limits in `what_this_does_not_prove` and the
 * last test here pins that it keeps reporting them, because a limit
 * that quietly stops being printed is how a narrow claim turns into a
 * broad one.
 */

const CERT_A = KV_KEYS.cert("cert_drill_a");
const CERT_B = KV_KEYS.cert("cert_drill_b");
const BODY_A = JSON.stringify({ id: "cert_drill_a", issued: "2026-08-26" });
const BODY_B = JSON.stringify({ id: "cert_drill_b", issued: "2026-08-26" });

const DAY = "2026-08-26";
const AT = new Date(`${DAY}T11:00:00.000Z`);

async function wipeCerts(): Promise<void> {
  const listed = await testEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix });
  await Promise.all(listed.keys.map((k) => testEnv.PATRONS.delete(k.name)));
}

async function seedAndExport(): Promise<string> {
  await testEnv.PATRONS.put(CERT_A, BODY_A);
  await testEnv.PATRONS.put(CERT_B, BODY_B);
  const report = await runColdExport(testEnv, AT);
  const certs = report.bundles.find((b) => b.prefix === KV_KEYS.certPrefix);
  expect(certs).toBeDefined();
  // Non-vacuity: a drill over an empty bundle would pass by proving
  // nothing, which is the failure mode every backup test has.
  expect(certs!.keys).toBeGreaterThanOrEqual(2);
  return certs!.r2_key;
}

beforeEach(wipeCerts);

describe("the restore drill, walked rather than described", () => {
  it("puts every destroyed certificate back, byte for byte", async () => {
    const key = await seedAndExport();
    await wipeCerts();
    expect(await testEnv.PATRONS.get(CERT_A)).toBeNull();

    const plan = await planRestore(testEnv, DAY);
    const audit = plan.bundles.find((b) => b.r2_key === key)!;
    expect(audit.digest_matches).toBe(true);
    expect(audit.missing_in_kv).toBeGreaterThanOrEqual(2);
    expect(plan.restorable).toBe(true);

    const result = await restoreBundle(testEnv, DAY, key);
    expect(result.refused).toEqual([]);
    expect(result.written).toBeGreaterThanOrEqual(2);
    // The whole claim: what comes back is what went in.
    expect(await testEnv.PATRONS.get(CERT_A)).toBe(BODY_A);
    expect(await testEnv.PATRONS.get(CERT_B)).toBe(BODY_B);
  });

  it("plans without writing, so the drill can be run on an ordinary day", async () => {
    const key = await seedAndExport();
    await wipeCerts();

    await planRestore(testEnv, DAY);
    // A drill that repairs what it is auditing cannot be run to find
    // out whether a repair is needed.
    expect(await testEnv.PATRONS.get(CERT_A)).toBeNull();

    const second = await restoreBundle(testEnv, DAY, key);
    expect(second.written).toBeGreaterThanOrEqual(2);
  });

  it("refuses a bundle whose bytes no longer hash to the manifest", async () => {
    const key = await seedAndExport();
    await wipeCerts();

    const stored = JSON.parse(await (await bucket.get(key))!.text()) as {
      rows: Record<string, string>;
    };
    stored.rows[CERT_A] = JSON.stringify({ id: "cert_drill_a", issued: "who" });
    await bucket.put(key, JSON.stringify(stored));

    const plan = await planRestore(testEnv, DAY);
    const audit = plan.bundles.find((b) => b.r2_key === key)!;
    expect(audit.digest_matches).toBe(false);
    expect(plan.restorable).toBe(false);

    const result = await restoreBundle(testEnv, DAY, key);
    expect(result.written).toBe(0);
    expect(result.refused.join(" ")).toContain("hash");
    // The refusal has to be load-bearing, not advisory.
    expect(await testEnv.PATRONS.get(CERT_A)).toBeNull();
  });

  it("refuses a truncated bundle rather than publishing a subset as the set", async () => {
    const key = `backup/${DAY}/partial.json`;
    const body = JSON.stringify({
      prefix: KV_KEYS.certPrefix,
      namespace: "PATRONS",
      taken_at: AT.toISOString(),
      truncated: true,
      rows: { [CERT_A]: BODY_A },
    });
    await bucket.put(key, body);
    const digest = [...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
    )]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await bucket.put(
      `backup/${DAY}/manifest.json`,
      JSON.stringify({
        taken_at: AT.toISOString(),
        bundles: [
          {
            prefix: KV_KEYS.certPrefix,
            namespace: "PATRONS",
            keys: 1,
            sha256: digest,
            r2_key: key,
            truncated: true,
          },
        ],
        manifest_key: `backup/${DAY}/manifest.json`,
        what_this_does_not_prove: [],
      }),
    );

    const result = await restoreBundle(testEnv, DAY, key);
    // The digest is correct here on purpose: truncation has to refuse
    // on its own, not ride on some other check happening to fail.
    expect(result.refused.join(" ")).toContain("PARTIAL");
    expect(result.written).toBe(0);
    expect(await testEnv.PATRONS.get(CERT_A)).toBeNull();
  });

  it("never deletes what the bundle does not contain", async () => {
    const key = await seedAndExport();
    const newer = KV_KEYS.cert("cert_issued_after_backup");
    await testEnv.PATRONS.put(newer, "issued after the export ran");

    const plan = await planRestore(testEnv, DAY);
    const audit = plan.bundles.find((b) => b.r2_key === key)!;
    expect(audit.extra_in_kv).toBeGreaterThanOrEqual(1);

    await restoreBundle(testEnv, DAY, key);
    /*
     * A restore that also removed live keys absent from the bundle
     * would be a ROLLBACK, and run against a stale bundle it would
     * destroy every certificate issued since the export. The count is
     * reported so an operator can see it; acting on it is the wrong
     * instinct at the worst possible moment.
     */
    expect(await testEnv.PATRONS.get(newer)).toBe("issued after the export ran");
  });

  it("refuses a manifest it cannot find, instead of reporting a clean drill", async () => {
    // Rule 52: a lookup that cannot see everything must not answer
    // "no". An absent manifest is not a passing drill.
    const plan = await planRestore(testEnv, "1999-01-01");
    expect(plan.bundles).toEqual([]);
    expect(plan.restorable).toBe(false);
  });

  it("keeps saying what a passing drill does not prove", async () => {
    const plan = await planRestore(testEnv, DAY);
    const said = plan.what_this_does_not_prove.join(" ");
    expect(said).toContain("account");
    expect(said).toContain("truncated");
    expect(plan.what_this_does_not_prove.length).toBeGreaterThanOrEqual(3);
  });
});
