import { purchaseRecoveryAlarmAt } from "@/lib/purchase-recovery-clock";
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BASE_RAIL } from "@/lib/statement-rails";
import { KV_KEYS } from "@/lib/kv-keys";
import { verifyMessageSignature } from "@/lib/signing";
import { startOperatorStatement, passOnce, OPERATOR_STATEMENT_TERM_DAYS, OPERATOR_PASS_HOURS, type OperatorStatementRecord } from "@/services/operator-statement";
import { publishWatch } from "@/services/watch-recovery";
import type { Env } from "@/types";

const e = env as unknown as Env, at = new Date("2026-09-09T12:00:00Z"), wallet = `0x${"12".repeat(20)}`;
let head = 100, unreadable = false;
vi.mock("@/lib/statement-rails", async load => {
  const actual = await load<typeof import("@/lib/statement-rails")>();
  const rail = { ...actual.BASE_RAIL, head: async () => head,
    transfersTo: async () => { if (unreadable) throw new Error("SCVD-E2E-chain-error".padEnd(12 * 1024, "x")); return []; },
    transfersFrom: async () => [],
  };
  return { ...actual, BASE_RAIL: rail, railOfCaip2: () => rail };
});
beforeEach(() => { head = 100; unreadable = false; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at); });
afterEach(() => vi.useRealTimers());

it("a stale cron range cannot double-count blocks after another signed pass wins", async () => {
  const { record } = await startOperatorStatement(e, wallet, BASE_RAIL);
  head = 200;
  const first = await passOnce(e, record, new Date(at.getTime() + 6 * 3600_000));
  await publishWatch(e, { kind: "operator", record: { ...record, passes: [first] } });
  head = 300;
  const stale = await passOnce(e, record, new Date(at.getTime() + 12 * 3600_000));
  const saved = await publishWatch(e, { kind: "operator", record: { ...record, passes: [stale] } });
  expect(saved.record.passes).toEqual([first]);
  const fresh = await passOnce(e, saved.record, new Date(at.getTime() + 12 * 3600_000));
  expect(fresh.from_block).toBe(first.to_block + 1);
  const latest = await publishWatch(e, { kind: "operator", record: { ...saved.record, passes: [...saved.record.passes, fresh] } });
  expect(latest.record.passes).toEqual([first, fresh]);
  await expect(publishWatch(e, { kind: "operator", record: { ...record, wallet: `0x${"34".repeat(20)}` } })).rejects.toThrow("mismatch");
});

it("a whole signed month exceeds one storage value and survives projection loss", async () => {
  const { record } = await startOperatorStatement(e, wallet, BASE_RAIL);
  head = 200; unreadable = true;
  const passes = [];
  for (let hour = 0; hour < OPERATOR_STATEMENT_TERM_DAYS * 24; hour += OPERATOR_PASS_HOURS) {
    passes.push(await passOnce(e, record, new Date(at.getTime() + hour * 3600_000)));
  }
  const full: OperatorStatementRecord = { ...record, passes };
  expect(new TextEncoder().encode(JSON.stringify(full)).length).toBeGreaterThan(2 * 1024 * 1024);
  await publishWatch(e, { kind: "operator", record: full });
  const key = KV_KEYS.operatorStatement(record.statement_id);
  await e.ORDERS.delete(key);
  const stub = e.PAID_RECOVERIES!.get(e.PAID_RECOVERIES!.idFromName(`watch:${key}`));
  await runInDurableObject(stub, async (_instance, state) => state.storage.setAlarm(purchaseRecoveryAlarmAt(60_000)));
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  expect(await e.ORDERS.get(key, "json")).toEqual(full);
  for (const pass of passes) expect(await verifyMessageSignature(pass.signed_payload!, pass.signature, pass.public_key)).toBe(true);
});
