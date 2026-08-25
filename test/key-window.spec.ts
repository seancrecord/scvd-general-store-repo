import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { checkKeyServiceWindow } from "../verifier/x402-verify.js";
import { KV_KEYS } from "@/lib/kv-keys";
import { cachedPublicKeyHex } from "@/lib/signing";
import { RETIRED_KEYS } from "@/store/key-registry";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * LAYER 3, TESTED WITH THE FORGERY IT EXISTS TO CATCH (D4/L1,
 * 2026-08-24).
 *
 * Before this check, a stolen RETIRED key signing an artifact dated
 * after its own retirement sailed through /api/verify: signature
 * genuine (layer 1), key genuinely ours (layer 2), response reading
 * `status: "retired"` with prose that actively reassured — "expected
 * on an artifact issued before the handover" — without checking that
 * it was. The tamper-evidence rule applies: a claim like this is
 * tested by FORGING, not by checking the happy path twice, so the
 * route tests below plant exactly that artifact and demand the
 * response call it what it is.
 */
describe("checkKeyServiceWindow (the package function)", () => {
  // A fixture issuer, not scvd's real registry: the package is
  // generic and the test should prove it needs nothing of ours.
  const history = {
    current: { public_key: "AA".repeat(32), in_service_from: "2026-07-31" },
    retired: [
      {
        public_key: "bb".repeat(32),
        in_service_from: "2026-07-22",
        retired_on: "2026-07-31",
      },
    ],
  };

  it("passes an artifact dated inside a retired key's window", () => {
    const result = checkKeyServiceWindow(history, "bb".repeat(32), "2026-07-25T09:00:00Z");
    expect(result.status).toBe("in_service");
    expect(result.window).toEqual({
      in_service_from: "2026-07-22",
      retired_on: "2026-07-31",
    });
  });

  it("catches the stolen-retired-key shape: dated after retirement", () => {
    const result = checkKeyServiceWindow(history, "bb".repeat(32), "2026-08-15T00:00:00Z");
    expect(result.status).toBe("after_retirement");
    expect(result.detail).toContain("stolen");
  });

  it("catches a backdated artifact: dated before the key existed", () => {
    const retired = checkKeyServiceWindow(history, "bb".repeat(32), "2026-07-01");
    expect(retired.status).toBe("before_service");
    const current = checkKeyServiceWindow(history, "aa".repeat(32), "2026-07-15");
    expect(current.status).toBe("before_service");
  });

  it("the window is inclusive at both ends — the swap day carries both keys' last and first honest signatures", () => {
    expect(
      checkKeyServiceWindow(history, "bb".repeat(32), "2026-07-31T23:59:59Z").status,
    ).toBe("in_service");
    expect(
      checkKeyServiceWindow(history, "bb".repeat(32), "2026-07-22").status,
    ).toBe("in_service");
    expect(
      checkKeyServiceWindow(history, "aa".repeat(32), "2026-07-31").status,
    ).toBe("in_service");
  });

  it("a current key's window is open-ended", () => {
    const result = checkKeyServiceWindow(history, "aa".repeat(32), "2027-01-01");
    expect(result.status).toBe("in_service");
    expect(result.window?.retired_on).toBeNull();
  });

  it("normalises 0x prefixes and case, matching how keys travel", () => {
    const result = checkKeyServiceWindow(
      history,
      `0x${"BB".repeat(32)}`,
      "2026-07-25",
    );
    expect(result.status).toBe("in_service");
  });

  it("an unpublished key gets unknown_key, never a window verdict", () => {
    const result = checkKeyServiceWindow(history, "cc".repeat(32), "2026-07-25");
    expect(result.status).toBe("unknown_key");
    expect(result.window).toBeNull();
  });

  it("an unparseable date is reported, not guessed at", () => {
    const result = checkKeyServiceWindow(history, "bb".repeat(32), "last tuesday");
    expect(result.status).toBe("undated");
    // The window still travels: the caller learns what the artifact
    // COULD have been checked against.
    expect(result.window?.retired_on).toBe("2026-07-31");
  });
});

describe("/api/verify runs the window check on the artifact's own date", () => {
  const retiredKey = RETIRED_KEYS[0]!;

  async function plantCert(certId: string, publicKey: string, date: string): Promise<void> {
    await testEnv.PATRONS.put(
      KV_KEYS.cert(certId),
      JSON.stringify({
        certificate: {
          cert_id: certId,
          item: "hello",
          patron_number: 1,
          date,
        },
        // Junk on purpose: the window check answers a different
        // question than signature validity, and must answer it even
        // on a record whose signature fails.
        signature: "ab".repeat(64),
        public_key: publicKey,
      }),
    );
  }

  beforeEach(async () => {
    for (const id of ["cert_xw_forged", "cert_xw_honest", "cert_xw_current"]) {
      await testEnv.PATRONS.delete(KV_KEYS.cert(id));
    }
  });

  it("calls the forgery a forgery: retired key, dated after retirement", async () => {
    await plantCert("cert_xw_forged", retiredKey.public_key, "2026-08-15T12:00:00.000Z");
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/cert_xw_forged`)
    ).json()) as {
      signed_by: {
        status: string;
        service_window: {
          status: string;
          in_window: boolean;
          retired_on: string | null;
          artifact_dated: string;
          means: string;
        };
      };
    };
    // Attribution alone still reads "retired" — true, and exactly the
    // reassurance that used to be the whole answer.
    expect(body.signed_by.status).toBe("retired");
    const window = body.signed_by.service_window;
    expect(window.status).toBe("after_retirement");
    expect(window.in_window).toBe(false);
    expect(window.retired_on).toBe(retiredKey.retired_on);
    expect(window.artifact_dated).toBe("2026-08-15T12:00:00.000Z");
    expect(window.means).toContain("stolen");
  });

  it("clears the honest case: retired key, dated inside its window", async () => {
    await plantCert("cert_xw_honest", retiredKey.public_key, "2026-07-25T12:00:00.000Z");
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/cert_xw_honest`)
    ).json()) as {
      signed_by: { service_window: { status: string; in_window: boolean } };
    };
    expect(body.signed_by.service_window.status).toBe("in_service");
    expect(body.signed_by.service_window.in_window).toBe(true);
  });

  it("checks the current key too — a cert dated today is in service, and says since when", async () => {
    const current = await cachedPublicKeyHex(testEnv.SIGNING_KEY);
    await plantCert("cert_xw_current", current, new Date().toISOString());
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/cert_xw_current`)
    ).json()) as {
      signed_by: {
        status: string;
        service_window: {
          status: string;
          in_window: boolean;
          in_service_from: string;
          retired_on: string | null;
        };
      };
    };
    expect(body.signed_by.status).toBe("current");
    expect(body.signed_by.service_window.status).toBe("in_service");
    expect(body.signed_by.service_window.in_window).toBe(true);
    expect(body.signed_by.service_window.retired_on).toBeNull();
    // Derived from the registry, not typed here: the latest
    // retirement is when the current key took over. Recomputed the
    // same way so a second rotation cannot silently break this spec.
    const latestRetirement = [...RETIRED_KEYS]
      .map((key) => key.retired_on)
      .sort()
      .slice(-1)[0];
    expect(body.signed_by.service_window.in_service_from).toBe(
      latestRetirement,
    );
  });
});
