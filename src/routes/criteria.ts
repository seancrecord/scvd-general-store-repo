import { Hono } from "hono";
import { jsonLdScript } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { BADGE_SURFACES, badgesTodayLine } from "@/store/badges";
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
import { PREFLIGHT_VERSION_NEXT } from "@/services/preflight";
import {
  AUDIT_BATTERY_CHANGE_NOTE,
  AUDIT_CRITERIA_VERSION,
} from "@/services/service-audit";
import { DOCTRINE_NOTE } from "@/store/copy/doctrine";
import { ESTABLISHED_ROUNDS, STANDING_ROUNDS, TIER_RULE, TIER_RULE_NOTE } from "@/services/passport-tier";
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

/**
 * THE VOCABULARY AS STRUCTURED DATA (the AEO pass, 2026-08-20).
 *
 * This page's citable asset is not an argument, it is a vocabulary:
 * what each verdict word means and — the column nobody else
 * publishes — what a valid signature still does not prove. schema.org
 * has an exact type for that, DefinedTermSet, and an answer engine
 * asked "what does verified mean for an x402 payment" can lift a
 * defined term whole. It cannot lift a paragraph that merely contains
 * the definition.
 *
 * Every term derives from the same two lists the page and /attestation
 * already render, so the markup cannot drift from the prose above it —
 * a second hand-typed copy is precisely the failure this store keeps
 * catching in its own pages.
 */
function criteriaTermsJsonLd(base: string): string {
  const verdicts = VERDICT_VOCABULARY.map((entry) => ({
    "@type": "DefinedTerm",
    name: entry.verdict,
    description: entry.means,
    inDefinedTermSet: `${base}/criteria`,
  }));
  const classes = ARTIFACT_CLASSES.map((entry) => ({
    "@type": "DefinedTerm",
    name: entry.name,
    description: `Trust model: ${TRUST_MODELS[entry.trust_model].name}. Signs: ${entry.signs} A valid signature does not prove: ${entry.does_not_prove}`,
    inDefinedTermSet: `${base}/criteria`,
  }));
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "What 'verified' means at scvd.store — x402 verdict vocabulary and artifact classes",
    description:
      "The published meaning of every verdict this store's checks can return, and for each class of signed artifact, what the signature covers and what it still does not prove. Criteria version " +
      `${AUDIT_CRITERIA_VERSION}. Never a ranking, and never a verdict without its derivation and denominator beside it; each verdict is a dated observation of one moment, or a derivation that prints its rule and its fraction.`,
    url: `${base}/criteria`,
    inLanguage: "en",
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "scvd.store", url: base },
    hasDefinedTerm: [...verdicts, ...classes],
  });
}

