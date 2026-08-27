#!/usr/bin/env node
/**
 * PUBLISH THE CLAWHUB SKILL, WITH THE THREE MISTAKES ALREADY MADE
 * BUILT IN AS REFUSALS.
 *
 * The command once lived in docs/archive/REPUBLISH.md as a block to copy, and every
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
 * AND THREE MORE, FOUND IN ONE RUN ON 2026-08-10, all the same shape:
 * this file telling the keeper something that used to be true.
 *
 *   4. A freshness suite that CRASHED was reported as a bundle that
 *      did not match, sending him to edit a file that was fine.
 *   5. "Look for ✔ OK. Published" named a line the CLI no longer
 *      prints, on the screen where the only question is whether it
 *      worked.
 *   6. The final `git push` is rejected by `main`'s required status
 *      check, so the step that exists because a step got skipped was
 *      itself impossible to follow.
 *
 * The lesson is the one already written above about --source-commit:
 * a value copied out of a document is a value that goes stale, and
 * prose is a document. What can be derived is derived now.
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
import { readSuiteOutcome } from "./lib/suite-verdict.mjs";

const BUNDLE = "registry/clawhub/SKILL.md";
const RECORD = "registry/clawhub/published.json";
const BUNDLE_DIR = "registry/clawhub";
const SLUG = "scvd-general-store";
/** THE NAMING LAW, tier 2: the display name, and never the full one. */
const DISPLAY_NAME = "SCVD General Store";
const REPO = "seancrecord/scvd-general-store-repo";
/**
 * THE BRANCH NOBODY CAN PUSH TO, named here because the last line this
 * script prints is a git command and that command has to be one the
 * repository will accept. `main` carries a required `check` status
 * (the job in .github/workflows/ci.yml); a direct push is rejected
 * with GH013 no matter how small the change.
 */
const PROTECTED_BRANCH = "main";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * VARIADIC BECAUSE IT ALREADY WAS, IN EVERY WAY BUT THE SIGNATURE.
 *
 * Found 2026-08-10. The fifth refusal below calls this with FIVE
 * arguments and the parameter list took two, so three of its lines
 * were dropped on the floor — silently, since a JavaScript function
 * ignores extra arguments without complaint. The refusal that stops a
 * version bump over unchanged bytes was printing its first sentence
 * and eating the part that says what to do instead.
 *
 * Continuation lines align under the arrow rather than repeating it:
 * one refusal, one pointer, however many lines it takes to say.
 */
