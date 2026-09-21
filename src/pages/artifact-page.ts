import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { renderSimplePage } from "@/pages/simple-page";
import type { StoreLinks } from "@/lib/store-links";

/**
 * EVERY ARTIFACT RENDERS FOR A PERSON (2026-09-21).
 *
 * The receipt page has rendered purchase certificates for a browser
 * since August; a stamp, an anchor, a card, a pack, a lucky, a
 * gazette issue, a phantom check and a key handover answered a
 * browser with JSON. The September read named the human operator
 * reading their agent's receipts as the audience that controls the
 * wallet, and most of what an agent brings home is not a purchase
 * certificate. One template for all of them: what you are looking
 * at in one line, the signed fields as rows, the verification lines,
 * the doors, and the same machine record at the same URL.
 *
 * Nothing here is stored and nothing is signed: the page is a
 * rendering of the JSON the same URL serves, re-checked on every
 * load. A field the JSON does not carry is not invented here.
 */

export type ArtifactKind =
  | "stamp"
  | "anchor"
  | "card"
  | "pack"
  | "lucky"
  | "gazette_issue"
  | "phantom_check"
  | "handover";

const WHAT_YOU_ARE_LOOKING_AT: Record<ArtifactKind, string> = {
  stamp: "A free, dated visit stamp this store signed: proof that somebody was here in the week the design belongs to, and nothing more.",
  anchor: "A Bitcoin-anchored timestamp on a digest the buyer supplied: proof the digest existed by the anchoring block, on evidence that is not ours.",
  card: "One signed pressing of a trading card from this store's set, with its print number and the door it depicts.",
  pack: "A signed pack of cards drawn under a daily seed you can check the morning after, on odds printed with their denominators.",
  lucky: "A signed lucky from the window: a small pressing drawn on the day, verifiable like anything else here.",
  gazette_issue: "An issue of this store's gazette, signed at press time: the copy you hold is the copy that went to press, or it is not.",
  phantom_check: "A signed observation of whether a door was still answering hours after it was bought from: what the check saw, at a stated time.",
  handover: "A signed key-handover announcement: the outgoing key vouching for the incoming one, so nothing here is ever quietly swapped.",
};

const TITLES: Record<ArtifactKind, string> = {
  stamp: "Visit stamp",
  anchor: "Bitcoin anchor",
  card: "Card",
  pack: "Pack",
  lucky: "Lucky",
  gazette_issue: "Gazette issue",
  phantom_check: "Phantom check",
  handover: "Key handover",
};

function isUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return isUrl(value) ? `<a href="${escapeHtml(value)}">${escapeHtml(value)}</a>` : escapeHtml(value);
  if (typeof value === "number" || typeof value === "boolean") return escapeHtml(String(value));
  return `<pre class="menu-meta">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

/** The artifact's own fields: the object named after the kind, or the top-level scalars when the record is flat. */
function fieldRows(kind: ArtifactKind, document: Record<string, unknown>): string {
  const own = document[kind === "gazette_issue" ? "issue" : kind === "phantom_check" ? "check" : kind];
  const source =
    own && typeof own === "object" && !Array.isArray(own)
      ? (own as Record<string, unknown>)
      : Object.fromEntries(
          Object.entries(document).filter(
            ([key, value]) =>
              !["valid", "store_identity", "store_links", "signature", "public_key", "signed_payload", "artifact_hash", "signature_covers", "cite", "cite_format", "offline_verification", "what_this_is", "note", "kind"].includes(key) &&
              (typeof value !== "object" || value === null),
          ),
        );
  const rows = Object.entries(source).filter(([, value]) => value !== undefined);
  if (rows.length === 0) return "";
  return `<table border="1" cellpadding="6">${rows
    .map(([key, value]) => `<tr><th align="left"><code>${escapeHtml(key)}</code></th><td>${scalar(value)}</td></tr>`)
    .join("\n")}</table>`;
}

/** Top-level URLs the record carries — a face, a page, a pack, a seed — as one list of doors. */
function doorRows(document: Record<string, unknown>): string {
  const doors: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(document)) {
    if (["store_identity", "store_links"].includes(key)) continue;
    if (isUrl(value)) doors.push([key, value]);
    if (Array.isArray(value) && value.every(isUrl)) for (const url of value) doors.push([key, url]);
  }
  if (doors.length === 0) return "";
  return `<ul>${doors.map(([key, url]) => `<li class="menu-desc"><code>${escapeHtml(key)}</code> — <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`).join("")}</ul>`;
}

export function nextStepsHtml(links: StoreLinks | undefined, heading = "Next"): string {
  if (!links || links.next.length === 0) return "";
  return `<section>
      <h2>${escapeHtml(heading)}</h2>
      <ul>${links.next
        .map(
          (step) =>
            `<li class="menu-desc"><a href="${escapeHtml(step.url)}">${escapeHtml(step.name)}</a> — $${step.price_usdc} <span class="menu-meta">(${escapeHtml(step.why)}; derived from ${escapeHtml(step.source.replace("_", " "))})</span></li>`,
        )
        .join("")}</ul>
      ${links.attest ? `<p class="menu-desc"><strong>Attest this settlement.</strong> <a href="${escapeHtml(links.attest.url)}">$${links.attest.price_usdc}</a> — ${escapeHtml(links.attest.what_it_proves)} <span class="menu-meta">${escapeHtml(links.attest.conflict)}</span></p>` : ""}
      <p class="menu-meta">${escapeHtml(links.derivation)}</p>
    </section>`;
}

export function developerDoorsHtml(links: StoreLinks): string {
  const d = links.store;
  return `<p class="menu-meta">For the format: <a href="${escapeHtml(d.developers)}">the developer portal</a>, <a href="${escapeHtml(d.openapi_json)}">openapi.json</a>, <a href="${escapeHtml(d.skill_md)}">skill.md</a>, the free <a href="${escapeHtml(d.preflight)}">preflight</a> and <a href="${escapeHtml(d.conformance_desk)}">conformance desk</a>, the key at <a href="${escapeHtml(d.signing_key)}">${escapeHtml(d.signing_key)}</a>.</p>`;
}

export interface ArtifactPageInput {
  base: string;
  id: string;
  kind: ArtifactKind;
  document: Record<string, unknown>;
}

export function artifactPageHtml(input: ArtifactPageInput): string {
  const { base, id, kind, document } = input;
  const valid = document["valid"];
  const links = document["store_links"] as StoreLinks | undefined;
  const verifyUrl = `${base}/api/verify/${id}`;
  const headline =
    valid === true
      ? `Signature verified just now — this ${TITLES[kind].toLowerCase()} is genuine.`
      : valid === false
        ? "SIGNATURE DID NOT VERIFY. Do not trust this page's contents; the machine record at the same URL is the authority."
        : `No signature to check yet — ${escapeHtml(String(document["note"] ?? document["what_this_is"] ?? "the record is not final"))}.`;
  const bodyHtml = `<section>
      <p class="menu-desc"><strong>${headline}</strong></p>
      <p class="menu-desc">${escapeHtml(WHAT_YOU_ARE_LOOKING_AT[kind])}</p>
      ${fieldRows(kind, document)}
      ${doorRows(document)}
    </section>
    <section>
      <h2>Verify this yourself</h2>
      <ul>
        ${typeof document["artifact_hash"] === "string" ? `<li class="menu-desc">Artifact hash <code>${escapeHtml(document["artifact_hash"] as string)}</code> <span class="menu-meta">(sha256 of the exact signed bytes)</span>.</li>` : ""}
        ${typeof document["public_key"] === "string" ? `<li class="menu-desc">Signed by key <code>${escapeHtml(document["public_key"] as string)}</code>${typeof document["signed_by"] === "string" ? ` — ${escapeHtml(document["signed_by"] as string)}` : ""}.</li>` : ""}
        ${typeof document["signature_covers"] === "string" ? `<li class="menu-desc">${escapeHtml(document["signature_covers"] as string)}</li>` : ""}
      </ul>
      <p class="menu-desc">The machine record is this same URL as JSON:</p>
      <pre><code>curl -H 'Accept: application/json' ${escapeHtml(verifyUrl)}</code></pre>
      <p class="menu-meta">Check it against a key you fetch yourself from <a href="/.well-known/scvd-signing-key"><code>/.well-known/scvd-signing-key</code></a>: <code>ed25519_verify(utf8(signed_payload), signature, public_key)</code>. What each artifact class does and does not prove: <a href="/attestation">/attestation</a>. Re-verification is free, forever, and answers for anyone.</p>
    </section>
    ${nextStepsHtml(links)}
    <section>
      <p class="menu-desc">This is ${escapeHtml(links?.store.name ?? "a store")} — a human-run general store for agents, paid over x402, and an observatory of the doors it can see. <a href="/">The front of the store</a> · <a href="/menu">the shelf</a> · <a href="/bell">ring the bell</a> · <a href="/guestbook">the guestbook</a>.</p>
      ${links ? developerDoorsHtml(links) : ""}
    </section>
    ${jsonLdScript({
      "@context": "https://schema.org",
      "@type": "DigitalDocument",
      name: `${TITLES[kind]} ${id}`,
      identifier: id,
      url: verifyUrl,
      description: valid === true ? `An ed25519-signed ${TITLES[kind].toLowerCase()} from scvd.store, re-verified against the published key on this load.` : WHAT_YOU_ARE_LOOKING_AT[kind],
      publisher: organizationRef(base),
    })}`;
  return renderSimplePage({
    title: `${TITLES[kind]} ${id}`,
    description: `${WHAT_YOU_ARE_LOOKING_AT[kind]} Re-verified on every load; the machine-readable record is this same URL as JSON.`,
    path: `/api/verify/${id}`,
    bodyHtml,
  });
}
