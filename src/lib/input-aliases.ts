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
 * changes: the VALUE crosses verbatim and meets the canonical field's
 * own validation, so a bare URL sent as `url` to research_comparison
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
 */
export const INPUT_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["address", "wallet"],
  ["url", "urls"],
  ["tx_hash", "tx_hashes"],
];

/** The other names a door reads as `name`, given what the door declares. */
export function inputAliasesFor(declared: readonly string[], name: string): string[] {
  if (!declared.includes(name)) return [];
  const group = INPUT_ALIAS_GROUPS.find((members) => members.includes(name));
  return group ? group.filter((other) => other !== name && !declared.includes(other)) : [];
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
    if (alias !== undefined) out[name] = record[alias];
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
  return {
    get: (name) => args.get(resolve(name)),
    ...(args.has ? { has: (name: string) => args.has!(resolve(name)) } : {}),
    ...(args.raw ? { raw: (name: string) => args.raw!(resolve(name)) } : {}),
    field: (name) => {
      const from = resolve(name);
      return from === name ? args.field(name) : `${args.field(name)} (read from your ${from})`;
    },
  };
}
