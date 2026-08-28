/**
 * THE OFFICIAL COMMAND LINE, AND ITS HONEST STATE.
 *
 * `cli/` in this repo is a zero-dependency Node script that wraps the
 * store's free instruments: preflight, the conformance desk, receipt
 * verification, the on-page desk, the fresh set, the corpus, the menu,
 * the RFC 9727 catalog and the version table. It holds no key and
 * cannot sign a payment, which is a constraint rather than a first
 * version — the store never asks anyone for credentials, and a CLI is
 * the easiest place in the world to break that quietly.
 *
 * PUBLISHED IS A FIELD, NOT A LINK. `npm publish` is the keeper's hand
 * (rule 30) and has not run. Every surface that names the CLI reads
 * these constants, so the day it does run there is ONE line to change
 * and no page left saying the wrong thing — and until then, no page
 * hands a reader an install command that fails or a registry link that
 * 404s. The steps are written down in DISTRIBUTION.md §4b.
 *
 * THE PACKAGE AND THE COMMAND ARE TWO NAMES (2026-08-28). The first
 * publish attempt hit npm's typosquat guard: 403, "too similar to
 * existing packages scss, save, send, jscpd" — the bare name `scvd`
 * is permanently unpublishable, for anyone. The keeper picked
 * scvd-cli over npm's suggested scope. npm polices only the package
 * name, so the installed command is still `scvd`, which is why
 * CLI_BIN exists as its own constant instead of being derived from
 * CLI_PACKAGE: the derivation was quietly claiming a `scvd-cli`
 * command and a cli/scvd-cli.mjs file, and neither exists.
 */
export const CLI_PACKAGE = "scvd-cli";

/** The installed command. NOT the package name; see above. */
export const CLI_BIN = "scvd";

/** Flip to true in the same commit as the publish, never before. */
export const CLI_PUBLISHED = false;

export const CLI_INSTALL = `npm i -g ${CLI_PACKAGE}`;

export const CLI_REGISTRY_URL = `https://www.npmjs.com/package/${CLI_PACKAGE}`;

/** The link that works today, and will keep working after the publish. */
export const CLI_SOURCE_URL =
  "https://github.com/seancrecord/scvd-general-store-repo/tree/main/cli";

/** How to run it with nothing installed. The file keeps the bin's name. */
export const CLI_RUN_FROM_SOURCE = `node cli/${CLI_BIN}.mjs preflight <url>`;

/** Every command, so no surface has to keep its own list. */
export const CLI_COMMANDS: readonly string[] = [
  "scvd preflight <url>",
  "scvd conformance <file|->",
  "scvd receipt <file|->",
  "scvd verify <id>",
  "scvd onpage <url>",
  "scvd fresh-set",
  "scvd corpus",
  "scvd menu",
  "scvd catalog",
  "scvd versions",
];
