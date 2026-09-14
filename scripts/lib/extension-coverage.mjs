/**
 * THE x402 EXTENSION COVERAGE MATRIX — what the specification
 * publishes, what this store reads, and what the difference costs.
 *
 * WHY GENERATED AND NOT WRITTEN. A hand-kept table of somebody else's
 * extensions is the exact artifact that went stale twice this month:
 * the scheme advisory and the MPP citations were both a true reading
 * that nobody re-took. So the extension list is read from the
 * specification's own tree on every run, and the one thing kept by
 * hand — whether we read each extension and where — is checked against
 * that list.
 *
 * THE PROPERTY THAT MATTERS: an extension in the spec with no row here
 * FAILS THE RUN. Not a warning, not a gap in a table nobody scrolls
 * to. A new extension is a decision someone has to make, and this is
 * the thing that makes them make it. Silence would put us back exactly
 * where the scheme list was in August.
 */

/**
 * Our declared reading, by the extension's own id. `reads` is what the
 * code actually does, `where` is the file that does it, and `cost` is
 * an honest sizing of what reading it would take if we do not.
 *
 * `none` is a legitimate answer and appears here without apology. The
 * point of the matrix is to make it a decision rather than an
 * accident.
 */
export const COVERAGE = {
  bazaar: {
    reads: "full",
    where: "src/services/preflight.ts — the `bazaar-extension` conditional check, plus discovery-info-fails-schema over the catalog's own listing rule",
    note: "The discovery extension our own door is indexed by. Read since the battery's conditional tier.",
  },
  "extension-offer-and-receipt": {
    reads: "full",
    where: "src/services/preflight.ts (`signed-offers`), src/services/ward-round.ts, src/services/market.ts",
    note: "Signed offers and receipts — the conformance desk's own subject. offer-contradicts-challenge decodes each signed offer and looks for the accepts entry it commits to.",
  },
  "http-message-signatures": {
    reads: "adjacent",
    where: "src/services/bot-auth-card.ts and the RFC 9421 work behind the signature agent card",
    note: "We sign and verify RFC 9421 for agent identity, but not as an x402 extension inside a 402. The machinery exists; the reading in this position does not.",
    cost: "Low — the verifier is already built. What is missing is recognising the extension where a challenge declares it.",
  },
  "payment-identifier": {
    reads: "none",
    where: null,
    note: "An idempotency key carried in PaymentPayload, consumable by resource server and facilitator alike. This store has its own idempotency story — Idempotency-Key, idempotency.suggested_key on every 402 — built before the extension existed and not reconciled with it.",
    cost: "Low to READ (recognise and report it in the battery). Medium to SPEAK (emit it beside our own key, which is a wire change on a paid path and therefore a keeper's ruling).",
  },
  "builder-code": {
    reads: "none",
    where: null,
    note: "ERC-8021 attribution in settlement calldata: which application exposed the endpoint, which facilitator settled it.",
    cost: "Low to read. Worth noting that it is an attribution channel a directory could use to count us, which is a discovery question rather than a battery one.",
  },
  "auth-hints": {
    reads: "none",
    where: null,
    note: "Declares which accepts[] entries need authentication, so a client can register before committing to a payment method rather than after a wasted round trip.",
    cost: "Low, and squarely in this battery's job: it is a pre-payment fact a buyer needs, which is the whole thesis of the preflight.",
  },
  "sign-in-with-x": {
    reads: "none",
    where: null,
    note: "CAIP-122 wallet authentication; lets a server skip payment for an address that has already paid. Server↔client only, no facilitator.",
    cost: "Low to read. We already read the extension's shape indirectly — sign-in-with-x.md is where #3133 bound the SIWX challenge to the request origin.",
  },
  eip2612GasSponsoring: {
    reads: "none",
    where: null,
    note: "Gasless EIP-2612 permit approval for exact/EVM, facilitator pays gas.",
    cost: "Low to read, and the reading is buyer-relevant: it changes who pays gas, which changes what a quote actually costs.",
  },
  erc20ApprovalGasSponsoring: {
    reads: "none",
    where: null,
    note: "The same for ERC-20 tokens with no native gasless approval.",
    cost: "Low to read; same argument as its EIP-2612 sibling.",
  },
};

export const READ_STATES = ["full", "adjacent", "none"];

