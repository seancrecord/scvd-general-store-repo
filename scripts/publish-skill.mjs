#!/usr/bin/env node
/**
 * PUBLISH THE CLAWHUB SKILL, WITH THE THREE MISTAKES ALREADY MADE
 * BUILT IN AS REFUSALS.
 *
 * The command has lived in REPUBLISH.md as a block to copy, and every
 * gotcha in that file is a thing a copied block cannot check:
 *
 *   1. --source-commit was pasted from a document written days
 *      earlier, so a publish could claim a hash that did not contain
 *      the file being published. Stamped from HEAD here.
 *   2. `clawhub skill publish` reads the LOCAL directory. A publish
 *      from a stale or dirty checkout ships the wrong bytes under a
 *      fresh version number, which is worse than not publishing,
 *      because the changelog then claims a fix that did not ship.
 *      Refused here on a dirty tree or an unpushed HEAD.
 *   3. The bundle is hand-maintained and drifts from the shelf. The
 *      freshness suite runs before anything leaves.
 *
 * RULE 30 IS INTACT. This publishes only when a human runs it, exactly
 * like the Actions button. It adds no trigger, no schedule and no
 * hook — it is the same hand, holding a shorter command.
 *
 *   npm run skill:publish -- 2.5.0 "what changed since the last one"
 *   npm run skill:publish -- 2.5.0 "..." --dry-run
 */
import { execFileSync } from "node:child_process";

const BUNDLE = "registry/clawhub/SKILL.md";
const BUNDLE_DIR = "registry/clawhub";
const SLUG = "scvd-general-store";
/** THE NAMING LAW, tier 2: the display name, and never the full one. */
const DISPLAY_NAME = "SCVD General Store";
const REPO = "seancrecord/scvd-general-store-repo";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function die(message, fix) {
  console.error(`\nRefusing to publish: ${message}`);
  if (fix) {
    console.error(`  → ${fix}`);
  }
  process.exit(1);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const [version, changelog] = argv.filter((arg) => !arg.startsWith("--"));

if (!version || !changelog) {
  console.error(
    `\nUsage: npm run skill:publish -- <version> "<changelog>" [--dry-run]\n\n` +
      `Both are required and neither has a default, deliberately: a\n` +
      `default version publishes over the wrong number and a default\n` +
      `changelog describes somebody else's release.\n`,
  );
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  die(`"${version}" is not a version`, "Use MAJOR.MINOR.PATCH, e.g. 2.5.0.");
}

/**
 * A DIRTY TREE MEANS THE PUBLISHED BYTES ARE NOT THE STAMPED COMMIT.
 * The CLI reads the working directory; --source-commit names HEAD. If
 * those disagree, the skill ships pointing at a commit that does not
 * contain it — a claim nobody can check, from the store that sells
 * claims people can check.
 */
if (git("status", "--porcelain")) {
  die(
    "the working tree has uncommitted changes",
    "Commit or stash first — the publish reads these files and stamps HEAD.",
  );
}

const head = git("rev-parse", "HEAD");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
try {
  const upstream = git("rev-parse", "@{u}");
  if (upstream !== head) {
    die(
      `${branch} is not level with its remote`,
      "Push first, so --source-commit names a commit somebody else can fetch.",
    );
  }
} catch {
  die(
    `${branch} has no upstream`,
    `Run: git push -u origin ${branch}`,
  );
}

// The bundle is a static file and the shelf is code; nothing ties them
// together except this suite, so it runs before the bytes leave.
console.log("Checking the bundle against the shelf…");
try {
  execFileSync(
    "npx",
    ["vitest", "run", "test/skill-bundle-freshness.spec.ts"],
    { stdio: "inherit" },
  );
} catch {
  die(
    "the bundle does not match the shelf",
    `Fix ${BUNDLE}, then run this again.`,
  );
}

const args = [
  "clawhub@latest",
  "skill",
  "publish",
  BUNDLE_DIR,
  "--slug",
  SLUG,
  "--name",
  DISPLAY_NAME,
  "--version",
  version,
  "--changelog",
  changelog,
  "--source-repo",
  REPO,
  "--source-commit",
  head,
  "--source-path",
  BUNDLE_DIR,
  ...(dryRun ? ["--dry-run"] : []),
];

console.log(`\n${dryRun ? "Dry run" : "Publishing"} ${SLUG} ${version}`);
console.log(`  commit   ${head}`);
console.log(`  bundle   ${BUNDLE}\n`);

try {
  execFileSync("npx", args, { stdio: "inherit" });
} catch {
  /**
   * TWO FAILURES THAT ARE NOT FAILURES, both learned the slow way on
   * 2026-07-29, when three version numbers were burned in an afternoon
   * by re-running a publish that had already worked.
   */
  console.error(
    `\nIf that said the version already exists, THE PREVIOUS ATTEMPT MAY\n` +
      `HAVE WORKED. The CLI errors on a version collision, so a run that\n` +
      `succeeded and was retried reads as two failures in a row.\n` +
      `Run \`npx clawhub@latest skill inspect ${SLUG}\` before assuming\n` +
      `nothing landed, and take the next unused number rather than this one.\n`,
  );
  process.exit(1);
}

if (!dryRun) {
  console.log(
    `\nThe "✔ OK. Published" line above is the authoritative signal.\n` +
      `\`latest\` lags it — a new version goes through a moderation scan\n` +
      `before the tag moves, so inspect can show the previous version for\n` +
      `several minutes. Publish once, read the line, walk away.\n\n` +
      `Then add the row to REPUBLISH.md: ${version}, today, "${changelog}".\n`,
  );
}
