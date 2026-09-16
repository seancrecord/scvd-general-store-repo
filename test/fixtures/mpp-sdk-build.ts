// Build-only entry, invoked exclusively by the dry-run qualification script.
// Keeps the adapter reachable so tree-shaking cannot hide a missing SDK peer.
import { createMppEvmAdapter, type MppEvmTerms } from "../../src/lib/mpp-evm-adapter";
export default {
  async fetch(request: Request) {
    const config = await request.json() as MppEvmTerms;
    const adapter = createMppEvmAdapter({ ...config, verify: async () => ({ isValid: false }) });
    return Response.json(await adapter.challenge());
  },
};
