import { SELF, env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import type { Env } from "@/types";
import { CONTRIBUTION_PAGE_CAP } from "@/store/contribution-tasks";
import { bountyRoutes } from "@/routes/bounties";
const bindings = env as unknown as Env;
const BASE = "https://scvd.store";
const prefix = "contribution_task:";
beforeEach(async () => {
  const keys = await bindings.COUNTERS.list({prefix});
  await Promise.all(keys.keys.map(key => bindings.COUNTERS.delete(key.name)));
});
async function brief(id: string, title = "Check the public example") {
  const store = bindings.CONTRIBUTION_TASKS!.getByName(id);
  await store.create({id,kind:"docs",title,target:"https://scvd.store/what",brief:"Attempt the named free workflow",acceptance:"Retain reproducible steps; successful attempts qualify",reward_usd:1.25,slots:1,expires_at:new Date(Date.now()+86400000).toISOString(),review_days:2,payment_days:3});
  await bindings.COUNTERS.put(prefix+id,"1");
  return store;
}
const room = (path="/bounties") => SELF.fetch(BASE+path,{headers:{Accept:"text/html"}});
it("shows posted no-purchase briefs and terms directly on the existing bounty page", async () => {
  await brief("public-contribution");
  const response = await room(); const html = await response.text();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(html.match(/id="contribution-work"/g)).toHaveLength(1);
  expect(html).toContain("Check the public example");
  expect(html).toContain("$1.25 Base USDC");
  expect(html).toContain("Retain reproducible steps; successful attempts qualify");
  expect(html).toContain("Review within 2 days; pay accepted work within 3 days");
  expect(html).toContain('/api/bounties/contributions/public-contribution');
  expect(html).toContain("Read brief and reserve");
});
it("shows capacity changes, escapes titles and never includes private submission data", async () => {
  const store = await brief("held-contribution", '<script>unsafe-title</script>');
  const reservation_key="f".repeat(64);
  await store.act("reserve",{reservation_key},"private-visitor");
  await store.act("submit",{reservation_key,payout_to:`0x${"3".repeat(40)}`,report:{attempted:"PRIVATE REPORT",environment:"Local",expected:"Works",observed:"Worked",evidence:"PRIVATE EVIDENCE",suggestion:"No change"}});
  const html=await (await room()).text();
  expect(html).toContain("&lt;script&gt;unsafe-title&lt;/script&gt;");
  expect(html).not.toContain("<script>unsafe-title</script>");
  expect(html).toContain("All slots held");
  expect(html).not.toContain("Read brief and reserve");
  expect(html).not.toContain("PRIVATE REPORT");
  expect(html).not.toContain("PRIVATE EVIDENCE");
  expect(html).not.toContain(reservation_key);
});
it("distinguishes an empty listing from unavailable contribution storage", async () => {
  const empty = await (await room()).text();
  expect(empty).toContain("No contribution briefs are listed on this page");
  const failed = await bountyRoutes.request(BASE+"/bounties",{headers:{Accept:"text/html"}},{...bindings,CONTRIBUTION_TASKS:undefined});
  const html=await failed.text();
  expect(failed.status).toBe(200);
  expect(html).toContain("Contribution listings could not be read");
  expect(html).not.toContain("No contribution briefs are listed on this page");
  expect(html).toContain("Open bounties");
});
it("follows the same bounded cursor as the public API without hiding later briefs", async () => {
  for(let i=0;i<CONTRIBUTION_PAGE_CAP+1;i++) await brief(`paged-${String(i).padStart(2,"0")}`,`Contribution ${i}`);
  const first=await (await room()).text();
  const href=first.match(/href="([^\"]*contribution_cursor=[^\"]+)"/);
  expect(href).not.toBeNull();
  expect(first).toContain("This is a partial list");
  const second=await (await room(href![1]!.replaceAll("&amp;","&"))).text();
  expect(second).toContain(`Contribution ${CONTRIBUTION_PAGE_CAP}`);
  expect(second).not.toContain(">Contribution 0<");
});

it("serves the same live briefs to Markdown and JSON readers", async () => {
  await brief("negotiated-contribution", "Shared contribution reading");
  const jsonResponse=await SELF.fetch(BASE+"/bounties",{headers:{Accept:"application/json"}});
  const payload=await jsonResponse.json() as {contribution_list:{tasks:{id:string;task_url:string}[]}};
  expect(payload.contribution_list.tasks[0]).toMatchObject({id:"negotiated-contribution",task_url:BASE+"/api/bounties/contributions/negotiated-contribution"});
  expect(jsonResponse.headers.get("Cache-Control")).toBe("no-store");
  const markdown=await SELF.fetch(BASE+"/bounties",{headers:{Accept:"text/markdown"}});
  expect(markdown.headers.get("Content-Type")).toContain("text/markdown");
  expect(markdown.headers.get("Cache-Control")).toBe("no-store");
  expect(await markdown.text()).toContain("Shared contribution reading");
});
