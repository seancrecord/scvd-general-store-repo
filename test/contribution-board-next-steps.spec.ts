import {env,SELF} from 'cloudflare:test';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {contributionBoard} from '@/services/contribution-board';
import {contributionRoutes} from '@/routes/contribution-tasks';
import {bountyRoutes} from '@/routes/bounties';
import {CONTRIBUTION_API,CONTRIBUTION_INDEX_PREFIX,CONTRIBUTION_PAGE_CAP} from '@/store/contribution-tasks';
import {agentJobEntries} from '@/store/agent-jobs';
import type {Env} from '@/types';
const bindings=env as unknown as Env,base='https://scvd.store',now=new Date('2026-10-22T12:00:00Z');
let sequence=0;
beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
  const keys=await bindings.COUNTERS.list({prefix:CONTRIBUTION_INDEX_PREFIX});
  await Promise.all(keys.keys.map(key=>bindings.COUNTERS.delete(key.name)));
});
afterEach(()=>vi.useRealTimers());
async function brief(options:{closed?:boolean;signed?:boolean;slots?:number;title?:string}={}) {
  const id=`discovery-next-${String(++sequence).padStart(4,'0')}`,store=bindings.CONTRIBUTION_TASKS!.getByName(id);
  await store.create({id,kind:'docs',title:options.title??'Read the public example',target:base+'/what',brief:'Attempt the named free workflow',acceptance:'Reproducible evidence, including correct behavior',reward_usd:1,slots:options.slots??1,expires_at:new Date(now.getTime()+86400000).toISOString(),review_days:2,payment_days:3,...(options.signed?{payment_method:'signed_authorization'}:{})});
  if(options.closed)await store.act('close',{});
  await bindings.COUNTERS.put(CONTRIBUTION_INDEX_PREFIX+id,'1');return {id,store};
}
it('counts only currently available slots on this page, without representing them as funded permission',async()=>{
  const open=await brief({signed:true,slots:2});await brief({closed:true});
  const held=await brief();await held.store.act('reserve',{reservation_key:'a'.repeat(64)},'held-visitor');
  const board=await contributionBoard(bindings);
  expect(board.availability).toMatchObject({state:'slots_listed',scope:'this_page',available_tasks:1,available_slots:2,permission_to_start:false,evaluated_at:now.toISOString()});
  expect(board.next_steps).toHaveLength(1);
  expect(board.next_steps[0]).toMatchObject({action:'read_brief',method:'GET',url:`${base}${CONTRIBUTION_API}/${open.id}`,required_fields:[]});
  expect(board.next_steps[0]!.note).toContain('funding_pending does not');
  expect(board.next_steps.some(step=>step.action==='free_task')).toBe(false);
  expect((await open.store.publicView())!.available_slots).toBe(2);
  vi.setSystemTime(new Date(now.getTime()+86400001));
  expect((await contributionBoard(bindings)).availability).toMatchObject({state:'no_slots_listed',available_slots:0});
});
it('gives an empty board useful existing free tasks without presenting them as rewarded work',async()=>{
  const response=await SELF.fetch(base+CONTRIBUTION_API),board=await response.json() as Awaited<ReturnType<typeof contributionBoard>>;
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(board).toMatchObject({tasks:[],truncated:false,availability:{state:'no_slots_listed',scope:'this_page',available_tasks:0,available_slots:0,permission_to_start:false}});
  expect(board.next_steps.length).toBeGreaterThan(0);
  const jobs=agentJobEntries(base);
  for(const step of board.next_steps){
    expect(step).toMatchObject({action:'free_task',method:'GET',required_fields:[],deadline_at:null});
    expect(step.note).toContain('not paid contribution work');
    expect(jobs.some(job=>job.url===step.url&&job.title===step.label)).toBe(true);
    expect((await SELF.fetch(step.url)).status).toBe(200);
  }
});
it('directs readers past a full first page of closed briefs to later available work',async()=>{
  for(let i=0;i<CONTRIBUTION_PAGE_CAP;i++)await brief({closed:true});
  const later=await brief();const first=await contributionBoard(bindings);
  expect(first).toMatchObject({truncated:true,availability:{state:'no_slots_listed',available_slots:0,scope:'this_page'}});
  expect(first.next_steps[0]).toMatchObject({action:'next_page',method:'GET'});
  const nextUrl=new URL(first.next_steps[0]!.url);expect(nextUrl.searchParams.get('cursor')).toBe(first.cursor);
  const next=await (await SELF.fetch(nextUrl)).json() as Awaited<ReturnType<typeof contributionBoard>>;
  expect(next.availability.available_slots).toBe(1);expect(next.tasks[0]!.id).toBe(later.id);
  const html=await (await SELF.fetch(base+'/bounties',{headers:{Accept:'text/html'}})).text();
  expect(html).toContain('No available contribution slots on this page');expect(html).toContain('Next contribution briefs');
});
it('uses the same availability and alternatives in HTML, JSON and Markdown',async()=>{
  const full=await brief();await full.store.act('reserve',{reservation_key:'b'.repeat(64)},'another-visitor');
  const json=await (await SELF.fetch(base+'/bounties',{headers:{Accept:'application/json'}})).json() as {contribution_list:Awaited<ReturnType<typeof contributionBoard>>};
  const html=await (await SELF.fetch(base+'/bounties',{headers:{Accept:'text/html'}})).text();
  const md=await (await SELF.fetch(base+'/bounties',{headers:{Accept:'text/markdown'}})).text();
  expect(json.contribution_list.availability.available_slots).toBe(0);expect(html).toContain('All slots held');expect(html).toContain('these are not paid contribution briefs');
  for(const step of json.contribution_list.next_steps){expect(html).toContain(step.url);expect(md).toContain(step.url);}
  expect(html).not.toContain('b'.repeat(64));
});
it('keeps a failed listing unknown and still offers free guide links on the bounty page',async()=>{
  const unavailable={...bindings,CONTRIBUTION_TASKS:undefined};
  const api=await contributionRoutes.request(base+CONTRIBUTION_API,{},unavailable);
  expect(api.status).toBe(503);expect(await api.text()).not.toContain('no_slots_listed');
  const page=await bountyRoutes.request(base+'/bounties',{headers:{Accept:'text/html'}},unavailable),html=await page.text();
  expect(html).toContain('Availability is unknown');expect(html).not.toContain('No available contribution slots');expect(html).toContain('Free tools for another task');
});
it('escapes visitor-authored brief titles and publishes the discovery contract in OpenAPI',async()=>{
  await brief({title:'<script>not-an-instruction</script>'});
  const board=await contributionBoard(bindings);expect(board.next_steps[0]!.label).toContain('<script>');
  const html=await (await SELF.fetch(base+'/bounties',{headers:{Accept:'text/html'}})).text();
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>not-an-instruction');
  const api=await (await SELF.fetch(base+'/openapi.json')).json() as {components:{schemas:Record<string,unknown>};paths:Record<string,unknown>};
  expect(api.components.schemas.ContributionAvailability).toMatchObject({properties:{scope:{const:'this_page'},permission_to_start:{const:false}}});
  expect(api.paths[CONTRIBUTION_API]).toMatchObject({get:{responses:{'200':{content:{'application/json':{schema:{properties:{availability:{$ref:'#/components/schemas/ContributionAvailability'},next_steps:{items:{$ref:'#/components/schemas/ContributionDiscoveryStep'}}}}}}}}}});
});
