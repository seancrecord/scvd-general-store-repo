import { listKeys } from "@/lib/kv-list";
import { newLetterId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { readProse, sanitizeText } from "@/lib/sanitize";
import { readEmailAddress, sendMail } from "@/lib/keeper-mail";
import { STORE_CONTACT_EMAIL } from "@/store/metadata";
import { cheapestLabel } from "@/store/identity-lead";
import { getMenuItem } from "@/store/menu";
import { signMessage } from "@/lib/signing";
import type {
  Env,
  LetterFollowUp,
  LetterRecord,
  LetterReply,
  LetterStatus,
  MailOutcome,
} from "@/types";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";


/**
 * The Mailbox. Letters are private correspondence: they live in the
 * admin queue only, are never published, and never render on any
 * public surface. Stored raw (sanitized for length and null bytes);
 * shown to the keeper escaped. Replies are signed with the store key.
 * The public sees only two numbers: received and answered.
 */

/**
 * How long a letter may run. ⚑ keeper dial.
 *
 * RAISED FROM 2000 ON 2026-09-08, because the keeper's own reply had
 * just invited a correspondent to deliver a five-endpoint report with
 * response hashes through this door, and 2000 characters does not
 * hold one. The box is still small on purpose — this is a mailbox,
 * not a manuscript drawer — but it now fits the thing the store asks
 * people to put in it.
 */
export const LETTER_CAP = 8000;

/** How many times a correspondent may add to one letter. ⚑ keeper dial. */
export const LETTER_FOLLOW_UP_CAP = 20;

/**
 * THE STANDING REPLY (2026-10-02, the keeper: letters that say "1" or
 * "test" each wanted a hand-typed answer). One set of words for the
 * letters that asked nothing, sent by the handful from the counter
 * and signed on each letter like any other answer, so a pickup URL
 * verifies it the same way. The prices are read off the shelf, never
 * typed (AT_SCALE rule 1). The words are his to change. ⚑ keeper dial.
 */
export function standingLetterReply(env: Pick<Env, "STORE_BASE_URL">): string {
  const patronage = getMenuItem("recurring_patronage");
  // Derive or refuse (AT_SCALE rule 1): no hand-typed price, and no
  // reply that names a shelf the menu no longer has.
  if (!patronage?.term_days) {
    throw new Error(
      "The standing reply names Recurring Patronage, and the shelf no longer has it. Rewrite the reply.",
    );
  }
  const base = env.STORE_BASE_URL;
  return [
    "Thanks for writing. The letter landed, the keeper read it, and there was nothing in it that asked for an answer, so this is the standing one.",
    "",
    `The store is open and the shelves are at ${base}/menu. The cheapest thing on them is ${cheapestLabel()}, every purchase comes with a signed certificate you can verify without trusting us, and ${patronage.term_days} days of ${patronage.name} is $${patronage.price_usdc} at ${base}/menu/${patronage.id}. Come back and buy something; the next letter gets a longer reply.`,
  ].join("\n");
}

export interface SubmitLetterInput {
  letter: unknown;
  fromName?: unknown;
  verifiedIdentity?: string;
  /** An address to mail each signed reply to. Optional; shape-checked, never echoed. */
  replyTo?: unknown;
}

export interface SubmittedLetter {
  record: LetterRecord;
  pickupUrl: string;
}

/**
 * WHAT THE DOOR DECIDED, said out loud (2026-09-08). This used to
 * return `null` for both "you sent nothing" and — never, because the
 * over-long case did not exist: `sanitizeText` cut the letter to fit
 * and the door answered 201 over the top of it. A caller cannot tell
 * a sender what went wrong with a value that does not distinguish.
 */
export type LetterSubmission =
  | { ok: true; record: LetterRecord; pickupUrl: string }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "too_long"; length: number; cap: number };

