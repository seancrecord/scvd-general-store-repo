#!/usr/bin/env node
/**
 * POST A ROUND OF BOUNTIES FROM ANYWHERE (2026-09-19, the keeper: "so
 * i can post as i please").
 *
 * The board had two ways to open a listing and both of them were the
 * market page: tick the checkboxes, or wait for the standing order's
 * tick. This is the third — a named list of doors, a reward, a rail,
 * pressed from a terminal in one command.
 *
 * IT REACHES AROUND NOTHING. It calls POST /admin/bounties/batch, the
 * same door the desk's own press calls, so every rule lives where it
 * always did: each door's live 402 is read and captured as the terms
 * of record, a reward that does not exceed a door's price is refused,
 * one bounty stands per domain per week, the weekly budget holds, and
 * a refusal comes back named beside its URL. What this adds is the
 * keeper's reach, not his permissions.
 *
 * A DOOR IS STILL HOUSE-PICKED. Nothing here nominates a door — the
 * list is one a human typed or piped in, which is the anti-farming
 * rule in BOUNTY_BOARD.md holding exactly as it does on the desk. Do
 * not wire this to a feed a seller can write to.
 *
 *   ADMIN_PASSWORD=… node scripts/post-bounty-round.mjs \
 *     --reward 0.12 --tier sprint --rail base \
 *     --ask "Did the paid response carry a PAYMENT-RESPONSE receipt?" \
 *     https://door.example/api/thing https://other.example/api/thing
 *
 *   ADMIN_PASSWORD=… node scripts/post-bounty-round.mjs --reward 0.12 < doors.txt
 *
 * --dry-run prints the presses it would make and posts nothing.
 */

/** The batch door's own cap, mirrored so a long list is split, not trimmed. */
const BATCH_CAP = 10;

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    `post-bounty-round — open a round of bounties on doors you name\n\n` +
      `  node scripts/post-bounty-round.mjs [options] URL...\n` +
      `  ... | node scripts/post-bounty-round.mjs [options]\n\n` +
      `  --reward N        USD per listing, on top of each door's own price (required)\n` +
      `  --tier T          sprint (2 days) | standard (7) | long (21). Default standard\n` +
      `  --rail R          capture this rail or refuse the door: base, polygon, arbitrum,\n` +
      `                    optimism, avalanche, world, solana, algorand, or a CAIP-2\n` +
      `  --note TEXT       your words, shown verbatim on every listing in the press\n` +
      `  --ask TEXT        what to observe at these doors (repeatable)\n` +
      `  --second-walk     refuse a claim from a wallet that already walked this door\n` +
      `  --store URL       default https://scvd.store\n` +
      `  --user NAME       basic-auth user, default keeper\n` +
      `  --dry-run         print the presses and post nothing\n\n` +
      `ADMIN_PASSWORD must be set unless --dry-run.\n`,
  );
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
const options = {
  store: process.env.STORE_BASE_URL ?? "https://scvd.store",
  user: process.env.ADMIN_USER ?? "keeper",
  tier: "standard",
  asks: [],
};
const urls = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  const next = () => {
    const value = argv[index + 1];
    if (value === undefined) usage(`${arg} needs a value`);
    index += 1;
    return value;
  };
  if (arg === "--help" || arg === "-h") usage();
  else if (arg === "--reward") options.reward = Number.parseFloat(next());
  else if (arg === "--tier") options.tier = next();
  else if (arg === "--rail") options.rail = next();
  else if (arg === "--note") options.note = next();
  else if (arg === "--ask") options.asks.push(next());
  else if (arg === "--store") options.store = next();
  else if (arg === "--user") options.user = next();
  else if (arg === "--second-walk") options.secondWalk = true;
  else if (arg === "--dry-run") options.dryRun = true;
  else if (arg.startsWith("-")) usage(`unknown option ${arg}`);
  else urls.push(arg);
}

/* A list piped in is the same list, one door a line, blanks and # ignored. */
if (urls.length === 0 && !process.stdin.isTTY) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  for (const line of Buffer.concat(chunks).toString("utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) urls.push(trimmed.split(/\s+/)[0]);
  }
}

if (urls.length === 0) usage("no doors named");
if (!Number.isFinite(options.reward) || options.reward <= 0) {
  usage("--reward is required, in dollars (e.g. --reward 0.12)");
}
if (!["sprint", "standard", "long"].includes(options.tier)) {
  usage("--tier must be sprint, standard or long");
}
const password = process.env.ADMIN_PASSWORD;
if (!password && !options.dryRun) usage("ADMIN_PASSWORD is not set");

/*
 * SPLIT, NEVER TRIM. The batch door posts at most ten doors a press
 * and reports the rest as trimmed; a keeper who named twenty meant
 * twenty, so the split happens here and each press is reported on its
 * own line.
 */
const presses = [];
for (let index = 0; index < urls.length; index += BATCH_CAP) {
  presses.push(urls.slice(index, index + BATCH_CAP));
}

const body = (batch) => ({
  urls: batch,
  reward_usd: options.reward,
  tier: options.tier,
  ...(options.rail ? { rail: options.rail } : {}),
  ...(options.note ? { note: options.note } : {}),
  ...(options.asks.length > 0 ? { asks: options.asks } : {}),
  ...(options.secondWalk ? { distinct_payer: true } : {}),
});

if (options.dryRun) {
  process.stdout.write(
    `${urls.length} door${urls.length === 1 ? "" : "s"} in ${presses.length} press${presses.length === 1 ? "" : "es"} to ${options.store}/admin/bounties/batch:\n`,
  );
  for (const batch of presses) {
    process.stdout.write(`${JSON.stringify(body(batch), null, 2)}\n`);
  }
  process.exit(0);
}

const auth = `Basic ${Buffer.from(`${options.user}:${password}`).toString("base64")}`;
let posted = 0;
let refused = 0;
for (const [index, batch] of presses.entries()) {
  const response = await fetch(`${options.store}/admin/bounties/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body(batch)),
  });
  if (!response.ok) {
    process.stderr.write(
      `press ${index + 1}/${presses.length} failed: ${response.status} ${(await response.text()).slice(0, 300)}\n`,
    );
    process.exitCode = 1;
    continue;
  }
  const result = await response.json();
  posted += result.posted ?? 0;
  refused += result.refused ?? 0;
  for (const outcome of result.outcomes ?? []) {
    process.stdout.write(
      outcome.ok
        ? `posted  ${outcome.bounty_id}  ${outcome.domain}  door $${outcome.amount_usd}  reward $${options.reward.toFixed(2)}\n`
        : `refused ${outcome.url} — ${outcome.refusal}\n`,
    );
  }
}
process.stdout.write(
  `\n${posted} posted, ${refused} refused, $${(posted * options.reward).toFixed(2)} of the week's budget now standing open.\n`,
);
