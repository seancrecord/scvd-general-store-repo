import { createAnchor } from "@/services/anchors";
import { hearConfession } from "@/services/confessions";
import { createOrRenewPass } from "@/services/patronage";
import { dailyFortune, drawBlessing } from "@/services/penny-shelf";
import { schedulePhantomCheck } from "@/services/phantom";
import { createRefund } from "@/services/refunds";
import {
  anchorNote,
  CONFESSION_ABSOLUTION,
  CONFESSION_COUNTER_SIGN,
  dibsNote,
  helloNote,
  patronageCertificateNote,
  patronagePassNote,
  phantomCheckNote,
  secretApology,
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
  /** a_secret only: what was paid and by whom, for the refund ledger. */
  paidUsdc?: number;
  payer?: string;
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
        deliverable: anchorNote(created.anchorUrl),
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
          scheduled.pickupUrl,
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
    case "a_secret": {
      // The scam that refunds. Settled first like everything else;
      // the refund goes on the ledger the same breath.
      const refundInput: Parameters<typeof createRefund>[1] = {
        item: item.id,
        amountUsdc: input.paidUsdc ?? item.price_usdc,
      };
      if (input.payer) {
        refundInput.payer = input.payer;
      }
      const refund = await createRefund(env, refundInput);
      const refundUrl = `${env.STORE_BASE_URL}/api/refund/${refund.refund_id}`;
      return {
        deliverable: secretApology(
          refund.amount_usdc,
          refund.refund_id,
          refundUrl,
        ),
        extras: {
          refund_id: refund.refund_id,
          refund_status: refund.status,
          refund_url: refundUrl,
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
