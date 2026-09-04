import { renderAdminShell, EVERY_ROOM } from "@/pages/admin/layout";
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
  /** Keeper-written almanac pages, newest first. null when unreadable. */
  almanacPages: { slug: string; title: string; date: string }[] | null;
  /** null when the read failed — never assume open. */
  shutter: ShutterState | null;
  /** This month's patronage note, if one is already inked. */
  patronageNote: string | null;
  /** item id -> units sold this week, the counters the reset clears. */
  inventory: Record<string, number> | null;
  /** The month the patronage note would be filed under. */
  month: string;
  /** Today, YYYY-MM-DD, prefilled on the almanac page form. */
  today: string;
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
  const body = `
  <section>
    <p><small>Downloads moved to <a href="/admin/files">keeper's files</a>;
    test levers to <a href="/admin/testing">the test drawer</a>. This
    shelf is for running the store.</small></p>
  </section>

  <section>
    <h2>The Keeper's Almanac &mdash; write a page</h2>
    <p>A penny a page over x402, and the only shelf a stranger has ever bought
    from. Pages go live on the next request &mdash; no deploy, no commit. Same
    slug as an existing page REPLACES it, which is how a correction gets made
    without a laptop. <strong>Your words only</strong> &mdash; dated first-person
    field notes; if it could be posted on Medium, it doesn't go in the Almanac.</p>
    ${
      data.almanacPages === null
        ? condition(false, "")
        : data.almanacPages.length === 0
          ? condition(
              true,
              "No pages written from the office yet. The seed pages compiled into the store are still there and are not listed here.",
            )
          : condition(
              true,
              `Written from here: ${data.almanacPages
                .map((page) => `${page.date} ${page.title}`)
                .join(" \u00B7 ")}`,
              "on",
            )
    }
    <form method="POST" action="/admin/almanac">
      <p><label>The day it is ABOUT<br>
      <input type="text" name="date" value="${escapeHtml(data.today)}" maxlength="10" required></label></p>
      <p><label>Title (becomes the URL slug)<br>
      <input type="text" name="title" placeholder="What the day was" maxlength="120" required></label></p>
      <p><label>The one free line on the index (blank = your first sentence)<br>
      <input type="text" name="teaser" placeholder="What a stranger sees before paying the penny" maxlength="200"></label></p>
      <p><label>The page itself &mdash; just write; the heading and the almanac
      dressing are set around it for you<br>
      <textarea name="body" rows="14" placeholder="Write the thing." required></textarea></label></p>
      <button type="submit">Put it on the shelf</button>
    </form>
    ${
      data.almanacPages && data.almanacPages.length > 0
        ? `<p>Pull a page back off the shelf:</p>
           <form method="POST" action="/admin/almanac/remove">
             <input type="text" name="slug" placeholder="the page's slug" required>
             <button type="submit">Take it down</button>
           </form>`
        : ""
    }
  </section>

  <section>
    <h2>Resolve a delivery</h2>
    <p>For when the money-in-vs-goods-out check on
    <a href="/admin/reconciliation">the books check</a> names a settle. Paste
    its settlement tx, say what you did about it by hand &mdash; fulfilled it,
    refunded it, or absorbed it as house &mdash; and the audit stands down for
    that sale. The record keeps the original intent inside it.</p>
    <form method="POST" action="/admin/delivery/resolve">
      <input type="text" name="transaction" placeholder="the settlement tx from the alert" required>
      <select name="outcome" required>
        <option value="fulfilled_by_hand">fulfilled by hand</option>
        <option value="refunded">refunded</option>
        <option value="house_absorbed">house money, absorbed</option>
      </select>
      <button type="submit">Resolve it</button>
    </form>
  </section>

  <section>
    <h2>Payer-case repair</h2>
    <p>Solana addresses are case-sensitive; payer rows written before
    the canonical-address fix hold a lowercased copy no explorer
    resolves. This walks the certificates (which kept the true case)
    and rewrites the rows. Idempotent — pressing it twice finds
    nothing the second time.</p>
    <form method="post" action="/admin/repair/payer-case" style="margin:0.5em 0">
      <button type="submit">Repair payer rows from certificates</button>
    </form>
  </section>

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
    <p>What this is for: a buyer writes in about how their lucky performed (write-ins ride the Mailbox), and you promote or bench it here by id. Rare by nature. The record re-signs and the card re-inks; the bench is real.</p>
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
    <h2>Key handover</h2>
    <p><strong>The most consequential button in this office.</strong> It
    mints a signed announcement that the key everything on this store
    verifies against is changing — signed by the key being RETIRED,
    which is what makes a real handover distinguishable from somebody
    who has taken over the page. Read <code>docs/archive/CEREMONY_B.md</code> before
    touching it.</p>
    <p>A form and not a script, because a lever this size wants a hand
    on it and a password typed into a browser rather than into a shell
    history. Nothing schedules this and nothing else can call it.</p>
    <p><strong>Order is the whole protocol.</strong> Mint FIRST, while
    the outgoing key is still the live secret — that is what puts the
    outgoing key's signature on the notice. Replace the
    <code>SIGNING_KEY</code> secret only AFTER this has been minted and
    checked. Minted afterwards, it is the new key vouching for itself
    and worth nothing.</p>
    <p>The incoming value is a <strong>PUBLIC key</strong>: the 64
    characters <code>npm run keys:check</code> printed back. Never a
    seed. Nothing here ever wants a seed.</p>
    <p>The reason is published exactly as written and is signed with
    everything else, so it is permanent — editing it afterwards would
    break its own signature. Write it before you press this, not after.</p>
    <form method="POST" action="/admin/keys/handover">
      <label for="incoming_public_key">Incoming PUBLIC key (64 hex)</label>
      <input type="text" id="incoming_public_key" name="incoming_public_key"
             pattern="[0-9a-fA-F]{64}" maxlength="64" required
             placeholder="the derived public key, never the seed">
      <label for="handover_reason">Why, in plain words (permanent)</label>
      <textarea id="handover_reason" name="reason" rows="10" required
                placeholder="Published verbatim and signed. This is the sentence people will quote."></textarea>
      <button type="submit">Mint the handover announcement</button>
    </form>
  </section>

  <section>
    <h2>Every room</h2>
    <p><small>The readings the 08-05 consolidation took off the top nav. Nothing here is on a
    tab, so this is the one place all of it is reachable — held by test/admin-reach.spec.ts.</small></p>
    <ul>${EVERY_ROOM.map((room) => `<li><a href="${room.href}">${escapeHtml(room.label)}</a></li>`).join("")}</ul>
  </section>`;
  return renderAdminShell("tools", body);
}
