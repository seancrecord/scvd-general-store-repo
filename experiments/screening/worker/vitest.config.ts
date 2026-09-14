import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { budgetPolicy } from './fixtures';

export default defineConfig({
  test:{include:['experiments/screening/worker/*.spec.ts']},
  resolve:{alias:{'@':path.resolve(import.meta.dirname,'../../../src')}},
  plugins:[cloudflareTest({
    wrangler:{configPath:path.resolve(import.meta.dirname,'wrangler.jsonc')},
    miniflare:{kvNamespaces:['COUNTERS','ORDERS','GUESTBOOK','PATRONS'],bindings:{SCREENING_BUDGET_POLICY:JSON.stringify(budgetPolicy)}}
  })]
});