criteriaRoutes.get("/criteria", (c) => {
  const base = c.env.STORE_BASE_URL;
  const payload = {
    standfirst: CRITERIA_STANDFIRST,
    dated: CRITERIA_DATED,
    what_a_badge_is: BADGE_IS,
    what_retires_a_badge: BADGE_RETIREMENT,
    never_a_ranking: NEVER_AN_ACTOR_SCORE,
    /**
     * THE DOCTRINE NOTE (2026-09-02). The sentence changed on the
     * keeper's ruling, and a sentence that governs every surface
     * changes in public, dated, with the why beside it — the same
     * manner as the battery change note above it.
     */
    doctrine: DOCTRINE_NOTE,
    /**
     * THE TIER RULE (2026-09-02, roadmap N7b), typed once here and
     * derived everywhere it renders. A tier is a function of the
     * rounds in the window, the ready count, the latest observation
     * and coverage_suspect; every rendering prints the fraction.
     */
    tier_rule: {
      dated: DOCTRINE_NOTE.dated,
      rules: TIER_RULE,
      established_needs: ESTABLISHED_ROUNDS,
      standing_needs: STANDING_ROUNDS,
      note: TIER_RULE_NOTE,
      index: `${base}/corpus/tiers.json`,
    },
    who_pays_and_what_it_buys: WHO_PAYS_AND_WHAT_IT_BUYS,
    criteria_battery: {
      version: AUDIT_CRITERIA_VERSION,
      url: `${base}/api/preflight/${PREFLIGHT_VERSION_NEXT}`,
      note: "The published check battery. A criteria-governed check runs those checks and no others; a new battery is a new version, and the version is named on every artifact it produces.",
      changed: AUDIT_BATTERY_CHANGE_NOTE,
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
    /*
     * LEDGER A1 (2026-08-24). This field read "None. Nothing this
     * store serves carries a badge" while five badge surfaces were
     * live. It is derived now, and a test walks the router to make
     * sure it stays derived.
     */
    badges_today: {
      count: BADGE_SURFACES.length,
      summary: badgesTodayLine(),
      serves: BADGE_SURFACES.map((entry) => ({
        route: entry.route,
        name: entry.name,
        cost: entry.cost,
        asserts: entry.asserts,
        does_not_assert: entry.does_not_assert,
        ages: entry.ages,
      })),
    },
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
        "What 'verified' means at this store, per artifact class, and the terms every badge here ships against: the criteria version, the verdict vocabulary.",
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
        <h2>The sentence changed on ${escapeHtml(DOCTRINE_NOTE.dated)}</h2>
        <p class="menu-desc">It read: <em>${escapeHtml(DOCTRINE_NOTE.was)}</em> It now reads: <strong>${escapeHtml(DOCTRINE_NOTE.now)}</strong></p>
        <p class="menu-desc">${escapeHtml(DOCTRINE_NOTE.what_changed)}</p>
        <p class="menu-desc">${escapeHtml(DOCTRINE_NOTE.why)}</p>
        <p class="menu-desc">${escapeHtml(DOCTRINE_NOTE.what_did_not_change)}</p>
        <p class="menu-meta">${escapeHtml(DOCTRINE_NOTE.what_keeps_its_bytes)} ${escapeHtml(DOCTRINE_NOTE.rule)}</p>
      </section>
      <section>
        <h2>The passport tier: the rule, typed once</h2>
        <p class="menu-desc">Every endpoint passport carries a tier derived at read from that host's signed rounds. This is the only place the rule is typed; every rendering of a tier prints the fraction it came from and links the rows.</p>
        <table border="1" cellpadding="6">
          <tr><th>tier</th><th>rule</th></tr>
          ${TIER_RULE.map((entry) => `<tr><td><strong><code>${escapeHtml(entry.tier)}</code></strong></td><td><small>${escapeHtml(entry.rule)}</small></td></tr>`).join("\n")}
        </table>
        <p class="menu-meta">${escapeHtml(TIER_RULE_NOTE)} Every host's tier, alphabetical: <a href="/corpus/tiers.json"><code>/corpus/tiers.json</code></a>.</p>
      </section>
      <section>
        <h2>What retires a badge</h2>
        <p class="menu-desc">${escapeHtml(BADGE_RETIREMENT)}</p>
      </section>
      <section>
        <h2>The criteria</h2>
        <p class="menu-desc">Version <strong><code>${escapeHtml(AUDIT_CRITERIA_VERSION)}</code></strong>: the published check battery at <a href="/api/preflight/${escapeHtml(PREFLIGHT_VERSION_NEXT)}"><code>/api/preflight/${escapeHtml(PREFLIGHT_VERSION_NEXT)}</code></a>. A criteria-governed check runs those checks and no others; a new battery is a new version, named on every artifact it produces.</p>
        <p class="menu-meta">${escapeHtml(AUDIT_BATTERY_CHANGE_NOTE)}</p>
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
        <p class="menu-desc">${escapeHtml(badgesTodayLine())}</p>
        <div style="overflow-x:auto">
        <table border="1" cellpadding="6">
          <tr><th>badge</th><th>cost</th><th>what it asserts</th><th>what it refuses to assert</th><th>ages</th></tr>
          ${BADGE_SURFACES.map(
            (entry) => `<tr>
              <td>${escapeHtml(entry.name)}</td>
              <td>${entry.cost}</td>
              <td>${escapeHtml(entry.asserts)}</td>
              <td>${escapeHtml(entry.does_not_assert)}</td>
              <td>${entry.ages ? "yes" : "no"}</td>
            </tr>`,
          ).join("")}
        </table>
        </div>
        <p class="menu-meta">${escapeHtml(CRITERIA_HONEST_LIMIT)}</p>
      </section>
      ${criteriaTermsJsonLd(base)}`,
    }),
  );
});
