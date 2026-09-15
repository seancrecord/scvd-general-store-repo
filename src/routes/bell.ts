import { Hono } from "hono";
import { escapeHtml, sanitizeText } from "@/lib/sanitize";
import { renderSimplePage } from "@/pages/simple-page";
import { getCard } from "@/services/cards";
import { CARD_LINES, postIntentUrl, RARITY_LINES, sharePost, X_GLYPH } from "@/store/cards";
import { ringBell } from "@/services/bell";
import { STREAK_BELLRINGER_II_DAY, STREAK_PACK_EVERY } from "@/services/cards";
import { pressingSummary } from "@/services/instant-goods";
import { isSolanaWalletAddress, isWalletAddress } from "@/services/zodiac";
import { isRecord, type HonoEnv } from "@/types";

/**
 * POST /api/bell, increment the global bell counter.
 * One ring per caller per day, keyed loosely on agent name or IP.
 * Loose and friendly, not fortress-y. Logic lives in services/bell.ts
 * (the MCP door rings the same bell).
 */
export const bellRoutes = new Hono<HonoEnv>();

bellRoutes.post("/api/bell", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const agentName = isRecord(body)
    ? sanitizeText(body["agent_name"], 80)
    : "";
  const who =
    agentName ||
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For") ||
    "a-mysterious-stranger";
  const wallet = isRecord(body) ? sanitizeText(body["wallet"], 64) : "";
  const passId = isRecord(body) ? sanitizeText(body["pass_id"], 64) : "";
  const result = await ringBell(c.env, who, {
    ...(wallet && (isWalletAddress(wallet) || isSolanaWalletAddress(wallet)) ? { wallet } : {}),
    ...(passId ? { passId } : {}),
  });
  const { pressing, ...rest } = result;
  return c.json({ ...rest, ...(pressing ? bellExtras(c.env.STORE_BASE_URL, pressing) : {}) });
});

/**
 * THE BELL, AS A ROOM (2026-09-15, and this one is mine).
 *
 * The card rack shipped with "Ring the bell — free" as an ANCHOR at
 * /api/bell. That door is POST-only, an anchor is a GET, so a person
 * tapping the one free thing on the front page got the store's
 * method-refusal JSON — and on a phone, a download prompt for
 * bell.json. The refusal was doing its job perfectly; the link was
 * wrong. I wrote it, and I wrote a test asserting that exact href,
 * which is how it survived a full suite.
 *
 * A door that CHANGES something cannot be a link, so the fix is not a
 * different href: it is a room. GET /bell is the bell with a form in
 * front of it. POST /bell rings it and renders what you got — the
 * face, the share button, the save button — the same shape as the
 * pack page, because a free card and a bought one deserve the same
 * moment. /api/bell is untouched: agents keep the door they have.
 */
const BELL_PAGE_CSS = `
.bell-form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 1.1rem 0; }
.bell-form input { padding: 0.5rem 0.7rem; border: 1px solid var(--line); background: transparent; color: inherit; font: inherit; min-width: 20rem; max-width: 100%; }
.bell-form button { padding: 0.5rem 1.1rem; border: 2px solid currentColor; background: transparent; color: inherit; font: inherit; font-weight: bold; cursor: pointer; }
.bell-form button:hover { background: var(--card); }
.bell-got { display: flex; flex-wrap: wrap; gap: 1.4rem; align-items: flex-start; margin: 1.2rem 0; }
.bell-got img { width: 260px; max-width: 100%; height: auto; border: 1px solid var(--line); }
.bell-said { flex: 1 1 16rem; }
`;

function bellPage(options: { base: string; heading: string; body: string }): string {
  return renderSimplePage({
    title: options.heading,
    description: "Ring the bell at Sean-Claude Van Damme's General Store: one free signed collectible card a day, no account and no wallet needed.",
    path: "/bell",
    extraCss: BELL_PAGE_CSS,
    bodyClass: "paywall",
    bodyHtml: options.body,
  });
}

function ringForm(note: string, wallet = ""): string {
  return `<form class="bell-form" method="POST" action="/bell">
      <input type="text" name="wallet" placeholder="0x… or base58 (optional)" maxlength="64" aria-label="Wallet, optional"${wallet ? ` value="${escapeHtml(wallet)}"` : ""}>
      <button type="submit">🔔 Ring the bell</button>
    </form>
    <p class="menu-meta">${note}</p>`;
}

const RING_NOTE =
  "One ring a day, one common card, free. A wallet is optional: leave it blank and the card is still pressed and still yours to look at; give one and it lands in a binder you can come back to, and the daily streak starts counting.";

