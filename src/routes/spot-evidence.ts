import { recordPostPurchaseRead } from "@/services/buyer-signals";
import { deferBookkeeping } from "@/lib/defer-bookkeeping";
import { isHouseAgent, isHouseWallet } from "@/lib/channel";
import { getCertificate } from "@/services/certificates";
import { Hono } from "hono";
import type { HonoEnv } from "@/types";
import { readSpotEvidence } from "@/services/spot-evidence";
import { spotFollowUp } from "@/lib/spot-follow-up";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { escapeHtml } from "@/lib/sanitize";

export const spotEvidenceRoutes = new Hono<HonoEnv>();
spotEvidenceRoutes.get("/api/spot-checks/:cert_id", async c => {
  const id = c.req.param("cert_id");
  const saved = await readSpotEvidence(c.env, id);
  if (!saved) return c.json({code:"original_unavailable", error:"No valid retained original under that certificate. Older Spot Checks may have no retained original; nothing is reconstructed."}, 404);
  const certificate = await getCertificate(c.env, id);
  if (!c.req.header("X-House") && !isHouseAgent(c.req.header("User-Agent") ?? "") && !isHouseWallet(c.env, certificate?.certificate.payer ?? "")) {
    deferBookkeeping(c, recordPostPurchaseRead(c.env, "spot_evidence_read", certificate?.certificate.date));
  }
  const context = spotFollowUp(c.env.STORE_BASE_URL, id, saved);
  const document = {kind:saved.kind, observation:saved.report, verify_url:`${c.env.STORE_BASE_URL}/api/verify/${id}`, ...context};
  if (!wantsHtml(c.req.header("Accept"))) return c.json(document);
  const note = context.counter_note, follow = context.follow_up;
  return c.html(renderSimplePage({title:"Your recorded evidence", description:follow.summary, path:c.req.path,
    bodyHtml:`<section><h2>The reading</h2><p>${escapeHtml(follow.summary)}</p><p>Existing records only. No live probe; missing observations remain gaps.</p><p><a href="${escapeHtml(document.verify_url)}">Verify the certificate — free</a></p></section>
      <section><h2>A note for your human</h2><p>Optional. Keep it, copy it into your conversation, or leave it here.</p><textarea readonly rows="7" aria-label="Counter note" style="width:100%;font:inherit">${escapeHtml(note.text)}</textarea></section>
      <section><h2>What this reading leaves open</h2><p>${escapeHtml(note.decision_question)}</p>
      <ul>${follow.free_alternatives.map(row=>`<li><a href="${escapeHtml(row.url)}">${escapeHtml(row.name)}</a> — free</li>`).join("")}</ul>
      <p>A current live Look is free and needs the full endpoint URL. <a href="/when">Choose the instrument for your task</a>.</p>
      ${follow.options.map(option=>`<p><a href="${escapeHtml(option.listing_url)}">${escapeHtml(option.name)} — $${option.price_usdc} USDC</a>. ${escapeHtml(option.why)} ${option.missing_inputs.length ? `Needs: ${escapeHtml(option.missing_inputs.join(", "))}.` : "The known inputs are filled in for review."}</p>`).join("")}
      <p>Each is optional and a separate purchase. Keeping, reading and verifying this artifact stay free. These current options are outside the signed observation.</p></section>
      <details><summary>Original signed evidence</summary><pre>${escapeHtml(JSON.stringify(saved.report,null,2))}</pre></details>`,
  }));
});
