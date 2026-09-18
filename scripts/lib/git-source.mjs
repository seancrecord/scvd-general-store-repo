/**
 * LAYER 3 — reading our own rail from the commits themselves.
 *
 * The scout screen watches the standards NEXT DOOR and is structurally
 * blind to x402 and MPP, which is the layer this store trades on. This
 * module closes that hole from a better source than scout: not somebody
 * else's reading of a repository, but the repository.
 *
 * WHY GIT AND NOT THE GITHUB API. Three reasons, in order of weight:
 *  1. It is first-hand. A corpus that says "somebody's dashboard showed
 *     us" and a corpus that says "we read the commits" are different
 *     artifacts, and only one of them belongs under our signature.
 *  2. No API token, no rate limit, no per-session repository grant. A
 *     blobless shallow clone of a 90-day window is a few megabytes.
 *  3. It cannot go stale behind us the way an ingest pipeline can.
 *
 * WHAT GIT CANNOT TELL US, AND THIS IS THE IMPORTANT PART. Scout hands
 * us a `breaking` flag and a written impact line because a human wrote
 * them. Git hands us a subject line. None of the four repositories
 * below uses conventional-commit breaking markers — over the last 90
 * days x402 carried zero `feat!:` subjects and zero `BREAKING CHANGE`
 * trailers — so **a git-sourced row's `breaking: false` means "not
 * declared", never "not breaking"**. Every derived field here is
 * marked `derived: true` so no downstream artifact can quote it as the
 * maintainer's own word.
 *
 * What replaces it is the axis that actually matters at layer 3:
 * **did the commit touch the specification, or an SDK?** A change under
 * `specs/` is a change to the wire we implement and verify other
 * people's doors against. A change to the Go client is somebody else's
 * ergonomics. That is the promotion signal, and it is a fact about
 * paths, not a guess about intent.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * The four repositories that carry our own layer, and the paths in
 * each that are the specification rather than an implementation of it.
 *
 * `onlyPaths` exists for exactly one repository. `tempoxyz/tempo` is an
 * L1 node in Rust — 548 commits in 90 days of consensus, precompiles
 * and reth bumps, none of which we run or read. Its protocol surface is
 * `tips/` (Tempo Improvement Proposals, 57 commits over the same
 * window), and admitting the other 491 would drown the screen to look
 * thorough. Tempo is scoped to its TIPs and the scoping is declared.
 */
export const LAYER3 = [
  {
    key: "x402",
    name: "x402",
    fullName: "x402 Payment Protocol",
    maintainers: "x402 Foundation (Linux Foundation)",
    url: "https://github.com/x402-foundation/x402",
    layer: "3 our rail",
    launchDate: "2026-04-02",
    specPaths: ["specs/"],
    /**
     * `coinbase/x402` is NOT this repository. Its tip is 2026-04-21,
     * "chore: bump main to match foundation repo (#93)" — a mirror that
     * stopped tracking when the protocol moved to the foundation. Our
     * own docs still cite spec files by their coinbase/ path. Reading
     * the mirror would produce a screen that says our rail went quiet
     * in April, which is the most expensive wrong answer available.
     */
    supersedes: "coinbase/x402 (mirror, frozen at 2026-04-21)",
  },
  {
    key: "mpp",
    name: "MPP",
    fullName: "Merchant Payment Protocol / Payment HTTP Authentication",
    maintainers: "Stripe + Tempo (IETF track)",
    url: "https://github.com/tempoxyz/mpp-specs",
    layer: "3 second wire",
    launchDate: "2026-03-18",
    specPaths: ["specs/", "pages/"],
  },
  {
    /**
     * UCP, AND THE ONE SOURCE HERE THAT IS NOT READ AT `main`.
     *
     * UCP cuts long-lived `release/YYYY-MM-DD` branches and freezes
     * them: after the cut, only backports land, and a snapshot stays
     * available for reference and maintenance. The store implements
     * against `2026-08-25` and says so in its profile, so the tree
     * worth watching is that branch rather than the tip of main.
     *
     * A pin on main would be noise with no reader — main moves
     * continuously and none of it is what this store serves. A pin on
     * the release branch is quiet until the one event that matters:
     * a backport landing on the snapshot we implement against, which
     * is exactly the case where somebody here has to go and read.
     */
    key: "ucp",
    name: "UCP",
    fullName: "Universal Commerce Protocol",
    maintainers: "UCP Governance / Tech Council",
    url: "https://github.com/universal-commerce-protocol/ucp",
    ref: "release/2026-08-25",
    layer: "2 commerce",
    launchDate: "2026-01-11",
    specPaths: ["source/schemas/", "source/services/", "docs/specification/"],
    scopeNote:
      "read at release/2026-08-25, the frozen snapshot this store implements and advertises — not at main, which moves continuously and is not what anybody here serves",
  },
  {
    key: "tempo",
    name: "Tempo TIPs",
    fullName: "Tempo Improvement Proposals",
    maintainers: "Tempo",
    url: "https://github.com/tempoxyz/tempo",
    layer: "4 settlement",
    launchDate: "2026-03-18",
    specPaths: ["tips/"],
    onlyPaths: ["tips/"],
    scopeNote: "scoped to tips/ — the node's Rust internals are deliberately out of frame",
  },
];

