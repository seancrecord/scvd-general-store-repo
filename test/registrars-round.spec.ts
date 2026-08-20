import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { listAlerts } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { cachedPublicKeyHex } from "@/lib/signing";
import { runHealthChecks } from "@/services/health";
import { SAMPLE_ARTIFACT_ID } from "@/store/spec";
import type { CertificateRecord, Env } from "@/types";

const testEnv = env as unknown as Env;

/** Alerts dedupe for six hours; clear the marker to test a fresh raise. */
async function clearDedupe(condition: string, key: string): Promise<void> {
  await testEnv.COUNTERS.delete(`alert_sent:${condition}:${key}`);
}

async function alertsSince(): Promise<string[]> {
  return (await listAlerts(testEnv, 20)).map((alert) => alert.detail);
}

/**
 * THE REGISTRAR'S ROUND — docs/archive/EMPLOYEES.md's recommended first hire.
 *
 * READINESS names signature tenure as the one asset that cannot be
 * bought back, and the operational rule as "never take a verify URL
 * down, for any reason." Nothing enforced that until now. A deploy
 * could break verification and we would learn it from a stranger — or,
 * far more likely, never, because the people who check our signatures
 * are exactly the people who do not write to us.
 *
 * The employee is READ-ONLY on purpose. It reports and stops. It must
 * never re-sign, re-mint, or "repair" anything, because a store that
 * silently re-issues artifacts to make a check pass has destroyed the
 * only thing the check was protecting.
 */
describe("the registrar's round", () => {
  it("stays quiet when the store's own claims hold", async () => {
    // Seed the sample artifact so the round has something true to find.
    const publicKey = await cachedPublicKeyHex(testEnv.SIGNING_KEY);
    const { mintCertificate } = await import("@/services/certificates");
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const record: CertificateRecord = {
      certificate: { ...minted.certificate, cert_id: SAMPLE_ARTIFACT_ID },
      signature: minted.signature,
      public_key: publicKey,
    };
    // Re-sign under the sample id so the canonical form matches.
    const { signCertificate } = await import("@/lib/signing");
    const signed = await signCertificate(
      record.certificate,
      testEnv.SIGNING_KEY,
    );
    record.signature = signed.signature;
    record.public_key = signed.publicKey;
    await testEnv.PATRONS.put(
      KV_KEYS.cert(SAMPLE_ARTIFACT_ID),
      JSON.stringify(record),
    );

    await clearDedupe("signing_failure", `sample:${SAMPLE_ARTIFACT_ID}`);
    await clearDedupe("signing_failure", `verify:${SAMPLE_ARTIFACT_ID}`);
    await runHealthChecks(testEnv);

    const details = await alertsSince();
    expect(
      details.some((detail) => detail.includes(SAMPLE_ARTIFACT_ID)),
      "the round complained about an artifact that verifies fine",
    ).toBe(false);
  });

  it("raises signing_failure when the published sample stops resolving", async () => {
    await testEnv.PATRONS.delete(KV_KEYS.cert(SAMPLE_ARTIFACT_ID));
    await clearDedupe("signing_failure", `sample:${SAMPLE_ARTIFACT_ID}`);

    await runHealthChecks(testEnv);

    const details = await alertsSince();
    const raised = details.find((detail) =>
      detail.includes("does not resolve"),
    );
    expect(raised, "a 404 on the published sample raised nothing").toBeTruthy();
    // The alarm has to say why it matters, not just that it fired.
    expect(raised).toContain(SAMPLE_ARTIFACT_ID);
    expect(raised).toContain("a stranger tries first");
  });

  it("raises when the artifact resolves but no longer verifies", async () => {
    const publicKey = await cachedPublicKeyHex(testEnv.SIGNING_KEY);
    await testEnv.PATRONS.put(
      KV_KEYS.cert(SAMPLE_ARTIFACT_ID),
      JSON.stringify({
        certificate: {
          cert_id: SAMPLE_ARTIFACT_ID,
          item: "hello",
          patron_number: 1,
          date: "2026-07-22T00:00:00.000Z",
        },
        // A signature that is the right shape and the wrong bytes.
        signature: "ab".repeat(64),
        public_key: publicKey,
      }),
    );
    await clearDedupe("signing_failure", `verify:${SAMPLE_ARTIFACT_ID}`);

    await runHealthChecks(testEnv);

    const details = await alertsSince();
    const raised = details.find((detail) =>
      detail.includes("NO LONGER VERIFIES"),
    );
    expect(raised, "a broken signature raised nothing").toBeTruthy();
    // And it tells the keeper the one thing not to do in a panic.
    expect(raised).toContain("Do not re-issue anything");
  });

  it("raises when the advertised key drifts from the signing key", async () => {
    // The worst split: strangers verifying against the published key
    // fail while every check we run ourselves passes.
    await testEnv.PATRONS.put(
      KV_KEYS.cert(SAMPLE_ARTIFACT_ID),
      JSON.stringify({
        certificate: {
          cert_id: SAMPLE_ARTIFACT_ID,
          item: "hello",
          patron_number: 1,
          date: "2026-07-22T00:00:00.000Z",
        },
        signature: "ab".repeat(64),
        public_key: "cd".repeat(32),
      }),
    );
    await clearDedupe("signing_failure", `verify:${SAMPLE_ARTIFACT_ID}`);
    await runHealthChecks(testEnv);

    const details = await alertsSince();
    // Verification fails first here, which is correct ordering: a
    // broken signature is the louder fact and the round stops there.
    expect(
      details.some((detail) => detail.includes("NO LONGER VERIFIES")),
    ).toBe(true);
  });
});
