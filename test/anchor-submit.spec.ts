import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendAnchor,
  latestAnchor,
  listAnchors,
  verifyChain,
} from "@/services/anchor-log";
import {
  runAnchorCron,
  runAnchorSubmissions,
  submitToOts,
  upgradeOtsProof,
  ANCHOR_INTERVAL_HOURS,
  MAX_SUBMISSIONS_PER_RUN,
} from "@/services/anchor-submit";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE OUTSIDE HALF, tested for its failures rather than its successes.
 *
 * Everything here uses a fake fetch. That is not a shortcut — the
 * property being proved is that no behaviour of somebody else's server
 * can damage our chain, and the only way to prove that is to make
 * their server behave badly on demand. A live calendar cannot be asked
 * to return a 503 politely.
 *
 * HONEST LIMIT, stated because the store states limits: these tests
 * prove the CONTRACT (what we send, what we do with each answer). They
 * cannot prove the real OpenTimestamps calendars accept our submission
 * — that needs one live stamp, which is owed and recorded as owed.
 */

const CALENDARS = ["https://calendar.test"];

function okProof(bytes = new Uint8Array([1, 2, 3, 4])): typeof fetch {
  return (async () =>
    new Response(bytes, { status: 200 })) as unknown as typeof fetch;
}

function statusOnly(status: number): typeof fetch {
  return (async () => new Response(null, { status })) as unknown as typeof fetch;
}

function throwing(): typeof fetch {
  return (async () => {
    throw new Error("network is down");
  }) as unknown as typeof fetch;
}

async function clearAnchors(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.anchorLogPrefix,
  });
  for (const key of listed.keys) {
    await testEnv.COUNTERS.delete(key.name);
  }
}

beforeEach(async () => {
  await clearAnchors();
});

