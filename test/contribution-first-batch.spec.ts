import { expect, it } from "vitest";
import { renderContributionDesk } from "@/pages/admin/contribution-tasks";
const empty = {tasks: [], truncated: false, cursor: null, indexing_note: "Empty local directory"};
it("offers scoped first-batch drafts only on the keeper posting desk", () => {
  const html = renderContributionDesk(empty, null, 0, "https://scvd.store");
  const batch = html.match(/<section id="first-contribution-batch">([\s\S]*?)<\/section>/)?.[1];
  expect(batch).toBeDefined();
  expect(batch!.match(/<form /g)).toHaveLength(4);
  for (const name of ["aura", "census", "package", "discovery"]) expect(batch).toContain(`name="kind" value="${name}"`);
  expect(batch).toContain("Drafts only");
  expect(batch).toContain("synthetic");
});
it("leaves the financial commitment and schedule unset while supplying targets and evidence criteria", () => {
  const batch = renderContributionDesk(empty, null, 0, "https://scvd.store").match(/<section id="first-contribution-batch">([\s\S]*?)<\/section>/)?.[1];
  expect(batch).toBeDefined();
  const forms = batch!.match(/<form [\s\S]*?<\/form>/g)!;
  for (const form of forms) {
    for (const name of ["reward_usd", "expires_at", "review_days", "payment_days"]) expect(form).toContain(`name="${name}" type="${name === "expires_at" ? "datetime-local" : "number"}" value="" required`);
    expect(form).toMatch(/name="target" type="url" value="https:\/\//);
    expect(form).toMatch(/name="brief"[^>]*>[^<]+<\/textarea>/);
    expect(form).toMatch(/name="acceptance"[^>]*>[^<]+<\/textarea>/);
  }
});
