import verifier from '../../verifier/package.json';
import { TAB_GUIDE } from "@/store/agent-jobs";

// These are editable keeper drafts, never indexed work or funded commitments.
const repository = verifier.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
export function firstContributionBatch(base: string) {
  return [
    {
      kind: "aura", title: "Find and complete a free receipt check from the front door",
      target: `${base}/what`,
      brief: "Use a fresh agent context and begin at the target page. Goal: find a free way to check a supported signed receipt and explain the result to a human. Use the documented synthetic receipt and test public key; no real wallet, secrets or purchases. Limit the attempt to 20 minutes. Retain the entry path, exact links, model/harness, elapsed time and each GUESS, RETRY and DIG. If blocked, stop and retain the last successful step and exact blocker.",
      acceptance: "An ordered, redacted trace of the bounded attempt; the inputs and result of any check; and a short explanation of what that result establishes and leaves unknown. A successful check or a reproducible blocked attempt qualifies. No defect, praise or public post is required.",
    },
    {
      kind: "census", title: "Check whether one dated corpus row supports its public summary",
      target: `${base}/corpus`,
      brief: "Choose one retained census snapshot and one host row. Save the exact snapshot URL, observation time, host, criteria/battery version and the public sentence or field being checked. Compare only retained public records and their documented meanings. Limit the attempt to 20 minutes and one row; do not probe or pay the third-party endpoint. Identify a supported match, a contradiction, or missing evidence. A later endpoint change cannot by itself invalidate an earlier observation.",
      acceptance: "A traceable row-to-summary comparison with exact public references and timestamps, the specific fields compared, and a supported conclusion or explicit evidence gap. Confirming an accurate summary qualifies. Do not infer continuous uptime, provider quality or historical facts absent from the retained record.",
    },
    {
      kind: "package", title: `Run the ${verifier.name} receipt quickstart from a clean directory`,
      target: `${repository}/tree/main/${verifier.repository.directory}`,
      brief: `Test the receipt quickstart in ${verifier.name}, source version ${verifier.version}. Pin and record the checkout commit and package version before starting; if they differ from these terms, report that mismatch rather than silently changing the tested version. Pack that source into a disposable directory and use its documented synthetic receipt and separate test public key. Run the valid and tampered cases. Retain installation steps, runtime version, commands, outputs and missing instructions. Limit the attempt to 20 minutes; no real signing keys, wallet, purchase or issuer request is needed.`,
      acceptance: "Reproducible setup and both attempted cases, with the package version/commit and exact outcomes. State whether the two results are distinguishable and what signature verification does not establish. A working example, version mismatch or reproducible setup failure qualifies when the trace identifies the point reached. Never submit private files or secrets.",
    },
    {
      kind: "discovery", title: "Demonstrate an overlooked free use for an everyday agent assignment",
      target: `${base}/what`,
      brief: `Choose one concrete everyday task and one existing free SCVD capability that may help. For example, Tab at ${TAB_GUIDE} may help check for an existing software subscription before another signup. Use synthetic inputs in a disposable local workspace. Record the original task, discovery path, capability and version, attempted workflow, output and limits. Limit the attempt to 20 minutes. No purchases, real financial data, inbox access, outreach, endorsements or new services are needed.`,
      acceptance: "One reproducible demonstration or a precisely located discovery/usability failure, with the useful step, evidence, missing capability and unsupported assumptions separated. An existing use qualifies when it reveals a concrete improvement to how the store explains or exposes it. An idea alone or a promotional restatement is insufficient; a negative result can qualify.",
    },
  ];
}
