import { listKeys } from "@/lib/kv-list";
import { newLetterId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import { signMessage } from "@/lib/signing";
import type { Env, LetterRecord, LetterReply, LetterStatus } from "@/types";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";


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
  await kvPut(env.ORDERS, queueKey, JSON.stringify(record));
  // Direct-id pointer so pickup doesn't scan the queue.
  await kvPut(env.ORDERS, KV_KEYS.letterById(record.letter_id), queueKey);
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
  const queueKey = await kvGet(env.ORDERS, KV_KEYS.letterById(letterId));
  if (!queueKey) {
    return null;
  }
  return kvGetJson<LetterRecord>(env.ORDERS, queueKey, "json");
}

export interface QueuedLetter {
  record: LetterRecord;
  kvKey: string;
}

export async function listLetters(env: Env): Promise<QueuedLetter[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.letterPrefix, cap: LETTER_CAP });
  const values = await bulkGetJson<LetterRecord>(
    env.ORDERS,
    listed.names,
  );
  const letters: QueuedLetter[] = [];
  for (const name of listed.names) {
    const record = values.get(name);
    if (record) {
      letters.push({ record, kvKey: name });
    }
  }
  return letters;
}

async function saveLetter(env: Env, letterId: string, record: LetterRecord): Promise<void> {
  const queueKey = await kvGet(env.ORDERS, KV_KEYS.letterById(letterId));
  if (queueKey) {
    await kvPut(env.ORDERS, queueKey, JSON.stringify(record));
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

/**
 * EVERY ANSWER A LETTER HAS, oldest first — the one way to read a
 * letter's replies. A record written before the thread existed keeps
 * its four top-level fields and no `replies` array; that is a
 * one-reply thread and reads as one here, so no caller needs to know
 * which era a record is from.
 */
export function letterThread(record: LetterRecord): LetterReply[] {
  if (record.replies?.length) {
    return record.replies;
  }
  if (record.reply) {
    return [
      {
        reply: record.reply,
        signature: record.reply_signature ?? "",
        public_key: record.reply_public_key ?? "",
        replied_at: record.replied_at ?? record.date,
      },
    ];
  }
  return [];
}

/**
 * THE KEEPER ANSWERS — AND MAY ANSWER AGAIN (2026-09-08).
 *
 * FOUND BY TRYING TO USE IT. A correspondent wrote in on 09-05 with a
 * scoped offer; the keeper replied, promised a list of endpoints in
 * the same breath, and then had nowhere to put them: the admin box
 * replaces the reply form with the reply text the moment a letter is
 * answered, so a second letter could not be written at all. The
 * promise went unkept because the desk had no way to keep it.
 *
 * AND THE ROUTE UNDERNEATH WAS WORSE THAN MISSING. A second POST
 * (the form is gone, the route was not) overwrote `reply`,
 * `reply_signature` and `replied_at` in place. That is this store
 * silently replacing a SIGNED artifact it had already published at a
 * public pickup URL — the one thing every rule here exists to
 * prevent. It also bumped `letters_answered` a second time, so the
 * public "answered" figure counted answers, not letters.
 *
 * SO: replies APPEND. Each is signed on its own over the same payload
 * as before. The first reply's four fields are written once and never
 * touched again, because somebody may already hold them. The counter
 * moves only when a letter goes from unanswered to answered.
 */
export async function replyToLetter(
  env: Env,
  letterId: string,
  reply: string,
): Promise<LetterRecord | null> {
  const record = await getLetter(env, letterId);
  if (!record) {
    return null;
  }
  const existing = letterThread(record);
  const repliedAt = new Date().toISOString();
  const { signature, publicKey } = await signMessage(
    JSON.stringify({ letter_id: letterId, reply, replied_at: repliedAt }),
    env.SIGNING_KEY,
  );
  record.status = "replied";
  record.replies = [
    ...existing,
    { reply, signature, public_key: publicKey, replied_at: repliedAt },
  ];
  if (existing.length === 0) {
    record.reply = reply;
    record.reply_signature = signature;
    record.reply_public_key = publicKey;
    record.replied_at = repliedAt;
  }
  await saveLetter(env, letterId, record);
  if (existing.length === 0) {
    await bumpCounter(env, KV_KEYS.lettersAnswered);
  }
  return record;
}

async function bumpCounter(env: Env, key: string): Promise<void> {
  const current = await kvGet(env.COUNTERS, key);
  await kvPut(env.COUNTERS, key, String((current ? parseInt(current, 10) : 0) + 1));
}

export interface LetterCounts {
  received: number;
  answered: number;
}

/** The only two letter facts the public ever sees. */
export async function letterCounts(env: Env): Promise<LetterCounts> {
  const [received, answered] = await Promise.all([
    kvGet(env.COUNTERS, KV_KEYS.lettersReceived),
    kvGet(env.COUNTERS, KV_KEYS.lettersAnswered),
  ]);
  return {
    received: received ? parseInt(received, 10) : 0,
    answered: answered ? parseInt(answered, 10) : 0,
  };
}

/**
 * IS THIS LETTER STILL ON HIM? (2026-09-04, the keeper: "on the letter,
 * i responded but it still says it needs my hands... i dont want it to
 * go away, but i dont have anything to do".)
 *
 * A letter is work until it is ANSWERED, not until it is filed.
 * "Not archived" was standing in for "unanswered", and the two part
 * company the moment he replies: the reply is the work, archiving is
 * housekeeping, and a desk that demands housekeeping before it stops
 * asking is a desk that trains you to ignore it. Replied letters stay
 * in the box, visible, out of the count.
 */
export function letterNeedsReply(record: LetterRecord): boolean {
  return record.status === "received" || record.status === "read";
}

/** For the Sunday digest: letters the keeper hasn't read yet. */
export async function unreadLetterCount(env: Env): Promise<number> {
  const letters = await listLetters(env);
  return letters.filter((entry) => entry.record.status === "received").length;
}
