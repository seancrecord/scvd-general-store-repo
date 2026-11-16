interface ScheduledJob {
  name: string;
  run: () => Promise<unknown>;
}

/** Deferred work: registering a sweep must not start its storage reads. */
export class ScheduledJobs {
  private readonly jobs: ScheduledJob[] = [];

  constructor(private readonly onError: (name: string, error: unknown) => Promise<unknown>) {}

  add(name: string, run: () => Promise<unknown>): void {
    this.jobs.push({ name, run });
  }

  async run(): Promise<void> {
    for (const job of this.jobs) {
      console.info(JSON.stringify({ event: "scheduled_job_started", job: job.name }));
      try {
        await job.run();
        console.info(JSON.stringify({ event: "scheduled_job_completed", job: job.name }));
      } catch (error: unknown) {
        console.error(JSON.stringify({ event: "scheduled_job_failed", job: job.name }));
        await this.onError(job.name, error).catch(() => undefined);
      }
    }
  }
}
