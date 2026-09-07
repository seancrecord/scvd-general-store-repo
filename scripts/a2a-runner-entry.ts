import { readCard, authorize, runRuntime } from "../src/lib/a2a-instrument";

export async function checkAgent(url: string, runtime = false, fetchImpl: typeof fetch = fetch) {
  const card = await readCard(url, fetchImpl);
  return runtime ? runRuntime(card, await authorize(card, fetchImpl), fetchImpl) : card;
}
const url = process.argv[2];
const runtime = process.argv.includes("--runtime");
if (process.argv.includes("--library")) { /* Explicit import mode for offline fixture tests. */ }
else if (!url) { console.error("Usage: node a2a-regression.mjs https://your-agent.example/.well-known/agent-card.json [--runtime]"); process.exitCode = 2; }
else {
  try {
    const result = await checkAgent(url, runtime);
    console.log(JSON.stringify(result, null, 2));
    // A green exit requires every applicable check to have been observed and passed.
    process.exitCode = result.counts.fail ? 1 : result.counts.not_observed ? 2 : 0;
  } catch (error) { console.error(error instanceof Error ? error.message : "instrument_failed"); process.exitCode = 2; }
}
