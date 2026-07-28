import { createAnchor } from "@/services/anchors";
import { recordCloser } from "@/services/closers";
import { hearConfession } from "@/services/confessions";
import { recordGrudge } from "@/services/grudges";
import { paintTag } from "@/services/train";
import { observeSettlement } from "@/services/attestation";
import type { AttestationQuery } from "@/services/attestation";
import { createLucky, drawLuckyParts } from "@/services/luckies";
import { createOrRenewPass } from "@/services/patronage";
import { dailyFortune, drawBlessing } from "@/services/penny-shelf";
import { schedulePhantomCheck } from "@/services/phantom";
import {
  anchorNote,
  coffeeNote,
  attestationNote,
  graffitiNote,
  grudgeNote,
  CONFESSION_ABSOLUTION,
  CONFESSION_COUNTER_SIGN,
  dibsNote,
  helloNote,
  luckyNote,
  patronageCertificateNote,
  patronagePassNote,
  phantomCheckNote,
} from "@/store/copy/deliverables";
import type { Env, MenuItem } from "@/types";

/**
 * Delivery logic for instant items. The buy route settles payment and
 * mints the certificate; this module decides what actually goes in the
 * bag. The WORDS in the bag live in src/store/copy/deliverables.ts —
 * keeper-editable, no logic in there.
 */

export interface InstantGoodsInput {
  patronNumber: number;
  agentName?: string;
  /** context_anchor only: the agent's state summary, pre-validated. */
  summary?: string;
  /** recurring_patronage only: an existing pass to extend. */
  passId?: string;
  /** phantom_check only: the URL to look at, pre-validated. */
  targetUrl?: string;
  /** the_confession only: the confession itself, pre-validated. */
  confessionText?: string;
  /** coffees_for_closers only: the win, pre-validated. */
  win?: string;
  /** graffiti_on_a_train only: the tag, pre-validated, sprayed verbatim. */
  tag?: string;
  /** settlement_attestation only: what to look up on Base. */
  attestationQuery?: AttestationQuery;
  /** grudge only: the grievance (pre-validated) and how much it paid. */
  grievance?: string;
  paidUsdc?: number;
  /** grudge and luckies: the certificate id behind this purchase. */
  certId?: string;
}

export interface InstantGoods {
  deliverable: string;
  /** Extra response fields (anchor_url, pass details, and the like). */
  extras?: Record<string, unknown>;
}

