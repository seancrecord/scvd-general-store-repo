# Admin report entry points — September 29

Source inventory at `b8a87513`. Each registered GET entry is included below,
including JSON twins, exports, drafts, tool pages and the books redirect.
The purchase routes are mounted behind admin authentication. This is a
route/source inventory, not a claim that every operation exposed by a page
was executed or that every dependency has received a financial audit.

Owners below are dynamic data-module imports in each handler, or its named
reader calls where imports are static; renderer modules are omitted. Static
imports resolve in `src/routes/admin.ts`. The findings report identifies the
paths that received deeper producer/renderer checks and synthetic probes.

| Entry | Source | Data owner / reader |
| --- | --- | --- |
| `/admin/trade` | [handler](../../src/routes/admin.ts#L428) | `@/store/trade-counter`, `@/services/trade-counter` |
| `/admin/desvela-registry.json` | [handler](../../src/routes/admin.ts#L439) | `@/services/desvela-registry` |
| `/admin/calling-card.json` | [handler](../../src/routes/admin.ts#L445) | `@/services/calling-card` |
| `/admin/calling-card` | [handler](../../src/routes/admin.ts#L451) | `@/services/calling-card` |
| `/admin/trade.json` | [handler](../../src/routes/admin.ts#L459) | `@/store/trade-counter`, `@/services/trade-counter` |
| `/admin/take` | [handler](../../src/routes/admin.ts#L631) | `@/services/books-summary`, `@/services/stats`, `@/lib/payment-operations` |
| `/admin/round` | [handler](../../src/routes/admin.ts#L677) | `@/services/keepers-round` |
| `/admin/glance` | [handler](../../src/routes/admin.ts#L687) | `@/services/glance` |
| `/admin/counter` | [handler](../../src/routes/admin.ts#L742) | `listOrders`, `listWaitlist`, `listCommissions`, `listFailedItems`, `listGuestbook`, `listTips`, `listLetters`, `readAlertInbox`, `listConfessions`, `listTags`, `listRefunds`, `listClosers`, `listStock`, `listGrudges` |
| `/admin` | [handler](../../src/routes/admin.ts#L833) | `@/services/glance`, `@/services/reclassify`, `@/services/mcp-clients`, `@/services/field-wallet`, `@/services/bounty-board`, `@/services/ward-round`, `@/services/counter-raise`, `@/lib/counter-ledger` |
| `/admin/reconciliation` | [handler](../../src/routes/admin.ts#L1062) | `@/services/chain-reconciliation`, `@/services/delivery-audit`, `@/services/settle-sources`, `@/lib/counter-ledger`, `@/services/counter-raise`, `@/lib/alert-mutes` |
| `/admin/files` | [handler](../../src/routes/admin.ts#L1248) | Redirect to `/admin` |
| `/admin/testing` | [handler](../../src/routes/admin.ts#L1254) | `listKeys` |
| `/admin/books` | [handler](../../src/routes/admin.ts#L1279) | Redirect to `/admin` |
| `/admin/ward/index` | [handler](../../src/routes/admin.ts#L1288) | `@/services/ward-round` |
| `/admin/ward` | [handler](../../src/routes/admin.ts#L1296) | `@/services/source-liveness`, `@/services/ward-heartbeat` |
| `/admin/raise-log` | [handler](../../src/routes/admin.ts#L1461) | `@/services/counter-raise` |
| `/admin/export/tax.csv` | [handler](../../src/routes/admin.ts#L1508) | `@/services/tax-export` |
| `/admin/mcp-ward` | [handler](../../src/routes/admin.ts#L1678) | `readMcpWalk`, `readMcpRegister`, `latestMcpPass` |
| `/admin/tools` | [handler](../../src/routes/admin.ts#L1797) | `shutterState`, `listKeys`, `listKeeperEntries` |
| `/admin/recount` | [handler](../../src/routes/admin.ts#L2156) | `recountFromRows`, `readMonthLedger` |
| `/admin/referrals` | [handler](../../src/routes/admin.ts#L2187) | `@/lib/referrals`, `@/lib/metrics` |
| `/admin/deliveries` | [handler](../../src/routes/admin.ts#L2210) | `auditDeliveries` |
| `/admin/settlement-unknown` | [handler](../../src/routes/admin.ts#L2228) | `listSettlementUnknowns` |
| `/admin/buyers` | [handler](../../src/routes/admin.ts#L2259) | `@/services/buyers` |
| `/admin/mpp-sales` | [handler](../../src/routes/admin.ts#L2269) | `@/services/mpp-sales` |
| `/admin/settlement/:tx` | [handler](../../src/routes/admin.ts#L2287) | `@/services/settlement-lookup` |
| `/admin/disclosure` | [handler](../../src/routes/admin.ts#L2300) | `@/services/disclosure-census` |
| `/admin/signals` | [handler](../../src/routes/admin.ts#L2312) | `@/services/buyer-signals` |
| `/admin/protocols` | [handler](../../src/routes/admin.ts#L2320) | `@/services/protocol-reading` |
| `/admin/open-for-business` | [handler](../../src/routes/admin.ts#L2326) | `@/services/open-for-business`, `@/services/open-for-business-store` |
| `/admin/open-for-business.md` | [handler](../../src/routes/admin.ts#L2379) | `@/services/open-for-business` |
| `/admin/instruments` | [handler](../../src/routes/admin.ts#L2384) | `@/services/observatory`, `@/services/pulse`, `@/services/instruments`, `@/lib/client-census` |
| `/admin/growth` | [handler](../../src/routes/admin.ts#L2441) | `@/services/growth` |
| `/admin/peers` | [handler](../../src/routes/admin.ts#L2452) | `@/services/peer-shelf` |
| `/admin/peers.json` | [handler](../../src/routes/admin.ts#L2457) | `@/services/peer-shelf` |
| `/admin/growth.json` | [handler](../../src/routes/admin.ts#L2462) | `@/services/growth` |
| `/admin/census` | [handler](../../src/routes/admin.ts#L2467) | `takeCensus` |
| `/admin/funnel` | [handler](../../src/routes/admin.ts#L2488) | `@/services/funnel` |
| `/admin/market` | [handler](../../src/routes/admin.ts#L2505) | `@/services/ward-round`, `@/services/market` |
| `/admin/bounties/plan` | [handler](../../src/routes/admin.ts#L2687) | `readBountyPlan` |
| `/admin/outreach` | [handler](../../src/routes/admin.ts#L2916) | `@/services/outreach`, `@/services/citation-watch`, `@/services/buyer-signals` |
| `/admin/market/inflows` | [handler](../../src/routes/admin.ts#L3395) | `@/services/inflow-census`, `@/lib/sanitize` |
| `/admin/market/authenticity` | [handler](../../src/routes/admin.ts#L3583) | `@/lib/sanitize` |
| `/admin/bounties` | [handler](../../src/routes/admin.ts#L3756) | `@/services/bounty-board`, `@/services/field-wallet`, `@/services/store-credit`, `@/lib/kv-bulk`, `@/services/field-study`, `@/services/study-findings`, `@/lib/metrics` |
| `/admin/declines` | [handler](../../src/routes/admin.ts#L3960) | `readDeclines`, `traceClient` |
| `/admin/trace` | [handler](../../src/routes/admin.ts#L4002) | `traceClient` |
| `/admin/events` | [handler](../../src/routes/admin.ts#L4025) | `listEventsForItem` |
| `/admin/bell` | [handler](../../src/routes/admin.ts#L4041) | `listRecentPorchEvents` |
| `/admin/digest` | [handler](../../src/routes/admin.ts#L4344) | `getLatestDigest` |
| `/admin/purchases/` | [handler](../../src/routes/admin-purchases.ts#L17) | `services/purchase-inspection` |
| `/admin/purchases/:id` | [handler](../../src/routes/admin-purchases.ts#L18) | `services/purchase-inspection` |
