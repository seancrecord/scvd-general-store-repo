/**
 * Portable calling-card setup and Node fetch integration. No dependencies,
 * automatic payments. Local key setup and reporting require explicit action.
 * Browser setup uses the same
 * normalizer as the downloaded module; supported inputs are deliberately finite.
 */
export const CARD_VERSION = "scvd-calling-card/1";
export const INPUT_LIMIT = 16384;
export const DIRECTORY_PATH = "/.well-known/http-message-signatures-directory";
const encoder = new TextEncoder();
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const aliases = {
  name: ["name", "agent_name", "display_name"],
  signature_agent: ["signature_agent", "signatureAgent", "directory_url"],
  contact_url: ["contact_url", "contact"],
  public_key: ["public_key", "publicKey", "jwk"],
  allowed_origins: ["allowed_origins", "destinations"],
  networks: ["networks", "payment_networks"],
  runtime: ["runtime", "integration"],
};
const secretField = /^(?:d|private[-_]?key|secret(?:[-_]?key)?|api[-_]?key|api[-_]?secret|seed|seed[-_]?phrase|mnemonic|authorization|cookie|password|access[-_]?token|refresh[-_]?token|payment[-_]?signature)$/i;

function containsSecret(value, depth = 0) {
  if (depth > 12) throw new Error("input_too_deep");
  if (typeof value === "string") return /-----BEGIN [^-]*PRIVATE KEY-----|\bBearer\s+\S+/i.test(value);
  if (Array.isArray(value)) return value.some(item => containsSecret(item, depth + 1));
  return isRecord(value) && Object.entries(value).some(([key, item]) => secretField.test(key) || containsSecret(item, depth + 1));
}

function httpsUrl(value, originOnly = false) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("invalid_url");
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("invalid_url");
  return originOnly ? url.origin : url.href;
}

