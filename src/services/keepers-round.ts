import type { Env } from "@/types";

/**
 * THE ROUND — one page that says what ran, when, and what is waiting
 * on the keeper's hand (2026-09-08, and the keeper's own words for
 * why: "should be very easy to me to see 'bounty done', needs new
 * bounty… really another summary dash of like last walk ran, last mcp
 * walk ran really everything that I 'could' be checking or last
 * checked or need to update in one place in a really human readable
 * way").
 *
 * THE OFFICE HAD EVERY NUMBER AND NO ANSWER. Fifteen readings, each
 * honest, each on its own page, each answering a different question —
 * and nowhere among them the two a keeper actually opens the office
 * with: is anything stuck, and what do I owe. The ward round's own
 * lesson applies to the office itself: an instrument nobody can read
 * at a glance is an instrument that gets read once a month, and a
 * machine that quietly stopped a week ago looks exactly like a machine
 * with nothing to report.
 *
 * WHAT THIS PAGE IS, AND WHAT IT IS NOT. It reads state the machines
 * already write and prints it against the cadence each is supposed to
 * keep. It runs nothing, presses nothing, and recomputes nothing — a
 * summary that starts doing work is a summary that starts timing out,
 * and the rooms it points at stay the place where the work happens.
 *
 * EVERY ROW FAILS SOFT AND SAYS SO. A shelf that did not load reads
 * "unknown", never "never ran" and never a zero: the whole point of
 * this page is to make a stopped machine visible, so a page that
 * renders silence as health would be worse than no page at all.
 */

/** How a machine is doing against the cadence it is meant to keep. */
export type MachineState =
  /** Ran inside its window. */
  | "fresh"
  /** Past its window but inside the grace this page allows. */
  | "due"
  /** Past even that: something is stuck, and it is worth a look. */
  | "late"
  /** No state at all — never run, or run before it kept a record. */
  | "never"
  /** The shelf did not load. Not zero, not fine: unknown. */
  | "unknown";

export interface RoundRow {
  /** The machine, in the keeper's words. */
  name: string;
  /** One line: what it does when it runs. */
  what: string;
  /** When it is supposed to run. */
  cadence: string;
  /** ISO, or null when the machine leaves no readable stamp. */
  last_at: string | null;
  /** Hours since last_at, rounded; null when unknown. */
  age_hours: number | null;
  state: MachineState;
  /** What the last run left behind, or why this row is unknown. */
  detail: string;
  /** The room that has the whole story. */
  where?: string;
}

/** Something only the keeper's hand can do, and the reason it is owed. */
export interface KeeperPress {
  what: string;
  why: string;
  where: string;
  /** Loud when money or a public record is at stake. */
  urgent: boolean;
}

export interface KeepersRound {
  at: string;
  rows: RoundRow[];
  presses: KeeperPress[];
  /** Shelves that did not load. Named, never swallowed. */
  notes: string[];
}

const HOUR = 3_600_000;

/** Hours between two instants, or null when either is unreadable. */
function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.round(((now.getTime() - then) / HOUR) * 10) / 10;
}

/**
 * A cadence is two numbers: when a run is due, and when a missed run
 * stops being a shrug. Both are stated per row rather than inferred,
 * because "late" is a judgement and a judgement with no number behind
 * it is the thing this store keeps telling other people not to serve.
 */
function judge(
  ageHours: number | null,
  dueAfter: number,
  lateAfter: number,
): MachineState {
  if (ageHours === null) return "never";
  if (ageHours >= lateAfter) return "late";
  if (ageHours >= dueAfter) return "due";
  return "fresh";
}

/** A row for a shelf that would not load: unknown, and named as such. */
function unknownRow(
  name: string,
  what: string,
  cadence: string,
  problem: string,
  where?: string,
): RoundRow {
  return {
    name,
    what,
    cadence,
    last_at: null,
    age_hours: null,
    state: "unknown",
    detail: `not read: ${problem}`,
    ...(where ? { where } : {}),
  };
}

/** ISO week key of a date, the same shape every machine here stamps. */
function weekOf(now: Date): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Every read here is wrapped: one shelf that throws must not take the
 * page down, and the failure has to reach the reader as its own row
 * rather than as an absence.
 */
