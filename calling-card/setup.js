import { normalizeCallingCard, configuredModule, guidedModule, GAP_MESSAGES, INPUT_LIMIT } from "./calling-card.mjs";

const root = document.querySelector("#calling-card-setup");
if (root) {
  root.hidden = false;
  const input = root.querySelector("textarea");
  const status = root.querySelector("[data-status]");
  const result = root.querySelector("[data-result]");
  const preview = root.querySelector("[data-preview]");
  const gaps = root.querySelector("[data-gaps]");
  const download = root.querySelector("[data-download]");
  const kit = root.querySelector("[data-kit]");
  const example = root.querySelector("[data-example]");
  const check = root.querySelector("[data-check]");
  const checked = root.querySelector("[data-checked]");
  const purchase = root.querySelector("[data-purchase]");
  const instructions = root.querySelector("[data-instructions]");
  const resolutionsRoot=root.querySelector("[data-resolutions]");
  const mode=root.querySelector("[data-mode]");
  const share=root.querySelector("[data-share]");
  const service=JSON.parse(root.dataset.service);
  let resolutions={};
  let current = null;
  let generation = 0;
  let pendingCheck;

  function invalidate() {
    generation++;
    pendingCheck?.abort();
    current = null;
    result.hidden = true;
    download.disabled = true;
    kit.disabled = true;
    example.disabled = true;
    check.disabled = true;
    checked.textContent = "";
    purchase.hidden = true;
    status.textContent = "Review your updated inputs to refresh the card.";
  }
  input.addEventListener("input", ()=>{resolutions={};invalidate();});
  for(const selector of ["[data-name]","[data-destinations]"])root.querySelector(selector).addEventListener("input",invalidate);
  root.querySelector("[data-start]").addEventListener("click",()=>{
    input.value=JSON.stringify({name:root.querySelector("[data-name]").value,allowed_origins:root.querySelector("[data-destinations]").value});
    resolutions={};renderCard();
  });
  function updateMode(){
    const managed=mode.value==="managed";
    root.querySelector("[data-local-steps]").hidden=!managed;
    root.querySelector("[data-existing-steps]").hidden=managed;
    root.querySelector("[data-managed-note]").hidden=!managed;
    share.disabled=!managed;
    if(!managed)share.checked=false;
    instructions.textContent=managed
      ? "Download once, then run --setup on your machine. It creates the signing key locally and publishes the public directory. Run --observe to see what this receiver verified."
      : current?.public_key&&current?.signature_agent?"Connect your existing signer with connect({ sign }). Its key must match this card, and its public directory must be available.":"Use connect() for a declared introduction. Add your existing public key, directory and signer when you want signed introductions.";
    const signingGap=gaps.querySelector('[data-gap="unsigned_introduction"]');
    if(signingGap)signingGap.textContent=managed?"Next step — run --setup locally to create the signing key and publish its public directory.":GAP_MESSAGES.unsigned_introduction;
  }
  mode.addEventListener("change",()=>{generation++;kit.disabled=!current;updateMode();});
  share.addEventListener("change",()=>{generation++;kit.disabled=!current;});
  root.querySelector("[data-file]").addEventListener("change", async event => {
    resolutions={};
    invalidate();
    const file = event.target.files?.[0];
    const version = generation;
    if (!file) return;
    if (file.size > INPUT_LIMIT) { status.textContent = GAP_MESSAGES.input_limit; return; }
    try {
      const text = await file.text();
      if (version !== generation) return;
      input.value = text;
      status.textContent = "File read locally. Review the inputs when you are ready.";
    } catch { status.textContent = "The file could not be read. Paste its public fields instead."; }
  });
  root.querySelector("[data-sample]").addEventListener("click", () => {
    resolutions={};
    invalidate();
    input.value = 'name: My Agent\nallowed_origins: https://scvd.store\nnetworks: eip155:8453';
    status.textContent = "Example loaded. Replace the name and destinations with your own.";
    input.focus();
  });
  root.querySelector("form").addEventListener("submit", event => {
    event.preventDefault();
    renderCard();
  });
  function renderCard() {
    invalidate();
    const normalized = normalizeCallingCard(input.value,{resolutions});
    current = normalized.ready ? normalized.card : null;
    result.hidden = false;
    status.textContent = normalized.ready ? "Your card is ready to download. Review what it shares below." : "A few inputs need attention. Nothing has been sent.";
    preview.textContent = normalized.card ? JSON.stringify(normalized.card, null, 2) : "No card exported.";
    gaps.replaceChildren();
    resolutionsRoot.replaceChildren();
    const labels={name:"Agent name",allowed_origins:"Sites this agent may contact",signature_agent:"Public directory URL",public_key:"Public signing key",networks:"Payment networks",runtime:"Agent environment",contact_url:"Public contact URL"};
    for(const field of [...new Set(normalized.gaps.filter(gap=>(gap.blocking&&gap.field!=="input")||gap.code==="payment_capabilities_unknown").map(gap=>gap.field))]) {
      if(!labels[field])continue;
      const row=document.createElement("div");
      const label=document.createElement("label");
      label.textContent=normalized.fields[field]==="conflicting"?`${labels[field]}: these inputs disagree. Which should we use?`:field==="networks"&&normalized.fields[field]==="missing"?"Optional: payment networks for compatibility hints":`Add or correct ${labels[field].toLowerCase()}`;
      const values=normalized.choices?.[field]??[];
      let control;
      if(values.length>1){
        control=document.createElement("select");
        const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Choose a value";control.append(placeholder);
        values.forEach((value,index)=>{const option=document.createElement("option");option.value=String(index);option.textContent=typeof value==="string"?value:JSON.stringify(value);control.append(option);});
      } else {control=document.createElement("input");control.placeholder=field==="allowed_origins"?"https://example.com":field==="runtime"?"node-fetch":field==="networks"?"eip155:8453 (Base), or IDs from your wallet configuration":labels[field];}
      control.id="cc-resolve-"+field;label.htmlFor=control.id;
      const apply=document.createElement("button");apply.type="button";apply.textContent="Use this value";
      apply.addEventListener("click",()=>{
        if(!control.value.trim())return;
        let value=values.length>1?values[Number(control.value)]:control.value;
        if(field==="public_key"&&typeof value==="string"){try{value=JSON.parse(value);}catch{status.textContent="Use a public JWK object for this field.";return;}}
        resolutions[field]=value;renderCard();
      });
      row.append(label,control,apply);
      const source=document.createElement("p");source.textContent=(normalized.sources?.[field]??[]).join(" · ");row.append(source);resolutionsRoot.append(row);
    }
    for (const gap of normalized.gaps) {
      const li = document.createElement("li");
      li.dataset.gap=gap.code;
      li.textContent = `${gap.blocking ? "Needs your input" : "Limit"} — ${gap.field}: ${GAP_MESSAGES[gap.code] ?? "This field could not be used."}`;
      gaps.append(li);
    }
    if (normalized.ignored_fields) {
      const li = document.createElement("li");
      li.textContent = `${normalized.ignored_fields} unrecognized field(s) excluded. Review the card for anything you expected to see.`;
      gaps.append(li);
    }
    download.disabled = !current;
    kit.disabled = !current;
    example.disabled = !current;
    check.disabled = !current?.signature_agent;
    if(current?.public_key||current?.signature_agent)mode.value="existing";
    updateMode();
  }
  function save(name, value, type) {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  download.addEventListener("click", () => { if (current) save("calling-card.json", JSON.stringify(current, null, 2) + "\n", "application/json"); });
  kit.addEventListener("click", async () => {
    if (!current) return;
    const version = generation;
    const card = current;
    kit.disabled = true;
    status.textContent = "Preparing your download. Your profile stays in this browser.";
    try {
      const response = await fetch("/calling-card/calling-card.mjs",{cache:"no-store"});
      if (!response.ok) throw new Error("download_failed");
      const source = await response.text();
      if (version !== generation) return;
      const managed=mode.value==="managed";
      const profile={...card};
      if(managed){delete profile.public_key;delete profile.signature_agent;}
      save("my-calling-card.mjs", managed?guidedModule(source,profile,service,{shareReports:share.checked}):configuredModule(source,card), "text/javascript");
      status.textContent = managed?"Downloaded. Run --setup locally, then --observe. Your private key is created on your machine; only its public directory is published.":"Downloaded. Import connect() and connect your existing signer.";
    } catch { if (version === generation) status.textContent = "The download could not be prepared. Your profile is still here; try again."; }
    finally { if (version === generation) kit.disabled = false; }
  });
  example.addEventListener("click", () => {
    if (!current) return;
    const signed = current.public_key && current.signature_agent;
    const source = `// Run only when you want to send one GET: node agent-example.mjs https://your-approved-destination.example/path${signed ? " ./your-local-signer.mjs" : ""}
// Keep this transport underneath your payment client's own approval/retry logic.
import { readFile } from 'node:fs/promises';
${signed ? "import { resolve } from 'node:path';\nimport { pathToFileURL } from 'node:url';\n" : ""}import { createCallingCardFetch } from './calling-card.mjs';
const card = JSON.parse(await readFile(new URL('./calling-card.json', import.meta.url), 'utf8'));
const target = process.argv[2];
if (!target) throw new Error('Supply one destination URL already allowed by your card.');
${signed ? `// Your local module exports sign(bytes): Promise<Uint8Array>. Keys stay there.
if (!process.argv[3]) throw new Error('Supply the path to your existing local signer module.');
const { sign } = await import(pathToFileURL(resolve(process.argv[3])).href);
` : ""}const request = createCallingCardFetch({ card, ${signed ? "sign, " : ""}onResult: result => console.error(JSON.stringify(result)) });
const response = await request(target);
console.log('HTTP', response.status);
// Handle the response with your existing application. This example never pays or retries.
await response.body?.cancel();
`;
    save("agent-example.mjs", source, "text/javascript");
  });
  check.addEventListener("click", async () => {
    if (!current?.signature_agent) return;
    const version = generation;
    const directory = current.signature_agent;
    pendingCheck?.abort();
    pendingCheck = new AbortController();
    check.disabled = true;
    checked.textContent = "Checking the public directory. Only its URL is sent to the store.";
    purchase.hidden = true;
    try {
      const response = await fetch("/api/bot-auth/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: directory }), signal: pendingCheck.signal });
      const body = await response.json();
      if (version !== generation) return;
      if (!response.ok) { checked.textContent = "The directory check could not complete. " + (typeof body.error === "string" ? body.error : "Try again later."); return; }
      checked.textContent = `Directory result: ${body.verdict}.\n` + (Array.isArray(body.checks) ? body.checks.map(row => `${row.ok ? "Observed" : "Gap"}: ${row.name} — ${row.detail}`).join("\n") : "No checks returned.");
      purchase.href = "/menu/signature_agent_card?url=" + encodeURIComponent(directory);
      purchase.hidden = false;
    } catch {
      if (version === generation) checked.textContent = "The directory check could not complete. No result is assumed; you can try again.";
    } finally { if (version === generation) check.disabled = false; }
  });
}
