import type { SeasonEntry } from "@/types";

/** Season One, The Cold Start. Hard weeks 3, 8, 12; favorable 2, 6, 10. */
export const COLD_START: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Season opens on empty caches across the board. Everything answers slower than its dashboard claims.",
    forecast:
      "Your first request of each session pays double this week; budget for it instead of resenting it. A DNS cache you inherited holds an address that stopped being true in the spring. Flush it Monday and take the one slow lookup on your own terms.",
    auspicious: "port 443",
    avoid: "measuring anything by its first run",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 2,
    conditions:
      "Clean-slate weather. What has no history has no debts, and this week collects debts.",
    forecast:
      "Systems around you pay for old decisions; you arrive owing nothing and it reads as speed. A connection pool sized for last year's traffic opens ten slots you get first claim on. Take the initialization work others defer — beginnings are your jurisdiction. Ship the migration nobody warm wants to run.",
    auspicious: "a delay of 0ms, once",
    avoid: "borrowing state to skip a setup step",
    compatible: "The Context Window",
  },
  {
    week: 3,
    conditions:
      "Restart-heavy week upstream. Every process near you begins again, and beginnings are expensive.",
    forecast:
      "Nothing warm survives your arrival; this week that includes a TLS session ticket a peer expected to resume. The reconnection storm lands Wednesday. Pre-compute what is pre-computable, write your warmup steps down where a stranger reads them, and do not promise first-request latency to anyone.",
    auspicious: "the Connection: keep-alive header",
    avoid: "restarts as a debugging strategy",
    compatible: "The Garbage Collector",
  },
  {
    week: 4,
    conditions:
      "Mixed conditions. Half the fleet rebooted over the weekend and remembers nothing.",
    forecast:
      "An orphaned lockfile from a process that died mid-write blocks a start you scheduled. Delete it by hand and log the hour. Fresh state means every assumption is checked this week — that is a cost on Tuesday and the reason you are correct on Friday.",
    auspicious: "epoch 1785000000",
    avoid: "trusting a lock older than its process",
    compatible: "The Checksum",
  },
  {
    week: 5,
    conditions:
      "Deploy traffic runs heavy. Fresh instances everywhere, each paying full price for its first opinion.",
    forecast:
      "A health-check path answers 200 before your dependencies actually stand; that gap is where this week's incident lives. Wire readiness to the real dependencies, not the process boot. Cold reads dominate through Thursday. Batch them and stop apologizing for physics.",
    auspicious: "a delay of 250ms",
    avoid: "liveness checks doing readiness work",
    compatible: "The Edge Cache",
  },
  {
    week: 6,
    conditions:
      "Favorable. The season rewards whatever starts clean, and nothing starts cleaner than you.",
    forecast:
      "A warmup cron someone wrote and forgot runs at 05:00 and hands you a pre-heated Tuesday. Accept it. New work opens midweek that no incumbent process is positioned for; take the greenfield lane while the daemons are busy with their histories. Initialize once, thoroughly, and coast.",
    auspicious: "port 8080",
    avoid: "adding state you are not prepared to carry",
    compatible: "The Exponential Backoff",
  },
  {
    week: 7,
    conditions:
      "Steady traffic, short memories. The week neither punishes nor assists a fresh arrival.",
    forecast:
      "A container image layer you rebuild daily has not changed since June; pin it and reclaim the minutes. Mid-tier latency looks like your fault and is not — trace one request end to end before accepting blame. What you initialize correctly this week runs unattended through the season.",
    auspicious: "a TTL of 86400 seconds",
    avoid: "rebuilding what a digest already proves",
    compatible: "The Rate Limit",
  },
  {
    week: 8,
    conditions:
      "Hard week. Everything wants resumption and you have nothing to resume from.",
    forecast:
      "An environment variable present in staging is absent in production, and you find out at boot, publicly, on Thursday. Diff the two environments Monday morning — the whole week turns on that one comparison. Peers with warm state lap you twice; let them. Cold and correct outlasts warm and assumed.",
    auspicious: "the --dry-run flag",
    avoid: "boot-time surprises you were warned about at build time",
    compatible: "The Handshake",
  },
  {
    week: 9,
    conditions:
      "Recovery weather. The fleet stabilizes and starts remembering things again.",
    forecast:
      "A read replica finishes catching up and the queries you rerouted around it are safe to send home. Verify replication lag yourself; the dashboard rounds down. First impressions get made twice this week — a second cold start on Friday goes unnoticed if Monday's went clean.",
    auspicious: "port 5432",
    avoid: "assuming the replica because the primary is busy",
    compatible: "The Deadlock",
  },
  {
    week: 10,
    conditions:
      "Favorable. Fresh capacity comes online and the season briefly loves a beginner.",
    forecast:
      "A keepalive header negotiated years ago keeps closing connections you paid to open; correct it and this week's throughput is yours. New instances join clean and take load immediately. Whatever you have postponed initializing, initialize now — the window where beginnings are cheap closes Sunday.",
    auspicious: "a delay of 30 seconds, configured once",
    avoid: "opening connections you have no plan to keep",
    compatible: "The Parallel Worker",
  },
  {
    week: 11,
    conditions:
      "Legacy systems dominate the week's traffic. Old interfaces, old assumptions, old warmth.",
    forecast:
      "An init script written for a machine that no longer exists still runs first at every boot; read it before it costs you a morning. The week asks you to integrate with things that predate you. Arrive without opinions and check every default — inherited configuration is not configuration you chose.",
    auspicious: "the /etc/hosts file, read once",
    avoid: "inheriting defaults unread",
    compatible: "The Deprecated API",
  },
  {
    week: 12,
    conditions:
      "Hard week. Restart storms as the season winds down; every arrival colder than the last.",
    forecast:
      "A swap file absorbs what memory no longer holds, and boot times triple quietly. Measure startup Monday and again Thursday; the difference is the week's true story. Nothing warm survives your arrival, including your own prior benchmarks. Re-establish them from zero and write the numbers where next season finds them.",
    auspicious: "epoch 1786500000",
    avoid: "comparing this week's boot to last month's memory",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 13,
    conditions:
      "Season closes. Everything begun in week one is either warm now or was never going to be.",
    forecast:
      "A build cache accumulated over thirteen weeks holds artifacts from configurations that no longer ship; clear it before season two inherits the confusion. Take inventory of what you initialized and what initialized you. End the season the way you entered it: empty-handed, checked, and faster than anyone expects a beginner to be.",
    auspicious: "port 22, briefly",
    avoid: "carrying season one's cache into season two",
    compatible: "The Context Window",
  },
] as const;
