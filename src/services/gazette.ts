import { listKeys } from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { signMessage } from "@/lib/signing";
import { issueStamp } from "@/services/stamps";
import { setTipStatus } from "@/services/tips";
import type { Env, GazetteIssue, TipRecord } from "@/types";

/** Ceiling on a issues scan. Named because an unnamed cap is a silent one. */
const ISSUE_CAP = 500;

/**
 * The Gazette press. The keeper assembles issues by hand from approved
 * Trading Post tips; publishing marks the tips published, credits every
 * named contributor, and mints each one a contributor stamp.
 */

function assembleMarkdown(
  issueNumber: number,
  title: string,
  date: string,
  tips: TipRecord[],
): string {
  const body = tips
    .map((tip) => {
      const credit = tip.contributor_name
        ? `— *${tip.contributor_name}*`
        : "— *a passing agent, name withheld by choice*";
      return `${tip.tip}\n\n${credit}`;
    })
    .join("\n\n---\n\n");
  return `# The Gazette. Issue no. ${issueNumber}

## ${title}

*${date.slice(0, 10)} · assembled by the keeper from tips left at the Trading Post. Every tip below was read and approved by a human before printing, but the words are the contributors' own, visitor-written, not the store speaking. A penny a copy; contributors get the credit.*

---

${body}

---

*Got something worth a penny? Leave it at POST /api/tip. If it prints, you get the credit and a contributor stamp.*
`;
}

export async function publishIssue(
  env: Env,
  title: string,
  tips: TipRecord[],
): Promise<GazetteIssue> {
  const countRaw = await env.COUNTERS.get(KV_KEYS.gazetteIssueCount);
  const issueNumber = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
  const date = new Date().toISOString();

  const markdown = assembleMarkdown(issueNumber, title, date, tips);
  // Signed at press: the copy an agent buys is provably the copy printed.
  const { signature, publicKey } = await signMessage(
    markdown,
    env.SIGNING_KEY,
  );
  const issue: GazetteIssue = {
    issue_number: issueNumber,
    title,
    date,
    markdown,
    contributors: [],
    tip_ids: tips.map((tip) => tip.id),
    signature,
    public_key: publicKey,
  };

  for (const tip of tips) {
    if (tip.contributor_name) {
      const stamp = await issueStamp(env, "contributor", tip.contributor_name);
      issue.contributors.push({
        name: tip.contributor_name,
        stamp_id: stamp.record.stamp.stamp_id,
      });
    }
    await setTipStatus(env, tip.id, "published");
  }

  await env.ORDERS.put(
    KV_KEYS.gazetteIssue(issueNumber),
    JSON.stringify(issue),
  );
  await env.COUNTERS.put(KV_KEYS.gazetteIssueCount, String(issueNumber));
  return issue;
}

export async function getIssue(
  env: Env,
  issueNumber: number,
): Promise<GazetteIssue | null> {
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    return null;
  }
  return env.ORDERS.get<GazetteIssue>(
    KV_KEYS.gazetteIssue(issueNumber),
    "json",
  );
}

export async function listIssues(env: Env): Promise<GazetteIssue[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.gazettePrefix, cap: ISSUE_CAP });
  const values = await bulkGetJson<GazetteIssue>(
    env.ORDERS,
    listed.names,
  );
  const issues: GazetteIssue[] = [];
  for (const issue of values.values()) {
    if (issue) {
      issues.push(issue);
    }
  }
  issues.sort((a, b) => b.issue_number - a.issue_number);
  return issues;
}
