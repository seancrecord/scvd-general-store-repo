import { relatedOfferPaths } from "@/store/offer-paths";
import { getMenuItem } from "@/store";
import { shelfForItem } from "@/lib/mcp-tools";
import type { StoredSpotEvidence } from "@/services/spot-evidence";
import type { SignedSpotCheck } from "@/services/spot-check";

export function spotReadings(value: StoredSpotEvidence): SignedSpotCheck[] {
  if (value.kind === "spot_check") return [value.report];
  return value.report.record.kind === "change_check" ? [value.report.record.current] : value.report.record.readings;
}
export function spotFollowUp(base: string, certId: string, value: StoredSpotEvidence) {
  const readings = spotReadings(value), hosts = readings.map(row => row.record.host);
  const artifactUrl = `${base}/api/spot-checks/${encodeURIComponent(certId)}`;
  const known = readings.reduce((n, row) => n + row.record.history.rounds_probed, 0);
  const hostSummary = readings.map(row => {
    // Legacy history.last_observed can fall back to the round's seal date.
    // A handoff must not silently turn publication into observation.
    const dated = row.record.history.timeline.filter(round => round.probed && round.observed_at && Number.isFinite(Date.parse(round.observed_at)))
      .sort((a,b) => Date.parse(b.observed_at!) - Date.parse(a.observed_at!));
    const when = dated[0] ? `last dated observation ${dated[0].observed_at}` : "observation date unknown";
    return `${row.record.host}: ${row.record.history.rounds_probed} observed rounds of ${row.record.history.rounds_since_first_sighting} since first sighting; ${when}.`;
  }).join(" ");
  const comparison = value.kind !== "spot_check" && value.report.record.kind === "change_check" ? value.report.record.comparison : null;
  const conclusion = comparison ? {
    no_new_observations: "No new recorded observations; this does not mean the endpoint stayed unchanged.",
    new_observations_same_findings: "New recorded observations, with the same compared findings; unobserved intervals and omitted fields remain unknown.",
    changed: `Recorded findings changed: ${comparison.changed_fields.join(", ")}. This is not a safety verdict.`,
    not_comparable: "These readings cannot support a like-for-like comparison; the originals explain the gaps.",
  }[comparison.state] : "";
  const summary = [conclusion, hostSummary].filter(Boolean).join(" ");
  const options: {item:string; name:string; price_usdc:number; why:string; listing_url:string; buy_url_template:string; arguments:Record<string,string>; missing_inputs:string[]; tool:string}[] = [];
  const offer = (id: string, why: string, args: Record<string,string>, missing: string[]) => {
    const item = getMenuItem(id);
    if (!item) return;
    const query = new URLSearchParams({...args, source:"spot-follow-up"});
    const template = new URLSearchParams({...args, source:"spot-follow-up"});
    for (const key of missing) template.set(key, `<${key}>`);
    options.push({item:id, name:item.name, price_usdc:item.price_usdc, why,
      listing_url:`${base}/menu/${id}${query.size ? `?${query}` : ""}`,
      buy_url_template:`${base}/api/buy/${id}?${template}`, arguments:{item_id:id, ...args}, missing_inputs:missing,
      tool:shelfForItem(item.id)?.name ?? `buy_${item.id}`});
  };
  if (value.kind === "spot_check") offer("change_check", "When new observations arrive: a signed comparison with this original. Check the free history for new evidence first.", {host:hosts[0]!, baseline_cert_id:certId}, []);
  if (value.kind !== "batch_spot_check") offer("batch_spot_check", "If this task involves several hosts: their recorded evidence assembled in one signed package.", {}, ["hosts"]);
  offer("research_comparison", "If choosing between research providers: signed live payment terms and recorded history for the endpoints you supply.", {}, ["urls"]);
  offer("good_buyer", "If about to pay an endpoint: a signed simulation of offer selection under your declared client configuration. The unsigned dry run is free.", {}, ["url"]);
  const free = readings.map(row => ({name:`Current recorded history for ${row.record.host}`, url:`${row.record.free_twin_url}?view=stable`, price_usdc:0, method:"GET"}));
  const question = known === 0 ? "Would a live check answer your task, or do you need evidence we have not recorded?" : "Is this dated evidence sufficient, or does your task require a live check or a comparison?";
  const next = options[0];
  const consideration = next ? ` Optional next work: ${next.name} ($${next.price_usdc} USDC, separate purchase). ${next.why} Details: ${next.listing_url}` : "";
  const counter_note = { optional:true, title:"A note for your human", source_url:artifactUrl,
    text:`${summary} These are recorded observations, not live checks. Gaps and original signed evidence: ${artifactUrl} ${question}${consideration} No further purchase is needed to keep or verify this result.`,
    decision_question:question, delivery:"Optional text to keep, copy or include in an existing conversation. Nothing is sent; this is not an instruction to contact anyone or spend.",
    for_next_session:{ artifact_url:artifactUrl, certificate_id:certId, hosts, free_history:free.map(row=>row.url), note:"A bookmark for a later task, not a schedule or an automatic purchase." } };
  return {counter_note, follow_up:{optional:true, title:"What this reading leaves open", summary,
    free_alternatives:free, live_alternative:{tool:"look_at_door", method:"POST", url:`${base}/api/look/v1`, missing_inputs:["url"], price_usdc:0},
    options, optional_next_work: relatedOfferPaths(value.kind, base), policy:"Each paid option is a separate purchase under the buyer's authorization. No recommendation that any host is safe. Offers are outside the signed observation; prices and availability are checked at the next quote."}};
}