function base64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
function base64url(bytes) {
  return base64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function keyBytes(x) {
  if (typeof x !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(x)) throw new Error("invalid_public_key");
  const bytes = Uint8Array.from(atob(x.replaceAll("-", "+").replaceAll("_", "/") + "="), char => char.charCodeAt(0));
  if (bytes.length !== 32 || base64url(bytes) !== x) throw new Error("invalid_public_key");
  return bytes;
}
function publicJwk(value) {
  if (!isRecord(value) || value.kty !== "OKP" || value.crv !== "Ed25519" || "d" in value) throw new Error("invalid_public_key");
  keyBytes(value.x);
  return { kty: "OKP", crv: "Ed25519", x: value.x };
}

function fieldValue(field, value) {
  if (field === "name") {
    if (typeof value !== "string" || !value.trim() || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) throw new Error("invalid_name");
    return value.trim();
  }
  if (field === "signature_agent" || field === "contact_url") return httpsUrl(value);
  if (field === "public_key") return publicJwk(value);
  if (field === "runtime") {
    if (value !== "node-fetch") throw new Error("unsupported_runtime");
    return value;
  }
  const items = typeof value === "string" ? value.split(/[\s,]+/).filter(Boolean) : value;
  if (!Array.isArray(items) || items.length > 32) throw new Error("invalid_list");
  return [...new Set(items.map(item => {
    if (field === "allowed_origins") return httpsUrl(item, true);
    if (typeof item !== "string" || !/^[a-z0-9-]{3,8}:[A-Za-z0-9_-]{1,32}$/.test(item)) throw new Error("network_id_required");
    return item;
  }))].sort();
}

function parseInput(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  if (!text || encoder.encode(text).length > INPUT_LIMIT) throw new Error("input_limit");
  if (typeof input !== "string") return input;
  if (/^\s*[\[{]/.test(text)) return JSON.parse(text);
  // Keep duplicate labels: silently keeping the last value would hide conflicts.
  return text.split(/\r?\n/).filter(line => line.trim()).map(line => {
    const match = /^\s*([a-zA-Z_][a-zA-Z_ -]*?)\s*[:=]\s*(.+?)\s*$/.exec(line);
    if (!match) throw new Error("labeled_input_required");
    let value = match[2];
    if (/^[\[{]/.test(value)) value = JSON.parse(value);
    return { [match[1].trim().replaceAll(" ", "_")]: value };
  });
}

/** Public fields only. Source documents and unsupported values never ride the card. */
export function normalizeCallingCard(input, { resolutions = {} } = {}) {
  const gaps = [];
  const fields = {};
  const choices = {};
  const sourcesByField = {};
  let parsed;
  try {
    parsed = parseInput(input);
    if (containsSecret(parsed) || containsSecret(resolutions)) throw new Error("secret_input");
  } catch (error) {
    const known = ["input_limit", "input_too_deep", "secret_input", "labeled_input_required"];
    return { card: null, fields, gaps: [{ code: known.includes(error.message) ? error.message : "invalid_input", field: "input", blocking: true }], ready: false, ignored_fields: 0 };
  }
  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (records.length > 64 || records.some(row => !isRecord(row))) return { card: null, fields, gaps: [{ code: "invalid_input", field: "input", blocking: true }], ready: false, ignored_fields: 0 };
  if (records.some(row => row.schema !== undefined && row.schema !== CARD_VERSION)) return { card: null, fields, gaps: [{ code: "unsupported_schema", field: "schema", blocking: true }], ready: false, ignored_fields: 0 };
  const sources = records.flatMap(row => [row, ...[row.identity, row.agent].filter(isRecord)]);
  let ignored = 0;
  const knownKeys = new Set([...Object.values(aliases).flat(), "identity", "agent", "schema", "user_agent"]);
  for (const row of sources) ignored += Object.keys(row).filter(key => !knownKeys.has(key)).length;
  const normalized = {};
  for (const [field, names] of Object.entries(aliases)) {
    sourcesByField[field] = sources.flatMap((row,index) => names.filter(name => Object.hasOwn(row,name)).map(name=>`Input ${index+1}: ${name}`));
    const candidates = Object.hasOwn(resolutions,field) ? [resolutions[field]] : sources.flatMap(row => names.filter(name => Object.hasOwn(row, name)).map(name => row[name]));
    if (!candidates.length) { fields[field] = "missing"; continue; }
    try {
      const values = candidates.map(value => fieldValue(field, value));
      choices[field] = [...new Map(values.map(value=>[JSON.stringify(value),value])).values()];
      if (new Set(values.map(value => JSON.stringify(value))).size !== 1) {
        fields[field] = "conflicting";
        gaps.push({ code: "conflicting_input", field, blocking: true });
      } else {
        fields[field] = Object.hasOwn(resolutions,field) ? "chosen" : "provided";
        normalized[field] = values[0];
      }
    } catch (error) {
      fields[field] = "unsupported";
      gaps.push({ code: error.message, field, blocking: true });
    }
  }
  if (fields.runtime === "missing") { normalized.runtime = "node-fetch"; fields.runtime = "derived"; }
  if (fields.name === "missing") gaps.push({ code: "name_required", field: "name", blocking: true });
  if (!normalized.allowed_origins?.length) gaps.push({ code: "destinations_required", field: "allowed_origins", blocking: true });
  if (!normalized.signature_agent || !normalized.public_key) gaps.push({ code: "unsigned_introduction", field: "signature_agent", blocking: false });
  if (!normalized.networks?.length) gaps.push({ code: "payment_capabilities_unknown", field: "networks", blocking: false });
  const product = (normalized.name ?? "Agent").normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Agent";
  const directoryComment = normalized.signature_agent?.replace(/[\\()]/g, "\\$&");
  const card = {
    schema: CARD_VERSION,
    name: normalized.name ?? "",
    runtime: normalized.runtime ?? "",
    user_agent: `${product}/1.0${directoryComment ? ` (+${directoryComment})` : ""}`,
    ...(normalized.signature_agent ? { signature_agent: normalized.signature_agent } : {}),
    ...(normalized.public_key ? { public_key: normalized.public_key } : {}),
    ...(normalized.contact_url ? { contact_url: normalized.contact_url } : {}),
    allowed_origins: normalized.allowed_origins ?? [],
    networks: normalized.networks ?? [],
  };
  return { card, fields, choices, sources: sourcesByField, gaps, ready: !gaps.some(gap => gap.blocking), ignored_fields: ignored };
}

export const GAP_MESSAGES = {
  input_limit: "Use a smaller public configuration (at most 16 KB).",
  input_too_deep: "Use a flat public profile instead of the full configuration.",
  secret_input: "Private material was detected. Remove credentials and private keys; nothing was uploaded or exported.",
  invalid_input: "Paste a JSON object, an array of public profiles, or labeled lines.",
  labeled_input_required: "Give each value a label, such as name: My Agent.",
  invalid_name: "Use a name of 1–120 characters without control characters.",
  name_required: "Add the name your agent should introduce itself with.",
  invalid_url: "Use a public HTTPS URL without credentials, a query, or a fragment.",
  invalid_public_key: "Use an Ed25519 public JWK with kty, crv, and x. Private keys stay in your own signer.",
  invalid_list: "Use a list of at most 32 destinations or network identifiers.",
  conflicting_input: "These inputs disagree. Keep one value for this field, then review again.",
  unsupported_runtime: "This download supports Node fetch. Browser automation and other runtimes need their own integration.",
  unsupported_schema: "This card uses an unsupported schema version. Import its supported public fields explicitly instead.",
  network_id_required: "Use an explicit network identifier such as eip155:8453. A currency name alone does not identify a network.",
  destinations_required: "Add the HTTPS destinations allowed to receive this introduction.",
  unsigned_introduction: "Your name is a self-declaration. Signed introductions also need a public key, directory URL, and a connected local signer.",
  payment_capabilities_unknown: "Payment capabilities were not supplied. Your existing payment client remains in charge.",
};

/** RFC 7638 thumbprint; no private-key fields enter the canonical document. */
export async function keyThumbprint(key) {
  const jwk = publicJwk(key);
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })))));
}

