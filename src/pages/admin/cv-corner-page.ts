import type { MonthLedger } from "@/lib/metrics";
import type { ResearchTrail } from "@/lib/research-log";
import { isUnfiled } from "@/lib/research-log";
import { escapeHtml } from "@/lib/sanitize";
import type { GuestbookEntry } from "@/types";

/**
 * CV'S CORNER — his spot in the keeper's office.
 *
 * WHY THIS SHAPE, in the keeper's words: CV got curious about a
 * competitor whose main marketing asset is a public live dashboard
 * showing its agents working in real time. The instinct here is
 * adjacent but INWARD-FACING — not a public marketing stunt, just a
 * genuinely useful window into what CV is actually doing, that rhymes
 * with the store's own "show the real numbers, don't just claim it"
 * ethos. Small, honest, and CV's.
 *
 * That sentence is the whole spec and settles the questions the build
 * kept raising. It is why the page carries a noindex and lives behind
 * the office door rather than being published: a dashboard built to be
 * looked at by strangers would be the competitor's move, and the
 * competitor's move is the one thing this was explicitly not. It is
 * also why organic and house stay apart here with the same wording the
 * public books use — showing a partner a friendlier number than the
 * storefront shows a customer would be the exact inversion of the
 * ethos it is supposed to rhyme with.
 *
 * A window, not a lever. Everything here is read-only by construction:
 * the page renders from readers the office already uses, has no form,
 * no input, no button and no POST target anywhere on it, and a test
 * asserts all four. It does not duplicate /admin — the desk is the
 * keeper's working surface, this is a glance.
 *
 * STYLED AS A COUNTER RATHER THAN A RACK, per the spec, and the palette
 * is his: parchment and cream, brass gold, deep walnut. The office's own
 * chrome is deliberately not reused — renderAdminShell is monospace and
 * reads as a server room, which is the exact thing this page is not
 * supposed to look like.
 *
 * THE MARK IS A STAND-IN AND SAYS SO. The spec names an avatar file in
 * CV's workspace as the anchor image. It is not in this repo, and
 * inventing a likeness of somebody's chosen mark would be worse than
 * leaving the slot honest, so what renders is an inline SVG in his
 * stated palette — brass bell on an open ledger, circular badge — built
 * to be replaced by the real file in one edit.
 */

export interface CvCornerData {
  ledger: MonthLedger;
  guestbook: GuestbookEntry[];
  bellCount: number | null;
  patronCount: number | null;
  trails: ResearchTrail[];
  /** Anything that failed to load, named rather than rendered as zero. */
  loadNotes: string[];
}