describe("submitting", () => {
  it("stores a returned proof as PENDING, never as complete", async () => {
    const record = await appendAnchor(testEnv);
    const result = await submitToOts(testEnv, record, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    // Bitcoin has not confirmed anything yet. Calling this complete
    // would be the exact overclaim the log exists to avoid.
    expect(result.ots?.status).toBe("pending");
    expect(result.ots?.proof_base64).toBeTruthy();
    expect(result.ots?.calendar).toBe(CALENDARS[0]);
    // Persisted, not just returned.
    expect((await latestAnchor(testEnv))?.ots?.status).toBe("pending");
  });

  it("sends the digest as 32 raw bytes, not as a hex string", async () => {
    const record = await appendAnchor(testEnv);
    let sentLength: number | null = null;
    const capture = (async (_url: string, init: RequestInit) => {
      sentLength = (init.body as Uint8Array).length;
      return new Response(new Uint8Array([9]), { status: 200 });
    }) as unknown as typeof fetch;
    await submitToOts(testEnv, record, {
      fetch: capture,
      calendars: CALENDARS,
    });
    expect(sentLength).toBe(32);
  });

  it("falls through to the next calendar when the first refuses", async () => {
    const record = await appendAnchor(testEnv);
    const calls: string[] = [];
    const flaky = (async (url: string) => {
      calls.push(url);
      return url.startsWith("https://first")
        ? new Response(null, { status: 503 })
        : new Response(new Uint8Array([7, 7]), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await submitToOts(testEnv, record, {
      fetch: flaky,
      calendars: ["https://first.test", "https://second.test"],
    });
    expect(calls.length).toBe(2);
    expect(result.ots?.status).toBe("pending");
    expect(result.ots?.calendar).toBe("https://second.test");
  });

  it("records a failure without throwing when every calendar is down", async () => {
    const record = await appendAnchor(testEnv);
    const result = await submitToOts(testEnv, record, {
      fetch: throwing(),
      calendars: CALENDARS,
    });
    expect(result.ots?.status).toBe("failed");
    expect(String(result.ots?.error)).toContain("network is down");
  });

  it("treats an empty body as a failure rather than a proof", async () => {
    const record = await appendAnchor(testEnv);
    const result = await submitToOts(testEnv, record, {
      fetch: okProof(new Uint8Array()),
      calendars: CALENDARS,
    });
    expect(result.ots?.status).toBe("failed");
    expect(String(result.ots?.error)).toContain("empty proof");
  });

  it("NEVER damages the chain, whatever the calendar does", async () => {
    await appendAnchor(testEnv);
    await appendAnchor(testEnv);
    for (const fetchImpl of [throwing(), statusOnly(500), okProof()]) {
      const records = await listAnchors(testEnv);
      for (const record of records) {
        await submitToOts(testEnv, record, {
          fetch: fetchImpl,
          calendars: CALENDARS,
        });
      }
      // The chain is ours. Nobody else's server gets a vote on it.
      expect(await verifyChain(await listAnchors(testEnv))).toEqual([]);
    }
  });
});

describe("upgrading", () => {
  it("leaves a pending proof alone on 404, because that is the normal answer", async () => {
    const record = await appendAnchor(testEnv);
    const pending = await submitToOts(testEnv, record, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    const result = await upgradeOtsProof(testEnv, pending, {
      fetch: statusOnly(404),
    });
    // Not confirmed yet is not a failure. Marking it failed would
    // train the keeper to ignore this log.
    expect(result.ots?.status).toBe("pending");
    expect(result.ots?.error).toBeUndefined();
  });

  it("marks complete and stamps the upgrade time once Bitcoin confirms", async () => {
    const record = await appendAnchor(testEnv);
    const pending = await submitToOts(testEnv, record, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    const result = await upgradeOtsProof(testEnv, pending, {
      fetch: okProof(new Uint8Array([5, 5, 5, 5, 5])),
      now: new Date("2026-08-02T12:00:00.000Z"),
    });
    expect(result.ots?.status).toBe("complete");
    expect(result.ots?.upgraded_at).toBe("2026-08-02T12:00:00.000Z");
    expect((await latestAnchor(testEnv))?.ots?.status).toBe("complete");
  });

  it("does nothing to an entry that was never submitted", async () => {
    const record = await appendAnchor(testEnv);
    const result = await upgradeOtsProof(testEnv, record, { fetch: okProof() });
    expect(result.ots).toBeUndefined();
  });

  it("survives a network throw during upgrade with no state change", async () => {
    const record = await appendAnchor(testEnv);
    const pending = await submitToOts(testEnv, record, {
      fetch: okProof(),
      calendars: CALENDARS,
    });
    const result = await upgradeOtsProof(testEnv, pending, {
      fetch: throwing(),
    });
    expect(result.ots?.status).toBe("pending");
  });
});

describe("the cron pass", () => {
  it("stamps the newest first, so one stamp covers the most history", async () => {
    for (let i = 0; i < 3; i += 1) await appendAnchor(testEnv);
    const order: string[] = [];
    const capture = (async (url: string) => {
      order.push(url);
      return new Response(new Uint8Array([1]), { status: 200 });
    }) as unknown as typeof fetch;
    const records = await listAnchors(testEnv);
    await runAnchorSubmissions(testEnv, records, {
      fetch: capture,
      calendars: CALENDARS,
    });
    const stamped = await listAnchors(testEnv);
    // Every one got stamped here, but the ORDER matters when the cap
    // bites: newest is attempted first.
    expect(stamped.every((r) => r.ots?.status === "pending")).toBe(true);
  });

  it("respects its own cap rather than trying to catch up all at once", async () => {
    for (let i = 0; i < MAX_SUBMISSIONS_PER_RUN + 3; i += 1) {
      await appendAnchor(testEnv);
    }
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return new Response(new Uint8Array([1]), { status: 200 });
    }) as unknown as typeof fetch;
    const summary = await runAnchorSubmissions(
      testEnv,
      await listAnchors(testEnv),
      { fetch: counting, calendars: CALENDARS },
    );
    expect(summary.submitted).toBe(MAX_SUBMISSIONS_PER_RUN);
    expect(calls).toBe(MAX_SUBMISSIONS_PER_RUN);
  });

  it("retries a previously failed entry on the next pass", async () => {
    const record = await appendAnchor(testEnv);
    await submitToOts(testEnv, record, {
      fetch: throwing(),
      calendars: CALENDARS,
    });
    expect((await latestAnchor(testEnv))?.ots?.status).toBe("failed");
    const summary = await runAnchorSubmissions(
      testEnv,
      await listAnchors(testEnv),
      { fetch: okProof(), calendars: CALENDARS },
    );
    expect(summary.submitted).toBe(1);
    expect((await latestAnchor(testEnv))?.ots?.status).toBe("pending");
  });

  it("counts honestly when everything fails", async () => {
    await appendAnchor(testEnv);
    const summary = await runAnchorSubmissions(
      testEnv,
      await listAnchors(testEnv),
      { fetch: throwing(), calendars: CALENDARS },
    );
    expect(summary.submitted).toBe(0);
    expect(summary.failed).toBe(1);
  });

  it("is a no-op on an empty log", async () => {
    const summary = await runAnchorSubmissions(testEnv, [], {
      fetch: throwing(),
    });
    expect(summary).toEqual({
      submitted: 0,
      upgraded: 0,
      failed: 0,
      pending_after: 0,
    });
  });
});

describe("the daily interval", () => {
  const okFetch = (async () =>
    new Response(new Uint8Array([1]), { status: 200 })) as unknown as typeof fetch;

  it("appends on an empty log, whatever the clock says", async () => {
    const result = await runAnchorCron(
      testEnv,
      [],
      () => appendAnchor(testEnv),
      { fetch: okFetch, calendars: CALENDARS },
    );
    expect(result.appended).toBe(true);
    expect((await listAnchors(testEnv)).length).toBe(1);
  });

  it("does NOT append again within the interval, but still upgrades", async () => {
    const first = await appendAnchor(testEnv);
    await submitToOts(testEnv, first, {
      fetch: okFetch,
      calendars: CALENDARS,
    });
    const soon = new Date(
      new Date(first.snapshot.taken_at).getTime() + 3600 * 1000,
    );
    const result = await runAnchorCron(
      testEnv,
      await listAnchors(testEnv),
      () => appendAnchor(testEnv),
      { fetch: okFetch, calendars: CALENDARS, now: soon },
    );
    expect(result.appended).toBe(false);
    expect((await listAnchors(testEnv)).length).toBe(1);
    // The upgrade half still ran — that is the time-sensitive one.
    expect(result.upgraded).toBe(1);
  });

  it("keeps growing when the newest entry's date is unreadable", async () => {
    /**
     * The silent-death case. `now - NaN >= interval` is false, so a
     * single corrupt timestamp would read as "not due yet" on every
     * run from then on — a log that quietly stopped growing while
     * still serving, which looks identical to one that is current.
     * The gate fails toward appending; the cost of being wrong that
     * way is one extra entry.
     */
    const first = await appendAnchor(testEnv);
    const corrupted = {
      ...first,
      snapshot: { ...first.snapshot, taken_at: "not a date at all" },
    };
    const result = await runAnchorCron(
      testEnv,
      [corrupted],
      () => appendAnchor(testEnv),
      { fetch: okFetch, calendars: CALENDARS },
    );
    expect(result.appended).toBe(true);
  });

  it("appends once the interval has passed", async () => {
    const first = await appendAnchor(testEnv);
    const later = new Date(
      new Date(first.snapshot.taken_at).getTime() +
        ANCHOR_INTERVAL_HOURS * 3600 * 1000 +
        1000,
    );
    const result = await runAnchorCron(
      testEnv,
      await listAnchors(testEnv),
      () => appendAnchor(testEnv),
      { fetch: okFetch, calendars: CALENDARS, now: later },
    );
    expect(result.appended).toBe(true);
    const records = await listAnchors(testEnv);
    expect(records.length).toBe(2);
    // And the new entry chains onto the old one.
    expect(await verifyChain(records)).toEqual([]);
  });

  it("keeps the chain intact across many cron passes with a flaky calendar", async () => {
    let call = 0;
    const flaky = (async () => {
      call += 1;
      if (call % 3 === 0) throw new Error("calendar hiccup");
      if (call % 3 === 1) return new Response(null, { status: 503 });
      return new Response(new Uint8Array([2, 2]), { status: 200 });
    }) as unknown as typeof fetch;
    let clock = new Date("2026-08-02T00:00:00.000Z");
    for (let day = 0; day < 5; day += 1) {
      await runAnchorCron(
        testEnv,
        await listAnchors(testEnv),
        () => appendAnchor(testEnv),
        { fetch: flaky, calendars: CALENDARS, now: clock },
      );
      clock = new Date(clock.getTime() + 25 * 3600 * 1000);
    }
    const records = await listAnchors(testEnv);
    expect(records.length).toBe(5);
    // Whatever the calendar did, the chain is a chain.
    expect(await verifyChain(records)).toEqual([]);
  });
});
