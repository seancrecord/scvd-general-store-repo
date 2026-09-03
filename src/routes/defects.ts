import { Hono } from "hono";
import { MARKDOWN_MEDIA_TYPE, VARY_ACCEPT, prefersMarkdown } from "@/lib/accept";
import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript } from "@/lib/jsonld";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  DEFECT_CLASSES,
  DEFECT_VOCABULARY_VERSION,
  EVIDENCE_LABELS,
  MAPPINGS_READ_ON,
  VOCABULARY_CHANGELOG,
  type DefectClass,
} from "@/store/defect-vocabulary";
import type { HonoEnv } from "@/types";
import { CORRECTIONS_POINTER } from "@/store/corrections";

/**
 * GET /defects — the named defect classes, in three dialects.
 *
 * A vocabulary nobody can fetch is not a standard, it is a private
 * opinion with good formatting. This serves JSON for the instrument
 * that wants to join records up, markdown for the agent that asked for
 * it, and a page for the person deciding whether any of it is honest.
 *
 * THE FIELD THAT DOES THE WORK is `detectable`. Our census sends one
 * unpaid GET; a paid walk settles real money. A door can be clean to
 * us and defective to them with neither instrument wrong — and saying
 * WHICH SIDE of that line each defect sits on is what turns "we
 * disagree" into "we measured different things".
 */
export const defectRoutes = new Hono<HonoEnv>();

function document(base: string) {
  return {
    version: DEFECT_VOCABULARY_VERSION,
    url: `${base}/defects`,
    what_this_is:
      "Stable names for the ways an x402 endpoint can be broken, each with what it asserts, what a finding of it would be falsified by, and whether an unpaid probe can see it at all. Published so that two independent instruments observing the same door can tell whether they agree.",
    what_this_is_not:
      "Not a ranking, and not a list of anybody. Every class describes an observable property of ONE endpoint at ONE moment; nothing here accumulates across weeks into a judgment on an operator.",
    the_method_line:
      "unpaid = visible from a GET nobody paid for. paid = only a settled payment reveals it. A door clean to an unpaid probe and defective to a paid walk is not a contradiction; it is two instruments measuring different things, and this field is how a reader tells the difference.",
    cross_instrument_mappings_read_on: MAPPINGS_READ_ON,
    mapping_caveat:
      "Mappings to another instrument's names are our reading of their published definitions on the date above, not their endorsement. Each carries the path to check it and what would show it wrong. If they change a definition, this file is stale until corrected — say so rather than trusting it.",
    corrections: CORRECTIONS_POINTER,
    classes: DEFECT_CLASSES,
    /*
     * A SECOND REGISTER, DELIBERATELY NOT MIXED IN. A defect class is
     * a property of an endpoint; an evidence label is the provenance
     * of a CLAIM about one. Filing them together would rank "this door
     * replays payments" and "we read that in a directory" as findings
     * of equal weight.
     */
    evidence_labels: EVIDENCE_LABELS,
    what_evidence_labels_are:
      "Labels for how a claim was come by, not for what is wrong with a service. They attach to the claimant, never to the operator: listed-not-walked says the instrument did not look, and says nothing whatever about the door.",
    changelog: VOCABULARY_CHANGELOG,
    governance:
      "Definitions are appended and never edited in place. A changed assertion is a new version with the old text still readable in the changelog, and every version records at whose instigation it moved. Outside instruments may author entries; where one did, the entry names them as author and this store only as registrar.",
    license: "CC BY 4.0. Take the names; that is the point of publishing them.",
  };
}

function classMarkdown(entry: DefectClass): string {
  const lines = [
    `### \`${entry.id}\` — ${entry.title}`,
    "",
    `**Asserts:** ${entry.asserts}`,
    "",
    `**Costs:** ${entry.costs}`,
    "",
    `**Detectable:** ${entry.detectable === "unpaid" ? "unpaid — a free probe can see it" : "paid — only a settled payment reveals it"}`,
    "",
    `**Falsified by:** ${entry.falsified_by}`,
  ];
  lines.push("", `**How an operator clears it:** ${entry.repair_hint}`, "", `**What a buyer does:** ${entry.buyer_hint}`);
  if (entry.our_signal) {
    lines.push("", `**Our signal:** \`${entry.our_signal}\``);
  }
  for (const foreign of entry.also_known_as ?? []) {
    lines.push(
      "",
      `**Also known as:** \`${foreign.as}\` (${foreign.instrument}). Check: ${foreign.verify}. Wrong if: ${foreign.falsified_by}`,
    );
  }
  return lines.join("\n");
}

