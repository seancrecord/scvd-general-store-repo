import { sendAlert } from "@/lib/alerts";
import { trafficCorrectionsDue } from "@/lib/operating-cost";
import { recomputeCorrections } from "@/services/reclassify";
import type { Env } from "@/types";

/** Only retrospective traffic reporting is slowed; paid sweeps stay independent. */
export function scheduleTrafficCorrections(
  event: Pick<ScheduledController, "cron" | "scheduledTime">,
  env: Env,
  ctx: Pick<ExecutionContext, "waitUntil">,
): void {
  if (!trafficCorrectionsDue(event.scheduledTime, event.cron)) return;
  ctx.waitUntil(
    recomputeCorrections(env, new Date(event.scheduledTime), { cache: true }).catch(() =>
      sendAlert(env, {
        condition: "worker_health",
        detail: "Historical traffic correction failed. Inspect the scheduled job; retained figures keep their original correction date.",
      }),
    ),
  );
}
