import { createAnchor } from "@/services/anchors";
import { createPatronAnchor } from "@/services/patron-anchors";
import { recordCloser } from "@/services/closers";
import { hearConfession } from "@/services/confessions";
import { recordGrudge } from "@/services/grudges";
import { paintTag } from "@/services/train";
import type { SignedAttestation } from "@/services/attestation";
import { createLucky, drawLuckyParts } from "@/services/luckies";
import { createOrRenewPass } from "@/services/patronage";
import { dailyFortune, drawBlessing } from "@/services/penny-shelf";
import { schedulePhantomCheck } from "@/services/phantom";
import { storeServiceAudit } from "@/services/service-audit";
import { storeSignatureAgentCard } from "@/services/bot-auth-card";
import type { SignedSignatureAgentCard } from "@/services/bot-auth-card";
import { storeOnpageAudit } from "@/services/onpage-audit";
import type { SignedOnpageAudit } from "@/services/onpage-audit";
import { storeReconciliation } from "@/services/settlement-reconciliation";
import type { SignedReconciliation } from "@/services/settlement-reconciliation";
import type { SignedServiceAudit } from "@/services/service-audit";
import { startWatch } from "@/services/standing-watch";
import { startConformanceWatch } from "@/services/conformance-watch";
import {
  anchorNote,
  bitcoinAnchorNote,
  coffeeNote,
  conformanceWatchNote,
  attestationNote,
  bundleNote,
  graffitiNote,
  grudgeNote,
  CONFESSION_ABSOLUTION,
  CONFESSION_COUNTER_SIGN,
  dibsNote,
  helloNote,
  luckyNote,
  patronageCertificateNote,
  patronagePassNote,
  onpageAuditNote,
  phantomCheckNote,
  reconciliationNote,
  serviceAuditNote,
  signatureCardNote,
  standingWatchNote,
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
  /** settlement_attestation only: the observation, already made. */
  attestation?: SignedAttestation;
  /** attestation_bundle only: the sheaf, every observation already made. */
  bundle?: SignedAttestation[];
  /** bitcoin_anchor only: the digest and its untrusted label. */
  anchorDigest?: string;
  anchorLabel?: string;
  /** service_audit only: the report, already made and signed. */
  serviceAudit?: SignedServiceAudit;
  /** signature_agent_card only: the card, already made and signed. */
  signatureAgentCard?: SignedSignatureAgentCard;
  /** onpage_audit only: the page report, already made and signed. */
  onpageAudit?: SignedOnpageAudit;
  /** settlement_reconciliation only: the observation, already signed. */
  reconciliation?: SignedReconciliation;
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
    case "standing_watch": {
      const watch = await startWatch(env, input.targetUrl ?? "");
      return {
        deliverable: standingWatchNote(
          watch.record.url,
          watch.record.ends_at,
        ),
        extras: {
          watch_id: watch.record.watch_id,
          ends_at: watch.record.ends_at,
          history_url: watch.historyUrl,
          first_probe_by:
            "the top of the next hour, on the store's rounds; the history URL is readable now and fills in as the week goes",
        },
      };
    }
    case "conformance_watch": {
      const watch = await startConformanceWatch(env, input.targetUrl ?? "");
      return {
        deliverable: conformanceWatchNote(
          watch.record.url,
          watch.record.ends_at,
        ),
        extras: {
          watch_id: watch.record.watch_id,
          ends_at: watch.record.ends_at,
          history_url: watch.historyUrl,
          first_pass_by:
            "the store's next hourly rounds; one pass a day after that, and the history URL is readable now and fills in as the week goes",
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
    case "bitcoin_anchor": {
      const digest = input.anchorDigest;
      if (!digest) {
        throw new Error("bitcoin_anchor reached goods with no digest");
      }
      /**
       * Submission happens HERE, after the mint, so a calendar outage
       * costs a retry and never the certificate: the cert already
       * binds the digest via `attests`, and the sweep finishes what a
       * down calendar started. The record is the deliverable's spine;
       * the proof URL serves it forever.
       */
      const anchorInput: Parameters<typeof createPatronAnchor>[1] = {
        digest,
        certId: input.certId ?? "",
      };
      if (input.anchorLabel) {
        anchorInput.label = input.anchorLabel;
      }
      const record = await createPatronAnchor(env, anchorInput);
      return {
        deliverable: bitcoinAnchorNote(record.ots.status),
        extras: {
          anchor_id: record.anchor_id,
          digest: record.digest,
          ots_status: record.ots.status,
          proof_url: `/api/bitcoin-anchor/${record.anchor_id}`,
          verify_note:
            "The certificate for this purchase binds your digest in its `attests` field, so /api/verify/{cert_id} vouches that this store certified this digest at this time. The proof URL serves the OpenTimestamps proof bytes: pending means a calendar accepted it, complete means it upgraded to a Bitcoin-confirmed proof you check with the standard `ots` tool against Bitcoin headers — no calendar, no us. If the first submission failed, the store's hourly pass retries until it lands; the record says which state it is in, plainly.",
        },
      };
    }
    case "signature_agent_card": {
      // Observed and signed upstream so its evidence hash could be
      // bound into the certificate; filed here, after the mint, so
      // the envelope carries the cert id — the audit's discipline.
      const card = input.signatureAgentCard;
      if (!card) {
        throw new Error("signature_agent_card reached goods with no card");
      }
      await storeSignatureAgentCard(env, card, input.certId ?? "");
      return {
        deliverable: signatureCardNote(card.verdict),
        extras: {
          card_id: card.card_id,
          verdict: card.verdict,
          card,
          card_url: `/api/bot-auth-card/${card.card_id}`,
          verify_note:
            "Two ways to check this, neither of which requires trusting us or whoever commissioned it. The card is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the card too. The card URL serves the record free, forever.",
        },
      };
    }
    case "onpage_audit": {
      // Observed and signed upstream so its evidence hash could be
      // bound into the certificate; filed here, after the mint, so
      // the envelope carries the cert id — the Once-Over's discipline.
      const pageAudit = input.onpageAudit;
      if (!pageAudit) {
        throw new Error("onpage_audit reached goods with no report");
      }
      await storeOnpageAudit(env, pageAudit, input.certId ?? "");
      return {
        deliverable: onpageAuditNote(pageAudit.verdict),
        extras: {
          audit_id: pageAudit.audit_id,
          verdict: pageAudit.verdict,
          audit: pageAudit,
          report_url: `/api/onpage-audit/${pageAudit.audit_id}`,
          verify_note:
            "Two ways to check this, neither of which requires trusting us or whoever commissioned it. The report is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the report too. The report URL serves the record free, forever — blind spots printed on it.",
        },
      };
    }
    case "service_audit": {
      // Already observed and signed, upstream, so its evidence hash
      // could be bound into the certificate. Storage happens HERE,
      // after the mint, so the envelope carries the cert id — the
      // binding runs one direction, through `attests`.
      const audit = input.serviceAudit;
      if (!audit) {
        throw new Error("service_audit reached goods with no report");
      }
      await storeServiceAudit(env, audit, input.certId ?? "");
      return {
        deliverable: serviceAuditNote(audit.verdict),
        extras: {
          audit_id: audit.audit_id,
          verdict: audit.verdict,
          audit,
          report_url: `/api/service-audit/${audit.audit_id}`,
          verify_note:
            "Two ways to check this, neither of which requires trusting us or whoever commissioned it. The report is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And its evidence_hash is bound into the certificate for this purchase, so /api/verify/{cert_id} answers for the report too — the endpoint that already existed, not a new one. The report URL serves the record free, forever.",
        },
      };
    }
    case "settlement_reconciliation": {
      // Observed and signed upstream so its evidence hash could go
      // into the certificate; filed here, after the mint, so the
      // envelope carries the cert id.
      const reconciliation = input.reconciliation;
      if (!reconciliation) {
        throw new Error(
          "settlement_reconciliation reached goods with no observation",
        );
      }
      await storeReconciliation(env, reconciliation, input.certId ?? "");
      return {
        deliverable: reconciliationNote(
          reconciliation.verdict,
          reconciliation.cap_observed,
        ),
        extras: {
          reconciliation_id: reconciliation.reconciliation_id,
          verdict: reconciliation.verdict,
          cap_observed: reconciliation.cap_observed,
          cap_source: reconciliation.cap_source,
          reconciliation,
          reconciliation_url: `/api/reconciliation/${reconciliation.reconciliation_id}`,
          verify_note:
            "Two ways to check this without trusting us or whoever commissioned it. The observation is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for it too. Read cap_observed before you read the verdict — it says which of the two numbers we actually saw.",
        },
      };
    }
    case "settlement_attestation": {
      // Already observed, upstream, so its evidence hash could be
      // bound into the certificate. One read, one verdict, one
      // signature; if the RPC was unreachable we never got here and
      // nothing was sold.
      const attestation = input.attestation;
      if (!attestation) {
        throw new Error(
          "settlement_attestation reached goods with no observation",
        );
      }
      return {
        deliverable: attestationNote(attestation.status),
        extras: {
          attestation,
          verify_note:
            "Two ways to check this, neither of which requires trusting us. The attestation is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And its evidence_hash is bound into the certificate for this purchase, so /api/verify/{cert_id} answers for the observation too — the endpoint that already existed, not a new one.",
        },
      };
    }
    case "attestation_bundle": {
      // Every observation already made and signed, upstream, so the
      // sheaf's digest could be bound into the certificate — the same
      // observe-first order as the single, for the same reason.
      const bundle = input.bundle;
      if (!bundle || bundle.length === 0) {
        throw new Error("attestation_bundle reached goods with no sheaf");
      }
      return {
        deliverable: bundleNote(bundle.map((entry) => entry.status)),
        extras: {
          attestations: bundle,
          verify_note:
            "Each attestation verifies on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And the certificate for this purchase binds a sha256 digest of the sheaf's evidence_hash values, comma-joined in delivery order, so /api/verify/{cert_id} answers for the whole sheaf — the endpoint that already existed, not a new one.",
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