function die(message, ...fix) {
  console.error(`\nRefusing to publish: ${message}`);
  fix.forEach((line, index) => {
    console.error(`  ${index === 0 ? "→" : " "} ${line}`);
  });
  process.exit(1);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
/**
 * CI MODE (P10 hardening, 2026-08-27). actions/checkout leaves the
 * runner on a DETACHED HEAD, where `@{u}` has no meaning — so the
 * unpushed-HEAD refusal below, run verbatim in CI, would refuse every
 * workflow publish for the wrong reason. The check's PURPOSE is that
 * --source-commit names a commit somebody else can fetch; in CI that
 * is true by construction (the workflow checked the commit out FROM
 * the remote), so the honest translation is not to delete the check
 * but to replace it with its CI equivalent: the workflow passes the
 * commit it dispatched on (--source-commit=<sha>) and this script
 * refuses unless the working tree IS that commit. The dirty-tree
 * refusal runs unchanged in both modes.
 */
const ciSourceCommit = argv
  .find((arg) => arg.startsWith("--source-commit="))
  ?.slice("--source-commit=".length);
const ciMode = Boolean(ciSourceCommit);
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
if (ciMode) {
  // The CI translation of the upstream check — see the note at the
  // flag parse. A workflow that checked out anything other than the
  // commit it claims to publish is refused, same spirit, same teeth.
  if (ciSourceCommit !== head) {
    die(
      `the checkout (${head.slice(0, 12)}) is not the commit the workflow dispatched on (${ciSourceCommit.slice(0, 12)})`,
      "--source-commit must equal HEAD in CI; something moved between dispatch and checkout.",
    );
  }
} else {
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

/**
 * THE BUNDLE CHECK IS TWO OUTCOMES WEARING ONE MESSAGE, AND THE WRONG
 * ONE SENDS YOU TO EDIT A FILE THAT IS FINE.
 *
 * The bundle is a static file and the shelf is code; nothing ties them
 * together except this suite, so it runs before the bytes leave. Until
 * 2026-08-10 any non-zero exit from vitest was reported as "the bundle
 * does not match the shelf" — which is true when the suite RAN and
 * disagreed, and a fabrication when it never started.
 *
 * The live case: a stale node_modules missing @x402/svm, so the suite
 * failed to import src/lib/payments.ts, collected nothing, and ran no
 * assertions at all. The keeper was told to fix registry/clawhub/
 * SKILL.md. Nothing was wrong with SKILL.md. A guard that names the
 * wrong file is worse than one that says "I could not tell," because
 * the first sends somebody to change something that was correct.
 *
 * SO THE OUTPUT IS READ RATHER THAN JUST THE EXIT CODE, and what it
 * is read for lives in scripts/lib/suite-verdict.mjs — testable, and
 * written up there rather than in two places that can disagree.
 *
 * The cost is that the run is captured and echoed instead of streamed,
 * so it appears at once rather than live. It takes about a second.
 */
console.log("Checking the bundle against the shelf…");
const suite = (() => {
  try {
    return {
      ok: true,
      output: execFileSync(
        "npx",
        ["vitest", "run", "test/skill-bundle-freshness.spec.ts"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
})();
process.stdout.write(suite.output);
if (!suite.ok) {
  const { reachedAVerdict, missingPackage } = readSuiteOutcome(suite.output);
  if (!reachedAVerdict) {
    die(
      "the freshness suite could not run, so the bundle was never checked",
      missingPackage
        ? "Something it imports is not installed. Run: npm ci"
        : "It exited without reporting a single test — read the error above.",
      `This is NOT a finding about ${BUNDLE}. That file has not been`,
      `examined either way. Fix the run, then publish.`,
    );
  }
  die(
    "the bundle does not match the shelf",
    `Fix ${BUNDLE}, then run this again.`,
  );
}

/**
 * PINNABLE CLI, added 2026-08-04: clawhub shipped 0.23.2 and 0.23.3
 * within an hour that morning and @latest began failing every upload
 * with "Uploaded file does not match its skill upload ticket" — their
 * ticket validation rejecting their own fresh CLI's uploads. The
 * bundle was fine; the instrument was mid-deploy. When @latest is
 * churning, pin the last version that worked:
 *
 *   CLAWHUB_VERSION=0.23.1 npm run skill:publish -- 2.9.0 "..."
 */
const cliVersion = process.env.CLAWHUB_VERSION ?? "latest";
const args = [
  `clawhub@${cliVersion}`,
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
  /**
   * DESCRIBE THE SIGNAL, DO NOT QUOTE IT. This paragraph told the
   * keeper to look for `✔ OK. Published` — a string the CLI had
   * stopped printing by 2026-08-10, when a real publish came back
   * "✔ Update submitted … pending security scans before it becomes
   * public." The instruction named something that no longer appears,
   * on the one screen where the whole question is "did that work?"
   *
   * A quoted string from somebody else's tool is a hardcoded copy of a
   * value we do not own, which is the same defect this script exists
   * to prevent — it just happened to be in prose rather than in an
   * argument. So: the shape of the signal, and what SUBMITTED means,
   * neither of which moves when they reword a line.
   */
  console.log(
    `\nThe CLI's ✔ line above is the authoritative signal, in whatever\n` +
      `words it uses today. Read it rather than this script.\n\n` +
      `SUBMITTED IS NOT YET PUBLIC. A new version goes through their\n` +
      `moderation and security scan before the \`latest\` tag moves, so\n` +
      `\`npx clawhub@latest skill inspect ${SLUG}\` can keep showing the\n` +
      `previous version for several minutes with nothing wrong.\n` +
      `Publish once, read the line, walk away.\n\n` +
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
  /**
   * THE LAST STEP HAS TO BE A STEP THAT WORKS.
   *
   * It said `git push`, flat, and on 2026-08-10 that was rejected:
   * GH013, `main` requires the `check` status and a direct push
   * produces none. So the instruction that exists BECAUSE the previous
   * instruction got skipped was itself impossible to follow — and it
   * fails at the end of a publish, which is exactly when somebody
   * shrugs and leaves the record uncommitted. That is the failure this
   * paragraph was written to prevent, arrived at by a new road.
   *
   * The commands are now derived from the branch you are actually on:
   * off `main`, commit and push where you stand; on `main`, carry the
   * record out on a branch, because that is the only way it lands.
   */
  if (ciMode) {
    // The workflow that called this owns the next step: it commits
    // the record to a branch and opens the PR. Saying so here keeps
    // the run log honest about who does what.
    console.log(
      `CI mode: the workflow now opens a pull request carrying ${RECORD}.\n` +
        `The publish is not complete until that PR merges — a stale record\n` +
        `silently disarms the bundle-unchanged refusal for the NEXT publish.\n`,
    );
    process.exit(0);
  }
  const recordBranch = `record-${version}`;
  const steps =
    branch === PROTECTED_BRANCH
      ? [
          `git switch -c ${recordBranch}`,
          `git add ${RECORD}`,
          `git commit -m "Record ${SLUG} ${version} as published"`,
          `git push -u origin ${recordBranch}`,
        ]
      : [
          `git add ${RECORD}`,
          `git commit -m "Record ${SLUG} ${version} as published"`,
          `git push -u origin ${branch}`,
        ];
  console.log(
    `ONE STEP LEFT, and it is the one that got skipped last time:\n\n` +
      `${steps.map((step) => `  ${step}`).join(" && \\\n")}\n\n` +
      (branch === PROTECTED_BRANCH
        ? `Then open the pull request. \`${PROTECTED_BRANCH}\` requires the\n` +
          `\`check\` status, which a direct push cannot produce; CI runs on\n` +
          `the push above, so it is green by the time you get there.\n\n`
        : "") +
      `Uncommitted, this record is worse than absent — the refusal that\n` +
      `catches a version bump over unchanged bytes reads its hash, so a\n` +
      `stale copy does not fail loudly, it just stops catching things.\n`,
  );
}
