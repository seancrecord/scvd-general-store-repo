/**
 * THE CITATION FRESHNESS CHECK — does the document we cited still say
 * what it said when we read it?
 *
 * WHY THIS EXISTS, IN TWO DEFECTS OF OUR OWN.
 *
 * On 2026-09-14 the protocol screen's first run found two faults in
 * this store's own shipped instruments, and they were the same fault
 * wearing different clothes:
 *
 *   - `preflight.ts` scored every x402 scheme but `exact` as vendor
 *     drift. That was true on 2026-08-03 and false by late August,
 *     because `specs/schemes/` kept moving — `auth-capture` to v1.1,
 *     `batch-settlement` an SVM specification, `upto` new payment
 *     flows. Six weeks of a free public instrument accusing doors of
 *     drift for implementing the specification.
 *   - Eleven defect classes cited `draft-httpauth-payment-00`. On
 *     2026-09-09 the IETF Datatracker expired that draft and it was
 *     renewed as `-01`. The path we cited stopped existing.
 *
 * Neither was found by a check. Both were found because somebody
 * happened to be looking. That is the thing worth fixing: **a claim of
 * ours about somebody else's document can go stale silently, and
 * nothing watches it.**
 *
 * WHAT A PIN IS. A claim, the file or directory it rests on, and the
 * git tree as it stood when a human read it. The digest is taken over
 * `git ls-tree -r`'s own blob hashes rather than file contents, which
 * has two properties we want: it costs no blob fetch (the screen's
 * clones are `--filter=blob:none`), and it moves when a file changes,
 * when one is added, and when one is deleted. All three are drift.
 *
 * WHAT THIS CHECK CANNOT DO, said plainly:
 *
 *   - **It reports that a document moved, never what the change means.**
 *     A typo fix and a reversed MUST produce the same verdict. The
 *     check hands a human a diff to read; it does not read it.
 *   - **A clean run is not a correct citation.** It proves the source
 *     is unchanged since the pinned read, not that our reading of it
 *     was right. The August scheme advisory would have passed every
 *     freshness check ever written, because the mistake was in the
 *     reading, not in the source.
 *   - **Re-pinning is a human act.** `--update` rewrites the lock, and
 *     running it without reading the diff converts a real signal into
 *     a rubber stamp. That is the one way to make this instrument
 *     worse than nothing.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PINS. Each names a claim this repository makes, the place the
 * claim is written down, and the upstream tree it rests on.
 *
 * A pin is only worth adding where a human actually read the source
 * and wrote something down because of it. Pinning a path nobody cited
 * produces noise with no reader, and noise with no reader is how a
 * weekly check dies.
 */
export const PINS = [
  {
    id: "x402-scheme-families",
    claim: "SPEC_SCHEMES lists exactly the scheme families the x402 specification publishes",
    cited_in: "src/services/preflight.ts",
    source: "x402",
    paths: ["specs/schemes/"],
    read_date: "2026-09-14",
    /*
     * The pin that would have caught P1. Not by the directory listing
     * — all four families already existed in August — but by content:
     * the family specs were edited continuously through the window
     * while our advisory sat still.
     */
    on_drift: "Re-read specs/schemes/ and reconcile SPEC_SCHEMES and the nonstandard-scheme advisory. A new family means the advisory is accusing doors that implement it.",
  },
  {
    id: "x402-core-v2",
    claim: "The preflight battery reads the x402 v2 wire: challenge shape, discovery fields, accepts entries",
    cited_in: "src/services/preflight.ts",
    source: "x402",
    paths: ["specs/x402-specification-v2.md"],
    read_date: "2026-09-14",
    on_drift: "Re-read the v2 core. §8 discovery was corrected to match the wire on 2026-08-31 (#3067) and the battery has not been reconciled against that correction.",
  },
  {
    id: "x402-extensions",
    claim: "The extensions the specification publishes, against which our coverage is measured",
    cited_in: "docs/X402_EXTENSION_COVERAGE.md",
    source: "x402",
    paths: ["specs/extensions/"],
    read_date: "2026-09-14",
    on_drift: "A new or changed extension. Re-generate the coverage matrix; five of seven already have no reader here.",
  },
  {
    /**
     * The catalog this store serves is generated from MENU_ITEMS and
     * validated against these schemas in CI, so a backport that
     * changes product, variant, price, availability or the response
     * envelope changes what /ucp/v1 is allowed to emit.
     */
    id: "ucp-shopping-schemas",
    claim: "The UCP catalog projection emits products, variants, prices and response envelopes shaped by the 2026-08-25 shopping schemas",
    cited_in: "src/lib/ucp/catalog.ts, test/ucp/conformance.spec.ts",
    source: "ucp",
    paths: ["source/schemas/shopping/", "source/schemas/common/", "source/schemas/ucp.json"],
    read_date: "2026-09-16",
    on_drift: "A backport landed on the snapshot this store advertises. Re-read the changed schemas and re-run test/ucp/conformance.spec.ts before touching the profile — the catalog is validated against the vendored copies, so a drift here means the vendored copies are stale.",
  },
  {
    /**
     * The REST transport contract: which operations exist, at which
     * paths, with which methods. Reading it is what established that
     * catalog search and lookup are POST rather than GET.
     */
    id: "ucp-shopping-rest",
    claim: "The store serves UCP Shopping over REST at the operations and paths the 2026-08-25 transport contract defines",
    cited_in: "src/routes/ucp.ts",
    source: "ucp",
    paths: ["source/services/shopping/rest.openapi.json"],
    read_date: "2026-09-16",
    on_drift: "The transport moved. Check method, path and body shape for every operation this store implements, and for checkout-sessions and orders before implementing them.",
  },
  {
    id: "mpp-core-draft",
    claim: "Eleven MPP defect classes are sourced to the core draft's MUSTs",
    cited_in: "src/store/defect-vocabulary.ts",
    source: "mpp",
    paths: ["specs/core/"],
    read_date: "2026-09-14",
    /*
     * The pin that would have caught P2, and caught it as `missing`
     * rather than `drifted`: on 2026-09-09 the file we cited ceased to
     * exist at the path we cited it by.
     */
    on_drift: "Re-read the core draft and re-cite the eleven classes with a fresh read date. A missing path means the draft was renumbered — check whether the renewal was substantive before assuming it was not.",
  },
  {
    id: "mpp-intents",
    claim: "The intent families the MPP battery's check list recognises",
    cited_in: "src/services/mpp-battery.ts",
    source: "mpp",
    paths: ["specs/intents/"],
    read_date: "2026-09-14",
    on_drift: "A new intent family (subscriptions arrived 2026-07-29) changes what mpp-intent-unregistered should accept.",
  },
  {
    id: "mpp-methods",
    claim: "The method drafts named in every MPP class's sourced_by line",
    cited_in: "src/store/defect-vocabulary.ts",
    source: "mpp",
    paths: ["specs/methods/"],
    read_date: "2026-09-14",
    on_drift: "Methods are added often (XRPL 2026-09-08, Hedera 2026-08-07). New methods do not invalidate the classes, but the sourced_by line's read date should not claim more than it read.",
  },
];

