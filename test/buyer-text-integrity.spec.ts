import { beforeEach, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { NAME_CAP } from "@/lib/sanitize";
import { getAnchor } from "@/services/anchors";
import { listConfessions } from "@/services/confessions";
import { listTags } from "@/services/train";
import { getOrder } from "@/services/orders";
import { getPatronAnchor } from "@/services/patron-anchors";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, call, shelves, request, object, testEnv, facilitator, type Obj } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
let verifies = 0;
beforeEach(() => { verifies = facilitator.verifyCalls; });
function certificate(body: Obj): Obj { return Object.keys(object(body.certificate)).length ? object(body.certificate) : object(JSON.parse(String(body.signed_payload))); }
for (const menu of MENU_ITEMS) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${menu.id} ${door}: preserves a whole emoji at the published name boundary`, async () => {
    const item = items.find(i => i.id === menu.id)!, value = "n".repeat(NAME_CAP - 1) + "🧵";
    const args = { ...baseline(item), ...(item.id === "the_confession" ? { sign_as: value } : { agent_name: value }) };
    const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers[0]!;
    const bought = await sendLabor(item.id, door, args, await signLabor(offer), crypto.randomUUID());
    expect(bought.refused).toBe(false); expect(JSON.stringify(certificate(bought.body).name)).toBe(JSON.stringify(value)); expect(transfers).toBe(1);
  });
}
for (const id of ["the_collab", "aura_walk", "bitcoin_anchor"]) for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  it(`${id} ${door} ${network}: preserves valid rich text and boundary Unicode exactly`, async () => {
    const item = items.find(i => i.id === id)!, field = id === "bitcoin_anchor" ? "label" : "detail";
    const limit = Number(object(item.spec.inputs.properties[field]).maxLength);
    expect(limit).toBeGreaterThan(0);
    const prefix = "  SCVD-E2E vector<int> & 🧵\nExact text. ";
    const value = prefix + "x".repeat(limit - [...prefix].length - 1) + "🪡";
    const args = { ...baseline(item), [field]: value };
    const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers.find(o => o.network === network)!;
    const bought = await sendLabor(id, door, args, await signLabor(offer), crypto.randomUUID());
    expect(bought.refused).toBe(false);
    const retained = id === "bitcoin_anchor" ? (await getPatronAnchor(testEnv, String(bought.body.anchor_id)))?.label : (await getOrder(testEnv, String(bought.body.order_id)))?.detail;
    expect(JSON.stringify(retained)).toBe(JSON.stringify(value)); expect(transfers).toBe(1);
  });
}
for (const id of ["hello", "the_collab", "bitcoin_anchor"]) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${id} ${door}: refuses an over-limit supplied string before quoting`, async () => {
    const item = items.find(i => i.id === id)!, field = id === "hello" ? "agent_name" : id === "bitcoin_anchor" ? "label" : "detail";
    const limit = field === "agent_name" ? NAME_CAP : Number(object(item.spec.inputs.properties[field]).maxLength), args = { ...baseline(item), [field]: "🧵".repeat(limit + 1) };
    const refused = await sendLabor(id, door, args);
    expect(refused.quote).toBe(false); expect(refused.refused).toBe(true);
    expect(refused.body).toMatchObject({ code: "bad_request", charged: false, input_field: field, max_length: limit });
    expect(facilitator.verifyCalls).toBe(verifies); expect(transfers).toBe(0);
  });
}
for (const door of ["mcp", "mcp-standard"] as const) it(`${door}: rejects unpaired Unicode instead of signing altered text`, async () => {
  const result = await sendLabor("hello", door, { agent_name: "name\ud83d" });
  expect(result.refused).toBe(true); expect(result.quote).toBe(false);
  expect(result.body).toMatchObject({ input_field: "agent_name", charged: false });
});
for (const door of ["http", "mcp", "mcp-standard"] as const) it(`${door}: badge display clipping keeps an intact grapheme and escapes markup`, async () => {
  const item = items.find(i => i.id === "hello")!;
  const agent_name = "a".repeat(42) + "👩‍💻" + "<i>tail</i>";
  const args = { agent_name }, offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers[0]!;
  const bought = await sendLabor(item.id, door, args, await signLabor(offer), crypto.randomUUID());
  expect(bought.refused).toBe(false); expect(JSON.stringify(certificate(bought.body).name)).toBe(JSON.stringify(agent_name));
  const svg = await (await request(String(bought.body.badge_url))).text();
  expect(JSON.stringify(svg)).toContain(JSON.stringify("a".repeat(42) + "👩‍💻…").slice(1, -1));
  expect(/\ud83d(?![\udc00-\udfff])/.test(svg)).toBe(false); expect(svg.includes("<i>")).toBe(false);
});


for (const [id, field] of [["context_anchor", "summary"], ["the_confession", "confession"], ["graffiti_on_a_train", "tag"], ["the_mandate", "mandate"], ["coffees_for_closers", "win"]] as const) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${id} ${door}: the exact purchased text survives its own Unicode boundary`, async () => {
    const item = items.find(i => i.id === id)!, limit = Number(object(item.spec.inputs.properties[field]).maxLength);
    expect(Number.isFinite(limit)).toBe(true);
    const prefix = "  vector<int> & 🧵\n", value = prefix + "x".repeat(limit - [...prefix].length - 2) + "🪡 ";
    const args = { ...baseline(item), [field]: value };
    const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers[0]!;
    const bought = await sendLabor(id, door, args, await signLabor(offer), crypto.randomUUID());
    expect(bought.refused).toBe(false);
    const retained = id === "context_anchor" ? (await getAnchor(testEnv, String(bought.body.anchor_id)))?.anchor.summary
      : id === "the_confession" ? (await listConfessions(testEnv))[0]?.record.confession
      : id === "graffiti_on_a_train" ? (await listTags(testEnv))[0]?.record.tag
      : id === "the_mandate" ? object(bought.body.mandate).mandate_text : bought.body.win_recorded;
    expect(JSON.stringify(retained)).toBe(JSON.stringify(value));
    expect(transfers).toBe(1);
  });
}

for (const id of ["the_confession", "graffiti_on_a_train"]) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${id} ${door}: the stored buyer name agrees with its exact signed name`, async () => {
    const item = items.find(i => i.id === id)!, name = "  <i>Ada</i> & 🧵\n  ";
    const args = { ...baseline(item), [id === "the_confession" ? "sign_as" : "agent_name"]: name };
    const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers[0]!;
    const bought = await sendLabor(id, door, args, await signLabor(offer), crypto.randomUUID());
    expect(bought.refused).toBe(false); expect(certificate(bought.body).name).toBe(name);
    const retained = id === "the_confession" ? (await listConfessions(testEnv))[0]?.record.sign_as : (await listTags(testEnv))[0]?.record.name;
    expect(retained).toBe(name);
  });
}
