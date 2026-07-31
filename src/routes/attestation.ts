import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  ARTIFACT_CLASSES,
  ATTESTATION_HONEST_LIMIT,
  ATTESTATION_STANDFIRST,
  HELD_AGAINST_US,
  KEY_ARCHITECTURE,
  MAKER_MARK_POLICY,
  NOT_BUILT,
  TRUST_MODELS,
  WHY_SIGNED_PAYLOAD,
} from "@/store/attestation-spec";
import {
  CONTINUITY_LIMIT,
  KEY_BACKUP,
  KEY_BACKUP_EXISTS,
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
function keyContinuity() {
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
      what_is_deliberately_undisclosed: SUCCESSION_SECRECY,
    },
    limit: CONTINUITY_LIMIT,
  };
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
    key_continuity: keyContinuity(),
    trust_models: TRUST_MODELS,
    artifact_classes: ARTIFACT_CLASSES.map((entry) => ({
      ...entry,
      trust_model_name: TRUST_MODELS[entry.trust_model].name,
      verify_url: `${base}${entry.verify_url}`,
    })),
    maker_marks: MAKER_MARKS,
    maker_mark_policy: MAKER_MARK_POLICY,
    marked_items: ITEM_MAKER_MARK,
    not_built: NOT_BUILT,
    held_against_us: HELD_AGAINST_US,
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
        "What this x402 store signs, who holds the key, and whose word you are taking: the trust model per artifact class, including where it is the weakest available, and a list of what this store does not have.",
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
      </section>`,
    }),
  );
});