const REC = "\x1e";
const FIELD = "\x1f";

function git(args, cwd, timeout = 600_000) {
  return execFileSync("git", args, {
    cwd,
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1", GIT_TERMINAL_PROMPT: "0" },
  });
}

/**
 * A blobless, checkout-less, date-bounded clone. Re-cloned rather than
 * fetched: these are a few megabytes each, and a fresh clone has no
 * shallow-boundary edge cases to be wrong about once a quarter.
 */
export function ensureClone(source, since, cacheDir) {
  const dir = join(cacheDir, source.key);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(cacheDir, { recursive: true });
  git([
    "clone",
    "--filter=blob:none",
    "--no-checkout",
    `--shallow-since=${since}`,
    source.url,
    dir,
  ], cacheDir);
  return dir;
}

/** Conventional-commit type → the semver level it implies. Derived. */
export function levelFromSubject(subject) {
  const m = /^([a-z]+)(\([^)]*\))?(!)?:/.exec(subject);
  if (m?.[3]) return { level: "major", declaredBreaking: true };
  if (/BREAKING[ -]CHANGE/.test(subject)) return { level: "major", declaredBreaking: true };
  if (m?.[1] === "feat") return { level: "minor", declaredBreaking: false };
  return { level: "patch", declaredBreaking: false };
}

