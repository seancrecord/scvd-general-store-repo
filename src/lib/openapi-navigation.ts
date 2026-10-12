type OpenApiObject = Record<string, unknown>;

const GROUPS = [
  ["Purchases", "Buy a signed good or commission an observation."],
  ["Verification", "Check a protocol, endpoint, receipt or agent before committing money."],
  ["Orders and refunds", "Recover a purchase, cancel an unfinished checkout or read a refund's status."],
  ["Catalog", "Find available goods, prices and required inputs."],
  ["Evidence", "Read the observatory's public findings, records and source material."],
  ["Trade", "Inspect and use the partner trade counter and its sandbox."],
  ["Discovery", "Find machine interfaces, contracts and developer instructions."],
  ["Identity", "Read authentication conventions and register or inspect agent identity."],
  ["Community", "Leave a letter, contribute field observations or take part in a study."],
  ["Publications", "Read the almanac, gazette and other store publications."],
  ["Artifacts", "Retrieve purchased artifacts and use their collection or redemption features."],
  ["Store policies", "Read the store's commitments, prices, operating status and policies."],
] as const;
type Group = (typeof GROUPS)[number][0];
const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

function groupFor(path: string, operation: OpenApiObject): Group {
  if (/^\/(api\/trade(?:\/|$)|trade\.md$)/.test(path)) return "Trade";
  if (/^\/(almanac|open-for-business|gazette|zodiac)(\/|$)/.test(path)) return "Publications";
  if (operation["x-payment"]) return "Purchases";
  if (/^\/(api\/(order|refund|purchase-status)\/|ucp\/v1\/checkout-sessions(?:\/|$))/.test(path)) return "Orders and refunds";
  if (/^\/(menu(?:\.json|\/)|api\/catalog\/)/.test(path)) return "Catalog";
  if (/^\/api\/(preflight|conformance|before-you-pay|look|onpage|practice|verify|verify-receipt|replay)(\/|$)/.test(path)
    || /^\/api\/(a2a|bot-auth)\/check$/.test(path)) return "Verification";
  if (/^\/(\.well-known(?:\/|$)|mcp$|developers$|sites$)/.test(path)) return "Discovery";
  if (/^\/(auth\.md$|bot-auth\/|calling-card\/)/.test(path)) return "Identity";
  if (/^\/(ask(?:\/|$)|bounties$|api\/(bounties|field-study|study|guestbook|bell|stamp|tip|request|letter|declare-door|standing-note)(\/|$))/.test(path)) return "Community";
  if (/^\/(corpus(?:[/.]|$)|ledger(?:\/|$)|case\/|passport(?:\/|$)|profiles(?:\/|$)|registry$|trust$|fresh-set$|sources\.json$|defects\.json$|doors(?:\.json)?$|pulse\.json$|store-month\.json$|mcp-ward\.json$|a2a-desk\.json$|samples(?:\/|$))/.test(path)) return "Evidence";
  if (path.startsWith("/api/")) return "Artifacts";
  return "Store policies";
}

// Walk the finished document so generated shelf and publication paths get
// navigation too. Path-item metadata is not an operation.
export function stampOperationTags(document: OpenApiObject): void {
  const paths = document.paths as Record<string, Record<string, OpenApiObject>>;
  const used = new Set<Group>();
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!METHODS.has(method) || !operation || typeof operation !== "object") continue;
      const tag = groupFor(path, operation);
      operation.tags = [tag];
      used.add(tag);
    }
  }
  document.tags = GROUPS.filter(([name]) => used.has(name)).map(([name, description]) => ({ name, description }));
}
