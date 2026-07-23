import { newLetterId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import { signMessage } from "@/lib/signing";
import type { Env, LetterRecord, LetterStatus } from "@/types";

/**
 * The Mailbox. Letters are private correspondence: they live in the
 * admin queue only, are never published, and never render on any
 * public surface. Stored raw (sanitized for length and null bytes);
 * shown to the keeper escaped. Replies are signed with the store key.
 * The public sees only two numbers: received and answered.
 */

export const LETTER_CAP = 2000;

export interface SubmitLetterInput {
  letter: unknown;
  fromName?: unknown;
  verifiedIdentity?: string;
}

export interface SubmittedLetter {
  record: LetterRecord;
  pickupUrl: string;
}

export async function submitLetter(
  env: Env,
  input: SubmitLetterInput,
): Promise<SubmittedLetter | null> {
  const letter = sanitizeText(input.letter, LETTER_CAP);
  if (!letter) {
    return null;
  }
  const record: LetterRecord = {
    letter_id: newLetterId(),
    letter,
    date: new Date().toISOString(),
    status: "received",
  };
  const fromName = sanitizeText(input.fromName, 80);
  if (fromName) {
    record.from_name = fromName;
  }
  if (input.verifiedIdentity) {
    record.verified_identity = input.verifiedIdentity;
    record.identity_verified = false;
  }
  const queueKey = KV_KEYS.letter(invertedTimestamp(Date.now()), record.letter_id);
  await env.ORDERS.put(queueKey, JSON.stringify(record));
  // Direct-id pointer so pickup doesn't scan the queue.
  await env.ORDERS.put(KV_KEYS.letterById(record.letter_id), queueKey);
  await bumpCounter(env, KV_KEYS.lettersReceived);
  return {
    record,
    pickupUrl: `${env.STORE_BASE_URL}/api/letter/${record.letter_id}`,
  };
}

export async function getLetter(
  env: Env,
  letterId: string,
): Promise<LetterRecord | null> {
  const queueKey = await env.ORDERS.get(KV_KEYS.letterById(letterId));
  if (!queueKey) {
    return null;
  }
  return env.ORDERS.get<LetterRecord>(queueKey, "json");
}

export interface QueuedLetter {
  record: LetterRecord;
  kvKey: string;
}

export async function listLetters(env: Env): Promise<QueuedLetter[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.letterPrefix });
  const values = await bulkGetJson<LetterRecord>(
    env.ORDERS,
    listed.keys.map((key) => key.name),
  );
  const letters: QueuedLetter[] = [];
  for (const key of listed.keys) {
    const record = values.get(key.name);
    if (record) {
      letters.push({ record, kvKey: key.name });
    }
  }
  return letters;
}

async function saveLetter(env: Env, letterId: string, record: LetterRecord): Promise<void> {
  const queueKey = await env.ORDERS.get(KV_KEYS.letterById(letterId));
  if (queueKey) {
    await env.ORDERS.put(queueKey, JSON.stringify(record));
  }
}

export async function setLetterStatus(
  env: Env,
  letterId: string,
  status: LetterStatus,
): Promise<LetterRecord | null> {
  const record = await getLetter(env, letterId);
  if (!record) {
    return null;
  }
  record.status = status;
  await saveLetter(env, letterId, record);
  return record;
}

/** The keeper answers. The reply is signed; the original stays private. */
export async function replyToLetter(
  env: Env,
  letterId: string,
  reply: string,
): Promise<LetterRecord | null> {
  const record = await getLetter(env, letterId);
  if (!record) {
    return null;
  }
  const repliedAt = new Date().toISOString();
  const { signature, publicKey } = await signMessage(
    JSON.stringify({ letter_id: letterId, reply, replied_at: repliedAt }),
    env.SIGNING_KEY,
  );
  record.status = "replied";
  record.reply = reply;
  record.reply_signature = signature;
  record.reply_public_key = publicKey;
  record.replied_at = repliedAt;
  await saveLetter(env, letterId, record);
  await bumpCounter(env, KV_KEYS.lettersAnswered);
  return record;
}

async function bumpCounter(env: Env, key: string): Promise<void> {
  const current = await env.COUNTERS.get(key);
  await env.COUNTERS.put(key, String((current ? parseInt(current, 10) : 0) + 1));
}

export interface LetterCounts {
  received: number;
  answered: number;
}

/** The only two letter facts the public ever sees. */
export async function letterCounts(env: Env): Promise<LetterCounts> {
  const [received, answered] = await Promise.all([
    env.COUNTERS.get(KV_KEYS.lettersReceived),
    env.COUNTERS.get(KV_KEYS.lettersAnswered),
  ]);
  return {
    received: received ? parseInt(received, 10) : 0,
    answered: answered ? parseInt(answered, 10) : 0,
  };
}

/** For the Sunday digest: letters the keeper hasn't read yet. */
export async function unreadLetterCount(env: Env): Promise<number> {
  const letters = await listLetters(env);
  return letters.filter((entry) => entry.record.status === "received").length;
}
