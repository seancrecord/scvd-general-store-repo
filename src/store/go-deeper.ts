import { ROOMS } from "@/store/rooms";
import { getMenuItem } from "@/store";
import { priceLine } from "@/services/menu-markdown";
import { escapeHtml } from "@/lib/sanitize";

/**
 * RULE 58.4, THE CLAUSE THE STORE KEPT FORGETTING.
 *
 * "A way to go deeper, for BOTH kinds of reader. The paid path is
 * named on the page, with its price, and it is walkable two ways: a
 * person can buy it, and a person can hand the line to their agent
 * and have the agent buy it. The second is the one we keep
 * forgetting, and it is the one this store is for."
 *
 * Measured 2026-08-30 across all 35 rooms: ONE carried a line a
 * person could hand to their agent. /doors, the room built the
 * evening the rule was adopted. Five named a paid path with a price.
 * The rule had a worked example and no reach.
 *
 * THE FREE HALF DERIVES COMPLETELY. Every one of the 35 rooms already
 * answers `Accept: application/json` at its own URL — measured, not
 * assumed — so the machine copy of any page is that page, and the
 * sentence naming it needs no per-room bookkeeping at all. That is
 * the line a person hands to their agent, and it is true of a room
 * added tomorrow.
 *
 * THE PAID HALF IS DELIBERATELY SPARSE. Most rooms carry no `deeper`
 * ids, because most rooms are a policy, a record or an explanation
 * and there is nothing honest to sell above them. Those pages say so
 * — which is the sentence rule 58 ends on. Pointing a reader at an
 * item that answers a different question to avoid an empty section
 * is the failure this store files against other people.
 *
 * Prices are read off the shelf. A page quoting a number the menu
 * does not charge is the defect derived-not-typed exists for, and
 * this would have been thirty-five new places to make it.
 */

const SITE_ORIGIN = "https://scvd.store";

export interface DeeperRung {
  id: string;
  name: string;
  price: string;
  price_usdc: number;
  listing_url: string;
  buy_url: string;
}

/** The rungs a room names, priced from the menu, broken ones dropped. */
export function deeperRungs(path: string): DeeperRung[] {
  const room = ROOMS.find((candidate) => candidate.path === path);
  return (room?.deeper ?? []).flatMap((id) => {
    const item = getMenuItem(id);
    if (!item) return [];
    return [
      {
        id: item.id,
        name: item.name,
        // priceLine ALREADY joins the cadence — appending it again
        // printed the whole never-renews clause twice on every rung,
        // caught by reading the rendered page rather than the test.
        price: priceLine(item),
        price_usdc: item.price_usdc,
        listing_url: `${SITE_ORIGIN}/menu/${item.id}`,
        buy_url: `${SITE_ORIGIN}/api/buy/${item.id}`,
      },
    ];
  });
}

/**
 * The section, or an empty string for a page that writes its own.
 *
 * Free first, always, and that ordering is the rule rather than a
 * layout preference: 58.3 says what a reader can do, with the free
 * thing first, and 58's closing line says selling deeper must never
 * make the free record harder to reach.
 */
export function goDeeperSection(path: string | undefined): string {
  if (!path) return "";
  const room = ROOMS.find((candidate) => candidate.path === path);
  if (!room || room.writes_its_own_deeper) return "";

  const machine = `${SITE_ORIGIN}${path}`;
  const rungs = deeperRungs(path);

  const paid =
    rungs.length === 0
      ? `<p class="menu-desc"><strong>Nothing on the shelf sells a deeper read of this page.</strong> What is here is all of it, free and complete. Where this store does sell a deeper read, what money buys is our labour on the record &mdash; never the record itself, and never easier access to it.</p>`
      : `<p class="menu-desc"><strong>Deeper, if you want our labour on it.</strong> Each of these is a separate purchase; nothing here charges again by itself.</p>
      <ul class="menu-desc">${rungs
        .map(
          (rung) =>
            `<li><a href="/menu/${escapeHtml(rung.id)}"><strong>${escapeHtml(rung.name)}</strong></a> &mdash; <em>${escapeHtml(rung.price)}</em>.</li>`,
        )
        .join("")}</ul>`;

  /*
   * The literal line, and it has to BE literal. An invitation to read
   * the API documentation is not a way for a person to hand this to
   * their agent; a sentence they can select and paste is.
   */
  const agentLine =
    rungs.length === 0
      ? `<em>&ldquo;Fetch ${escapeHtml(machine)} with the header <code>Accept: application/json</code>. That is this page as data &mdash; free, no key, and the same numbers a person reads.&rdquo;</em>`
      : `<em>&ldquo;Fetch ${escapeHtml(machine)} with the header <code>Accept: application/json</code>, then if I need the signed version, buy ${escapeHtml(rungs[0]!.name)} at ${escapeHtml(rungs[0]!.buy_url)} over x402.&rdquo;</em>`;

  return `<section>
      <h2>What you can do with this</h2>
      <p class="menu-desc"><strong>Free, and first:</strong> this page answers <code>Accept: application/json</code> at its own address, <code>${escapeHtml(machine)}</code> &mdash; the same content as data, with no key and no account. The whole machine map is at <a href="/atlas.json"><code>/atlas.json</code></a>.</p>
      ${paid}
      <p class="menu-desc"><strong>Or hand it to your agent.</strong> Paste this and it will do the whole thing without you: ${agentLine}</p>
    </section>`;
}
