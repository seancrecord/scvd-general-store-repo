import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { ARTIFACT_CLASSES, TRUST_MODELS } from "@/store/attestation-spec";
import {
  BADGE_IS,
  BADGE_RETIREMENT,
  CRITERIA_DATED,
  CRITERIA_HONEST_LIMIT,
  CRITERIA_STANDFIRST,
  NEVER_AN_ACTOR_SCORE,
  VERDICT_VOCABULARY,
} from "@/store/copy/criteria";
import { WHO_PAYS_AND_WHAT_IT_BUYS } from "@/store/copy/who-pays";
import { PREFLIGHT_VERSION } from "@/services/preflight";
import { AUDIT_CRITERIA_VERSION } from "@/services/service-audit";
import type { HonoEnv } from "@/types";

/**
 * GET /criteria — what "verified" means here, published before any
 * badge exists. Rule 43's gate: "No badge ships before its criteria
 * page exists."
 *
 * Almost everything on it is DERIVED rather than written: the artifact
 * classes with their trust models and does_not_prove come from
 * ARTIFACT_CLASSES (the same list /attestation serves), the criteria
 * battery is the versioned preflight the audit already runs, and the
 * immunity clause is the one the watch histories already carry. The
 * only new words are the ones only the keeper could supply — what
 * retires a badge — and he ruled it on 2026-08-10: nothing does; it
 * ages.
 */
export const criteriaRoutes = new Hono<HonoEnv>();

criteriaRoutes.get("/criteria", (c) => {
  const base = c.env.STORE_BASE_URL;
  const payload = {
    standfirst: CRITERIA_STANDFIRST,
    dated: CRITERIA_DATED,
    what_a_badge_is: BADGE_IS,
    what_retires_a_badge: BADGE_RETIREMENT,
    never_a_score_on_an_actor: NEVER_AN_ACTOR_SCORE,
    who_pays_and_what_it_buys: WHO_PAYS_AND_WHAT_IT_BUYS,
    criteria_battery: {
      version: AUDIT_CRITERIA_VERSION,
      url: `${base}/api/preflight/${PREFLIGHT_VERSION}`,
      note: "The published check battery. A criteria-governed check runs those checks and no others; a new battery is a new version, and the version is named on every artifact it produces.",
    },
    verdict_vocabulary: VERDICT_VOCABULARY,
    /**
     * Derived from the attestation spec, deliberately: the per-class
     * trust model and does-not-prove ARE the per-class criteria, and a
     * second hand-typed copy here would drift from the page that
     * exists to prevent exactly that.
     */
    artifact_classes: ARTIFACT_CLASSES.map((entry) => ({
      id: entry.id,
      name: entry.name,
      trust_model: TRUST_MODELS[entry.trust_model].name,
      signs: entry.signs,
      does_not_prove: entry.does_not_prove,
      verify_url: `${base}${entry.verify_url}`,
    })),
    badges_today: "None. Nothing this store serves carries a badge, and this page existing changes that only by removing the gate rule 43 put in front of it.",
    attestation: `${base}/attestation`,
    becoming: `${base}/becoming`,
    limit: CRITERIA_HONEST_LIMIT,
  };
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(payload);
  }

  const verdicts = VERDICT_VOCABULARY.map(
    (entry) => `<tr>
      <td><strong><code>${escapeHtml(entry.verdict)}</code></strong></td>
      <td><small>${escapeHtml(entry.means)}</small></td>
    </tr>`,
  ).join("\n");

  const classes = ARTIFACT_CLASSES.map(
    (entry) => `<tr>
      <td><strong>${escapeHtml(entry.name)}</strong></td>
      <td>${escapeHtml(TRUST_MODELS[entry.trust_model].name)}</td>
      <td><small>${escapeHtml(entry.does_not_prove)}</small></td>
    </tr>`,
  ).join("\n");

  return c.html(
    renderSimplePage({
      title: "What 'verified' means",
      description:
        "What 'verified' means at this store, per artifact class, published before anything carries a badge: the criteria version, the verdict vocabulary.",
      path: "/criteria",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(CRITERIA_STANDFIRST)}</p>
        <p class="menu-meta">Ruled and dated ${escapeHtml(CRITERIA_DATED)}. The signing spec this page leans on is at <a href="/attestation">/attestation</a>; the direction it unblocks is tracked at <a href="/becoming">/becoming</a>.</p>
      </section>
      <section>
        <h2>What a badge is</h2>
        <p class="menu-desc">${escapeHtml(BADGE_IS)}</p>
        <p class="menu-desc">${escapeHtml(NEVER_AN_ACTOR_SCORE)}</p>
      </section>
      <section>
        <h2>What retires a badge</h2>
        <p class="menu-desc">${escapeHtml(BADGE_RETIREMENT)}</p>
      </section>
      <section>
        <h2>The criteria</h2>
        <p class="menu-desc">Version <strong><code>${escapeHtml(AUDIT_CRITERIA_VERSION)}</code></strong>: the published check battery at <a href="/api/preflight/${escapeHtml(PREFLIGHT_VERSION)}"><code>/api/preflight/${escapeHtml(PREFLIGHT_VERSION)}</code></a>. A criteria-governed check runs those checks and no others; a new battery is a new version, named on every artifact it produces.</p>
        <table border="1" cellpadding="6">
          <tr><th>verdict</th><th>what it means, and no more</th></tr>
          ${verdicts}
        </table>
      </section>
      <section>
        <h2>Who pays, and what paying buys</h2>
        <p class="menu-desc">${escapeHtml(WHO_PAYS_AND_WHAT_IT_BUYS)}</p>
      </section>
      <section>
        <h2>Per artifact class</h2>
        <p class="menu-meta">Derived from the same list <a href="/attestation">/attestation</a> serves — what each signature covers is stated there; what matters here is the column no badge may blur.</p>
        <table border="1" cellpadding="6">
          <tr><th>artifact</th><th>trust model</th><th>what a valid signature does not prove</th></tr>
          ${classes}
        </table>
      </section>
      <section>
        <h2>Badges today</h2>
        <p class="menu-desc">None. Nothing this store serves carries a badge, and this page existing changes that only by removing the gate rule 43 put in front of it.</p>
        <p class="menu-meta">${escapeHtml(CRITERIA_HONEST_LIMIT)}</p>
      </section>`,
    }),
  );
});
