/** Kept separate so tests can control the native alarm clock as well as Date. */
export function purchaseRecoveryAlarmAt(delayMs: number): number {
  return Date.now() + delayMs;
}