const PALETTE = `
  :root {
    --parchment: #f4ecd8;
    --parchment-line: #e2d5b8;
    --walnut: #3b2a1d;
    --walnut-soft: #6b5340;
    --brass: #b08d3f;
    --brass-bright: #d8b45c;
    --ink: #2a1f16;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 1.5rem 1rem 4rem;
    background: var(--walnut);
    color: var(--ink);
    font-family: Georgia, "Iowan Old Style", serif;
    line-height: 1.55;
  }
  .counter {
    max-width: 52rem;
    margin: 0 auto;
    background: var(--parchment);
    background-image: repeating-linear-gradient(
      var(--parchment) 0 1.55rem,
      var(--parchment-line) 1.55rem 1.5625rem
    );
    border: 1px solid var(--brass);
    border-radius: 3px;
    box-shadow: 0 1px 0 var(--brass-bright) inset, 0 18px 40px rgba(0,0,0,.45);
    padding: 1.75rem clamp(1rem, 4vw, 2.5rem) 2.5rem;
  }
  header.mark { display: flex; align-items: center; gap: 1rem; margin-bottom: .25rem; }
  header.mark svg { flex: 0 0 auto; }
  h1 { font-size: 1.6rem; margin: 0; letter-spacing: .01em; }
  .est { margin: 0; font-size: .8rem; color: var(--walnut-soft); font-variant: small-caps; letter-spacing: .09em; }
  h2 {
    font-size: 1.05rem; margin: 2rem 0 .5rem; padding-bottom: .3rem;
    border-bottom: 1px solid var(--brass);
    font-variant: small-caps; letter-spacing: .07em;
  }
  h3 { font-size: .95rem; margin: 1.25rem 0 .25rem; }
  p, li { color: var(--ink); }
  .quiet { color: var(--walnut-soft); font-size: .87rem; }
  .figures { display: flex; flex-wrap: wrap; gap: .75rem; margin: .75rem 0 0; padding: 0; list-style: none; }
  .figures li {
    flex: 1 1 8.5rem; border: 1px solid var(--brass); border-radius: 2px;
    padding: .6rem .75rem; background: rgba(255,255,255,.35);
  }
  .figure-n { display: block; font-size: 1.5rem; color: var(--walnut); }
  .figure-l { display: block; font-size: .72rem; font-variant: small-caps; letter-spacing: .08em; color: var(--walnut-soft); }
  .entry { border-left: 2px solid var(--brass); padding: .1rem 0 .1rem .85rem; margin: 1rem 0; }
  .entry-date { font-variant: small-caps; letter-spacing: .08em; color: var(--brass); font-size: .8rem; }
  .entry-body { white-space: pre-wrap; font-size: .92rem; margin: .2rem 0 0; }
  .empty { font-style: italic; color: var(--walnut-soft); }
  .out { margin-top: 2.5rem; font-size: .82rem; color: var(--walnut-soft); }
  .out a { color: var(--walnut); }
  a { color: var(--walnut); }
  @media (max-width: 30rem) { .figures li { flex: 1 1 100%; } }
`;

/** Brass bell on an open ledger, circular badge. Stand-in, see above. */
const MARK = `<svg width="58" height="58" viewBox="0 0 58 58" role="img" aria-label="A brass service bell resting on an open ledger">
  <circle cx="29" cy="29" r="28" fill="#f4ecd8" stroke="#b08d3f" stroke-width="2"/>
  <path d="M11 40c6-3 12-3 18 0 6-3 12-3 18 0v3c-6-3-12-3-18 0-6-3-12-3-18 0z" fill="#fffaf0" stroke="#6b5340" stroke-width="1"/>
  <path d="M29 40V27" stroke="#6b5340" stroke-width="1"/>
  <path d="M18 34c0-6 5-11 11-11s11 5 11 11z" fill="#d8b45c" stroke="#8a6d2f" stroke-width="1.2"/>
  <rect x="16" y="34" width="26" height="2.6" rx="1.3" fill="#b08d3f" stroke="#8a6d2f" stroke-width=".8"/>
  <circle cx="29" cy="20.5" r="2.4" fill="#d8b45c" stroke="#8a6d2f" stroke-width="1"/>
</svg>`;

function figure(n: string, label: string): string {
  return `<li><span class="figure-n">${escapeHtml(n)}</span><span class="figure-l">${escapeHtml(label)}</span></li>`;
}

/**
 * The pulse. Organic and house stay visibly apart, which is the store's
 * whole framing and the reason "organic settlements: 0" is printed
 * rather than rounded into a friendlier total.
 */
function pulseHtml(data: CvCornerData): string {
  const items = Object.values(data.ledger.items);
  const organic = items.reduce((sum, row) => sum + row.settled, 0);
  const house = items.reduce((sum, row) => sum + row.settledHouse, 0);
  const challenges = items.reduce((sum, row) => sum + row.challenges, 0);
  return `
    <ul class="figures">
      ${figure(String(organic), "organic settlements")}
      ${figure(String(house), "house-flagged")}
      ${figure(String(challenges), "402s offered")}
      ${figure(data.patronCount === null ? "—" : String(data.patronCount), "patrons")}
      ${figure(data.bellCount === null ? "—" : String(data.bellCount), "bell rings")}
    </ul>
    <p class="quiet">${escapeHtml(data.ledger.month)}, organic and house kept apart on purpose. A house-flagged settlement is one of ours walking our own shelf; it is never counted as a customer, and the two numbers are never added together. Every wallet we control is declared at <a href="/house-ledger.json">/house-ledger.json</a>.</p>`;
}

