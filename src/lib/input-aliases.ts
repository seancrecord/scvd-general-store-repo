import type { PurchaseArgs } from "@/lib/purchase-args";

/**
 * A SIBLING DOOR'S NAME FOR THE SAME INPUT (2026-09-28, off the
 * decline desk).
 *
 * Three pairs of doors take the same kind of thing under two names:
 * provenance_check wants ?address= where the two statements want
 * ?wallet= (an EVM address either way); research_comparison wants
 * ?urls= where twelve doors want ?url=; attestation_bundle wants
 * ?tx_hashes= where the three single-transaction doors want ?tx_hash=.
 * Each name is right for its own door, and a caller that learned the
 * pattern on one door and carried it to the sibling was refused before
 * the gate — `local:input_missing:urls` and `:tx_hashes` were seen
 * from more than one client, which is the desk's own test for a wall
 * that is ours rather than theirs.
 *
 * So the sibling's name is read as this door's, and nothing else
 * changes: the VALUE crosses verbatim (one derived exception, dated
 * below) and meets the canonical field's own validation, so a bare URL sent as `url` to research_comparison
 * is refused by the same rule a bare URL sent as `urls` is (it wants a
 * JSON array of two to four), and an address sent as `wallet` to
 * provenance_check is held to the same pattern as one sent as
 * `address`. The published schema stays truthful — it documents the
 * canonical name, and the alias maps onto it before any check runs —
 * and the certificate never sees the alias, because fulfillment reads
 * canonical fields off purchaseInputFrom. The 402 body names the
 * aliases under `input_aliases` so a reader can learn the courtesy
 * without depending on it.
 *
 * TWO RULES KEEP THIS ADDITIVE. The canonical name always wins when it
 * is supplied, so no current caller's request reads differently. And a
 * name the door declares for ITSELF is never an alias for another of
 * its fields — the_case_file takes both `tx_hash` and an optional
 * `url`, and neither is ever read as the other — which is why every
 * function here takes the door's declared names rather than a global
 * table alone.
 *
 * THE ONE PAIR THAT IS NOT VERBATIM, AND NOT SYMMETRIC (2026-09-30,
 * off the decline desk). spot_check is the one input-taking door that
 * says ?host= where twelve say ?url=, and on 2026-09-30 a `node`
 * client was refused there three times in ten seconds for a missing
 * host, two days after every document carried the template. A caller
 * that learned ?url= on the other twelve reaches this one with a URL
 * in hand and a hostname inside it — so `host` is read from `url` by
 * taking the URL's hostname, the one derivation in this file. A value
 * that does not parse as a URL crosses verbatim, as every other alias
 * does, and meets the host rule on its own (a bare host sent as ?url=
 * passes; anything else is refused under host's rule, labelled as
 * read from url). The pair is DIRECTED: `url` is never read from
 * `host`, because a hostname is not a URL and the twelve url doors
 * have never seen ?host= sent to them. So the pairs below are edges,
 * not groups, and the edge carries its derivation.
 */
interface InputAlias {
  /** The name the door declares. */
  name: string;
  /** The sibling's name it is also read from. */
  from: string;
  /** How the sibling's value becomes this field's, when not verbatim. */
  derive?: (value: string) => string;
}

/** The hostname inside a URL, or the value itself where there is none to take. */
function hostnameOf(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return value;
  try {
    const host = new URL(trimmed).hostname;
    return host.length > 0 ? host : value;
  } catch {
    return value;
  }
}

const INPUT_ALIASES: readonly InputAlias[] = [
  { name: "address", from: "wallet" },
  { name: "wallet", from: "address" },
  { name: "url", from: "urls" },
  { name: "urls", from: "url" },
  { name: "tx_hash", from: "tx_hashes" },
  { name: "tx_hashes", from: "tx_hash" },
  { name: "host", from: "url", derive: hostnameOf },
];

/** The other names a door reads as `name`, given what the door declares. */
export function inputAliasesFor(declared: readonly string[], name: string): string[] {
  if (!declared.includes(name)) return [];
  return INPUT_ALIASES.filter((edge) => edge.name === name && !declared.includes(edge.from)).map((edge) => edge.from);
}

/** The sibling's value as this field's: derived where the edge says so, verbatim otherwise. */
function crossValue(name: string, from: string, value: unknown): unknown {
  const edge = INPUT_ALIASES.find((candidate) => candidate.name === name && candidate.from === from);
  return edge?.derive && typeof value === "string" ? edge.derive(value) : value;
}

/** Canonical name -> aliases, for the names in `names` that have any. */
export function inputAliasTable(declared: readonly string[], names: readonly string[]): Record<string, string[]> {
  const table: Record<string, string[]> = {};
  for (const name of names) {
    const aliases = inputAliasesFor(declared, name);
    if (aliases.length > 0) table[name] = aliases;
  }
  return table;
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * A plain record (the HTTP query, the MCP arguments) with each declared
 * name filled from its alias where the name itself was not supplied.
 * The alias key is left in place: nothing is removed, only read across.
 */
export function resolveInputRecord<T extends Record<string, unknown>>(declared: readonly string[], record: T): T {
  const out: Record<string, unknown> = { ...record };
  for (const name of declared) {
    if (!blank(out[name])) continue;
    const alias = inputAliasesFor(declared, name).find((other) => !blank(record[other]));
    if (alias !== undefined) out[name] = crossValue(name, alias, record[alias]);
  }
  return out as T;
}

/** Whether the door's reader holds a usable value under this exact name. */
function supplied(args: PurchaseArgs, name: string): boolean {
  if (args.has && args.raw) {
    return args.has(name) && !blank(args.raw(name));
  }
  return !blank(args.get(name));
}

/**
 * The same reader, answering each declared name from its alias when the
 * name itself was not supplied. The label a refusal prints still names
 * the canonical field — that is the name the schema teaches — and says
 * which of the buyer's names it was read from, so "urls query parameter
 * (read from your url)" tells them both halves at once.
 */
export function resolvePurchaseArgs(declared: readonly string[], args: PurchaseArgs): PurchaseArgs {
  const resolve = (name: string): string =>
    supplied(args, name)
      ? name
      : (inputAliasesFor(declared, name).find((other) => supplied(args, other)) ?? name);
  const cross = (name: string, value: unknown): unknown => {
    const from = resolve(name);
    return from === name ? value : crossValue(name, from, value);
  };
  return {
    get: (name) => {
      const value = cross(name, args.get(resolve(name)));
      return typeof value === "string" ? value : undefined;
    },
    ...(args.has ? { has: (name: string) => args.has!(resolve(name)) } : {}),
    ...(args.raw ? { raw: (name: string) => cross(name, args.raw!(resolve(name))) } : {}),
    field: (name) => {
      const from = resolve(name);
      return from === name ? args.field(name) : `${args.field(name)} (read from your ${from})`;
    },
  };
}
