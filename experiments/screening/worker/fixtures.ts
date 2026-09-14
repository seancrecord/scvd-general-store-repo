import { allowance, type Provider, type ReaderPolicy } from './rpc-reader';
import type { BudgetPolicy } from './budget';

// Synthetic limits only. No production quota or price is implied.
export const readerPolicy: ReaderPolicy = {id:'fixture_v1',deadlineMs:1000,maxAgeMs:60000,maxAncestry:2,maxResponseBytes:16384};
export const providers: [Provider,Provider] = [
  {id:'a',operator:'alpha',budgetId:'alpha_product',endpoint:'https://alpha.invalid/test-key',costs:{chain:1,block:2,call:3}},
  {id:'b',operator:'beta',budgetId:'beta_product',endpoint:'https://beta.invalid/test-key',costs:{chain:2,block:3,call:4}},
];
export const budgetPolicy: BudgetPolicy = {id:readerPolicy.id,windowMs:60000,maxRequests:10,maxFreeRequests:8,maxPerCaller:8,maxCallersPerTier:16,maxConcurrent:4,reservedPaidConcurrent:1,
  providers:providers.map(v=>({id:v.id,units:allowance(readerPolicy,v.costs),totalUnits:allowance(readerPolicy,v.costs)*5,paidReserveUnits:allowance(readerPolicy,v.costs)*2})) as BudgetPolicy['providers']};
