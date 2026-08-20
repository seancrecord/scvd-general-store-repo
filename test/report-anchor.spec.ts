import { env, SELF } from "cloudflare:test";
import { pendingProofBytes } from "./helpers/ots";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  getReportAnchor,
  sweepReportAnchors,
} from "@/services/report-anchors";
import { REPORT_BODY, REPORT_ID, REPORT_META } from "@/store/reports/x402-field-2026-08";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const CALENDARS = ["https://calendar.test"];

/**
 * Fake calendars throughout, same law as anchor-submit.spec.ts: the
 * property proved is that no calendar behaviour can damage the record
 * or overclaim the status, and only a misbehaving-on-demand server
 * proves that. One live stamp against the real calendars is owed the
 * day this deploys, and the artifact's own ots field is where it shows.
 */

function okProof(): typeof fetch {
  return (async () =>
    new Response(pendingProofBytes(), {
      status: 200,
    })) as unknown as typeof fetch;
}

function failing(): typeof fetch {
  return (async () =>
    new Response(null, { status: 503 })) as unknown as typeof fetch;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

beforeEach(async () => {
  await testEnv.COUNTERS.delete(KV_KEYS.reportAnchors);
});

describe("the report anchor sweep", () => {
  it("submits the body digest and stores the proof as PENDING, never complete", async () => {
    const sweep = await sweepReportAnchors(testEnv, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    expect(sweep.submitted).toBe(1);
    const record = await getReportAnchor(testEnv, REPORT_ID);
    // The digest anchored is exactly the served body_sha256 — a
    // stranger holding the body can recompute what the proof covers.
    expect(record?.digest).toBe(await sha256Hex(REPORT_BODY));
    expect(record?.ots.status).toBe("pending");
    expect(record?.ots.proof_base64).toBeTruthy();
  });

  it("records a calendar outage as FAILED and retries on the next pass", async () => {
    await sweepReportAnchors(testEnv, {
      fetch: failing(),
      calendars: CALENDARS,
    });
    expect((await getReportAnchor(testEnv, REPORT_ID))?.ots.status).toBe(
      "failed",
    );
    // Next hour, calendar back: the sweep resubmits on its own.
    const retry = await sweepReportAnchors(testEnv, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    expect(retry.submitted).toBe(1);
    expect((await getReportAnchor(testEnv, REPORT_ID))?.ots.status).toBe(
      "pending",
    );
  });

  it("upgrades a pending proof once the calendar serves the confirmed one", async () => {
    await sweepReportAnchors(testEnv, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    const sweep = await sweepReportAnchors(testEnv, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    expect(sweep.upgraded).toBe(1);
    const record = await getReportAnchor(testEnv, REPORT_ID);
    expect(record?.ots.status).toBe("complete");
    expect(record?.ots.upgraded_at).toBeTruthy();
  });
});

describe("the artifact states its anchor honestly in both states", () => {
  it("before any sweep: not_yet_submitted, said out loud", async () => {
    const artifact = (await (
      await SELF.fetch(`${BASE}/api/report/${REPORT_ID}`)
    ).json()) as Record<string, unknown>;
    const ots = artifact.ots as Record<string, unknown>;
    expect(ots.status).toBe("not_yet_submitted");
    // The signed payload's method line no longer disclaims anchoring —
    // the promise in the original meta ("anchoring to follow") is kept,
    // and this pin fails if the copy ever regresses to "not yet".
    expect(String(artifact.bitcoin_anchor)).toContain("OpenTimestamps");
    expect(REPORT_META.bitcoin_anchor).not.toContain("not yet anchored");
  });

  it("after a sweep: the proof, its digest, and what it does not prove", async () => {
    await sweepReportAnchors(testEnv, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    const artifact = (await (
      await SELF.fetch(`${BASE}/api/report/${REPORT_ID}`)
    ).json()) as Record<string, unknown>;
    const ots = artifact.ots as Record<string, unknown>;
    expect(ots.status).toBe("pending");
    expect(ots.digest_anchored).toBe(artifact.body_sha256);
    expect(ots.proof_base64).toBeTruthy();
    // The limits travel with the proof (a proof without its limits is
    // a ritual): verification instructions and the non-claim.
    expect(String(ots.how_to_verify)).toContain("ots verify");
    expect(String(ots.what_it_proves)).toContain("does not make");
    // The live state never leaks into the signed bytes: the signature
    // still verifies over a payload that carries no proof status.
    expect(String(artifact.signed_payload)).not.toContain("pending");
  });
});