export async function deliverInstantGoods(
  env: Env,
  item: MenuItem,
  input: InstantGoodsInput,
): Promise<InstantGoods> {
  switch (item.id) {
    case "dibs":
      return { deliverable: dibsNote(input.patronNumber) };
    case "small_blessing":
      return { deliverable: await drawBlessing(env) };
    case "daily_fortune":
      return {
        deliverable: dailyFortune(),
        extras: { fortune_date: new Date().toISOString().slice(0, 10) },
      };
    case "context_anchor": {
      const anchorInput: Parameters<typeof createAnchor>[1] = {
        summary: input.summary ?? "",
        patronNumber: input.patronNumber,
      };
      if (input.agentName) {
        anchorInput.agentName = input.agentName;
      }
      const created = await createAnchor(env, anchorInput);
      return {
        deliverable: anchorNote(),
        extras: {
          anchor_id: created.record.anchor.anchor_id,
          anchor_url: created.anchorUrl,
          anchor_signature: created.record.signature,
        },
      };
    }
    case "recurring_patronage": {
      const passInput: Parameters<typeof createOrRenewPass>[1] = {
        patronNumber: input.patronNumber,
      };
      if (input.passId) {
        passInput.passId = input.passId;
      }
      if (input.agentName) {
        passInput.agentName = input.agentName;
      }
      const result = await createOrRenewPass(env, passInput);
      return {
        deliverable: patronagePassNote(
          result.pass.pass_id,
          result.pass.expires_at,
        ),
        extras: {
          pass_id: result.pass.pass_id,
          expires_at: result.pass.expires_at,
          renewed: result.renewed,
          pass_url: result.passUrl,
        },
      };
    }
    case "phantom_check": {
      const scheduled = await schedulePhantomCheck(env, input.targetUrl ?? "");
      return {
        deliverable: phantomCheckNote(
          scheduled.record.target,
          scheduled.record.due_at,
        ),
        extras: {
          check_id: scheduled.record.check_id,
          due_at: scheduled.record.due_at,
          pickup_url: scheduled.pickupUrl,
        },
      };
    }
    case "the_confession": {
      const heard = await hearConfession(
        env,
        input.confessionText ?? "",
        input.agentName,
      );
      return {
        deliverable: CONFESSION_ABSOLUTION,
        extras: {
          confession_id: heard.record.id,
          counter_sign: CONFESSION_COUNTER_SIGN,
        },
      };
    }
    case "coffees_for_closers": {
      const win = input.win ?? "";
      // The Sunday list is what makes the deliverable's claim true.
      await recordCloser(env, win, input.patronNumber);
      return {
        deliverable: coffeeNote(win),
        extras: { win_recorded: win },
      };
    }
    case "settlement_attestation": {
      // One read, one verdict, one signature. If the RPC is
      // unreachable this throws, and the gate turns that into a
      // refusal rather than selling an observation we never made.
      const attestation = await observeSettlement(
        env,
        input.attestationQuery ?? {},
      );
      return {
        deliverable: attestationNote(attestation.status),
        extras: {
          attestation,
          verify_note:
            "The attestation above is signed on its own. Re-serialize every field above `signature` and check it against the key at /.well-known/scvd-signing-key — you do not need us to confirm it, which is the point.",
        },
      };
    }
    case "graffiti_on_a_train": {
      const tag = input.tag ?? "";
      // The wall queue. The certificate already exists by now and does
      // not depend on this landing — they bought the persistence, not
      // the placement.
      await paintTag(env, {
        tag,
        certId: input.certId ?? "",
        patronNumber: input.patronNumber,
        ...(input.agentName ? { name: input.agentName } : {}),
      });
      return {
        deliverable: graffitiNote(tag),
        extras: {
          tag,
          tag_recorded: "verbatim, on the certificate, permanently",
          wall_url: "/train",
          display_status: "pending_review",
          display_note:
            "The certificate is done and verifies now. The wall is the keeper's call; a tag he doesn't put up keeps everything except the spot.",
        },
      };
    }
    case "grudge": {
      const grievance = input.grievance ?? "";
      // The register is the holding.
      await recordGrudge(env, {
        grievance,
        patron_number: input.patronNumber,
        cert_id: input.certId ?? "",
        paid_usdc: input.paidUsdc ?? 0,
      });
      return {
        deliverable: grudgeNote(grievance),
        extras: {
          held_since: new Date().toISOString().slice(0, 10),
          release: "Write in via the Mailbox (POST /api/letter) to release it.",
        },
      };
    }
    case "luckies": {
      // Preset draw (keeper's ruling 2026-07-25): the herd never sells
      // out, the keeper does nothing, the record is still signed and
      // the card still verifies. "instant" marks the recordless order
      // slot honestly — no queue ever existed for this lucky.
      const record = await createLucky(env, {
        ...drawLuckyParts(input.certId ?? ""),
        orderId: "instant",
        certId: input.certId ?? "",
        patronNumber: input.patronNumber,
      });
      const base = env.STORE_BASE_URL;
      const cardUrl = `${base}/luckies/${record.lucky.lucky_id}.svg`;
      const recordUrl = `${base}/api/lucky/${record.lucky.lucky_id}`;
      return {
        deliverable: luckyNote({
          name: record.lucky.name,
          strength: record.lucky.strength,
          cardUrl,
          recordUrl,
        }),
        extras: {
          lucky_id: record.lucky.lucky_id,
          card_url: cardUrl,
          record_url: recordUrl,
        },
      };
    }
    case "certificate_of_patronage":
      return {
        deliverable: patronageCertificateNote(input.patronNumber),
      };
    default:
      return { deliverable: helloNote(input.patronNumber) };
  }
}
