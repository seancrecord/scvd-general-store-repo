import { Hono } from "hono";
import {
  attachHostNote,
  attachWalletNote,
  NoteRefused,
  noteChallengeText,
  STANDING_NOTE_MAX_CHARS,
  WELL_KNOWN_NOTE_PATH,
} from "@/services/standing-note";
import { isRecord } from "@/types";
import type { HonoEnv } from "@/types";

/**
 * THE STANDING-NOTE DOOR (G2 ruling §5). Self-serve: prove control,
 * attach your statement, and it rides beside our observation on every
 * surface that shows the fact — never replacing it. The GET explains
 * the whole lane so an agent (or an operator's intern) can complete
 * it without writing to the keeper.
 */
export const standingNoteRoutes = new Hono<HonoEnv>();

standingNoteRoutes.get("/api/standing-note", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    what_this_is:
      "Attach a dated statement to a subject this store has observed — your door, or a wallet your doors advertise. The statement rides BESIDE the observation on every surface that shows it, and never replaces the observation. Self-serve: prove control, post, done.",
    who_would_use_it:
      "An operator whose payment address is a platform or custodial wallet shared with strangers, and who wants that context to travel with the shared-wallet fact; or any operator who wants their own words beside an observation about their door.",
    host_lane: {
      how: `Serve the sha256 (hex) of your exact statement at https://{your-host}${WELL_KNOWN_NOTE_PATH}, then POST {"subject":"host","host":"{your-host}","statement":"..."} here. Extra content around the hash is fine.`,
      proof: "Control of the host is control of the subject.",
    },
    wallet_lane: {
      how: `POST {"subject":"wallet","address":"0x...","statement":"...","signature":"0x..."} where signature is EIP-191 personal_sign, by that wallet, over the exact challenge below.`,
      challenge_template: noteChallengeText(
        "0x{your-wallet-lowercase}",
        "{sha256-hex-of-your-exact-statement}",
      ),
      proof:
        "Recovery-based, EOA only, same discipline as the credit and claims doors. The challenge binds the statement's hash, so a replayed signature can only re-attach the same words to the same wallet — which is why no nonce is needed.",
      not_yet:
        "Solana addresses: use the host lane for now; the wallet lane is EVM-only today and says so rather than half-working.",
    },
    limits: {
      statement_max_chars: STANDING_NOTE_MAX_CHARS,
      one_note_per_subject:
        "Newest wins. Your words are yours to restate; we keep the current statement, not a history of you.",
      subject_must_be_observed:
        "A note rides an observation. A host or wallet no signed round has met is refused — there is nothing for the note to stand beside.",
    },
    where_it_rides: `${base}/corpus/host/{host}.json — as standing_note (host lane) or payment_address.standing_note (wallet lane).`,
    disputes:
      "A note answers most 'that reads wrong' cases without us. If it cannot, write to the notice desk; outcomes are a dated correction (we were wrong), added context (right but incomplete), or the observation stands — recorded either way.",
  });
});

standingNoteRoutes.post("/api/standing-note", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Send JSON. GET this URL for the shape." }, 400);
  }
  if (!isRecord(body)) {
    return c.json({ error: "Send a JSON object. GET this URL for the shape." }, 400);
  }
  try {
    if (body["subject"] === "host") {
      const note = await attachHostNote(c.env, {
        host: body["host"],
        statement: body["statement"],
      });
      return c.json({
        attached: true,
        note,
        rides_at: `${c.env.STORE_BASE_URL}/corpus/host/${String(body["host"]).trim().toLowerCase()}.json`,
      });
    }
    if (body["subject"] === "wallet") {
      const note = await attachWalletNote(c.env, {
        address: body["address"],
        statement: body["statement"],
        signature: body["signature"],
      });
      return c.json({
        attached: true,
        note,
        rides_at:
          "Every /corpus/host/{host}.json whose door advertises this address, under payment_address.standing_note.",
      });
    }
    return c.json(
      { error: 'subject must be "host" or "wallet". GET this URL for the shape.' },
      400,
    );
  } catch (error) {
    if (error instanceof NoteRefused) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});
