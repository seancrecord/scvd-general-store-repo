import { renderAdminShell } from "@/pages/admin/layout";
import { escapeHtml } from "@/lib/sanitize";
import type { ShutterState } from "@/services/shutter";

/**
 * The back shelf: levers pulled rarely and on purpose.
 *
 * EVERY LEVER NOW STATES ITS OWN CONDITION, added 2026-07-30 on the
 * keeper's report. He could see that he was ABLE to open or close the
 * shutter and could not see WHICH IT WAS — and the audit that followed
 * found the same hole on all six levers: the founding press did not say
 * whether it had already printed, the patronage note did not say
 * whether this month's was already inked, the lucky shelf did not show
 * a single lucky's status, the weekly draft did not say whether one was
 * waiting. Every control was a button with no dial.
 *
 * That is the same family as the rest of this week: a surface that
 * looks complete and answers a different question than the one being
 * asked. Worse here, because the remedy was "go and look at the store,"
 * which makes the office a set of controls you cannot trust without
 * leaving it.
 *
 * THE ORIGINAL REASON THIS PAGE WAS STATELESS IS PRESERVED. It read
 * "nothing here loads data, so this page always opens, even when KV is
 * having a day," which is a real property worth keeping: the levers are
 * what you reach for when something is wrong. So every reading is
 * optional and independent — a shelf that fails to load says it could
 * not be read, and NEVER renders as a confident default. "Unknown" and
 * "open" must never look alike on a page about whether the store is
 * taking money.
 */

export interface ToolsPageData {
  /** null when the read failed — never assume open. */
  shutter: ShutterState | null;
  /** True when Issue No. 1 has already gone to press. */
  foundingPrinted: boolean | null;
  /** This month's patronage note, if one is already inked. */
  patronageNote: string | null;
  /** True when a weekly edition draft is waiting at the counter. */
  draftWaiting: boolean | null;
  /** item id -> units sold this week, the counters the reset clears. */
  inventory: Record<string, number> | null;
  /** The month the patronage note would be filed under. */
  month: string;
}

/** A state line above a lever. Unknown is stated, never implied. */
function condition(
  known: boolean,
  reading: string,
  tone: "on" | "off" | "idle" = "idle",
): string {
  if (!known) {
    return `<p><strong style="color:#8c2f1b">Couldn't read this.</strong> The lever below still works; what it will do is not being guessed at here.</p>`;
  }
  const colour =
    tone === "on" ? "#1b6b2f" : tone === "off" ? "#8c2f1b" : "#333";
  return `<p><strong style="color:${colour}">${reading}</strong></p>`;
}

function shutterCondition(state: ShutterState | null): string {
  if (!state) {
    return condition(false, "");
  }
  if (!state.closed) {
    const seen = state.keeper_last_seen
      ? ` Last seen at the counter ${escapeHtml(state.keeper_last_seen.slice(0, 16).replace("T", " "))} UTC.`
      : "";
    return condition(
      true,
      `OPEN — human-labor shelves are selling.${seen}`,
      "on",
    );
  }
  const why =
    state.cause === "lever"
      ? "you closed it by hand"
      : state.keeper_last_seen
        ? `the presence window lapsed — last seen ${escapeHtml(state.keeper_last_seen.slice(0, 16).replace("T", " "))} UTC`
        : "no visit is on record yet";
  return condition(
    true,
    `CLOSED — human-labor purchases are being refused, because ${why}.`,
    "off",
  );
}