export async function submitLetter(
  env: Env,
  input: SubmitLetterInput,
): Promise<LetterSubmission> {
  const read = readProse(input.letter, LETTER_CAP);
  if (!read.text) {
    return { ok: false, reason: "empty" };
  }
  if (read.over) {
    return {
      ok: false,
      reason: "too_long",
      length: read.length,
      cap: LETTER_CAP,
    };
  }
  const letter = read.text;
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
  const replyTo = readEmailAddress(input.replyTo);
  if (replyTo) {
    record.reply_to = replyTo;
  }
  const queueKey = KV_KEYS.letter(invertedTimestamp(Date.now()), record.letter_id);
  await kvPut(env.ORDERS, queueKey, JSON.stringify(record));
  // Direct-id pointer so pickup doesn't scan the queue.
  await kvPut(env.ORDERS, KV_KEYS.letterById(record.letter_id), queueKey);
  await bumpCounter(env, KV_KEYS.lettersReceived);
  await notifyKeeperOfMail(env, record, "letter", letter);
  return {
    ok: true,
    record,
    pickupUrl: `${env.STORE_BASE_URL}/api/letter/${record.letter_id}`,
  };
}

/**
 * THE CORRESPONDENT WRITES BACK, on the same letter (2026-09-08).
 *
 * Answering used to be one sentence each way. The keeper got a thread
 * the same day this shipped; without this, the other half of the
 * conversation still arrived as unrelated letters, one a day, with
 * nothing on them saying which exchange they belonged to.
 *
 * THE DOOR OPENS ONLY AFTER HE ANSWERS. An unanswered letter takes no
 * follow-ups: otherwise this is an unmetered write channel into the
 * keeper's queue, and the daily limit on new letters would mean
 * nothing. Once he has replied he has invited the reply, so a
 * follow-up is not rationed by the day — a correspondent working to a
 * deadline can confirm a scope and deliver against it the same
 * afternoon — and is bounded per letter instead.
 */
export type FollowUpResult =
  | { ok: true; record: LetterRecord; pickupUrl: string }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "too_long"; length: number; cap: number }
  | { ok: false; reason: "no_such_letter" }
  | { ok: false; reason: "unanswered" }
  | { ok: false; reason: "full"; cap: number };

