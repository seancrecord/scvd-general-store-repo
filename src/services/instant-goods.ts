import { caseFileNote, storeCaseFile, type CaseFileInput, type SignedCaseFile } from "@/services/case-file";
import { storeProvenanceCheck, type SignedProvenanceCheck } from "@/services/provenance-check";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvPut } from "@/lib/kv-retry";
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
import { storeLaunchCheck } from "@/services/launch-check";
import type { SignedLaunchCheck } from "@/services/launch-check";
import { storeWalletStatement } from "@/services/wallet-statement";
import type { SignedWalletStatement } from "@/services/wallet-statement";
import type { SignedPassportRefresh } from "@/services/passport-refresh";
import type { SignedTrustProfile } from "@/services/trust-profile";
import type { SignedSpotCheck } from "@/services/spot-check";
import { storeMandate } from "@/services/mandates";
import type { SignedMandate } from "@/services/mandates";
import { storeOnpageAudit } from "@/services/onpage-audit";
import type { SignedOnpageAudit } from "@/services/onpage-audit";
import { storeReconciliation } from "@/services/settlement-reconciliation";
import type { SignedReconciliation } from "@/services/settlement-reconciliation";
import type { SignedServiceAudit } from "@/services/service-audit";
import {
  storeGoodBuyerReading,
  type SignedGoodBuyerReading,
} from "@/services/good-buyer";
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
  launchCheckNote,
  openingDayNote,
  mandateNote,
  onpageAuditNote,
  statementNote,
  phantomCheckNote,
  reconciliationNote,
  goodBuyerNote,
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
  /**
   * The wallet that paid. Recorded on the WATCHES so a lost watch id
   * is recoverable at the claims door instead of by buying the thing
   * twice (CV, 2026-08-21).
   */
  payer?: string;
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
  /** good_buyer only: the dry run, already read and signed. */
  goodBuyer?: SignedGoodBuyerReading;
  /** signature_agent_card only: the card, already made and signed. */
  signatureAgentCard?: SignedSignatureAgentCard;
  /** onpage_audit only: the page report, already made and signed. */
  onpageAudit?: SignedOnpageAudit;
  /** launch_check only: the walk record, already made and signed. */
  launchCheck?: SignedLaunchCheck;
  /** the_statement only: the transfer record, already made and signed. */
  walletStatement?: SignedWalletStatement;
  /** passport_refresh only: the observation, already made and signed. */
  passportRefresh?: SignedPassportRefresh;
  /** trust_profile only: the commission record, already gated and signed. */
  trustProfile?: SignedTrustProfile;
  /** spot_check only: the signed reading, already made and bound. */
  spotCheck?: SignedSpotCheck;
  /** the_case_file only: the assembly, already made and signed, and what was asked. */
  caseFile?: SignedCaseFile;
  caseFileInput?: CaseFileInput;
  caseFileReused?: boolean;
  provenanceCheck?: SignedProvenanceCheck;
  /** the_mandate only: the mandate record, already made and signed. */
  mandate?: SignedMandate;
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
      const watch = await startWatch(env, input.targetUrl ?? "", input.payer);
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
      const watch = await startConformanceWatch(
        env,
        input.targetUrl ?? "",
        input.payer,
      );
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
    case "opening_day": {
      /*
       * THE OPENING DAY (roadmap S3): the walk was made and signed
       * upstream so the certificate could bind it; here it is filed,
       * the week opens on the same door, and one row remembers the
       * three so one URL can serve them. The watch starts AFTER the
       * mint on purpose — a failed walk still opens the week (the
       * walk's verdict is the walk's, not a gate), and a failed mint
       * opens nothing, because nothing was sold.
       */
      const walk = input.launchCheck;
      if (!walk) {
        throw new Error("opening_day reached goods with no walk record");
      }
      const certId = input.certId ?? "";
      await storeLaunchCheck(env, walk, certId);
      const watch = await startConformanceWatch(
        env,
        input.targetUrl ?? "",
        input.payer,
      );
      const host = new URL(input.targetUrl ?? "https://invalid.example").host;
      await kvPut(
        env.ORDERS,
        KV_KEYS.openingDay(certId),
        JSON.stringify({
          cert_id: certId,
          host,
          url: input.targetUrl ?? "",
          check_id: walk.check_id,
          watch_id: watch.record.watch_id,
          opened_at: new Date().toISOString(),
        }),
      );
      return {
        deliverable: openingDayNote(walk.verdict, watch.record.ends_at),
        extras: {
          opening_day_url: `/api/opening-day/${certId}`,
          launch_check: {
            check_id: walk.check_id,
            verdict: walk.verdict,
            paid_usd: walk.paid_usd,
            replay_served: walk.replay_served,
            ...(walk.tx_hash ? { tx_hash: walk.tx_hash } : {}),
            check_url: `/api/launch-check/${walk.check_id}`,
          },
          conformance_watch: {
            watch_id: watch.record.watch_id,
            ends_at: watch.record.ends_at,
            history_url: watch.historyUrl,
            first_pass_by:
              "the store's next hourly rounds; one pass a day after that, and the history URL is readable now and fills in as the week goes",
          },
          passport_url: `/passport/${host}`,
          check: walk,
          verify_note:
            "The walk is signed on its own and its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for it. Each daily pass of the watch is signed alone at the history URL. The passport derives from the public corpus and says when its reading goes stale. Nothing here is a badge.",
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
    case "the_mandate": {
      // Recorded and signed upstream so its evidence hash could be
      // bound into the certificate; filed here, after the mint, so
      // the envelope carries the cert id — the Once-Over's discipline.
      const record = input.mandate;
      if (!record) {
        throw new Error("the_mandate reached goods with no record");
      }
      await storeMandate(env, record, input.certId ?? "");
      return {
        deliverable: mandateNote(),
        extras: {
          mandate_id: record.mandate_id,
          mandate: record,
          mandate_url: `/api/mandate/${record.mandate_id}`,
          cite_it: `Put mandate_id=${record.mandate_id} on any later purchase here and it rides that certificate, signed — the store refuses ids it cannot resolve, so the citation always lands on this record.`,
          verify_note:
            "Two ways to check this, neither of which requires trusting us or whoever submitted it. The record is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the mandate too. The record URL serves it free, forever — its own limits printed on it.",
        },
      };
    }
    case "passport_refresh": {
      const refresh = input.passportRefresh;
      if (!refresh) {
        throw new Error("passport_refresh reached goods with no observation");
      }
      const observed = refresh.observation;
      return {
        deliverable: `A fresh look at ${observed.host}, taken ${observed.observed_at} by the census's own instrument: ${observed.verdict.toUpperCase()}. The passport at /passport/${observed.host} re-derives from this observation immediately${observed.verdict === "ready" ? ", and the chip reads FRESH" : " — and because the finding is not ready, the passport refuses and the chip is dark. The check was bought; the verdict never is"}.`,
        extras: {
          refresh: refresh.observation,
          evidence_hash: refresh.evidence_hash,
          signature: refresh.signature,
          signature_jcs: refresh.signature_jcs,
          public_key: refresh.public_key,
          passport_url: `/passport/${observed.host}`,
          chip_url: `/badges/passport/${observed.host}.svg`,
          verify_note:
            "The observation is signed on its own: verify signed_payload semantics per /spec/scvd-attestation/v1 against the key at /.well-known/scvd-signing-key. Its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the observation too.",
        },
      };
    }
    case "spot_check": {
      const spot = input.spotCheck;
      if (!spot) {
        throw new Error("spot_check reached goods with no record");
      }
      const h = spot.record.history;
      const seen = spot.record.not_observed
        ? "We have never observed this host — that absence is the finding, recorded and signed."
        : `Rounds probed: ${h.rounds_probed} of ${h.rounds_since_first_sighting} since first sighting; last observed ${h.last_observed ?? "never"}.`;
      return {
        deliverable: `Spot check for ${spot.record.host}, read from the books at ${spot.record.asked_at}. ${seen} The full signed record rides in extras; the same facts serve free at ${spot.record.free_twin_url} — what you bought is the signed, certificate-bound copy.`,
        extras: {
          spot_check: spot.record,
          evidence_hash: spot.evidence_hash,
          signed_payload: spot.signed_payload,
          signature: spot.signature,
          signature_jcs: spot.signature_jcs,
          public_key: spot.public_key,
          how_to_verify:
            "ed25519_verify(signed_payload, signature) against public_key, also served at /.well-known/scvd-signing-key. The record's evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the reading too.",
        },
      };
    }
    case "provenance_check": {
      const prov = input.provenanceCheck;
      if (!prov) {
        throw new Error("provenance_check reached goods with no record");
      }
      await storeProvenanceCheck(env, prov, input.certId ?? "");
      const r = prov.record;
      const last = r.weeks[r.weeks.length - 1];
      const seen = !last
        ? "The signed chain has never seen a door advertise this address — that absence is the finding, recorded and signed."
        : `Advertised by ${last.doors.length} door${last.doors.length === 1 ? "" : "s"} in the latest week it appears (${last.week}), across ${r.weeks.length} signed week${r.weeks.length === 1 ? "" : "s"}; ${r.drift.length} dated change${r.drift.length === 1 ? "" : "s"} in the pairings or terms.`;
      return {
        deliverable: `The company this address keeps, read from the signed chain at ${r.asked_at}. ${seen} The full signed record rides in extras and is served at /api/provenance-check/${r.provenance_id}, to you; nothing about it is published by us.`,
        extras: {
          provenance_check: r,
          record_url: `/api/provenance-check/${r.provenance_id}`,
          evidence_hash: prov.evidence_hash,
          signed_payload: prov.signed_payload,
          signature: prov.signature,
          signature_jcs: prov.signature_jcs,
          public_key: prov.public_key,
          how_to_verify:
            "ed25519_verify(signed_payload, signature) against public_key, also served at /.well-known/scvd-signing-key. The record's evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the reading too; how_to_rederive on the record rebuilds every line from the public chain.",
        },
      };
    }
    case "trust_profile": {
      const profile = input.trustProfile;
      if (!profile) {
        throw new Error("trust_profile reached goods with no record");
      }
      const r = profile.record;
      return {
        deliverable: `Your hosted trust profile for ${r.host} is standing at ${r.profile_url} — term ends ${r.expires.slice(0, 10)}, purchase ${r.renewals} of the record. The page aggregates your live passport, the freshness chip, and the signed observation history; it derives from the same corpus everyone reads free, so what it shows moves with the evidence, both directions. Renew any time — an early renewal extends the term from its current end, never from today.`,
        extras: {
          profile: r,
          evidence_hash: profile.evidence_hash,
          signature: profile.signature,
          signature_jcs: profile.signature_jcs,
          public_key: profile.public_key,
          profile_url: `/profiles/${r.host}`,
          passport_url: `/passport/${r.host}`,
          chip_url: `/badges/passport/${r.host}.svg`,
          verify_note:
            "The commission record is signed on its own: verify signed_payload semantics per /spec/scvd-attestation/v1 against the key at /.well-known/scvd-signing-key. Its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the record too.",
        },
      };
    }
    case "the_statement": {
      // Read and signed upstream so its evidence hash could be bound
      // into the certificate; filed here, after the mint, so the
      // envelope carries the cert id — the Once-Over's discipline.
      const statement = input.walletStatement;
      if (!statement) {
        throw new Error("the_statement reached goods with no record");
      }
      await storeWalletStatement(env, statement, input.certId ?? "");
      return {
        deliverable: statementNote(statement.coverage),
        extras: {
          statement_id: statement.statement_id,
          coverage: statement.coverage,
          inflow_count: statement.inflows.count,
          outflow_count: statement.outflows.count,
          statement,
          statement_url: `/api/statement/${statement.statement_id}`,
          verify_note:
            "Three ways to check this, none of which requires trusting us. The record is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. Its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the statement too. And every row is a Base transaction hash — the chain's copy is nobody's to edit, ours included.",
        },
      };
    }
    case "launch_check": {
      // Walked and signed upstream so its evidence hash could be
      // bound into the certificate; filed here, after the mint, so
      // the envelope carries the cert id — the Once-Over's discipline.
      const walk = input.launchCheck;
      if (!walk) {
        throw new Error("launch_check reached goods with no record");
      }
      await storeLaunchCheck(env, walk, input.certId ?? "");
      return {
        deliverable: launchCheckNote(
          walk.verdict,
          walk.replay_served,
          walk.tx_hash_status,
        ),
        extras: {
          check_id: walk.check_id,
          verdict: walk.verdict,
          paid_usd: walk.paid_usd,
          // Top-level so a machine reading extras never has to dig
          // into `check` for the one finding that costs money.
          replay_served: walk.replay_served,
          ...(walk.tx_hash ? { tx_hash: walk.tx_hash } : {}),
          check: walk,
          check_url: `/api/launch-check/${walk.check_id}`,
          verify_note:
            "Three ways to check this, none of which requires trusting us. The record is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. Its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the walk too. And if money moved, the settlement is on Base from the field wallet named in the record — the chain's copy is nobody's to edit.",
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
          // The displayable half (2026-08-20): an embeddable dated
          // label linking back to this signed report. Free forever,
          // renders whatever the verdict was — badges here are
          // observations, not endorsements.
          badge_url: `/badges/audit/${audit.audit_id}.svg`,
          verify_note:
            "Two ways to check this, neither of which requires trusting us or whoever commissioned it. The report is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And its evidence_hash is bound into the certificate for this purchase, so /api/verify/{cert_id} answers for the report too — the endpoint that already existed, not a new one. The report URL serves the record free, forever.",
        },
      };
    }
    case "good_buyer": {
      /*
       * Already read and signed upstream, so its evidence hash could
       * be bound into the certificate. Storage happens HERE, after
       * the mint, so the envelope carries the cert id — the binding
       * runs one direction, through `attests`.
       */
      const reading = input.goodBuyer;
      if (!reading) {
        throw new Error("good_buyer reached goods with no reading");
      }
      await storeGoodBuyerReading(env, reading, input.certId ?? "");
      return {
        deliverable: goodBuyerNote(reading.verdict),
        extras: {
          reading_id: reading.reading_id,
          verdict: reading.verdict,
          reading,
          report_url: `/api/good-buyer/${reading.reading_id}`,
          verify_note:
            "Two ways to check this, neither of which requires trusting us or whoever commissioned it. The reading is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. And its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for the reading too. The accepts are printed as served, so the selection can be re-derived from the artifact by anyone holding a copy of @x402/core — including without us. The report URL serves the record free, forever.",
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
    case "the_case_file": {
      // Assembled and signed upstream so its evidence hash could go into
      // the certificate; filed here, after the mint, so the record
      // carries the cert id. A reused case (same tx and mandate inside a
      // day) is filed again under the same id with the new cert.
      const caseFile = input.caseFile;
      if (!caseFile || !input.caseFileInput) {
        throw new Error("the_case_file reached goods with no assembly");
      }
      await storeCaseFile(env, caseFile, input.certId ?? "", input.caseFileInput);
      return {
        deliverable: caseFileNote(caseFile),
        extras: {
          case_id: caseFile.case_id,
          case_url: `/case/${caseFile.case_id}`,
          sections_present: ["settlement", "reconciliation", "mandate", "door", "delivery"].filter(
            (section) => (caseFile[section as keyof SignedCaseFile] as { presence: { present: boolean } }).presence.present,
          ),
          gaps: caseFile.gaps,
          ...(caseFile.conflict ? { conflict: caseFile.conflict } : {}),
          ...(input.caseFileReused ? { reused: true, reused_note: "The same tx_hash and mandate_id were assembled inside the last 24 hours; this is that case file, under the same id, bound to this new certificate." } : {}),
          case_file: caseFile,
          verify_note:
            "The file is signed on its own: re-serialize every field above `signature` against the key at /.well-known/scvd-signing-key. Its evidence_hash is bound into this purchase's certificate, so /api/verify/{cert_id} answers for it too. Read `gaps` before anything else: the sections this store could not observe are the file's most important fact.",
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
        // The bid. This shelf is pay-what-it-deserves and the front
        // page derives the day's top tag from what was actually paid.
        ...(typeof input.paidUsdc === "number"
          ? { paidUsdc: input.paidUsdc }
          : {}),
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
