/**
 * THE CORPUS, MIRRORED WHERE RESEARCHERS LOOK (2026-09-03, the AEO
 * plan's entity anchors). The store signs one round a week on the
 * Sunday walk and serves it at /corpus/{n}.json beside the index at
 * /corpus.json. Two copies of the same files live elsewhere: the
 * Zenodo record behind the concept DOI (a new version per round, the
 * DOI never changes) and the Hugging Face dataset. Both were uploaded
 * by hand on 2026-09-03; this is the hand.
 *
 * DERIVED, NOT TYPED: the DOI and the Hugging Face repo are read from
 * the live corpus.json (its Dataset node carries the DOI as
 * `identifier` and the Hugging Face URL in `sameAs`), and the list of
 * round files is the index's own `distribution`. Nothing here names a
 * round the site does not serve.
 *
 * These are the pure parts, tested offline in corpus-publish.test.mjs.
 * The network conversations live in scripts/corpus-publish.mjs.
 */

/** The concept DOI and the Hugging Face repo id, from the live index. */
export function anchorsFrom(index) {
  const doi = index?.identifier?.propertyID === "DOI" ? index.identifier.value : null;
  const sameAs = Array.isArray(index?.sameAs) ? index.sameAs : index?.sameAs ? [index.sameAs] : [];
  const hf = sameAs.map(String).find((u) => u.startsWith("https://huggingface.co/datasets/"));
  const hfRepo = hf ? hf.replace("https://huggingface.co/datasets/", "").replace(/\/+$/, "") : null;
  const conceptId = doi ? Number.parseInt(doi.split("zenodo.")[1] ?? "", 10) : null;
  return { doi, conceptId: Number.isFinite(conceptId) ? conceptId : null, hfRepo };
}

/** Every round file the index distributes, as {sequence, name, url}, ascending. */
export function roundFilesFrom(index) {
  const out = [];
  for (const d of index?.distribution ?? []) {
    const url = String(d?.contentUrl ?? "");
    const m = /\/corpus\/(\d+)\.json$/.exec(url);
    if (m) out.push({ sequence: Number(m[1]), name: `${m[1]}.json`, url });
  }
  return out.sort((a, b) => a.sequence - b.sequence);
}

/**
 * The files a mirror is missing, given what it holds. The index and
 * the tiers file are always re-sent (they change every round); a
 * round file is sent only if the mirror lacks it, because a signed
 * round never changes after it is signed.
 */
export function plan(index, mirrorFiles) {
  const have = new Set((mirrorFiles ?? []).map(String));
  const rounds = roundFilesFrom(index);
  const missingRounds = rounds.filter((r) => !have.has(r.name));
  const latest = rounds.at(-1) ?? null;
  return {
    latest,
    missingRounds,
    always: ["corpus.json", "tiers.json"],
    nothingNew: missingRounds.length === 0,
  };
}

/** The week label of the latest round, from the index's own entries or the round file. */
export function weekOf(roundDoc) {
  return roundDoc?.snapshot?.week ?? null;
}

/**
 * Zenodo's new-version metadata: the previous version's metadata with
 * the version string and the publication date moved. Everything else
 * (title, creators, licence, description, related identifiers) is
 * kept exactly, so the record's identity never drifts by upload.
 */
export function zenodoMetadataFor(previous, week, isoDate) {
  const metadata = { ...(previous ?? {}) };
  metadata.version = week ?? metadata.version;
  metadata.publication_date = isoDate;
  return metadata;
}

/**
 * The NDJSON body of a Hugging Face commit: a header line, then one
 * line per file. Small files travel inline as base64; files the Hub's
 * preupload step marked as LFS travel as their sha256 and size, after
 * the bytes went to the LFS store.
 */
export function hfCommitBody(summary, files) {
  const lines = [{ key: "header", value: { summary } }];
  for (const f of files) {
    if (f.mode === "lfs") {
      lines.push({ key: "lfsFile", value: { path: f.path, algo: "sha256", oid: f.sha256, size: f.size } });
    } else {
      lines.push({ key: "file", value: { path: f.path, content: f.base64, encoding: "base64" } });
    }
  }
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}

/** The commit message for a round, the same on both mirrors. */
export function commitSummary(week, sequence) {
  return `Round ${sequence} (${week}): one signed weekly observation appended; index and tiers refreshed`;
}
