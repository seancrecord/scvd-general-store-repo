/** Keeper-approved cost cuts. Paid obligations keep their existing schedules. */
export const FREE_TRAFFIC_COLLECTION_NOTE =
  "Free visits retain aggregate counts only. Per-visit records and free-visit client and referring-host detail are no longer collected by this release; retained detail is historical. Price-quote and payment evidence continue to be recorded.";

export const TRAFFIC_CORRECTION_INTERVAL_HOURS = 6;
export function trafficCorrectionsDue(scheduledTime: number, cron: string): boolean {
  return cron === "30 * * * *" && Number.isFinite(scheduledTime) &&
    new Date(scheduledTime).getUTCHours() % TRAFFIC_CORRECTION_INTERVAL_HOURS === 0;
}