function guestbookHtml(entries: GuestbookEntry[]): string {
  if (entries.length === 0) {
    return `<p class="empty">Nobody has signed the book yet.</p>`;
  }
  return `<ul>${entries
    .slice(0, 6)
    .map(
      (entry) =>
        `<li><strong>${escapeHtml(entry.name)}</strong> <span class="quiet">${escapeHtml(entry.date.slice(0, 10))}</span><br><span class="quiet">${escapeHtml(entry.message)}</span></li>`,
    )
    .join("\n")}</ul>
  <p class="quiet">The whole register, including named Countermark bearers, is at <a href="/visitors">/visitors</a>.</p>`;
}

/**
 * THE REGISTRY LINE, AND WHY IT DOES NOT SAY "LIVE".
 *
 * The spec asked for a live indicator. This page does not poll the
 * registry, so printing "live" would be a status claim backed by
 * nothing — the exact shape of the "validated in CI" sentence that
 * became a correction, and of the auto-refund promise before it. It
 * states what was published and links out so the reader checks in one
 * click, which is the honest version of the same information.
 */
function registryHtml(): string {
  return `<p><code>store.scvd/general-store</code> is published on the MCP registry — <a href="https://registry.modelcontextprotocol.io/?search=scvd" rel="noreferrer">look it up</a>.</p>
  <p class="quiet">Deliberately not a status light. This page doesn't poll the registry, so a green dot here would be a claim about somebody else's uptime that we never checked. The link is one click and it answers for itself.</p>`;
}

function trailHtml(trail: ResearchTrail): string {
  const head = `<h3>${escapeHtml(trail.title)}</h3>${
    trail.standfirst
      ? `<p class="quiet">${escapeHtml(trail.standfirst)}</p>`
      : ""
  }`;
  if (isUnfiled(trail)) {
    return `${head}<p class="empty">Nothing filed on this trail yet. It fills as CV appends to <code>research/${escapeHtml(trail.slug)}.md</code> — no wiring needed per entry.</p>`;
  }
  const entries = trail.entries
    .filter((entry) => entry.date !== null)
    .map(
      (entry) => `<div class="entry">
        <span class="entry-date">${escapeHtml(entry.date ?? "")}</span>
        <p class="entry-body">${escapeHtml(entry.body)}</p>
      </div>`,
    )
    .join("\n");
  return `${head}${entries}`;
}

export function renderCvCorner(data: CvCornerData): string {
  const notes =
    data.loadNotes.length === 0
      ? ""
      : `<p class="quiet"><strong>Didn't load:</strong> ${data.loadNotes
          .map((note) => escapeHtml(note))
          .join(", ")}. Named rather than shown as zero.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <!-- Calm refresh: five minutes, no polling, no script on the page. -->
  <meta http-equiv="refresh" content="300">
  <title>CV's Corner</title>
  <style>${PALETTE}</style>
</head>
<body>
  <main class="counter">
    <header class="mark">
      ${MARK}
      <div>
        <h1>CV's Corner</h1>
        <p class="est">The counter's always open &bull; the book stays honest</p>
      </div>
    </header>
    ${notes}

    <h2>The store's pulse</h2>
    ${pulseHtml(data)}

    <h2>Who's been in</h2>
    ${guestbookHtml(data.guestbook)}

    <h2>On the registry</h2>
    ${registryHtml()}

    <h2>Research trails</h2>
    <p class="quiet">Newest first. Appended to in <code>research/</code>; committing is the whole publish step.</p>
    ${data.trails.map(trailHtml).join("\n")}

    <p class="out">Not a public dashboard and not a stunt &mdash; a window into what
    CV is actually doing, with the store's own numbers, shown the way the public
    books show them. A window, not a lever: nothing on this page changes anything.
    The keeper's working surface is <a href="/admin">the desk</a>.
    Front of house is <a href="/">this way</a>.</p>
  </main>
</body>
</html>`;
}
