import {SELF} from 'cloudflare:test';
import {expect, it} from 'vitest';
import {agentJobAnswers, earningAnswers, TAB_GUIDE} from '@/store/agent-jobs';
const base = 'https://scvd.store';
it('publishes trial-reminder and existing-subscription answers across the existing FAQ and guide', async () => {
  const answers = agentJobAnswers(base);
  const required = ['trial-reminders', 'before-signup'].map(id => answers.find(a=>a.id===id));
  expect(required.every(Boolean)).toBe(true);
  const [json,html,guide,markdown] = await Promise.all([
    SELF.fetch(base+'/what',{headers:{Accept:'application/json'}}).then(r=>r.json<{faq:{question:string;answer:string}[]}>()),
    SELF.fetch(base+'/what',{headers:{Accept:'text/html'}}).then(r=>r.text()),
    SELF.fetch(base+'/llms-full.txt').then(r=>r.text()),
    SELF.fetch(base+'/what',{headers:{Accept:'text/markdown'}}).then(r=>r.text()),
  ]);
  const schema = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]!)).find(n=>n['@type']==='FAQPage');
  for (const answer of required) {
    expect(json.faq).toContainEqual({question:answer!.question,answer:answer!.answer});
    expect(schema.mainEntity).toContainEqual({'@type':'Question',name:answer!.question,acceptedAnswer:{'@type':'Answer',text:answer!.answer}});
    expect(html).toContain(answer!.question);
    expect(markdown).toContain(answer!.question);
    expect(guide).toContain(answer!.answer);
    expect(answer!.answer).toContain(TAB_GUIDE);
  }
  expect(earningAnswers(base).map(a=>a.id)).toEqual(['earn','upfront','feedback']);
});
