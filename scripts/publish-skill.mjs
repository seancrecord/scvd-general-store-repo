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
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const BUNDLE = "registry/clawhub/SKILL.md";
const RECORD = "registry/clawhub/published.json";
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
  die(`"${version}" is not a version`, "Use MAJOR.MINOR.PATCH, e.g. 2.6.0.");
}

/**
 * THE FOURTH REFUSAL, ADDED 2026-07-31. The served skill.md declared
 * `version: 2.2.0` in its frontmatter while the published bundle had
 * moved on to 2.5.x — three releases of drift on a machine-read
 * document, because the number lived in a template literal and this
 * script took its version from the command line, and nothing ever
 * compared them.
 *
 * So the constant is the source and this is what remembers. Publishing
 * a number the store does not itself declare is refused rather than
 * warned about: a bundle whose frontmatter disagrees with its release
 * is a bundle that lies to whoever installs it, and warnings during a
 * publish are read after the publish.
 */
const declared = readFileSync("src/store/spec.ts", "utf8").match(
  /SKILL_VERSION = "([^"]+)"/,
);
if (!declared) {
  die(
    "SKILL_VERSION is not declared in src/store/spec.ts",
    "The served skill.md takes its frontmatter version from that constant. Without it there is nothing to check this publish against.",
  );
}
if (declared[1] !== version) {
  die(
    `The store declares ${declared[1]}; you asked to publish ${version}`,
    `Bump SKILL_VERSION in src/store/spec.ts to ${version} and deploy, or publish ${declared[1]}.\n` +
      `The served skill.md frontmatter would otherwise announce a different\n` +
      `version than the bundle somebody just installed.`,
  );
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

/**
 * THE FIFTH REFUSAL: THE BUNDLE HAS NOT CHANGED SINCE THE LAST PUBLISH.
 *
 * Added 2026-08-02, after an evening spent working out by hand that a
 * requested 2.7.0 would have shipped bytes identical to 2.6.0 under a
 * changelog naming four features none of which were in the file. The
 * script's own header already called that the worst outcome — "the
 * changelog then claims a fix that did not ship" — and had no check
 * for it. The version guard above compares a number to a number and
 * cannot see this.
 *
 * A NEW VERSION NUMBER IS A CLAIM THAT SOMETHING CHANGED. If nothing
 * did, the honest act is not to publish.
 */
let previous = null;
try {
  previous = JSON.parse(readFileSync(RECORD, "utf8"));
} catch {
  // No record yet: the check cannot run, and says so rather than
  // passing silently. An absent record is not a clean bill of health.
  console.log(
    `No ${RECORD} yet, so "has the bundle changed?" cannot be answered.\n` +
      `This publish will write one; the next will be checked.`,
  );
}
const bundleHash = createHash("sha256")
  .update(readFileSync(BUNDLE))
  .digest("hex");
if (previous && previous.bundle_sha256 === bundleHash) {
  die(
    `the bundle is byte-identical to what ${previous.version} published`,
    `Publishing ${version} would ship the same file under a new number,`,
    `with a changelog claiming a change nobody can find in it.`,
    `Either edit ${BUNDLE} first, or do not publish — an unchanged`,
    `bundle is not a release.`,
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
      `The record in ${RECORD} has been updated for you — no row to\n` +
      `remember to write, because the row somebody had to remember is\n` +
      `exactly the one that went stale and produced wrong advice about\n` +
      `what to publish next.\n`,
  );
  writeFileSync(
    RECORD,
    `${JSON.stringify(
      {
        version,
        bundle_sha256: bundleHash,
        published_at: new Date().toISOString(),
        commit: head,
        changelog,
      },
      null,
      2,
    )}\n`,
  );
  /**
   * THE SAME STALENESS, ONE STEP FURTHER DOWN — found 2026-08-02,
   * hours after this file was written to cure it the first time.
   *
   * The old ending said "Commit the record." The record was written,
   * the publish went out, and the commit did not happen — so
   * published.json in the repo still named 2.6.0 while 2.7.0 was live
   * on ClawHub. That is not cosmetic: the fifth refusal above reads
   * this file's hash to decide whether a bundle actually changed, so a
   * stale record DISARMS it. The guard would have compared the live
   * bundle against a superseded hash, found a difference that was only
   * the staleness, and waved through the exact publish it exists to
   * stop.
   *
   * Writing the file instead of asking for a row did not remove the
   * manual step; it moved it from "remember to write" to "remember to
   * commit." A step a human has to remember will eventually be
   * skipped, and the honest fix at this altitude is not to automate
   * the commit — rule 30, and a script that commits on your behalf is
   * worse than one that nags — but to make the remaining step a thing
   * you paste rather than a thing you compose.
   */
  console.log(
    `ONE STEP LEFT, and it is the one that got skipped last time:\n\n` +
      `  git add ${RECORD} && \\\n` +
      `    git commit -m "Record ${SLUG} ${version} as published" && \\\n` +
      `    git push\n\n` +
      `Uncommitted, this record is worse than absent — the refusal that\n` +
      `catches a version bump over unchanged bytes reads its hash, so a\n` +
      `stale copy does not fail loudly, it just stops catching things.\n`,
  );
}