/**
 * Pull an extension's declared id out of its spec file. The tree uses
 * two heading styles — `# Extension: \`bazaar\`` and the plain
 * `# Offer and Receipt Extension` — so the id falls back to the
 * filename rather than being guessed from prose.
 */
export function parseExtension(markdown, path) {
  const file = path.split("/").pop();
  const heading = /^#\s+(.*)$/m.exec(markdown)?.[1]?.trim() ?? file;
  const tagged = /^#\s+Extension:\s*`([^`]+)`/m.exec(markdown);
  const id = tagged ? tagged[1] : file.replace(/\.md$/, "");
  /*
   * Two summary conventions in one directory: most files carry a
   * `## Summary` section, and extension-offer-and-receipt opens with
   * `**1. Overview**`. Falling back to the first real paragraph after
   * the title covers both, and an empty summary in the matrix was how
   * this was noticed — a generated table shows its own parser's gaps.
   */
  const sectioned = /^##\s+Summary\s*\n+([\s\S]*?)(?=\n#|\n---|$)/m.exec(markdown)?.[1];
  const body = sectioned ?? markdown.replace(/^#\s+.*$/m, "");
  const summary = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[#>|-]/.test(l) && !/^\*\*\d+\./.test(l))[0] ?? "";
  return { id, file, path, heading, summary };
}

/**
 * The gate. An extension the specification publishes with no row in
 * COVERAGE is an unmade decision, and it stops the run.
 */
export function reconcile(extensions, coverage = COVERAGE) {
  const declared = new Set(Object.keys(coverage));
  const found = extensions.map((e) => e.id);
  const unclassified = found.filter((id) => !declared.has(id));
  const stale = [...declared].filter((id) => !found.includes(id));
  return { unclassified, stale, ok: unclassified.length === 0 && stale.length === 0 };
}

export function renderMatrix(extensions, coverage = COVERAGE, today = new Date().toISOString().slice(0, 10)) {
  const rows = extensions.map((e) => ({ ...e, ...(coverage[e.id] ?? { reads: "unclassified" }) }));
  const count = (state) => rows.filter((r) => r.reads === state).length;
  const out = [];
  out.push("# x402 EXTENSION COVERAGE");
  out.push("");
  out.push(`**Generated ${today} from \`specs/extensions/\` at \`x402-foundation/x402@HEAD\`. Do not hand-edit — run \`npm run extension-coverage\`.**`);
  out.push("");
  out.push(`${rows.length} extensions published: **${count("full")} read in full**, **${count("adjacent")} adjacent**, **${count("none")} unread**.`);
  out.push("");
  out.push("`none` is a legitimate answer. The matrix exists so that it is a decision rather than an accident — and an extension the spec adds with no row here fails the generator rather than sliding in unremarked.");
  out.push("");
  out.push("| Extension | Reads | Where | What it is |");
  out.push("| --- | --- | --- | --- |");
  for (const r of rows) {
    const mark = { full: "**full**", adjacent: "adjacent", none: "—", unclassified: "**UNCLASSIFIED**" }[r.reads];
    out.push(`| \`${r.id}\` | ${mark} | ${r.where ? r.where.split(" — ")[0] : "—"} | ${r.summary.slice(0, 150)} |`);
  }
  out.push("");
  for (const state of ["adjacent", "none"]) {
    const group = rows.filter((r) => r.reads === state);
    if (!group.length) continue;
    out.push(state === "adjacent" ? "## Adjacent — the machinery exists, the reading in this position does not" : "## Unread");
    out.push("");
    for (const r of group) {
      out.push(`### \`${r.id}\``);
      out.push("");
      out.push(r.note);
      if (r.cost) out.push(`\n**Cost:** ${r.cost}`);
      out.push("");
    }
  }
  out.push("## What this matrix does not say");
  out.push("");
  out.push("- **That `full` means complete.** It means the battery reads the extension where a challenge declares it, not that every MUST in its specification is checked.");
  out.push("- **That `none` is wrong.** Several of these are facilitator-side or settlement-side and a pre-payment reader has no view of them. The entry says what reading would cost so the decision can be made on a number.");
  out.push("- **Anything about adoption.** This counts what the specification publishes, not what any door actually serves.");
  out.push("");
  return out.join("\n");
}
