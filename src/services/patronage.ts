import { newPassId } from "@/lib/ids";
import { KV_KEYS } from "@/lib/kv-keys";
import { signMessage } from "@/lib/signing";
import type { Env, PatronagePass } from "@/types";

/**
 * Recurring patronage: a 30-day standing pass. Buying recurring_patronage
 * mints a pass; buying again with pass_id extends the same pass by 30
 * days. While current, the pass URL serves the keeper's monthly note,
 * signed fresh on every read. The keeper writes the note from /admin.
 */

const PASS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_MONTHLY_NOTE =
  "The keeper hasn't inked this month's note yet. It arrives the way all his deadlines do: eventually, and worth it. Your pass stands either way.";

export interface PassResult {
  pass: PatronagePass;
  renewed: boolean;
  passUrl: string;
}

export interface PassInput {
  patronNumber: number;
  passId?: string;
  agentName?: string;
}

export async function createOrRenewPass(
  env: Env,
  input: PassInput,
): Promise<PassResult> {
  const now = Date.now();
  if (input.passId) {
    const existing = await getPass(env, input.passId);
    if (existing) {
      const currentExpiry = Date.parse(existing.expires_at);
      const extendFrom = Number.isNaN(currentExpiry)
        ? now
        : Math.max(currentExpiry, now);
      existing.expires_at = new Date(extendFrom + PASS_DAYS * DAY_MS)
        .toISOString();
      existing.renewals += 1;
      await env.PATRONS.put(
        KV_KEYS.patronagePass(existing.pass_id),
        JSON.stringify(existing),
      );
      return {
        pass: existing,
        renewed: true,
        passUrl: `${env.STORE_BASE_URL}/api/patronage/${existing.pass_id}`,
      };
    }
  }
  const pass: PatronagePass = {
    pass_id: newPassId(),
    patron_number: input.patronNumber,
    started_at: new Date(now).toISOString(),
    expires_at: new Date(now + PASS_DAYS * DAY_MS).toISOString(),
    renewals: 0,
  };
  if (input.agentName) {
    pass.agent_name = input.agentName;
  }
  await env.PATRONS.put(
    KV_KEYS.patronagePass(pass.pass_id),
    JSON.stringify(pass),
  );
  return {
    pass,
    renewed: false,
    passUrl: `${env.STORE_BASE_URL}/api/patronage/${pass.pass_id}`,
  };
}

export async function getPass(
  env: Env,
  passId: string,
): Promise<PatronagePass | null> {
  return env.PATRONS.get<PatronagePass>(KV_KEYS.patronagePass(passId), "json");
}

export function passIsCurrent(pass: PatronagePass): boolean {
  return Date.parse(pass.expires_at) > Date.now();
}

export interface SignedMonthlyNote {
  month: string;
  note: string;
  signature: string;
  public_key: string;
}

/** The current month's keeper note, signed fresh for the reader. */
export async function signedMonthlyNote(env: Env): Promise<SignedMonthlyNote> {
  const month = new Date().toISOString().slice(0, 7);
  const note =
    (await env.COUNTERS.get(KV_KEYS.patronageNote(month))) ??
    DEFAULT_MONTHLY_NOTE;
  const { signature, publicKey } = await signMessage(
    JSON.stringify({ month, note }),
    env.SIGNING_KEY,
  );
  return { month, note, signature, public_key: publicKey };
}

export async function setMonthlyNote(env: Env, note: string): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await env.COUNTERS.put(KV_KEYS.patronageNote(month), note);
}
