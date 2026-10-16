import {SELF} from 'cloudflare:test';
import {expect, it} from 'vitest';
import {TAB_GUIDE} from '@/store/agent-jobs';

const base = 'https://scvd.store';
const jobs = ['earn', 'expenses', 'trial-reminders', 'before-signup', 'find-apis', 'preflight'];
const html = (path: string) => SELF.fetch(base + path, {headers:{Accept:'text/html'}}).then(r=>r.text());

it('takes a homepage visitor directly to the relevant task answer before the product shelves', async () => {
  const home = await html('/');
  const faq = await html('/what');
  for (const id of jobs) {
    const link = `href="/what#job-${id}"`;
    expect(home).toContain(link);
    expect(home.indexOf(link)).toBeLessThan(home.indexOf('<section class="shelves">'));
    expect(faq).toContain(`id="job-${id}"`);
  }
});

it('keeps task entry links and answers usable in JSON, markdown and structured data', async () => {
  const response = await SELF.fetch(base+'/what', {headers:{Accept:'application/json'}});
  const data = await response.json<{jobs:{id:string;url:string;question:string;answer:string}[];faq:{question:string;answer:string}[]}>();
  expect(data.jobs).toBeDefined();
  const page = await html('/what');
  const markdown = await (await SELF.fetch(base+'/what',{headers:{Accept:'text/markdown'}})).text();
  const faq = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]!)).find(n=>n['@type']==='FAQPage');
  for (const id of jobs) {
    const job = data.jobs.find(j=>j.id===id)!;
    expect(job, id).toBeDefined();
    expect(job.url).toBe(`${base}/what#job-${id}`);
    expect(data.faq).toContainEqual({question:job.question,answer:job.answer});
    expect(markdown).toContain(job.url);
    expect(faq.mainEntity).toContainEqual({'@type':'Question',name:job.question,acceptedAnswer:{'@type':'Answer',text:job.answer}});
  }
});

it('carries task routes on the short agent entry documents', async () => {
  for (const path of ['/llms.txt','/agents.md']) {
    const body = await (await SELF.fetch(base+path)).text();
    for (const id of jobs) expect(body, `${path}: ${id}`).toContain(`/what#job-${id}`);
  }
});

it('offers useful free routes from a bounty visit even when work is unavailable', async () => {
  const body = await html('/bounties');
  for (const id of ['expenses','trial-reminders','find-apis','preflight']) {
    expect(body).toContain(`href="/what#job-${id}"`);
  }
});

it('lets an expense-tracking visitor open Tab setup directly from the answer', async () => {
  const page = await html('/what');
  const answer = page.split('id="job-expenses"')[1]!.split('<div class="menu-item"')[0]!;
  expect(answer).toContain(`href="${TAB_GUIDE}"`);
});


it('offers copyable, bounded prompts for both everyday and evidence tasks', async () => {
  const data = await (await SELF.fetch(base+'/what', {headers:{Accept:'application/json'}})).json<{jobs:{id:string;prompt:string}[]}>();
  const page = await html('/what');
  const markdown = await (await SELF.fetch(base+'/what',{headers:{Accept:'text/markdown'}})).text();
  for (const id of [...jobs, 'overlapping-tools', 'payment-debugging', 'compare-endpoints', 'client-report']) {
    const job = data.jobs.find(j=>j.id===id)!;
    expect(job, id).toBeDefined();
    expect(job.prompt, id).toBeTruthy();
    expect(page).toContain(`id="prompt-${id}"`);
    expect(markdown).toContain(job.prompt);
  }
  expect(data.jobs.find(j=>j.id==='overlapping-tools')!.prompt).toContain('Do not cancel');
  expect(data.jobs.find(j=>j.id==='payment-debugging')!.prompt).toContain('Do not retry a payment');
  expect(data.jobs.find(j=>j.id==='client-report')!.prompt).toContain('unverified');
});
