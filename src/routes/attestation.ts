import { Hono } from "hono";
import { jsonLdScript } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  ARTIFACT_CLASSES,
  ATTESTATION_HONEST_LIMIT,
  ATTESTATION_STANDFIRST,
  HELD_AGAINST_US,
  KEY_ARCHITECTURE,
  MAKER_MARK_POLICY,
  MONEY_PATH,
  NOT_BUILT,
  TRUST_MODELS,
  WHY_SIGNED_PAYLOAD,
} from "@/store/attestation-spec";
import {
  CONTINUITY_LIMIT,
  KEY_BACKUP,
  POST_QUANTUM,
  KEY_BACKUP_EXISTS,
  SUCCESSION_MECHANISM,
  SUCCESSION_PROTOCOL,
  SUCCESSION_SECRECY,
  SUCCESSION_STATE,
} from "@/store/key-continuity";
import { ITEM_MAKER_MARK, MAKER_MARKS } from "@/store/provenance";
import type { HonoEnv } from "@/types";

/**
 * /attestation — what gets signed, who holds the key, whose word you
 * are taking.
 *
 * The machinery existed and nobody could tell, which is the same as not
 * having it. An outside critic reading the storefront alone concluded
 * there was no disclosed key architecture, no spec and no statement of
 * what is signed; three claims that were already false, and the fact
 * that a careful reader could believe all three is the finding this
 * page answers.
 *
 * It is not a rebuttal. The trust model per artifact class is stated
 * including where it is the weakest one available, the things this
 * store does NOT have are listed in their own words rather than left
 * to be discovered, and the one criticism that survived reassessment
 * is quoted verbatim rather than softened.
 */
export const attestationRoutes = new Hono<HonoEnv>();

/**
 * The continuity block, assembled once and served to both readers.
 *
 * SHAPED SO A MACHINE CANNOT MISREAD THE STATE. `backup.exists` is a
 * boolean beside the prose rather than a fact buried in it, and
 * `successor_key_exists` is stated as false rather than left to be
 * inferred from the absence of a key — an inferred absence is exactly
 * how "they have a succession plan" gets into a summary nobody wrote.
 */
function keyContinuity(base: string) {
  return {
    backup: {
      exists: KEY_BACKUP_EXISTS,
      state: KEY_BACKUP_EXISTS ? KEY_BACKUP.present : KEY_BACKUP.absent,
      protects_against: KEY_BACKUP_EXISTS ? ["loss"] : [],
      not_a_defence_against: ["theft", "copying", "coercion"],
      note: KEY_BACKUP.what_it_is_not,
    },
    succession: {
      successor_key_exists: false,
      state: SUCCESSION_STATE,
      protocol: SUCCESSION_PROTOCOL,
      mechanism: SUCCESSION_MECHANISM,
      key_history_url: `${base}/.well-known/scvd-signing-key`,
      /**
       * The key history above is ours and is editable by us; this is
       * the same history committed where we cannot reach it. It is
       * listed under succession rather than beside it because the
       * question a reader brings to this block — "was that really a
       * handover, on the date they say?" — is precisely the one a
       * self-hosted registry cannot answer about itself.
       */
      externally_anchored_history_url: `${base}/.well-known/anchor-log.json`,
      anchoring_limit:
        "The anchor log proves WHEN a key state was committed, never WHO SHOULD HAVE held it. A thief holding this store's key could timestamp exactly as validly as we can. It bounds a compromise window after the fact; the succession protocol above is the thing that is meant to prevent one, and these are different jobs.",
      what_is_deliberately_undisclosed: SUCCESSION_SECRECY,
    },
    post_quantum: POST_QUANTUM,
    limit: CONTINUITY_LIMIT,
  };
}

/**
 * THE SIGNING SPEC AS STRUCTURED DATA (the AEO pass, 2026-08-20).
 *
 * The question this page answers — "who holds the key, and what does
 * a signature from it actually prove" — is the exact question an
 * answer engine is asked when somebody wants a verification service,
 * and until now the page answered it only in prose. A TechArticle
 * with the key architecture named in its properties is liftable; the
 * same words inside three paragraphs are not.
 *
 * WHAT IS DELIBERATELY IN THE MARKUP: the weakest trust model, and
 * the fact that no successor key exists. Publishing the limits in the
 * machine-readable copy is the same rule the JSON payload follows —
 * an absence that has to be inferred is how "they have a succession
 * plan" ends up in a summary nobody wrote.
 */
