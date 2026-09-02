import { deriveTier, tierInputFromHistory, type TierReading } from "@/services/passport-tier";
import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { PASSPORT_CSS, passportCard, refusalCard } from "@/pages/passport-card";
import {
  decisionOf,
  effectiveObservation,
  freshnessOf,
  issuePassport,
  type AgentDecision,
} from "@/services/passport";
import {
  PROFILE_TERM_DAYS,
  listTrustProfiles,
  readTrustProfile,
  type SignedTrustProfile,
} from "@/services/trust-profile";
import type { HonoEnv } from "@/types";

/**
 * /profiles — the hosted trust profiles' two doors: the index (what
 * a profile is, plus every in-term READY-side profile — the consent
 * line holds on the list) and /profiles/{host} for any host with a
 * commissioned profile, in term or not, ready or not, marked plainly
 * either way. The page outlives the index listing on purpose:
 * yanking commissioned evidence mid-term because the verdict turned
 * would be selling the grade after all.
 */
export const profilesRoutes = new Hono<HonoEnv>();

interface ProfileView {
  profile: SignedTrustProfile;
  in_term: boolean;
  /** Live-derived from the corpus at read time, never stored. */
  freshness: string;
  /** The same four-word read the passport and the chip answer with. */
  decision: AgentDecision;
  latest_verdict: string | null;
  last_observed: string | null;
  /** The same derivation the passport signs, on the same fold. */
  tier: TierReading;
}

/**
 * THE PROFILE'S VIEW OF THE EVIDENCE — the passport's own fold, called
 * rather than reimplemented.
 *
 * This function used to carry its own copy of the newest-wins
 * comparison. Correction #114 is what that cost the first time: a door
 * that broke mid-term, with the break recorded by a paid refresh, went
 * dark on its chip and its passport while this page — the URL its
 * operator hands to counterparties — stayed ready-side until the next
 * weekly round. The copy was then fixed to match. A matching copy is
 * not a mechanism; `effectiveObservation` is, and it is now the only
 * place the comparison happens.
 */
async function viewOf(
  c: { env: HonoEnv["Bindings"] },
  profile: SignedTrustProfile,
  now: Date,
): Promise<ProfileView> {
  const observation = await effectiveObservation(
    c.env,
    profile.record.host,
    now,
  );
  const freshness = freshnessOf(
    observation.observed_at,
    observation.verdict ?? undefined,
    now,
  );
  return {
    profile,
    in_term: profile.record.expires > now.toISOString(),
    freshness,
    decision: decisionOf(freshness),
    latest_verdict: observation.verdict,
    last_observed: observation.observed_at,
    tier: deriveTier(
      tierInputFromHistory(observation.history, observation),
      `${c.env.STORE_BASE_URL}/criteria`,
    ),
  };
}

profilesRoutes.get("/profiles", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const now = new Date();
  const all = await listTrustProfiles(c.env);
  const views = await Promise.all(all.map((p) => viewOf(c, p, now)));
  // The consent line: the INDEX names only in-term, ready-side hosts.
  const listed = views.filter(
    (v) => v.in_term && v.latest_verdict === "ready",
  );
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json({
      what: `A hosted trust profile is a standing page an operator commissions about their own endpoint: this store's public evidence — the live passport, the chip, the signed history — aggregated at one URL for ${PROFILE_TERM_DAYS} days per purchase, renewable. Never a verdict: the page derives from the same corpus everyone reads free, and a host that breaks mid-term shows broken on its own page.`,
      how: `Buy trust_profile at ${base}/api/buy/trust_profile?url={your endpoint}. The index lists only in-term hosts whose latest evidence is on the ready side — names on the ready side, everywhere.`,
      profiles: listed.map((v) => ({
        host: v.profile.record.host,
        profile_url: v.profile.record.profile_url,
        active_since: v.profile.record.active_since,
        expires: v.profile.record.expires,
        decision: v.decision,
        freshness: v.freshness,
        tier: v.tier.tier,
        tier_line: v.tier.line,
        last_observed: v.last_observed,
      })),
    });
  }
  const rows = listed
    .map(
      (v) => `<tr><td><a href="/profiles/${escapeHtml(v.profile.record.host)}">${escapeHtml(v.profile.record.host)}</a></td>
      <td><code>${escapeHtml(v.decision)}</code></td>
      <td>${escapeHtml(v.freshness)}</td>
      <td><span data-tier="${escapeHtml(v.tier.tier)}">${escapeHtml(v.tier.line)}</span></td>
      <td>${escapeHtml(v.last_observed?.slice(0, 10) ?? "—")}</td>
      <td>${escapeHtml(v.profile.record.expires.slice(0, 10))}</td></tr>`,
    )
    .join("\n");
  const bodyHtml = `<section>
    <p class="menu-desc">A hosted trust profile is a STANDING page an operator
    commissions about their own endpoint: everything this store's instruments
    publish about one host — the live <a href="/passport">passport</a>, the
    chip, the signed history — at one URL, for ${PROFILE_TERM_DAYS} days per
    purchase, renewable (renewing early extends the term, never burns days).
    Never a verdict: the page derives from the same signed corpus everyone
    reads free, and a host that breaks mid-term shows broken on its own
    profile. The check is bought; the grade never is.</p>
    <p class="menu-desc">Commission yours:
    <code>GET /api/buy/trust_profile?url={your endpoint}</code> — the door
    refuses hosts whose latest evidence is not on the ready side, before any
    money moves.</p>
  </section>
  <section><h2>In-term profiles, ready side</h2>
  ${listed.length === 0 ? `<p class="menu-meta">None yet. The first profile on this index will belong to whoever commissions it.</p>` : `<table><thead><tr><th>host</th><th>decision</th><th>freshness</th><th>tier</th><th>last observed</th><th>term ends</th></tr></thead><tbody>${rows}</tbody></table>`}
  </section>`;
  return c.html(
    renderSimplePage({
      title: "Hosted trust profiles",
      description: `Standing evidence pages operators commission about their own endpoints. ${PROFILE_TERM_DAYS} days per purchase, renewable; index lists in-term ready-side hosts only.`,
      path: "/profiles",
      bodyHtml,
    }),
  );
});

