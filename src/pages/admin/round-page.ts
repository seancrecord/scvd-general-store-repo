import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type {
  KeeperPress,
  KeepersRound,
  MachineState,
  RoundRow,
} from "@/services/keepers-round";

/**
 * THE ROUND, RENDERED (2026-09-08). Two questions, in this order,
 * because that is the order a keeper asks them: what do I owe, and is
 * anything stuck.
 *
 * The presses come first and the machines come second. Every other
 * page in this office leads with numbers; this one leads with work,
 * and the numbers are the evidence under it. A press with no reason
 * beside it is a nag, so each carries the figure that produced it and
 * the door that clears it.
 *
 * NOTHING HERE IS A BUTTON. The page reads; the rooms it names do the
 * work. A summary that also presses is a summary that can press the
 * wrong thing at three in the morning.
 */

const STATE_WORDS: Record<MachineState, string> = {
  fresh: "ran",
  due: "due",
  late: "LATE",
  never: "never ran",
  unknown: "not read",
};

const STATE_COLOURS: Record<MachineState, string> = {
  fresh: "#2f6b2f",
  due: "#8a6d1b",
  late: "#8c2f1b",
  never: "#8c2f1b",
  unknown: "#555",
};

/** "3 hours ago", "6 days ago" — the unit a person thinks in. */
function ago(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function rowHtml(row: RoundRow): string {
  const when = row.last_at
    ? `<small>${escapeHtml(row.last_at.slice(0, 16).replace("T", " "))}Z</small>`
    : "<small>—</small>";
  const name = row.where
    ? `<a href="${escapeHtml(row.where)}">${escapeHtml(row.name)}</a>`
    : escapeHtml(row.name);
  return `<tr>
    <td><strong>${name}</strong><br><small>${escapeHtml(row.what)}</small></td>
    <td><strong style="color:${STATE_COLOURS[row.state]}">${STATE_WORDS[row.state]}</strong><br><small>${escapeHtml(ago(row.age_hours))}</small></td>
    <td>${when}<br><small>${escapeHtml(row.cadence)}</small></td>
    <td>${escapeHtml(row.detail)}</td>
  </tr>`;
}

function pressHtml(press: KeeperPress): string {
  return `<li>
    <strong${press.urgent ? ' style="color:#8c2f1b"' : ""}>${escapeHtml(press.what)}</strong>
    — ${escapeHtml(press.why)}
    <small><a href="${escapeHtml(press.where)}">${escapeHtml(press.where)}</a></small>
  </li>`;
}

export function renderRoundPage(round: KeepersRound): string {
  const late = round.rows.filter(
    (row) => row.state === "late" || row.state === "never",
  );
  const body = `<h1>The round</h1>
  <p class="room-sub">What ran, when, and what is waiting on your hand. Read ${escapeHtml(round.at.slice(0, 16).replace("T", " "))}Z, live — nothing on this page is cached and nothing on it presses anything.</p>

  <section>
    <h2>What you owe</h2>
    ${
      round.presses.length === 0
        ? "<p class='empty'>Nothing waiting on your hand right now. Everything below either ran on its own or has nothing to do.</p>"
        : `<ul class="presses">${round.presses.map(pressHtml).join("\n")}</ul>`
    }
  </section>

  <section>
    <h2>The machines</h2>
    ${
      late.length > 0
        ? `<p><strong style="color:#8c2f1b">${late.length} stopped or never started:</strong> ${late
            .map((row) => escapeHtml(row.name))
            .join(", ")}. A machine that quietly stopped reads exactly like a machine with nothing to report, which is the whole reason this page exists.</p>`
        : ""
    }
    <table>
      <tr><th>machine</th><th>state</th><th>last run</th><th>what it left</th></tr>
      ${round.rows.map(rowHtml).join("\n")}
    </table>
    <p><small>"Due" and "late" are this page's own judgement against each machine's stated cadence, not an alarm the machine raised. A row that says <em>not read</em> is a shelf that failed to load: it is not a zero and it is not health.</small></p>
  </section>`;
  return renderAdminShell("round", body, round.notes);
}