function attestationJsonLd(base: string): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline:
      "What scvd.store signs, who holds the key, and what a valid signature does not prove",
    description:
      "The signing spec behind this x402 store: one ed25519 key, its holder and rotation policy, the trust model for each class of signed artifact including where it is the weakest one available, where the money moves, and a plain list of what this store does not have.",
    url: `${base}/attestation`,
    inLanguage: "en",
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    author: { "@type": "Organization", name: "scvd.store", url: base },
    publisher: { "@type": "Organization", name: "scvd.store", url: base },
    about: ARTIFACT_CLASSES.map((entry) => ({
      "@type": "DefinedTerm",
      name: entry.name,
      description: `${entry.signs} Does not prove: ${entry.does_not_prove}`,
      inDefinedTermSet: `${base}/criteria`,
    })),
    mentions: [
      {
        "@type": "PropertyValue",
        name: "signing key algorithm",
        value: KEY_ARCHITECTURE.algorithm,
      },
      {
        "@type": "PropertyValue",
        name: "public key",
        value: `${base}${KEY_ARCHITECTURE.public_key_url}`,
      },
      {
        "@type": "PropertyValue",
        name: "key backup exists",
        value: KEY_BACKUP_EXISTS,
      },
      {
        "@type": "PropertyValue",
        name: "successor key exists",
        /* Read from the same block the JSON payload serves, so the
           markup cannot keep saying "no successor" after the day one
           exists. */
        value: keyContinuity(base).succession.successor_key_exists,
      },
    ],
    citation: `${base}/criteria`,
  });
}