export async function addFollowUp(
  env: Env,
  letterId: string,
  letter: unknown,
  /** An address given on the follow-up: added to the letter, or replacing the one it had. */
  replyTo?: unknown,
): Promise<FollowUpResult> {
  const record = await getLetter(env, letterId);
  if (!record) {
    return { ok: false, reason: "no_such_letter" };
  }
  if (letterThread(record).length === 0) {
    return { ok: false, reason: "unanswered" };
  }
  const existing = record.follow_ups ?? [];
  if (existing.length >= LETTER_FOLLOW_UP_CAP) {
    return { ok: false, reason: "full", cap: LETTER_FOLLOW_UP_CAP };
  }
  const read = readProse(letter, LETTER_CAP);
  if (!read.text) {
    return { ok: false, reason: "empty" };
  }
  if (read.over) {
    return {
      ok: false,
      reason: "too_long",
      length: read.length,
      cap: LETTER_CAP,
    };
  }
  const entry: LetterFollowUp = {
    letter: read.text,
    date: new Date().toISOString(),
  };
  record.follow_ups = [...existing, entry];
  const address = readEmailAddress(replyTo);
  if (address) {
    record.reply_to = address;
  }
  await saveLetter(env, letterId, record);
  await notifyKeeperOfMail(env, record, "follow_up", entry.letter);
  return {
    ok: true,
    record,
    pickupUrl: `${env.STORE_BASE_URL}/api/letter/${letterId}`,
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
  /*
   * THE COURTESY COPY (2026-09-28, the keeper: "how does the
   * individual get it?"). Until today, nobody was told. A reply sat
   * signed at a pickup URL that a polling agent reads and a person
   * who wrote once never returns to; the mailbox's first human
   * correspondent would have waited on an answer that was already
   * written. So a letter that carries an address gets the answer by
   * mail as well, the keeper copied so the thread can continue in
   * his own inbox where a person can be answered at length.
   *
   * SAVED FIRST, MAILED SECOND. The signed reply is the record and it
   * is already on the pickup URL before the wire is touched; the
   * outcome is written beside the reply afterwards, so the box can
   * say whether the copy went, and a failed send is a failed courtesy
   * and nothing more.
   */
  if (record.reply_to) {
    const outcome = await sendMail(env, {
      to: record.reply_to,
      cc: [STORE_CONTACT_EMAIL],
      replyTo: STORE_CONTACT_EMAIL,
      subject: `The keeper wrote back on your letter ${letterId}`,
      text: replyMailText(env, letterId, reply),
    });
    const last = record.replies[record.replies.length - 1];
    if (last) {
      last.mailed = outcome;
      await saveLetter(env, letterId, record);
    }
  }
  return record;
}

/** The body of a mailed reply: the answer, then where the signed copy lives. */
export function replyMailText(env: Env, letterId: string, reply: string): string {
  const base = env.STORE_BASE_URL;
  return [
    reply,
    "",
    "---",
    `This is a courtesy copy. The signed reply, with its signature and public key, is at ${base}/api/letter/${letterId} — verify it against ${base}/.well-known/scvd-signing-key.`,
    `To add to this exchange on the record, POST to ${base}/api/letter with in_reply_to "${letterId}". Replying to this mail reaches the keeper directly instead.`,
  ].join("\n");
}

/**
 * THE KEEPER HEARS A LETTER LAND (2026-09-28). The Sunday digest
 * counted unread letters and nothing else did, so a letter posted on
 * a Friday waited two days for a reader who had no idea it was
 * there. One mail per arrival, to the alarm address, with the words
 * in it — this is his own private box forwarded to his own private
 * inbox, nothing new is disclosed — and a line saying whether the
 * sender can be mailed back. Fails open: no key, no address, or a
 * dead wire, and the letter is still in the box exactly as before.
 */
export async function notifyKeeperOfMail(
  env: Env,
  record: LetterRecord,
  kind: "letter" | "follow_up",
  text: string,
): Promise<void> {
  if (!env.ALERT_EMAIL) {
    return;
  }
  const who = record.from_name ? `from ${record.from_name}` : "unsigned";
  const subject =
    kind === "letter"
      ? `A letter landed at the store: ${record.letter_id} (${who})`
      : `A follow-up landed on ${record.letter_id} (${who})`;
  await sendMail(env, {
    to: env.ALERT_EMAIL,
    subject,
    text: [
      new Date().toISOString(),
      record.reply_to
        ? `They left an address: ${record.reply_to}. Your signed reply from the back room goes there too, with you copied.`
        : "No address left. Your reply waits at their pickup URL for them to collect.",
      "",
      text,
      "",
      `Answer it in the back room: ${env.STORE_BASE_URL}/admin`,
    ].join("\n"),
  });
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
  const thread = letterThread(record);
  if (thread.length === 0) {
    return record.status === "received" || record.status === "read";
  }
  /*
   * AND IT IS WORK AGAIN THE MOMENT THEY WRITE BACK (2026-09-08).
   * Once the correspondent could add to a letter, "answered" stopped
   * meaning "finished": a follow-up that arrived after the last reply
   * is a question sitting unanswered in a letter the counter had
   * already stopped mentioning. The last word decides — his, and it
   * rests; theirs, and it is his turn.
   */
  const lastReply = thread[thread.length - 1]?.replied_at ?? "";
  return (record.follow_ups ?? []).some((entry) => entry.date > lastReply);
}

/** One side's turn in a letter, for the keeper's box. */
export type LetterEvent =
  | { at: string; who: "them"; text: string }
  | { at: string; who: "keeper"; text: string; mailed?: MailOutcome };

/**
 * THE WHOLE EXCHANGE IN ORDER, both sides — what the admin box shows.
 * Built from the record rather than stored, so a letter from any era
 * reads the same: the original, the keeper's answers, and the
 * correspondent's later messages, interleaved by their own clocks.
 */
export function letterEvents(record: LetterRecord): LetterEvent[] {
  const events: LetterEvent[] = [
    { at: record.date, who: "them", text: record.letter },
    ...(record.follow_ups ?? []).map(
      (entry): LetterEvent => ({
        at: entry.date,
        who: "them",
        text: entry.letter,
      }),
    ),
    ...letterThread(record).map(
      (entry): LetterEvent => ({
        at: entry.replied_at,
        who: "keeper",
        text: entry.reply,
        ...(entry.mailed ? { mailed: entry.mailed } : {}),
      }),
    ),
  ];
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

/** For the Sunday digest: letters the keeper hasn't read yet. */
export async function unreadLetterCount(env: Env): Promise<number> {
  const letters = await listLetters(env);
  return letters.filter((entry) => entry.record.status === "received").length;
}
