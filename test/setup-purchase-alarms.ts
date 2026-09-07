import { vi } from "vitest";

// workerd schedules alarms against its native clock, not Vitest's fake Date.
// Historical payment fixtures otherwise schedule immediately, then re-arm in
// the past forever. Keep only this coordinator's alarms in the native future;
// recovery tests run them explicitly with runDurableObjectAlarm. A relative
// clock avoids a fixed fixture date eventually becoming past in CI.
const nativeFuture = vi.hoisted(() => Date.now() + 365 * 86400_000);
vi.mock("@/lib/purchase-recovery-clock", () => ({
  purchaseRecoveryAlarmAt: (delayMs: number) => nativeFuture + delayMs,
}));