profilesRoutes.get("/profiles/:host", async (c) => {
  const rawHost = c.req.param("host").trim().toLowerCase();
  const now = new Date();
  const profile = await readTrustProfile(c.env, rawHost);
  if (!profile) {
    const detail = `${rawHost} has no hosted profile — nobody has commissioned one. The free evidence for any ready-side host is its passport at /passport/${rawHost}; commissioning is GET /api/buy/trust_profile?url={endpoint}.`;
    if (!wantsHtml(c.req.header("Accept"))) {
      return c.json({ profile: null, detail }, 404);
    }
    return c.html(
      renderSimplePage({
        title: "No profile",
        description: "No hosted profile commissioned for this host.",
        path: `/profiles/${rawHost}`,
        bodyHtml: `<section><h2>No profile for ${escapeHtml(rawHost)}</h2>
        <p class="menu-desc">${escapeHtml(detail)}</p></section>`,
      }),
      404,
    );
  }
  const view = await viewOf(c, profile, now);
  const state = view.in_term
    ? view.latest_verdict === "ready"
      ? "active"
      : "active — latest evidence NOT on the ready side"
    : "term expired — renewable";
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json({
      state,
      in_term: view.in_term,
      decision: view.decision,
      freshness: view.freshness,
      tier: view.tier,
      latest_verdict: view.latest_verdict,
      last_observed: view.last_observed,
      profile,
    });
  }
  const r = profile.record;
  /*
   * THE PAID PAGE SHOWS THE WHOLE PASSPORT (2026-09-01). It showed a
   * bare freshness noun and a LINK to the passport, which meant the
   * free page out-answered the $21 standing page the moment /passport
   * learned to render its own summary. An operator hands this URL to
   * a counterparty; the counterparty should not have to click through
   * to find out what was observed, what failed, what was not looked
   * at, and when the evidence expires.
   *
   * The card is the passport's own renderer, so the two surfaces
   * cannot describe the same host differently — and a refusal renders
   * in the same vocabulary rather than as an absence, because a
   * commissioned page outlives the verdict turning. That is the
   * promise this item was sold with: the page is bought, what it shows
   * never is.
   */
  const outcome = await issuePassport(c.env, r.host, now);
  const evidenceHtml = outcome.issued
    ? passportCard(outcome.passport)
    : refusalCard({
        host: r.host,
        reason: outcome.reason,
        detail: outcome.detail,
      });
  const bodyHtml = `<section>
    <h2>${escapeHtml(r.host)} — <em>${escapeHtml(state)}</em></h2>
    <p class="menu-meta">active since ${escapeHtml(r.active_since.slice(0, 10))} ·
    term ends ${escapeHtml(r.expires.slice(0, 10))} ·
    ${r.renewals} purchase${r.renewals === 1 ? "" : "s"} ·
    commissioned by the operator, never a verdict this store sold</p>
    <p class="menu-meta">
    <img src="/badges/passport/${escapeHtml(r.host)}.svg" alt="passport chip for ${escapeHtml(r.host)}" style="vertical-align:middle;max-height:2em"> ·
    <a href="/passport/${escapeHtml(r.host)}">this passport at its own URL</a> ·
    <a href="/corpus/host/${escapeHtml(r.host)}.json">full signed history</a></p>
    <p class="menu-meta">tier <span data-tier="${escapeHtml(view.tier.tier)}">${escapeHtml(view.tier.line)}</span> ·
    <a href="/corpus/host/${escapeHtml(r.host)}.json">the rows</a> · <a href="/criteria">the rule</a></p>
  </section>
  ${evidenceHtml}
  <section>
    <p class="menu-desc">${escapeHtml(r.not_a_guarantee)}</p>
    <details><summary>the signed commission record (verify it without asking us)</summary>
    <pre>${escapeHtml(JSON.stringify(profile, null, 2))}</pre></details>
  </section>`;
  return c.html(
    renderSimplePage({
      title: `Profile: ${rawHost}`,
      description: `The hosted trust profile for ${rawHost}: what this store observed about one endpoint, what it did not, how fresh the evidence is, and where to verify it — at a standing URL its operator commissioned.`,
      path: `/profiles/${rawHost}`,
      extraCss: PASSPORT_CSS,
      bodyHtml,
    }),
  );
});