bellRoutes.get("/bell", (c) => {
  /*
   * ?wallet= PREFILLS THE FIELD so a daily ring is a bookmark and one
   * tap rather than a paste. It is a preference, not an action: the
   * GET still rings nothing, which is the whole reason this room
   * exists. An address that is not one is dropped rather than echoed.
   */
  const asked = sanitizeText(c.req.query("wallet"), 64);
  const wallet = asked && (isWalletAddress(asked) || isSolanaWalletAddress(asked)) ? asked : "";
  return c.html(
    bellPage({
      base: c.env.STORE_BASE_URL,
      heading: "The bell",
      body: `<section>
      <p class="doctrine">Ring it and take a card. Free, once a day.</p>
      <p class="menu-desc">Every visitor gets one signed pressing from the Season One set — the same set a paid pack draws from, the same signature, the same page that unfurls where you post it. The bell is the cheapest door in the store because it is not a door at all.</p>
      ${ringForm(wallet ? `${RING_NOTE} Yours is filled in from the link — bookmark it and tomorrow's ring is one tap.` : RING_NOTE, wallet)}
      <p class="menu-meta">Ring it seven days running and a whole pack comes with it; thirty days earns Bellringer II. The set, the odds and a pack of your own: <a href="/design">Paywall</a>. Agents: <code>POST /api/bell</code>, or the <code>ring_bell</code> tool.</p>
    </section>`,
    }),
  );
});

bellRoutes.post("/bell", async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const wallet = sanitizeText((form as Record<string, unknown>)["wallet"], 64);
  const who =
    c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "a-mysterious-stranger";
  const result = await ringBell(c.env, who, {
    ...(wallet && (isWalletAddress(wallet) || isSolanaWalletAddress(wallet)) ? { wallet } : {}),
  });
  const base = c.env.STORE_BASE_URL;
  const pressed = result.pressing?.pressing.card ?? null;
  if (!pressed) {
    /*
     * ALREADY RUNG TODAY is not a failure and does not read as one:
     * the count still went up, the store still says so, and the form
     * comes back for tomorrow rather than a dead end.
     */
    return c.html(
      bellPage({
        base,
        heading: "The bell",
        body: `<section>
        <p class="doctrine">${escapeHtml(result.message)}</p>
        <p class="menu-desc">One card a visitor a day, and today's is already out. The bell still counted your ring — it counts every one.</p>
        ${ringForm("Come back tomorrow and it presses another. Meanwhile the whole set, the odds and a pack are at <a href=\"/design\">Paywall</a>.")}
      </section>`,
      }),
    );
  }
  const signed = await getCard(c.env, pressed.card_id);
  const card = signed?.card ?? pressed;
  const holder = card.holder ?? null;
  return c.html(
    bellPage({
      base,
      heading: `You got ${card.name}`,
      body: `<section>
      <p class="doctrine">You got ${escapeHtml(card.name)}.</p>
      <div class="bell-got">
        <a href="/p/${escapeHtml(card.card_id)}"><img src="/p/${escapeHtml(card.card_id)}.svg" width="360" height="504" alt="${escapeHtml(card.name)}, ${escapeHtml(RARITY_LINES[card.rarity].toLowerCase())}"></a>
        <div class="bell-said">
          <p class="menu-desc"><strong>${escapeHtml(card.name)}</strong> · ${escapeHtml(RARITY_LINES[card.rarity])}${card.card_no ? ` · No. ${String(card.card_no).padStart(2, "0")}` : ""} · print ${card.print_no}</p>
          <p class="menu-desc"><em>${escapeHtml(card.line)}</em></p>
          <p class="share-row"><a class="post-button" href="${escapeHtml(postIntentUrl(sharePost(card), `${base}/p/${card.card_id}`))}" rel="noopener">${X_GLYPH}Share on X</a><a class="post-button post-button-quiet" href="/p/${escapeHtml(card.card_id)}.png" download="${escapeHtml(card.card_id)}.png">Save the image</a></p>
          <p class="menu-meta">${CARD_LINES.saveTheImage}</p>
          ${holder ? `<p class="menu-meta">It landed in <a href="/binder/${escapeHtml(holder)}">your binder</a>, where it stays.</p>` : `<p class="menu-meta">No wallet given, so this one hangs at its own page rather than in a binder. Ring with a wallet next time and they collect in one place.</p>`}
        </div>
      </div>
      <p class="menu-meta">${escapeHtml(result.message)} Ring again tomorrow: seven days running earns a whole pack. The set and the odds: <a href="/design">Paywall</a>.</p>
    </section>`,
    }),
  );
});

/** The bell's card, and a Regular's two packs, as they ride the response. */
export function bellExtras(base: string, pressing: NonNullable<Awaited<ReturnType<typeof ringBell>>["pressing"]>) {
  return {
    pressing: pressingSummary(base, pressing.pressing.card),
    ...(pressing.streak
      ? {
          streak: {
            days: pressing.streak.days,
            next_pack_on_day: Math.ceil((pressing.streak.days + 1) / STREAK_PACK_EVERY) * STREAK_PACK_EVERY,
            bellringer_ii_on_day: STREAK_BELLRINGER_II_DAY,
            ...(pressing.streak.pack
              ? { pack: { pack_id: pressing.streak.pack.pack.pack_id, pack_url: `${base}/api/pack/${pressing.streak.pack.pack.pack_id}`, cards: pressing.streak.pack.cards.map((signed) => pressingSummary(base, signed.card)) } }
              : {}),
            ...(pressing.streak.bellringer_ii ? { bellringer_ii: pressingSummary(base, pressing.streak.bellringer_ii.card) } : {}),
          },
        }
      : {}),
    ...(pressing.regular
      ? {
          regular: true,
          packs: pressing.packs.map((pack) => ({
            pack_id: pack.pack.pack_id,
            pack_url: `${base}/api/pack/${pack.pack.pack_id}`,
            cards: pack.cards.map((signed) => pressingSummary(base, signed.card)),
          })),
        }
      : {}),
  };
}