/** Connect a CryptoKey already held by the caller. This module never exports it. */
export function webCryptoSigner(privateKey) {
  return bytes => crypto.subtle.sign("Ed25519", privateKey, bytes).then(result => new Uint8Array(result));
}

async function signedHeaders(card, authority, sign, tag, now, lifetime = 60) {
  const created = Math.floor(now() / 1000);
  if (!Number.isSafeInteger(created) || created < 0) throw new Error("invalid_clock");
  const keyid = await keyThumbprint(card.public_key);
  const authorityComponent = tag === "web-bot-auth" ? '"@authority"' : '"@authority";req';
  const components = tag === "web-bot-auth" ? '"@authority" "signature-agent"' : authorityComponent;
  if (!Number.isSafeInteger(lifetime)||lifetime<1) throw new Error("invalid_lifetime");
  const params = `(${components});created=${created};expires=${created + lifetime};keyid="${keyid}";alg="ed25519";nonce="${crypto.randomUUID()}";tag="${tag}"`;
  const base = `${authorityComponent}: ${authority}\n${tag === "web-bot-auth" ? `"signature-agent": ${JSON.stringify(card.signature_agent)}\n` : ""}"@signature-params": ${params}`;
  const bytes = encoder.encode(base);
  const signature = await sign(bytes.slice());
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw new Error("signing_failed");
  const key = await crypto.subtle.importKey("raw", keyBytes(card.public_key.x), "Ed25519", false, ["verify"]);
  if (!await crypto.subtle.verify("Ed25519", key, signature, bytes)) throw new Error("signer_key_mismatch");
  return { "Signature-Input": `card=${params}`, Signature: `card=:${base64(signature)}:`, ...(tag === "web-bot-auth" ? { "Signature-Agent": JSON.stringify(card.signature_agent) } : {}) };
}

/** Serve this response on your own HTTPS origin; no store hosting is involved. */
export async function createDirectoryResponse({ card, sign, now = Date.now, lifetime = 60 }) {
  const normalized = normalizeCallingCard(card);
  if (!normalized.ready || !normalized.card.public_key || !normalized.card.signature_agent || typeof sign !== "function") throw new Error("signing_setup_required");
  const profile = normalized.card;
  const headers = await signedHeaders(profile, new URL(profile.signature_agent).host, sign, "http-message-signatures-directory", now, lifetime);
  const kid = await keyThumbprint(profile.public_key);
  return new Response(JSON.stringify({ keys: [{ ...profile.public_key, kid }] }), { headers: { ...headers, "Content-Type": "application/http-message-signatures-directory+json", "Cache-Control": "no-store" } });
}

/**
 * Wrap the underlying transport BEFORE the existing payment client's retry logic.
 * Each invocation sends once. Redirects return to the caller for a new decision.
 * Signature scope is the destination authority and key-directory reference only;
 * it makes no claim about request bodies, payment authority or replay protection.
 */