async function attempt<T>(
  notes: string[],
  label: string,
  read: () => Promise<T>,
): Promise<T | { problem: string }> {
  try {
    return await read();
  } catch (error) {
    const problem = String(
      error instanceof Error ? error.message : error,
    ).slice(0, 160);
    notes.push(`${label} (${problem})`);
    return { problem };
  }
}

function failed<T>(value: T | { problem: string }): value is { problem: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "problem" in (value as Record<string, unknown>)
  );
}

export async function readKeepersRound(
  env: Env,
  now: Date = new Date(),
): Promise<KeepersRound> {
  const notes: string[] = [];
  const rows: RoundRow[] = [];
  const presses: KeeperPress[] = [];

  const [glance, round, corpus, pulse, fillable, mcp, longWalk, citations, board] =
    await Promise.all([
      attempt(notes, "the hourly glance", async () =>
        (await import("@/services/glance")).readGlance(env),
      ),
      attempt(notes, "the ward round", async () =>
        (await import("@/services/ward-round")).latestWardRound(env),
      ),
      attempt(notes, "the corpus", async () =>
        (await import("@/services/corpus")).latestCorpusEntry(env),
      ),
      attempt(notes, "the registry tally", async () =>
        (await import("@/services/registry-pulse")).readRegistryPulse(env),
      ),
      attempt(notes, "the corpus weeks not yet published", async () =>
        (await import("@/services/registry-pulse")).unpublishedCorpusWeeks(env),
      ),
      attempt(notes, "the MCP walk", async () =>
        (await import("@/services/mcp-ward")).readMcpWalk(env),
      ),
      attempt(notes, "the long walk", async () =>
        (await import("@/services/long-walk")).readLongWalk(env),
      ),
      attempt(notes, "the citation watch", async () =>
        (await import("@/services/citation-watch")).readCitationWatch(env),
      ),
      attempt(notes, "the bounty board", async () =>
        (await import("@/services/bounty-board")).bountyBoard(env, now),
      ),
    ]);

  // ── The hourly press ────────────────────────────────────────────
  if (failed(glance)) {
    rows.push(
      unknownRow(
        "The hourly round",
        "counts the day's work — orders waiting, alarms standing, the month's take",
        "every hour at :30",
        glance.problem,
        "/admin/glance",
      ),
    );
  } else {
    const age = hoursSince(glance?.computed_at, now);
    rows.push({
      name: "The hourly round",
      what: "counts the day's work — orders waiting, alarms standing, the month's take",
      cadence: "every hour at :30",
      last_at: glance?.computed_at ?? null,
      age_hours: age,
      state: judge(age, 2, 6),
      detail: glance
        ? `${glance.pending_orders} order${glance.pending_orders === 1 ? "" : "s"} waiting · ${glance.pending_reviews} to review · ${glance.open_alerts} alarm${glance.open_alerts === 1 ? "" : "s"} standing`
        : "no glance has been written since this worker last deployed — nothing here is zero, nothing here has been counted",
      where: "/admin/glance",
    });
    if (glance && glance.open_alerts > 0) {
      presses.push({
        what: `Read ${glance.open_alerts} standing alarm${glance.open_alerts === 1 ? "" : "s"}`,
        why: "an alarm stands until somebody reads it; nothing clears on its own",
        where: "/admin/counter",
        urgent: true,
      });
    }
    if (glance && glance.pending_orders > 0) {
      presses.push({
        what: `Deliver ${glance.pending_orders} waiting order${glance.pending_orders === 1 ? "" : "s"}`,
        why: "somebody paid and is still owed the thing they bought",
        where: "/admin/counter",
        urgent: true,
      });
    }
  }

  // ── The Sunday round, and everything that rides it ──────────────
  const roundWeek = failed(round) ? null : (round?.week ?? null);
  if (failed(round)) {
    rows.push(
      unknownRow(
        "The ward round",
        "walks the listed x402 doors and freezes the week's census",
        "Sundays at 11:00 UTC",
        round.problem,
        "/admin/ward",
      ),
    );
  } else {
    const age = hoursSince(round?.at, now);
    rows.push({
      name: "The ward round",
      what: "walks the listed x402 doors and freezes the week's census",
      cadence: "Sundays at 11:00 UTC",
      last_at: round?.at ?? null,
      age_hours: age,
      // A week plus a day is due; two weeks is a round that did not run.
      state: judge(age, 24 * 8, 24 * 14),
      detail: round
        ? `${round.week}: ${round.hosts?.length ?? 0} hosts walked, ${round.listed_resources} listed${round.capped ? " — capped, so the tail was never walked" : ""}${round.coverage_suspect ? " — coverage suspect" : ""}`
        : "no round has ever been stored",
      where: "/admin/ward",
    });
  }

  if (failed(corpus)) {
    rows.push(
      unknownRow(
        "The corpus snapshot",
        "signs and hash-chains the week's observations, then anchors them to Bitcoin",
        "with the Sunday round",
        corpus.problem,
        "/corpus",
      ),
    );
  } else {
    const age = hoursSince(corpus?.snapshot.taken_at, now);
    rows.push({
      name: "The corpus snapshot",
      what: "signs and hash-chains the week's observations, then anchors them to Bitcoin",
      cadence: "with the Sunday round",
      last_at: corpus?.snapshot.taken_at ?? null,
      age_hours: age,
      state: judge(age, 24 * 8, 24 * 14),
      detail: corpus
        ? `entry #${corpus.snapshot.sequence}, week ${corpus.snapshot.week}${corpus.ots ? "" : " — no Bitcoin anchor on this entry yet"}`
        : "the chain is empty",
      where: "/corpus",
    });
  }

  /*
   * THE REGISTRY IS THE ONE ROW THAT IS NOT A MACHINE. Nothing
   * publishes a week; the keeper presses publish, by rule 30, after
   * reading the round himself. So this row's "late" is not a stuck
   * cron — it is a press nobody made, which is exactly the thing the
   * office had no way to show.
   *
   * AND THE GAP IS PERMANENT, said here rather than discovered again:
   * publishRegistryWeek builds from latestWardRound and nothing else,
   * so once the next Sunday overwrites the round, the week that was
   * never published cannot be published from the market page at all.
   * The week's round is still in the corpus, signed; a backfill is
   * possible and is not built. A reader of this row should know which
   * of those two facts they are looking at.
   */
  if (failed(pulse)) {
    rows.push(
      unknownRow(
        "The registry tally",
        "the public weekly census at /registry — published by hand, never by the clock",
        "your press, after each Sunday round",
        pulse.problem,
        "/admin/market",
      ),
    );
  } else {
    const published = pulse.weeks[pulse.weeks.length - 1] ?? null;
    const age = hoursSince(published?.published_at, now);
    const behind =
      published && roundWeek && published.week !== roundWeek
        ? `${published.week} is published; the round in hand is ${roundWeek}`
        : null;
    rows.push({
      name: "The registry tally",
      what: "the public weekly census at /registry — published by hand, never by the clock",
      cadence: "your press, after each Sunday round",
      last_at: published?.published_at ?? null,
      age_hours: age,
      state: behind ? "due" : judge(age, 24 * 8, 24 * 16),
      detail: published
        ? `${pulse.weeks.length} week${pulse.weeks.length === 1 ? "" : "s"} on the public tally, latest ${published.week}${behind ? ` — ${behind}` : ""}`
        : "nothing published yet",
      where: "/admin/market",
    });
    if (behind && roundWeek) {
      presses.push({
        what: `Publish the registry week ${roundWeek}`,
        why: `${published?.week} is the last week on the public tally and the round in hand is ${roundWeek}`,
        where: "/admin/market",
        urgent: false,
      });
    }
    /*
     * THE GAP, BY NAME, AND NOW FILLABLE (2026-09-09). This row used to
     * say a missed week "cannot be published any more", which was true
     * of a press that built only from the round in hand — and stopped
     * being true the day the backfill read the corpus instead. A page
     * whose whole job is telling the keeper what is stuck must not be
     * the last thing carrying a stale impossibility.
     */
    if (!failed(fillable) && fillable && fillable.length > 0) {
      const missed = published
        ? missingWeeks(published.week, roundWeek ?? published.week)
        : [];
      presses.push({
        what: `Backfill ${fillable.length} registry week${fillable.length === 1 ? "" : "s"}: ${fillable.join(", ")}`,
        why: `the corpus froze ${fillable.length === 1 ? "this round" : "these rounds"} on the Sunday ${fillable.length === 1 ? "it" : "they"} ran and nobody pressed publish at the time${missed.length > 0 ? ` — the tally reads ${published?.week} straight to ${roundWeek}` : ""}. POST /admin/market/publish-registry-week with the week fills it from the signed record; the row is dated when it was walked, not when it was rescued`,
        where: "/admin/market",
        urgent: true,
      });
    }
  }

  // ── The other walks ─────────────────────────────────────────────
  if (failed(mcp)) {
    rows.push(
      unknownRow(
        "The MCP walk",
        "reads the MCP registry and probes the servers it lists",
        "hourly ticks, one pass a week",
        mcp.problem,
        "/admin/mcp-ward",
      ),
    );
  } else {
    const at = mcp?.finished_at ?? mcp?.started_at ?? null;
    const age = hoursSince(at, now);
    rows.push({
      name: "The MCP walk",
      what: "reads the MCP registry and probes the servers it lists",
      cadence: "hourly ticks, one pass a week",
      last_at: at,
      age_hours: age,
      state: judge(age, 24 * 8, 24 * 14),
      detail: mcp
        ? `${mcp.week}: ${mcp.servers_seen} servers over ${mcp.pages_read} page${mcp.pages_read === 1 ? "" : "s"}${mcp.finished_at ? " — pass finished" : " — pass still walking"}${mcp.truncated ? ", truncated at the ceiling" : ""}`
        : "no pass has started",
      where: "/admin/mcp-ward",
    });
  }

  if (failed(longWalk)) {
    rows.push(
      unknownRow(
        "The long walk",
        "walks the week's roster of doors across hourly firings so Sunday has something to freeze",
        "hourly ticks, one roster a week",
        longWalk.problem,
        "/admin/ward",
      ),
    );
  } else {
    const at = longWalk?.finished_at ?? longWalk?.started_at ?? null;
    const age = hoursSince(at, now);
    rows.push({
      name: "The long walk",
      what: "walks the week's roster of doors across hourly firings so Sunday has something to freeze",
      cadence: "hourly ticks, one roster a week",
      last_at: at,
      age_hours: age,
      state: judge(age, 24 * 8, 24 * 14),
      detail: longWalk
        ? `${longWalk.week}: ${longWalk.listed_resources} listed${longWalk.finished_at ? " — walk finished" : " — still walking"}${longWalk.coverage_suspect ? ", coverage suspect" : ""}`
        : "no walk has started",
      where: "/admin/ward",
    });
  }

  if (failed(citations)) {
    rows.push(
      unknownRow(
        "The citation watch",
        "checks which directories and answer engines still cite this store",
        "with the Sunday round, or by hand",
        citations.problem,
        "/admin/outreach",
      ),
    );
  } else {
    const age = hoursSince(citations?.checked_at, now);
    rows.push({
      name: "The citation watch",
      what: "checks which directories and answer engines still cite this store",
      cadence: "with the Sunday round, or by hand",
      last_at: citations?.checked_at ?? null,
      age_hours: age,
      state: judge(age, 24 * 8, 24 * 21),
      detail: citations
        ? `${citations.rows.length} page${citations.rows.length === 1 ? "" : "s"} watched${citations.newly_gone?.length ? `, ${citations.newly_gone.length} newly gone` : ""}${citations.newly_cited?.length ? `, ${citations.newly_cited.length} newly citing` : ""}`
        : "never checked",
      where: "/admin/outreach",
    });
  }

  // ── The bounty board: the money-out machine ─────────────────────
  if (failed(board)) {
    rows.push(
      unknownRow(
        "The bounty board",
        "pays strangers to walk other people's doors, and verifies the settlement on chain",
        "your press to post; claims arrive whenever",
        board.problem,
        "/admin/bounties",
      ),
    );
  } else {
    const latest = board.bounties[0] ?? null;
    const paid = board.bounties.filter((entry) => entry.status === "paid");
    const remaining =
      Math.round((board.weekly_budget_usd - board.spent_this_week_usd) * 100) /
      100;
    const age = hoursSince(latest?.opened_at, now);
    rows.push({
      name: "The bounty board",
      what: "pays strangers to walk other people's doors, and verifies the settlement on chain",
      cadence: "your press to post; claims arrive whenever",
      last_at: latest?.opened_at ?? null,
      age_hours: age,
      state:
        board.open_count > 0 ? "fresh" : latest ? "due" : "never",
      detail: `${board.open_count} open · ${paid.length} paid all-time · $${board.spent_this_week_usd.toFixed(2)} of $${board.weekly_budget_usd.toFixed(2)} spent this week${board.payouts_enabled ? "" : " · payouts PAUSED (no field wallet)"}`,
      where: "/admin/bounties",
    });
    if (board.open_count === 0 && board.payouts_enabled && remaining > 0) {
      presses.push({
        what: "Post bounties — the board is empty",
        why: `nothing is open for a walker to claim, and $${remaining.toFixed(2)} of this week's budget is unspent`,
        where: "/admin/market",
        urgent: false,
      });
    } else if (remaining > 0 && board.payouts_enabled) {
      presses.push({
        what: `Post more bounties — room for $${remaining.toFixed(2)} this week`,
        why: `${board.open_count} open against a $${board.weekly_budget_usd.toFixed(2)} week; an unspent budget buys no evidence`,
        where: "/admin/market",
        urgent: false,
      });
    }
    if (!board.payouts_enabled) {
      presses.push({
        what: "Load the field wallet key",
        why: "payouts are off, so the board is read-only and every claim is refused",
        where: "/admin/bounties",
        urgent: true,
      });
    }
  }

  // ── Outreach: the queue only a hand can move ────────────────────
  if (!failed(round) && round) {
    const outreach = await attempt(notes, "the outreach queue", async () => {
      const { deriveProspects, deriveWelcomes, readOutreachLedger } =
        await import("@/services/outreach");
      const { previousWardRound } = await import("@/services/ward-round");
      const previous = await previousWardRound(env);
      const ledger = await readOutreachLedger(env);
      const host = new URL(env.STORE_BASE_URL).host.toLowerCase();
      const everyone = [
        ...deriveProspects(round, previous),
        ...deriveWelcomes(round, previous, host),
      ];
      const unscouted = everyone.filter(
        (row) => !ledger.hosts[row.host]?.scouted_at,
      ).length;
      return { everyone: everyone.length, unscouted };
    });
    if (failed(outreach)) {
      rows.push(
        unknownRow(
          "The outreach queue",
          "the doors this week's round found broken, and who to tell",
          "your press, 25 scouted per press",
          outreach.problem,
          "/admin/outreach",
        ),
      );
    } else {
      rows.push({
        name: "The outreach queue",
        what: "the doors this week's round found broken, and who to tell",
        cadence: "your press, 25 scouted per press",
        last_at: round.at,
        age_hours: hoursSince(round.at, now),
        state: outreach.unscouted > 0 ? "due" : "fresh",
        detail: `${outreach.everyone} in the queue off ${round.week}, ${outreach.unscouted} never scouted`,
        where: "/admin/outreach",
      });
      if (outreach.unscouted > 0) {
        const presses25 = Math.ceil(outreach.unscouted / 25);
        presses.push({
          what: `Scout ${outreach.unscouted} contact${outreach.unscouted === 1 ? "" : "s"}`,
          why: `25 land per press, so the queue as it stands is ${presses25} press${presses25 === 1 ? "" : "es"}`,
          where: "/admin/outreach",
          urgent: false,
        });
      }
    }
  }

  return { at: now.toISOString(), rows, presses, notes };
}

/**
 * The ISO weeks strictly between two week keys — the gap a keeper
 * needs to see by name rather than as "you are behind". Bounded at a
 * year: past that the answer is "a lot", and a page that tries to list
 * it is a page that stops rendering.
 */
export function missingWeeks(from: string, to: string): string[] {
  const parse = (week: string): Date | null => {
    const match = /^(\d{4})-W(\d{2})$/.exec(week);
    if (!match) return null;
    const year = Number(match[1]);
    const number = Number(match[2]);
    // Thursday of ISO week 1 anchors the year, same as weekOf above.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4.getTime() - (day - 1) * 86_400_000);
    return new Date(monday.getTime() + (number - 1) * 7 * 86_400_000);
  };
  const start = parse(from);
  const end = parse(to);
  if (!start || !end || end <= start) return [];
  const out: string[] = [];
  for (
    let cursor = new Date(start.getTime() + 7 * 86_400_000);
    cursor < end && out.length < 52;
    cursor = new Date(cursor.getTime() + 7 * 86_400_000)
  ) {
    out.push(weekOf(cursor));
  }
  return out;
}