export function prNumberFrom(subject) {
  const m = /\(#(\d+)\)\s*$/.exec(subject);
  return m ? Number(m[1]) : null;
}

export function touchesSpec(files, specPaths) {
  return files.some((f) => specPaths.some((p) => f.startsWith(p)));
}

/** Parse `git log --name-only` output in our record format. */
export function parseLog(raw, source) {
  const out = [];
  for (const chunk of raw.split(REC)) {
    if (!chunk.trim()) continue;
    const parts = chunk.split(FIELD);
    if (parts.length < 6) continue;
    const [sha, date, author, subject, body, tail] = parts;
    const files = tail.split("\n").map((f) => f.trim()).filter(Boolean);
    const { level, declaredBreaking } = levelFromSubject(subject);
    const breakingInBody = /BREAKING[ -]CHANGE/.test(body);
    const spec = touchesSpec(files, source.specPaths);
    const pr = prNumberFrom(subject);
    out.push({
      id: `${source.key}:${sha}`,
      date,
      title: subject.replace(/\s*\(#\d+\)\s*$/, ""),
      description: body.trim(),
      /*
       * `impact` is where scout puts a human's sentence. We will not
       * fabricate one. It states what the commit touched, which is a
       * fact, and leaves the reading to the reader.
       */
      impact: spec
        ? `Touches the specification (${files.filter((f) => source.specPaths.some((p) => f.startsWith(p))).slice(0, 4).join(", ")}${files.length > 4 ? ", …" : ""}).`
        : "Implementation or repository housekeeping; no specification path touched.",
      breaking: declaredBreaking || breakingInBody,
      level,
      derived: true,
      specChange: spec,
      author,
      files,
      prNumber: pr,
      prUrl: pr ? `${source.url}/pull/${pr}` : `${source.url}/commit/${sha}`,
    });
  }
  return out;
}

/**
 * TAGS, AND WHY THIS DOES NOT CLAIM TO KNOW WHAT SHIPPED.
 *
 * A commit is not a release. Implementers adopt tagged versions, so a
 * spec change that has merged and a spec change that has shipped are
 * different news — the screen read only the first until 2026-09-14.
 *
 * The honest limit, and it is a real one: these clones are shallow, so
 * `git tag --contains` cannot be trusted and ANCESTRY IS NOT COMPUTED.
 * A row is marked released only when a tag points AT IT — exactly, by
 * commit sha, or by MPP's `spec-artifacts-<sha>` naming, which names
 * its commit in the tag itself. Everything else is `unknown`, NEVER
 * "unreleased": most x402 spec commits ship inside the next SDK
 * release without any tag pointing at them, and reporting that as
 * "not shipped" would be an instrument inventing a finding.
 *
 * What the per-source figures below CAN say honestly: how many
 * releases happened in the window, and when the last one was. A source
 * whose spec kept moving after its last release has unreleased spec
 * changes, and that is readable without any ancestry at all.
 */
export function readTags(dir, since, run = git) {
  const raw = run([
    "for-each-ref",
    "--format=%(refname:short)|%(creatordate:short)|%(objectname)|%(*objectname)",
    "refs/tags",
  ], dir);
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [tag, date, objectName, derefName] = line.split("|");
      return { tag, date, commit: derefName || objectName };
    })
    .filter((t) => !since || t.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** MPP tags its immutable spec artifacts `spec-artifacts-<commit sha>`. */
const SPEC_ARTIFACT = /^spec-artifacts-([0-9a-f]{40})$/;

/**
 * A preview or pre-release is not the thing implementers adopt, and
 * MPP's `pr-356-spec-preview` presented itself as the latest release
 * on the first run that read tags. Counted, never crowned.
 */
export const PRERELEASE = /preview|snapshot|nightly|[-@._](rc|alpha|beta|pre)[-.0-9]*$/i;

export function latestRelease(tags) {
  return tags.find((t) => !PRERELEASE.test(t.tag)) ?? null;
}

export function releasesFor(sha, tags) {
  return tags
    .filter((t) => t.commit === sha || SPEC_ARTIFACT.exec(t.tag)?.[1] === sha)
    .map((t) => t.tag);
}

export function readSource(source, since, cacheDir) {
  const dir = ensureClone(source, since, cacheDir);
  const args = [
    "log",
    `--since=${since}`,
    "--no-merges",
    "--date=short",
    "--name-only",
    `--format=${REC}%H${FIELD}%ad${FIELD}%an${FIELD}%s${FIELD}%b${FIELD}`,
  ];
  if (source.onlyPaths) args.push("--", ...source.onlyPaths);
  const tags = readTags(dir, since);
  const updates = parseLog(git(args, dir), source).map((u) => {
    const sha = u.id.split(":")[1];
    const releasedIn = releasesFor(sha, tags);
    return { ...u, releasedIn, released: releasedIn.length > 0 ? true : "unknown" };
  });
  if (updates.length === 0) {
    /*
     * Same rule as the scout extractor: an empty read is never reported
     * as a quiet protocol. x402 merges tens of times a week; zero rows
     * means the clone, the window or the path filter is wrong.
     */
    throw new Error(`git-source: ${source.key} returned no commits since ${since} — the read is broken, not the protocol`);
  }
  return {
    tags,
    latestRelease: latestRelease(tags),
    releasesInWindow: tags.length,
    name: source.name,
    fullName: source.fullName,
    maintainers: source.maintainers,
    repo: source.url,
    launchDate: source.launchDate,
    source: "git",
    layer: source.layer,
    scopeNote: source.scopeNote ?? null,
    supersedes: source.supersedes ?? null,
    updates,
  };
}

/** The whole of layer 3 in the shape the screen already scores. */
export function readLayer3({ since, cacheDir, sources = LAYER3, read = readSource }) {
  const map = {};
  const failures = [];
  for (const s of sources) {
    try {
      map[s.name] = read(s, since, cacheDir);
    } catch (err) {
      /*
       * One unreachable repository must not take the other two down,
       * and must not pass silently either. It is named in the report's
       * "did not see" list, which is where an unread source belongs.
       */
      failures.push({ source: s.name, url: s.url, error: String(err.message ?? err) });
    }
  }
  return { map, failures };
}