attestationRoutes.get("/attestation", (c) => {
  const base = c.env.STORE_BASE_URL;
  const payload = {
    standfirst: ATTESTATION_STANDFIRST,
    key_architecture: {
      ...KEY_ARCHITECTURE,
      public_key_url: `${base}${KEY_ARCHITECTURE.public_key_url}`,
    },
    why_signed_payload: WHY_SIGNED_PAYLOAD,
    key_continuity: keyContinuity(base),
    trust_models: TRUST_MODELS,
    artifact_classes: ARTIFACT_CLASSES.map((entry) => ({
      ...entry,
      trust_model_name: TRUST_MODELS[entry.trust_model].name,
      verify_url: `${base}${entry.verify_url}`,
    })),
    money_path: MONEY_PATH,
    maker_marks: MAKER_MARKS,
    maker_mark_policy: MAKER_MARK_POLICY,
    marked_items: ITEM_MAKER_MARK,
    not_built: NOT_BUILT,
    held_against_us: HELD_AGAINST_US,
    /**
     * Rule 43's gate: this page says what a signature proves; that one
     * says what "verified" would mean before anything carries a badge.
     * A reader weighing our signatures is the reader who should find
     * the badge contract without guessing the URL.
     */
    criteria_page: `${base}/criteria`,
    honest_limit: ATTESTATION_HONEST_LIMIT,
  };
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(payload);
  }

  const models = Object.values(TRUST_MODELS)
    .map(
      (model) => `<div class="menu-item">
        <div class="menu-line"><span class="menu-name">${escapeHtml(model.name)}</span></div>
        <p class="menu-desc">${escapeHtml(model.means)}</p>
        <p class="menu-meta"><strong>Where it is weak:</strong> ${escapeHtml(model.weakness)}</p>
      </div>`,
    )
    .join("\n");

  const classes = ARTIFACT_CLASSES.map(
    (entry) => `<tr>
      <td><strong>${escapeHtml(entry.name)}</strong></td>
      <td>${escapeHtml(TRUST_MODELS[entry.trust_model].name)}</td>
      <td><small>${escapeHtml(entry.signs)}</small></td>
      <td><small>${escapeHtml(entry.does_not_prove)}</small></td>
    </tr>`,
  ).join("\n");

  return c.html(
    renderSimplePage({
      title: "What we sign",
      description:
        "What this x402 store signs, who holds the key, and whose word you are taking: the trust model per artifact class, including where it is the weakest available.",
      path: "/attestation",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(ATTESTATION_STANDFIRST)}</p>
      </section>
      <section>
        <h2>The key</h2>
        <p class="menu-desc">One ${escapeHtml(KEY_ARCHITECTURE.algorithm)} key. ${escapeHtml(KEY_ARCHITECTURE.holder)}</p>
        <p class="menu-desc"><strong>Rotation:</strong> ${escapeHtml(KEY_ARCHITECTURE.rotation)}</p>
        <p class="menu-meta">Public key: <a href="${escapeHtml(KEY_ARCHITECTURE.public_key_url)}"><code>${escapeHtml(base)}${escapeHtml(KEY_ARCHITECTURE.public_key_url)}</code></a></p>
        <p class="menu-desc">${escapeHtml(KEY_ARCHITECTURE.verification)}</p>
        <p class="menu-meta">${escapeHtml(WHY_SIGNED_PAYLOAD)}</p>
      </section>
      <section>
        <h2>If the key is lost, stolen, or handed on</h2>
        <h3>Backup — copies of the same key</h3>
        <p class="menu-desc">${escapeHtml(KEY_BACKUP_EXISTS ? KEY_BACKUP.present : KEY_BACKUP.absent)}</p>
        <p class="menu-meta">${escapeHtml(KEY_BACKUP.what_it_is_not)}</p>
        <h3>Succession — a second, different key</h3>
        <p class="menu-desc">${escapeHtml(SUCCESSION_STATE)}</p>
        <p class="menu-desc">If this store ever does hand its key on, it will look like this, and you can hold us to every line:</p>
        <ul>${SUCCESSION_PROTOCOL.map(
          (entry) =>
            `<li><strong>${escapeHtml(entry.rule)}</strong><br><small>${escapeHtml(entry.because)}</small></li>`,
        ).join("\n")}</ul>
        <p class="menu-meta">${escapeHtml(SUCCESSION_MECHANISM)}</p>
        <p class="menu-desc">${escapeHtml(SUCCESSION_SECRECY)}</p>
        <p class="menu-meta">${escapeHtml(CONTINUITY_LIMIT)}</p>
      </section>
      <section>
        <h2>Whose word you are taking</h2>
        ${models}
      </section>
      <section>
        <h2>Per artifact</h2>
        <table border="1" cellpadding="6">
          <tr><th>artifact</th><th>trust model</th><th>what is signed</th><th>what it does not prove</th></tr>
          ${classes}
        </table>
      </section>
      <section>
        <h2>Where the money moves</h2>
        <p class="menu-desc">${escapeHtml(MONEY_PATH.custody)}</p>
        <p class="menu-desc"><strong>Check it yourself:</strong> ${escapeHtml(MONEY_PATH.the_check)}</p>
        <p class="menu-meta">${escapeHtml(MONEY_PATH.what_this_does_not_cover)}</p>
      </section>
      <section>
        <h2>Who made it</h2>
        <p class="menu-desc">${escapeHtml(MAKER_MARK_POLICY)}</p>
        <table border="1" cellpadding="6">
          <tr><th>mark</th><th>what it means</th></tr>
          ${Object.entries(MAKER_MARKS)
            .map(
              ([mark, entry]) =>
                `<tr><td><strong>${escapeHtml(entry.label)}</strong><br><small><code>${escapeHtml(mark)}</code></small></td><td><small>${escapeHtml(entry.means)}</small></td></tr>`,
            )
            .join("\n")}
        </table>
      </section>
      <section>
        <h2>What this store does not have</h2>
        <ul>${NOT_BUILT.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")}</ul>
      </section>
      <section>
        <h2>The criticism that stands</h2>
        <p class="menu-desc">${escapeHtml(HELD_AGAINST_US)}</p>
        <p class="menu-meta">${escapeHtml(ATTESTATION_HONEST_LIMIT)}</p>
      </section>
      ${attestationJsonLd(base)}`,
    }),
  );
});