function markdown(base: string): string {
  const doc = document(base);
  return [
    `# x402 defect classes, v${doc.version}`,
    "",
    doc.what_this_is,
    "",
    `**What this is not.** ${doc.what_this_is_not}`,
    "",
    `**Where readings diverge.** A cross-instrument mapping below is a dated read of somebody else's surface. Where their reading and ours diverge on a door, a term, or a claim, both stand with their derivations at ${base}/disagreements — neither authoritative over the other.`,
    "",
    `**The method line.** ${doc.the_method_line}`,
    "",
    `Cross-instrument mappings read on ${doc.cross_instrument_mappings_read_on}. ${doc.mapping_caveat}`,
    "",
    "---",
    "",
    ...DEFECT_CLASSES.map(classMarkdown).flatMap((block) => [block, ""]),
    "## Evidence labels — a separate register",
    "",
    doc.what_evidence_labels_are,
    "",
    ...EVIDENCE_LABELS.flatMap((entry) => [
      `### \`${entry.id}\` — ${entry.title}`,
      "",
      `**Asserts:** ${entry.asserts}`,
      "",
      `**Does NOT assert:** ${entry.does_not_assert}`,
      "",
      `**Falsified by:** ${entry.falsified_by}`,
      "",
      `**Authored by:** ${entry.authored_by}. Registered ${entry.registered}.`,
      "",
    ]),
    "## Changelog",
    "",
    ...VOCABULARY_CHANGELOG.map(
      (entry) =>
        `- **v${entry.version}** (${entry.date}, at the instigation of ${entry.at_the_instigation_of}) — ${entry.what_changed}`,
    ),
    "",
    doc.governance,
    "",
    `Machine-readable: ${base}/defects.json — ${doc.license}`,
    "",
  ].join("\n");
}

function html(base: string): string {
  const rows = DEFECT_CLASSES.map(
    (entry) => `<tr>
      <td><code>${escapeHtml(entry.id)}</code></td>
      <td>${escapeHtml(entry.title)}</td>
      <td>${entry.detectable === "unpaid" ? "unpaid" : "<strong>paid</strong>"}</td>
      <td>${escapeHtml(entry.asserts)}</td>
    </tr>`,
  ).join("\n");
  return renderSimplePage({
    title: "x402 defect classes",
    description:
      "Stable names for the ways an x402 endpoint can be broken, each with what it asserts, what would falsify a finding, and whether an unpaid probe can see it. Published so two independent instruments can tell whether they agree.",
    path: "/defects",
    bodyHtml: `
      <p>Stable names for the ways an x402 endpoint can be broken. Published
      so that two independent instruments observing the same door can tell
      whether they <em>agree</em> — or whether they measured different things.</p>
      <p><strong>Not a ranking, not a list of anybody.</strong>
      Every class below describes an observable property of one endpoint at
      one moment. Nothing here accumulates into a judgment on an operator.</p>
      <p>The column that does the work is <em>detectable</em>. A free probe
      never pays, so it cannot see what only money reveals. A door clean to an
      unpaid probe and defective to a paid walk is not a contradiction.</p>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>id</th><th>class</th><th>detectable</th><th>asserts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
      <p>Full definitions, falsifiers and cross-instrument mappings:
      <a href="/defects.json"><code>/defects.json</code></a>. Mappings were
      read on ${escapeHtml(MAPPINGS_READ_ON)} and are our reading of another
      instrument's published definitions, not their endorsement — each one
      carries the path to check it and what would show it wrong.</p>
      <h2>Evidence labels — a separate register</h2>
      <p>A defect class describes a property of an <em>endpoint</em>. An
      evidence label describes the provenance of a <em>claim</em> about one.
      Keeping them apart is the point: filing them together would rank
      &ldquo;this door replays payments&rdquo; and &ldquo;we read that in a
      directory&rdquo; as findings of equal weight.</p>
      ${EVIDENCE_LABELS.map(
        (entry) => `<h3><code>${escapeHtml(entry.id)}</code> — ${escapeHtml(entry.title)}</h3>
        <p><strong>Asserts:</strong> ${escapeHtml(entry.asserts)}</p>
        <p><strong>Does NOT assert:</strong> ${escapeHtml(entry.does_not_assert)}</p>
        <p><strong>Falsified by:</strong> ${escapeHtml(entry.falsified_by)}</p>
        <p><small>Authored by ${escapeHtml(entry.authored_by)}. Registered ${escapeHtml(entry.registered)} &mdash; this store is the registrar, not the author.</small></p>`,
      ).join("")}
      <h2>Changelog</h2>
      <ul>${VOCABULARY_CHANGELOG.map(
        (entry) =>
          `<li><strong>v${escapeHtml(entry.version)}</strong> (${escapeHtml(entry.date)}, at the instigation of ${escapeHtml(entry.at_the_instigation_of)}) — ${escapeHtml(entry.what_changed)}</li>`,
      ).join("")}</ul>
      <p>Definitions are appended and never edited in place. A changed
      assertion is a new version with the old text still readable above.</p>
      <p>CC BY 4.0. Take the names; that is the point of publishing them.</p>
    `,
  });
}