/* ------------------------------------------------------------------ */

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1", GIT_TERMINAL_PROMPT: "0" },
  });
}

/**
 * A depth-1, blobless, checkout-less clone: we want the tree as it
 * stands, not history. Cheaper than the screen's dated window.
 */
/**
 * `ref` added 2026-09-16 for UCP, the one source not read at main.
 *
 * Its release branches are frozen snapshots and the store implements
 * one of them; `--branch` makes HEAD in the clone that snapshot, so
 * treeLines below reads the tree we actually serve against without
 * knowing anything about refs. Omitted for every other source, which
 * keeps reading its default branch exactly as before.
 */
export function cloneAtHead(url, dir, ref) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git([
    "clone",
    "--filter=blob:none",
    "--no-checkout",
    "--depth",
    "1",
    ...(ref ? ["--branch", ref] : []),
    url,
    dir,
  ], "/");
  return dir;
}

/**
 * `git ls-tree -r HEAD -- <paths>` → sorted "<blobsha> <path>" lines.
 * Blob hashes, not blob contents: a blobless clone has the former and
 * not the latter, and the former is what identity requires anyway.
 */
export function treeLines(dir, paths, run = git) {
  const raw = run(["ls-tree", "-r", "HEAD", "--", ...paths], dir);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t");
      const sha = meta.split(/\s+/)[2];
      return `${sha} ${path}`;
    })
    .sort();
}

export function digestOf(lines) {
  const h = createHash("sha256");
  for (const line of lines) h.update(`${line}\n`);
  return `sha256:${h.digest("hex")}`;
}

/**
 * Compare one pin against the tree. Four verdicts, and `missing` is
 * the one that earns this instrument its keep: the path we cite is
 * gone, which is exactly how the MPP draft renumbering presented.
 */
export function checkPin(pin, lines, locked) {
  if (lines.length === 0) {
    return {
      id: pin.id,
      state: "missing",
      detail: `no file matches ${pin.paths.join(", ")} in ${pin.source} — the path this claim cites no longer exists`,
      files: 0,
    };
  }
  const digest = digestOf(lines);
  if (!locked) {
    return { id: pin.id, state: "unpinned", digest, files: lines.length, detail: "no locked digest — run with --update once a human has read the source" };
  }
  if (locked.digest === digest) {
    return { id: pin.id, state: "ok", digest, files: lines.length, detail: `unchanged since ${locked.read_date}` };
  }
  const before = new Set(locked.lines ?? []);
  const after = new Set(lines);
  const added = lines.filter((l) => !before.has(l)).map((l) => l.split(" ")[1]);
  const removed = (locked.lines ?? []).filter((l) => !after.has(l)).map((l) => l.split(" ")[1]);
  const changed = added.filter((p) => removed.includes(p));
  return {
    id: pin.id,
    state: "drifted",
    digest,
    files: lines.length,
    added: added.filter((p) => !changed.includes(p)),
    removed: removed.filter((p) => !changed.includes(p)),
    changed,
    detail: `moved since ${locked.read_date}`,
  };
}

