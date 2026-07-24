import { KV_KEYS } from "@/lib/kv-keys";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { computeStats } from "@/services/stats";
import { foundingEditionMarkdown } from "@/store/gazette-founding";
import type { Env, GazetteIssue } from "@/types";

/**
 * The founding edition press. Prints once: renders the paper with the
 * ledger's numbers of that day, signs it, freezes it, and claims
 * Issue No. 1 on the rack's numbering. A newspaper prints the numbers
 * of its day; this one proves it with a signature.
 */

export type FoundingPressResult =
  | { printed: GazetteIssue }
  | { refused: string };

export async function printFoundingEdition(
  env: Env,
): Promise<FoundingPressResult> {
  const existing = await getFoundingEdition(env);
  if (existing) {
    return {
      refused:
        "The founding edition already went to press. It prints once; corrections run in the next edition.",
    };
  }
  const stats = await computeStats(env);
  if (stats.organic_settlements > 0) {
    return {
      refused:
        "The organic zero broke before press. THE BOOKS is written for the zero; the keeper recuts it before this prints.",
    };
  }
  const date = new Date().toISOString();
  const markdown = foundingEditionMarkdown(stats, date.slice(0, 10));
  const { signature, publicKey } = await signMessage(
    markdown,
    env.SIGNING_KEY,
  );
  const edition: GazetteIssue = {
    issue_number: 1,
    title: "The Town Gazette \u2014 Founding Edition",
    date,
    markdown,
    contributors: [],
    tip_ids: [],
    signature,
    public_key: publicKey,
  };
  await env.ORDERS.put(KV_KEYS.foundingEdition, JSON.stringify(edition));
  // The founding edition claims Issue No. 1; the rack numbers onward.
  const countRaw = await env.COUNTERS.get(KV_KEYS.gazetteIssueCount);
  const count = countRaw ? parseInt(countRaw, 10) : 0;
  if (count < 1) {
    await env.COUNTERS.put(KV_KEYS.gazetteIssueCount, "1");
  }
  return { printed: edition };
}

export async function getFoundingEdition(
  env: Env,
): Promise<GazetteIssue | null> {
  return env.ORDERS.get<GazetteIssue>(KV_KEYS.foundingEdition, "json");
}

export async function verifyIssueSignature(
  issue: GazetteIssue,
): Promise<boolean> {
  if (!issue.signature || !issue.public_key) {
    return false;
  }
  return verifyMessageSignature(
    issue.markdown,
    issue.signature,
    issue.public_key,
  );
}