/**
 * ONE PAGE PER DEFECT CLASS (2026-09-03, PR 3). "What does
 * offer-contradicts-challenge mean" has one answer on the web and it
 * was a row in a table on a page whose title says "defect classes".
 * Each class now has its own page, its id in the title, a DefinedTerm
 * node in the set the vocabulary already is, and the same fields the
 * JSON carries — derived from DEFECT_CLASSES, so a class added to the
 * vocabulary has a page the same commit.
 */
defectRoutes.get("/defects/:id{[a-z0-9-]+}", (c) => {
  const base = c.env.STORE_BASE_URL;
  const id = c.req.param("id");
  const entry = DEFECT_CLASSES.find((klass) => klass.id === id);
  if (!entry) {
    return c.json(
      { error: `No defect class named ${id}. The vocabulary is at ${base}/defects.json.` },
      404,
    );
  }
  const description = `${entry.title} (${entry.id}), an x402 defect class: ${entry.asserts} Detectable by an ${entry.detectable} probe. ${entry.costs}`;
  return c.html(
    renderSimplePage({
      title: `${entry.title} — x402 defect class ${entry.id}`,
      description,
      path: `/defects/${entry.id}`,
      bodyHtml: `<section>
        <p class="menu-desc"><strong>Asserts:</strong> ${escapeHtml(entry.asserts)}</p>
        <p class="menu-desc"><strong>What a buyer loses when it is present:</strong> ${escapeHtml(entry.costs)}</p>
        <p class="menu-desc"><strong>Detectable:</strong> ${entry.detectable === "unpaid" ? "by an unpaid probe — a GET nobody paid for can see it" : "only by a paid probe — a settled payment reveals it"}.</p>
        <p class="menu-desc"><strong>Falsified by:</strong> ${escapeHtml(entry.falsified_by)}</p>
        <p class="menu-desc"><strong>How an operator clears it:</strong> ${escapeHtml(entry.repair_hint)}</p>
        <p class="menu-desc"><strong>What a buyer does:</strong> ${escapeHtml(entry.buyer_hint)}</p>
        ${entry.our_signal ? `<p class="menu-meta">Our signal: <code>${escapeHtml(entry.our_signal)}</code>.</p>` : `<p class="menu-meta">No instrument of ours reports this class today; the definition stands so another instrument's finding can be compared.</p>`}
        ${
          entry.also_known_as?.length
            ? `<p class="menu-meta">As other instruments name it: ${entry.also_known_as.map((name) => escapeHtml(JSON.stringify(name))).join("; ")}.</p>`
            : ""
        }
        ${entry.sourced_by ? `<p class="menu-meta">Named by ${escapeHtml(entry.sourced_by)}, registered ${escapeHtml(entry.registered ?? "")} — this store is the registrar, not the author.</p>` : ""}
      </section>
      <section>
        <p class="menu-meta">Vocabulary v${escapeHtml(DEFECT_VOCABULARY_VERSION)}, CC BY 4.0. Every class: <a href="/defects">/defects</a>; machine-readable with falsifiers and cross-instrument mappings: <a href="/defects.json"><code>/defects.json</code></a>. A class describes a property of one endpoint at one moment and never accumulates into a judgment on an operator.</p>
      </section>${jsonLdScript({
        "@context": "https://schema.org",
        "@type": "DefinedTerm",
        name: entry.title,
        termCode: entry.id,
        description,
        url: `${base}/defects/${entry.id}`,
        inDefinedTermSet: {
          "@type": "DefinedTermSet",
          name: "scvd.store x402 defect vocabulary",
          url: `${base}/defects`,
        },
      })}`,
    }),
  );
});

defectRoutes.get("/defects.json", (c) =>
  c.json(document(c.env.STORE_BASE_URL)),
);

defectRoutes.get("/defects", (c) => {
  const base = c.env.STORE_BASE_URL;
  const accept = c.req.header("Accept");
  if (prefersMarkdown(accept, "text/html")) {
    return new Response(markdown(base), {
      headers: { "Content-Type": MARKDOWN_MEDIA_TYPE, Vary: VARY_ACCEPT },
    });
  }
  if (wantsHtml(accept, c.req.header("User-Agent"))) {
    return c.html(html(base), 200, { Vary: VARY_ACCEPT });
  }
  c.header("Vary", VARY_ACCEPT);
  return c.json(document(base));
});
