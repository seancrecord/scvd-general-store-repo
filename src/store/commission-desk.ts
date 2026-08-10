/**
 * THE COMMISSION DESK'S FIXED TERMS — the keeper's ruling (2026-08-10,
 * C2): bespoke work moves to request → quote → agreed price, with
 * `the_collab` first through the door, and declined requests get a
 * PUBLIC reply, because transparency is house style.
 *
 * What the desk retires is the pricing mistake nobody could fix at
 * purchase time: a fixed dollar figure promised against work nobody
 * had seen yet, decided at listing time. The quote is the keeper's
 * hand (rule 30: no agent prices anything); the window is per-quote,
 * because a one-size 168-hour promise on unknown work is the thing
 * being retired.
 */

/**
 * THE PUBLISHED RUNGS (docs/COMMISSION_DESK.md §3, option (a),
 * standing on risk appetite rather than the corrected impossibility):
 * each rung is its own static x402 route, so the money spine never
 * reads storage to learn a price — a static price cannot fail, and a
 * `?price=1` that the gate honoured would be the store's worst bug.
 * The keeper quotes to a rung; the rungs are public, which is better
 * manners than a bespoke number quoted in private.
 */
export const COMMISSION_RUNGS = [25, 50, 100, 250] as const;

/**
 * A quote with no expiry binds the store to a price forever, and the
 * keeper will not remember. Fourteen days is the spec's suggested
 * default, taken as ruled since the keeper named no other number.
 */
export const QUOTE_EXPIRY_DAYS = 14;

/**
 * The item a paid commission mints under. The desk fronts
 * `the_collab` — the catch-all for bespoke keeper-time — so the
 * certificate class, the bench accounting and the order machinery
 * are all the ones that already exist. Nothing new is signed.
 */
export const COMMISSION_ITEM_ID = "the_collab";

/** The keeper's reply on a declined request is capped like any note. */
export const DECLINE_REPLY_CAP = 600;

/** The quote note riding the terms to the requester. */
export const QUOTE_NOTE_CAP = 600;

export const DESK_STANDFIRST =
  "The Commission Desk: bespoke work is quoted, never menu-priced. Write in free at POST /api/request with what you want and what you would pay; the keeper reads every one and answers by hand — a quote at a published rung with its own delivery window, or a decline with the reason stated in public. Payment only ever happens against a live quote, at the quoted rung, over x402.";