export function createCallingCardFetch({ card, sign, fetch: transport = globalThis.fetch, onResult, now = Date.now }) {
  const normalized = normalizeCallingCard(card);
  if (!normalized.ready) throw new Error("invalid_card");
  const profile = normalized.card;
  if (sign && (!profile.signature_agent || !profile.public_key)) throw new Error("signing_setup_required");
  if (profile.signature_agent && profile.public_key && typeof sign !== "function") throw new Error("signer_required");
  const signed = typeof sign === "function";
  const allowed = new Set(profile.allowed_origins);
  const report = result => {
    // A diagnostics callback must never turn a completed paid request into a
    // thrown exception that a caller might interpret as permission to pay again.
    try { const pending = onResult?.(Object.freeze(result)); if (pending?.catch) pending.catch(() => {}); } catch { /* advisory only */ }
  };
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.username || url.password || !allowed.has(url.origin)) throw new Error("destination_not_allowed");
    if (["signature", "signature-input", "signature-agent"].some(name => request.headers.has(name))) throw new Error("existing_identity_signature");
    const headers = new Headers(request.headers);
    headers.set("User-Agent", profile.user_agent);
    if (signed) {
      let identity;
      try { identity = await signedHeaders(profile, url.host, sign, "web-bot-auth", now); }
      catch { report({ outcome: "signing_failed", introduction: "not_sent", identity_acceptance: "not_observed", payment: "not_attempted" }); throw new Error("signing_failed"); }
      for (const [name, value] of Object.entries(identity)) headers.set(name, value);
    }
    let response;
    try { response = await transport(new Request(request, { headers, redirect: "manual" })); }
    catch { report({ outcome: "network_error", introduction: "delivery_unknown", identity_acceptance: "not_observed", payment: "unknown", next_action: "reconcile_before_retry" }); throw new Error("request_outcome_unknown"); }
    const outcome = response.status === 402 ? "payment_required" : [401, 403].includes(response.status) ? "access_refused" : response.status === 429 ? "rate_limited" : response.status >= 300 && response.status < 400 ? "redirect_requires_decision" : response.ok ? "response_received" : "endpoint_error";
    report({ outcome, http_status: response.status, introduction: signed ? "signed" : "declared", identity_acceptance: response.headers.get("Calling-Card-Recognition")==="signature_verified" ? "receiver_reported_verified" : "not_observed", payment: response.status === 402 ? "challenge_received" : "not_observed", ...(response.status===402 ? { payment_diagnosis: diagnosePaymentChallenge(response,profile.networks) } : {}), next_action: response.status === 402 ? "existing_payment_client" : response.ok ? "read_response" : "inspect_before_retry" });
    return response;
  };
}

/** Reads only a bounded x402 v2 header; never consumes a payment response body. */
export function diagnosePaymentChallenge(response, networks = []) {
  const header=response.headers.get("payment-required");
  if(!header)return "challenge_body_not_read";
  if(header.length>16384)return "challenge_header_too_large";
  try {
    const challenge=JSON.parse(atob(header));
    if(challenge.x402Version!==2)return "unsupported_payment_version";
    if(!Array.isArray(challenge.accepts)||!challenge.accepts.length||challenge.accepts.length>32)return "malformed_challenge";
    const offers=challenge.accepts;
    if(offers.some(offer=>!isRecord(offer)||typeof offer.scheme!=="string"||typeof offer.network!=="string"||typeof offer.asset!=="string"||typeof offer.amount!=="string"||!/^\d+$/.test(offer.amount)))return "malformed_challenge";
    if(!networks.length)return "wallet_networks_unknown";
    return offers.some(offer=>networks.includes(offer.network))?"declared_network_offered":"no_declared_network_offered";
  } catch{return "malformed_challenge";}
}

export async function actionEnvelope({action,audience,card,sign,extra={},now=Date.now}) {
  const payload={schema:"scvd-calling-card-action/1",action,audience,created:Math.floor(now()/1000),public_key:publicJwk(card.public_key),...extra};
  const signature=await sign(encoder.encode(JSON.stringify(payload)));
  return {payload,signature:[...signature].map(byte=>byte.toString(16).padStart(2,"0")).join("")};
}

/** Explicitly enabled reporting has its own transport and cannot recurse into payment calls. */
export function createReportQueue({service,card,sign,enabled=false,fetch:transport=globalThis.fetch}) {
  const pending=new Set();
  let sent=0,failed=0,dropped=0;
  return {
    submit(origin,result) {
      if(!enabled)return;
      try {const target=new URL(origin);if(target.protocol!=="https:"||target.origin!==origin||!card.allowed_origins.includes(origin)){dropped++;return;}}catch{dropped++;return;}
      if(pending.size>=8){dropped++;return;}
      const clean={event_id:crypto.randomUUID(),origin};
      for(const field of ["outcome","http_status","introduction","identity_acceptance","payment","payment_diagnosis","next_action"]) if(result[field]!==undefined)clean[field]=result[field];
      const task=(async()=>{
        try {
          const body=await actionEnvelope({action:"report",audience:service.origin,card,sign,extra:{consent:true,report:clean}});
          const response=await transport(service.origin+service.paths.reports,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(3000)});
          if(response.ok)sent++;else failed++;
          await response.body?.cancel();
        } catch {failed++;}
      })();
      pending.add(task);void task.finally(()=>pending.delete(task));
    },
    async flush(){await Promise.allSettled([...pending]);return {sent,failed,dropped};},
  };
}

