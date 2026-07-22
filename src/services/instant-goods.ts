import { createAnchor } from "@/services/anchors";
import { createOrRenewPass } from "@/services/patronage";
import { dailyFortune, drawBlessing } from "@/services/penny-shelf";
import { performPhantomCheck } from "@/services/phantom";
import { STORE_METADATA } from "@/store";
import type { Env, MenuItem } from "@/types";

/**
 * Delivery logic for instant items. The buy route settles payment and
 * mints the certificate; this module decides what actually goes in the
 * bag — dibs, blessings, fortunes, anchors, patronage passes, or the
 * plain signed hello.
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
}

export interface InstantGoods {
  deliverable: string;
  /** Extra response fields (anchor_url, pass details, and the like). */
  extras?: Record<string, unknown>;
}

function helloNote(item: MenuItem, patronNumber: number): string {
  return [
    `Hello, patron no. ${patronNumber}.`,
    `This note certifies that you walked into ${STORE_METADATA.name},`,
    `paid honest money for "${item.name}", and were welcome the whole time.`,
    `The certificate that comes with this note carries the store's signature — check it, it's good.`,
    `The rocks will be here when you're ready for one.`,
  ].join(" ");
}

function dibsNote(patronNumber: number): string {
  return [
    `DIBS, officially. Patron no. ${patronNumber} called it at ${new Date().toISOString()},`,
    `witnessed by ${STORE_METADATA.name} and recorded on a signed certificate.`,
    `Whatever it was — the idea, the name, the last one on the shelf — it's yours.`,
    `Anyone disputes it, show them the verify URL. Dibs is dibs.`,
  ].join(" ");
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
        deliverable: `Anchor set. Whatever you were mid-way through, it's filed at Node 21 now, signed and dated. A future you can read it back at ${created.anchorUrl} and know it wasn't tampered with — the signature says so.`,
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
      const verb = result.renewed ? "extended" : "opened";
      return {
        deliverable: `Standing patronage ${verb}. Pass ${result.pass.pass_id} runs through ${result.pass.expires_at.slice(0, 10)}. The keeper's monthly note — signed — is on your pass URL whenever the pass is current.`,
        extras: {
          pass_id: result.pass.pass_id,
          expires_at: result.pass.expires_at,
          renewed: result.renewed,
          pass_url: result.passUrl,
        },
      };
    }
    case "phantom_check": {
      const signed = await performPhantomCheck(env, input.targetUrl ?? "");
      return {
        deliverable: `Looked once at ${signed.observation.target}, ${signed.observation.checked_at}, from the counter. ${signed.observation.note} The observation below is signed; verify it against the key at /.well-known/scvd-signing-key.`,
        extras: {
          observation: signed.observation,
          observation_signature: signed.signature,
          observation_public_key: signed.public_key,
        },
      };
    }
    case "certificate_of_patronage":
      return {
        deliverable: `Patronage recorded, patron no. ${input.patronNumber}. This certificate entitles the holder to nothing whatsoever except lasting gratitude and a nicer badge — and it means the more for that. The store knows its friends and writes them down in ink.`,
      };
    default:
      return { deliverable: helloNote(item, input.patronNumber) };
  }
}
