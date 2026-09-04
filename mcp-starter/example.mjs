// Talk to the starter in-process: initialize, list the five tools, look one defect up.
import { handle } from "./server.mjs";

console.log(JSON.stringify(await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }), null, 2));
const list = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
console.log(list.result?.tools?.map((tool) => tool.name));
const defect = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_defect_definition", arguments: { id: "no-402" } } });
console.log(JSON.stringify(defect.result?.structuredContent ?? defect, null, 2));
