import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { spotFollowUp } from "@/lib/spot-follow-up";
import { performSpotCheck } from "@/services/spot-check";
import { performChangeCheck, retainSpotEvidence } from "@/services/spot-evidence";
import { mintCertificate } from "@/services/certificates";
import type { Env } from "@/types";
const testEnv = env as Env;
it("does not label the legacy history seal date as an observation date in the human note", async () => {
  const report = await performSpotCheck(testEnv,"legacy-date.example");
  report.record.history.rounds_probed=1;
  report.record.history.rounds_since_first_sighting=1;
  report.record.history.last_observed="2026-09-20T00:00:00Z";
  report.record.history.timeline=[{sequence:1,week:"2026-W38",taken_at:"2026-09-20T00:00:00Z",digest:"a",entry_url:"https://scvd.store/corpus/1.json",listed:true,probed:true,coverage_suspect:false,note:"Legacy row"}];
  const note=spotFollowUp(testEnv.STORE_BASE_URL,"cert_fixture",{kind:"spot_check",report}).counter_note;
  expect(note.text).not.toContain("last observed 2026-09-20");
  expect(note.text).toContain("observation date unknown");
  expect(note.for_next_session.free_history).toHaveLength(1);
});
it("carries the actual change-check conclusion into the optional human note", async () => {
  const original=await performSpotCheck(testEnv,"note-change.example");
  const cert=await mintCertificate(testEnv,{itemId:"spot_check",attests:original.evidence_hash});
  await retainSpotEvidence(testEnv,cert.certificate.cert_id,{kind:"spot_check",report:original});
  const report=await performChangeCheck(testEnv,"note-change.example",cert.certificate.cert_id);
  const note=spotFollowUp(testEnv.STORE_BASE_URL,"cert_fixture",{kind:"change_check",report}).counter_note;
  expect(note.text).toContain("No new recorded observations");
  expect(note.text).toContain("does not mean the endpoint stayed unchanged");
});