/** Node-only installation. Invoked by an explicit command, never during import. */
export async function localCallingCardState(moduleUrl,config,command,{fetch:transport=globalThis.fetch}={}) {
  const fs=await import("node:fs/promises");
  const {fileURLToPath}=await import("node:url");
  const path=await import("node:path");
  const root=path.join(path.dirname(fileURLToPath(moduleUrl)),"."+path.basename(fileURLToPath(moduleUrl))+".local");
  const file=path.join(root,"identity.json");
  const read=async()=>{
    const directory=await fs.lstat(root);
    if(!directory.isDirectory()||directory.isSymbolicLink()||(process.platform!=="win32"&&(directory.mode&0o077)))throw new Error("private_directory_permissions_required");
    const stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||(process.platform!=="win32"&&(stat.mode&0o077)))throw new Error("private_file_permissions_required");
    return JSON.parse(await fs.readFile(file,"utf8"));
  };
  let state;
  try {state=await read();}catch(error){if(error.code!=="ENOENT")throw error;}
  if(!state) {
    if(command!=="setup")throw new Error("run_setup_first");
    await fs.mkdir(root,{mode:0o700,recursive:true});
    const directory=await fs.lstat(root);
    if(!directory.isDirectory()||directory.isSymbolicLink()||(process.platform!=="win32"&&(directory.mode&0o077)))throw new Error("private_directory_permissions_required");
    try{await fs.writeFile(path.join(root,".gitignore"),"*\n",{mode:0o600,flag:"wx"});}catch(error){if(error.code!=="EEXIST")throw error;}
    const pair=await crypto.subtle.generateKey("Ed25519",true,["sign","verify"]);
    const key=publicJwk(await crypto.subtle.exportKey("jwk",pair.publicKey));
    const kid=await keyThumbprint(key);
    state={card:{...config.card,public_key:key,signature_agent:config.service.origin+config.service.paths.keys+"/"+kid},private_key:await crypto.subtle.exportKey("jwk",pair.privateKey)};
    // Persist before publishing so a lost response never causes silent identity replacement.
    await fs.writeFile(file,JSON.stringify(state),{mode:0o600,flag:"wx"});
  }
  // A newly reviewed download can update destinations and public details without
  // replacing its saved key or silently retaining the previous permissions.
  const reviewed=normalizeCallingCard({...config.card,public_key:state.card.public_key,signature_agent:state.card.signature_agent});
  if(!reviewed.ready)throw new Error("invalid_local_card");
  if(new URL(reviewed.card.signature_agent).origin!==config.service.origin)throw new Error("local_identity_service_mismatch");
  const key=await crypto.subtle.importKey("jwk",state.private_key,"Ed25519",false,["sign"]);
  const sign=webCryptoSigner(key);
  const card=reviewed.card;
  if(["setup","renew","revoke"].includes(command)) {
    const extra={};
    if(command!=="revoke") {
      const response=await createDirectoryResponse({card,sign,lifetime:config.service.term_seconds});
      extra.directory={signature_input:response.headers.get("signature-input"),signature:response.headers.get("signature")};
    }
    const body=await actionEnvelope({action:command==="revoke"?"revoke":"publish",audience:config.service.origin,card,sign,extra});
    const response=await transport(config.service.origin+config.service.paths.keys,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!response.ok){await response.body?.cancel();throw new Error("publication_not_confirmed_keep_local_key");}
    return {card,sign,registration:await response.json()};
  }
  return {card,sign};
}

