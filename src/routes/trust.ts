import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { buildTrustPanel } from "@/services/trust-panel";
import { ASSURANCE_LADDER } from "@/store/assurance";
import type { HonoEnv } from "@/types";

/**
 * GET /trust — every trust surface, one room (outside-reads item 6:
 * "a status/trust panel that summarizes signing key, delivery stats,
 * corrections, uptime, and recent fulfilled artifacts in one place").
 *
 * The panel's whole job is aggregation with links: each number is
 * derived from the deep room's own source and each section ends at
 * that room's door. A buyer deciding whether to trust a signature
 * should finish this page knowing exactly three things: what the key
 * is and how its history is anchored, what the signature claims at
 * each assurance level, and where the store's own failures are
 * recorded. The honesty block goes first because every outside read
 * praised it — being told what we are NOT is the store's best
 * conversion asset.
 */
export const trustRoutes = new Hono<HonoEnv>();

trustRoutes.get("/trust", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const panel = await buildTrustPanel(c.env);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({
      ...panel,
      assurance_ladder: ASSURANCE_LADDER,
      what_this_is_not:
        "Not an escrow, not a guarantor, not a dispute court, no chargebacks, no third-party audit. One operator, one live signing key (history Bitcoin-anchored). Treat artifacts as evidence to verify, never as institutional assurance.",
    });
  }

  const ladderRows = ASSURANCE_LADDER.map(
    (level) => `<tr>
      <td><strong>${level.level}. ${escapeHtml(level.name)}</strong></td>
      <td>${escapeHtml(level.claim)}</td>
      <td>${escapeHtml(level.not_claimed)}</td>
      <td>${level.examples.map((e) => `<code>${escapeHtml(e)}</code>`).join(", ")}</td>
    </tr>`,
  ).join("\n");

  const galleryRows = panel.gallery.items.length
    ? panel.gallery.items
        .map(
          (item) => `<tr>
      <td><code>${escapeHtml(item.item)}</code></td>
      <td>${escapeHtml(item.date.slice(0, 10))}</td>
      <td><a href="${escapeHtml(item.verify_url)}">verify it yourself</a></td>
    </tr>`,
        )
        .join("\n")
    : `<tr><td colspan="3"><em>No house purchases surfaced yet this hour — the gallery derives from real bought artifacts and refreshes hourly.</em></td></tr>`;

  const bodyHtml = `<section>
    <h2>What this store is not</h2>
    <p class="menu-desc">Not an escrow, not a guarantor, not a dispute court.
    No chargebacks, no third-party audit. One operator, one live signing key.
    Everything below exists so you can verify what we sign <em>without
    trusting us</em> — that is the entire model, and where it has limits, the
    limits are printed.</p>
  </section>
  <section>
    <h2>The key</h2>
    <p class="menu-desc">One live ed25519 key signs everything, in service
    since ${escapeHtml(panel.key.first_in_service_from)};
    ${panel.key.retired_keys} retired key${panel.key.retired_keys === 1 ? "" : "s"} in the
    history. The directory is at
    <a href="${escapeHtml(panel.key.directory_url)}"><code>/.well-known/scvd-signing-key</code></a>,
    and the history is committed where we cannot edit it: an append-only hash
    chain with digests timestamped into Bitcoin
    (<a href="${escapeHtml(panel.key.anchor_log_url)}"><code>/.well-known/anchor-log.json</code></a>).
    It proves <em>when</em> a key state existed, never <em>who should have</em>
    held it — a stolen live key would sign indistinguishably, which is why the
    key-risk caveat appears everywhere artifacts are sold.</p>
  </section>
  <section>
    <h2>What a signature claims — the assurance ladder</h2>
    <p class="menu-desc">A valid signature always proves the same mechanical
    fact. What that fact is <em>evidence of</em> depends on the artifact's
    level. Never a score on anybody — levels describe our claim, not their
    quality.</p>
    <table border="1" cellpadding="6">
      <tr><th>level</th><th>a valid signature claims</th><th>and does not claim</th><th>lives here today</th></tr>
      ${ladderRows}
    </table>
  </section>
  <section>
    <h2>Inspect before you buy</h2>
    <p class="menu-desc">${escapeHtml(panel.gallery.note)}</p>
    <table border="1" cellpadding="6">
      <tr><th>artifact</th><th>bought</th><th>proof</th></tr>
      ${galleryRows}
    </table>
  </section>
  <section>
    <h2>The record, kept where you can check it</h2>
    <ul>
      <li><a href="${escapeHtml(panel.corrections.url)}">Corrections</a> —
      ${panel.corrections.total} on record${panel.corrections.latest ? `, latest ${escapeHtml(panel.corrections.latest)}` : ""}.
      Things we said that were not true, kept forever, never softened.</li>
      <li><a href="${escapeHtml(panel.corpus.url)}">The corpus</a> —
      ${panel.corpus.entries} signed, hash-chained, Bitcoin-anchored weekly
      snapshot${panel.corpus.entries === 1 ? "" : "s"} of the x402 ecosystem${panel.corpus.latest_week ? `, latest ${escapeHtml(panel.corpus.latest_week)}` : ""}.</li>
      <li><a href="/books">The books</a> — revenue checked against the chain,
      drift printed, and <a href="/stats">the stats behind them</a>, house
      traffic split out.</li>
      <li><a href="/fulfillment-log">The fulfillment log</a> — queued human
      work, order by order, including the late ones.</li>
      <li><a href="/stack">The stack</a> — every dependency we do not control
      and what breaks when it does.</li>
      <li><a href="/.well-known/trust.json">The machine trust list</a> —
      third-party registries that have confirmed us, with dates, edges
      stated; the surface indexers read beside the signing key.</li>
      <li><a href="/corrections">When we get it wrong</a> and
      <a href="/attestation">what we sign</a> — the standing terms.</li>
      <li><a href="/disagreements">Disagreements</a> — where our reading
      and another instrument's diverge, both readings with their
      derivations; neither authoritative over the other (house rule 51).</li>
    </ul>
    <p class="menu-meta">Verification of any artifact:
    <code>${escapeHtml(base)}/api/verify/{id}</code> — free, no account,
    forever. JSON twin of this page at the same URL with
    <code>Accept: application/json</code>.</p>
  </section>`;

  return c.html(
    renderSimplePage({
      title: "The trust panel",
      description:
        "Every trust surface in one place: the signing key and its Bitcoin-anchored history, the assurance ladder, real verifiable sample artifacts, corrections, books, and the corpus.",
      path: "/trust",
      bodyHtml,
    }),
  );
});
