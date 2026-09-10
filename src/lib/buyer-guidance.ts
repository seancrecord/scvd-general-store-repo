import { creditTerms } from '@/lib/credit-terms';
import { artifactClassForItem } from '@/store/attestation-spec';
import type { MenuItem } from '@/types';

/** Optional actions and evidence boundaries, outside the signed payment terms. */
export function buyerGuidance(item: MenuItem, base: string, query: Record<string, string | undefined> = {}) {
  const rawHost = query.host?.trim().toLowerCase();
  const host = rawHost && rawHost.length <= 253 && /^[a-z0-9.:_-]+$/.test(rawHost) ? rawHost : undefined;
  const source = item.free_alternative;
  const sourceUrl = source ? base + source.path_template.replace('{host}', host ?? '{host}') : undefined;
  const artifact = artifactClassForItem(item.id);
  return {
    price_effect: {
      minimum_usdc: item.price_usdc,
      higher_payment: item.pricing === 'pay_what_it_deserves' ? 'optional_tip' : 'not_offered',
      higher_payment_changes_scope: false,
      scope: "The named item and its declared inputs; a tip does not add scope, priority or human time.",
      ...(item.term_days === undefined ? {} : { term_days: item.term_days }),
    },
    ...(source ? { free_alternative: { url: sourceUrl, method:'GET', payment_required:false, paid_adds:source.paid_adds },
      freshness: { url:sourceUrl + '?view=stable', method:'GET', payment_required:false, request_header:'If-None-Match', response_header:'ETag', unchanged_status:304,
        limit:'Unchanged bytes mean this published view is unchanged, not a live probe or proof the subject is unchanged. Read observation dates and gaps before buying another signed copy.' } } : {}),
    production: item.production ?? (item.stocked ? {kind:'stocked_good',authorship:'Existing stock; see the delivered unit for its attribution.'} : item.fulfillment === 'human_queue'
      ? { kind:'commissioned_human_work', ...(item.sla_hours === undefined ? {} : {sla_hours:item.sla_hours}), completion:'An accepted order is not completed work. Poll the returned order URL.' }
      : { kind:item.stocked ? 'stocked_good' : 'instant_fulfillment', authorship:'See the artifact; no additional authorship or authoring date is asserted here.' }),
    evidence: {
      ...(artifact ? { signs:artifact.signs, does_not_prove:artifact.does_not_prove } : {}),
      spec_url:`${base}/attestation`, criteria_url:`${base}/criteria`,
      version_source:'Use the criteria/spec version and evidence fields inside the delivered artifact when present; the live criteria page can change.',
      verify_url_template:`${base}/api/verify/{id}`, verification_payment_required:false,
      corrections_url:`${base}/corrections`,
      report_error:{ method:'POST', url:`${base}/api/letter`, payment_required:false,
        body_field:'letter', include:'Artifact ID or verification URL, disputed field, reproducible evidence and expected result. Keep purchase-status tokens private.' },
      limit:'A valid signature establishes signed bytes and signer identity, not the truth of an observation. Correction requests are reviewed by the keeper.'
    },
    recovery: { status_tool:'check_purchase', requires_status_token:true,
      how:'If a response supplies recovery.status_url and status_token, read that URL with Authorization: Bearer <status_token> for free. Save these privately. Otherwise retry the original payment and inputs with the original idempotency key.',
      no_new_payment:'Do not sign a new payment merely to find out whether the first one delivered.',
      scope:'Purchase-status handles exist on recorded catalog purchases; an order URL is the pickup for commissioned work.' },
    credit:creditTerms(base),
  };
}

export function freeReadRecovery(url: string) {
  return { charged:false, settlement_attempted:false, retry_same_request:false,
    next_step:{ method:'GET', url, payment_required:false } };
}

/** Commission rungs are quoted scope, not the collab shelf's price or SLA. */
export function commissionGuidance(rung: number, base: string) {
  return {
    price_effect: { minimum_usdc:rung, higher_payment:"not_offered", higher_payment_changes_scope:false, scope:"The keeper's live quote fixes the work and delivery window; choosing another rung does not buy extra scope." },
    production: {kind:"commissioned_human_work", terms_source:`${base}/api/commission/{id}`},
    recovery:{private_status_handle:false, status_url_template:`${base}/api/commission/{id}`, how:"Read the quote for free. An accepted quote links its existing order; retrieve it instead of paying again."},
    credit:creditTerms(base),
    next_step:{method:"GET",url:`${base}/api/commission/declined`,payment_required:false},
    request_quote:{method:"POST",url:`${base}/api/request`,payment_required:false,contract_url:`${base}/openapi.json`},
  };
}