export function lockEntry(pin, lines) {
  return { digest: digestOf(lines), read_date: pin.read_date, files: lines.length, lines };
}

/**
 * WHICH LOCK ENTRIES A RE-PIN IS ALLOWED TO TOUCH (2026-09-16).
 *
 * `--update` used to rewrite every pin in the file. That is a quiet
 * incentive problem, and it bit the first time somebody had genuinely
 * re-read one source: two freshly reviewed UCP pins could only be
 * locked by also stamping an unread x402 drift as read. The header of
 * scripts/spec-pins.mjs says running this to clear a red check without
 * reading anything is the one use that makes the instrument worse than
 * not having it — and the tool was making that the only available use.
 *
 * So a re-pin now names what it attests to. `selected` is the set of
 * pin ids a human said they re-read; everything else is copied out of
 * the old lock BYTE FOR BYTE, and a pin that was never locked stays
 * unlocked rather than being written unread.
 *
 * `selected === null` is the blunt form (`--update` with no ids) and
 * still means all of them. It is kept because it is the honest thing
 * to run after actually reading everything, and the runner prints the
 * full list it is attesting to before it writes.
 *
 * @param {object} args
 * @param {Array<{id: string}>} args.pins        every pin, in file order
 * @param {Record<string, object>} args.locked    the lock's current pins
 * @param {Map<string, object>} args.fresh        pin id -> newly computed entry
 * @param {Set<string>|null} args.selected        ids being re-pinned, or null for all
 * @param {string} args.today                     read date stamped on re-pinned entries
 */
export function nextLock({ pins, locked, fresh, selected, today }) {
  const next = {};
  for (const pin of pins) {
    const entry = fresh.get(pin.id);
    const prior = locked[pin.id];
    const chosen = selected === null || selected.has(pin.id);
    if (chosen && entry) {
      next[pin.id] = { ...entry, read_date: today };
      continue;
    }
    // Unselected: whatever the lock already said, unchanged. A pin with
    // nothing in the lock stays out of it, so it goes on reporting
    // UNPINNED until somebody reads it and says so.
    if (prior) next[pin.id] = prior;
  }
  return next;
}

/** Exit code: 0 all clear, 1 anything drifted, missing or unpinned. */
export function summarise(results) {
  const by = (state) => results.filter((r) => r.state === state);
  return {
    ok: by("ok").length,
    drifted: by("drifted"),
    missing: by("missing"),
    unpinned: by("unpinned"),
    clean: by("drifted").length === 0 && by("missing").length === 0 && by("unpinned").length === 0,
  };
}

export function renderReport(results, pins = PINS) {
  const s = summarise(results);
  const byId = new Map(pins.map((p) => [p.id, p]));
  const out = [];
  out.push(`# SPEC PIN CHECK — ${new Date().toISOString().slice(0, 10)}`);
  out.push("");
  out.push(`${results.length} pins: ${s.ok} unchanged, ${s.drifted.length} drifted, ${s.missing.length} missing, ${s.unpinned.length} unpinned.`);
  out.push("");
  for (const state of ["missing", "drifted", "unpinned"]) {
    const rows = results.filter((r) => r.state === state);
    if (!rows.length) continue;
    out.push(`## ${state.toUpperCase()}`);
    out.push("");
    for (const r of rows) {
      const pin = byId.get(r.id);
      out.push(`### ${r.id} — ${r.detail}`);
      out.push("");
      out.push(`- **Claim:** ${pin?.claim ?? "(unknown pin)"}`);
      out.push(`- **Written down in:** \`${pin?.cited_in}\``);
      out.push(`- **Source:** ${pin?.source} \`${pin?.paths.join(", ")}\``);
      if (r.changed?.length) out.push(`- **Changed:** ${r.changed.map((p) => `\`${p}\``).join(", ")}`);
      if (r.added?.length) out.push(`- **Added:** ${r.added.map((p) => `\`${p}\``).join(", ")}`);
      if (r.removed?.length) out.push(`- **Removed:** ${r.removed.map((p) => `\`${p}\``).join(", ")}`);
      if (pin?.on_drift) out.push(`- **What to do:** ${pin.on_drift}`);
      out.push("");
    }
  }
  if (s.clean) {
    out.push("Every pinned source is byte-identical to the tree its claim was read from.");
    out.push("");
  }
  out.push("## What a clean run does not prove");
  out.push("");
  out.push("- That our *reading* was right. This compares the source to itself at two dates; it never checks the claim against the source. The 2026-08-03 scheme advisory would have passed every freshness check ever written.");
  out.push("- That a drift matters. A typo fix and a reversed MUST move the digest identically. The diff is for a human.");
  out.push("- That re-pinning happened honestly. `--update` is a human saying they re-read it; run unread, it converts this signal into a rubber stamp.");
  out.push("");
  return out.join("\n");
}