export function guidedModule(source,card,service,{shareReports=false}={}) {
  const normalized=normalizeCallingCard(card);
  if(!normalized.ready)throw new Error("invalid_card");
  const origin=new URL(service.origin);
  if(origin.protocol!=="https:"||origin.origin!==service.origin)throw new Error("invalid_service");
  for(const field of ["keys","observe","reports"])if(typeof service.paths?.[field]!=="string"||!service.paths[field].startsWith("/")||service.paths[field].startsWith("//")||new URL(service.paths[field],origin).origin!==origin.origin)throw new Error("invalid_service_path");
  const config={card:normalized.card,service,shareReports:shareReports===true};
  return source+`\n\nconst localConfig=${JSON.stringify(config,null,2)};
export async function connectLocal({onResult,shareReports=localConfig.shareReports,fetch:transport=globalThis.fetch}={}) {
  const {card,sign}=await localCallingCardState(import.meta.url,localConfig,'load');
  const reports=createReportQueue({service:localConfig.service,card,sign,enabled:shareReports===true,fetch:transport});
  const request=async(input,init)=>{
    const destination=new URL(input instanceof Request?input.url:String(input)).origin;
    const client=createCallingCardFetch({card,sign,fetch:transport,onResult:result=>{
      reports.submit(destination,result);
      try{const pending=onResult?.(result);if(pending?.catch)pending.catch(()=>{});}catch{}
    }});
    return client(input,init);
  };
  request.flushReports=()=>reports.flush();
  request.observe=()=>createCallingCardFetch({card:{...card,allowed_origins:[localConfig.service.origin]},sign,fetch:transport})(localConfig.service.origin+localConfig.service.paths.observe);
  return request;
}
if(typeof process!=='undefined'&&process.release?.name==='node'&&process.argv[1]) {
  const {pathToFileURL}=await import('node:url');
  if(pathToFileURL(process.argv[1]).href===import.meta.url) {
    try {
      const command=process.argv[2];
      if(['--setup','--renew','--revoke'].includes(command)) {
        const result=await localCallingCardState(import.meta.url,localConfig,command.slice(2));
        console.log(JSON.stringify(result.registration));
        console.log(command==='--revoke'?'Revocation recorded; propagation can take time.':'Public directory published. Run --observe to verify one introduction.');
      } else if(command==='--observe') {
        const request=await connectLocal({shareReports:false});
        const response=await request.observe();
        console.log(JSON.stringify(await response.json()));
        if(!response.ok)process.exitCode=1;
      } else if(command?.startsWith('https://')) {
        const request=await connectLocal({onResult:result=>console.log(JSON.stringify(result))});
        const response=await request(command);await response.body?.cancel();
        console.log(JSON.stringify({report_delivery:await request.flushReports()}));
        if(!response.ok)process.exitCode=1;
      } else {
        console.error('Use --setup to create a local key and publish its public directory; --observe to verify an introduction; --renew to renew; --revoke to revoke; or an approved HTTPS URL to send one GET.');process.exitCode=2;
      }
    } catch {
      console.error('Operation not confirmed. Keep your local identity file. Check the destination and service availability before retrying; no automatic retry or payment was made.');process.exitCode=2;
    }
  }
}
`;
}

/** A single download can be imported as a transport or explicitly run once. */
export function configuredModule(source, card) {
  const normalized = normalizeCallingCard(card);
  if (!normalized.ready) throw new Error("invalid_card");
  return source + `\n\n// Your reviewed public configuration. Private signers stay in your application.
export const configuredCard = ${JSON.stringify(normalized.card, null, 2)};
export function connect(options = {}) {
  return createCallingCardFetch({ ...options, card: configuredCard });
}
// Importing this file sends nothing. Running it explicitly sends one GET.
if (typeof process !== 'undefined' && process.release?.name === 'node' && process.argv[1]) {
  const { pathToFileURL } = await import('node:url');
  if (pathToFileURL(process.argv[1]).href === import.meta.url) {
    const destination = process.argv[2];
    if (!destination) {
      console.error('Usage: node my-calling-card.mjs HTTPS_DESTINATION [LOCAL_SIGNER_MODULE]');
      console.error('The signer module exports sign(bytes) returning a Uint8Array. Required only for signed cards.');
      process.exitCode = 2;
    } else {
      try {
        let sign;
        if (configuredCard.public_key && configuredCard.signature_agent) {
          if (!process.argv[3]) throw new Error('signer_required');
          const { resolve } = await import('node:path');
          ({ sign } = await import(pathToFileURL(resolve(process.argv[3])).href));
        }
        const request = connect({ sign, onResult: result => console.log(JSON.stringify(result)) });
        const response = await request(destination);
        await response.body?.cancel();
        if (!response.ok) process.exitCode = 1;
      } catch {
        console.error('Request not completed. Check the approved destination and local signer. If an outcome was unknown, reconcile before retrying. No automatic retry was made.');
        process.exitCode = 2;
      }
    }
  }
}
`;
}