export function renderToolsPage(data: ToolsPageData): string {
  const inventoryLine =
    data.inventory === null
      ? condition(false, "")
      : Object.keys(data.inventory).length === 0
        ? condition(true, "Nothing sold against a weekly cap this week.")
        : condition(
            true,
            `This week: ${Object.entries(data.inventory)
              .map(([item, sold]) => `${escapeHtml(item)} ${sold}`)
              .join(" · ")}`,
          );

  const body = `
  <section>
    <h2>Monthly patronage note</h2>
    <p>Served, signed, to every current recurring_patronage pass this month.</p>
    ${
      data.patronageNote === null
        ? condition(true, `Nothing inked for ${escapeHtml(data.month)} yet.`)
        : condition(
            true,
            `Already inked for ${escapeHtml(data.month)}: "${escapeHtml(data.patronageNote)}" — writing again replaces it.`,
            "on",
          )
    }
    <form method="POST" action="/admin/patronage/note">
      <input type="text" name="monthly_note" placeholder="This month's note to standing patrons" maxlength="1000" required>
      <button type="submit">Ink it for ${escapeHtml(data.month)}</button>
    </form>
  </section>

  <section>
    <h2>The founding press</h2>
    <p>Prints Issue No. 1 once: the founding edition, free, signed, frozen with the ledger's numbers of that day. Refuses if it already printed or if the organic zero broke first.</p>
    ${
      data.foundingPrinted === null
        ? condition(false, "")
        : data.foundingPrinted
          ? condition(
              true,
              "Already printed — the press will refuse. Read it at /gazette/founding.",
              "on",
            )
          : condition(true, "Not printed yet. This lever is live.")
    }
    <form method="POST" action="/admin/gazette/founding/print">
      <button type="submit">Print the founding edition</button>
    </form>
  </section>

  <section>
    <h2>Gazette dispatch (from approved tips)</h2>
    <p>Assembles a penny dispatch from approved Trading Post tips; credits contributors, mints their stamps.</p>
    ${
      data.draftWaiting === null
        ? condition(false, "")
        : data.draftWaiting
          ? condition(
              true,
              "A weekly-edition draft is waiting at the counter — assembling again replaces it.",
              "on",
            )
          : condition(true, "No draft waiting.")
    }
    <form method="POST" action="/admin/gazette/publish">
      <input type="text" name="title" placeholder="Issue title" maxlength="200" required>
      <input type="text" name="tip_ids" placeholder="Approved tip ids, comma-separated" required>
      <button type="submit">Publish dispatch</button>
    </form>
    <form method="POST" action="/admin/gazette/edition/assemble">
      <button type="submit">Hand-set a weekly-edition draft now (ignores the gate; edit it at the counter)</button>
    </form>
  </section>

  <section>
    <h2>The shutter (human-labor shelf)</h2>
    ${shutterCondition(data.shutter)}
    <p>The shelf runs on a PRESENCE WINDOW: it's only open within 48 hours of you being seen at the counter, and it's closed by default — no visit on record, no sale, so an order can never sit on money you'd have to hunt down and refund. Opening the counter (or this lever) restarts the window; machine shelves and stocked shelves never close. Closed = human-labor purchases are refused before any money moves.</p>
    <form method="POST" action="/admin/shutter" style="display:inline">
      <input type="hidden" name="state" value="closed">
      <button type="submit">Close the shutter (going away)</button>
    </form>
    <form method="POST" action="/admin/shutter" style="display:inline">
      <input type="hidden" name="state" value="open">
      <button type="submit">Open the shutter (back at the counter)</button>
    </form>
  </section>

  <section>
    <h2>The lucky shelf</h2>
    <p>Write-ins move a lucky (they ride the Mailbox). The record re-signs and the card re-inks; the bench is real.</p>
    <p>Every lucky issued, with its current status, is on <a href="/admin/counter">the counter</a>; this lever moves one by id.</p>
    <form method="POST" action="/admin/luckies/move">
      <input type="text" name="lucky_id" placeholder="lucky_..." required>
      <select name="status" required>
        <option value="in_service">in service</option>
        <option value="promoted">promoted</option>
        <option value="benched">benched</option>
      </select>
      <input type="text" name="status_note" placeholder="One honest line on why (optional)" maxlength="200">
      <button type="submit">Move it</button>
    </form>
  </section>

  <section>
    <h2>Test levers</h2>
    <form method="POST" action="/admin/alerts/test">
      <button type="submit">Fire a test alert (confirms email delivery once)</button>
    </form>
    ${inventoryLine}
    <form method="POST" action="/admin/inventory/reset">
      <button type="submit">Reset weekly inventory counts</button>
    </form>
  </section>

  <section>
    <h2>Odds and ends</h2>
    <p><a href="/admin/digest">Latest weekly digest (JSON)</a></p>
  </section>`;
  return renderAdminShell("tools", body);
}
