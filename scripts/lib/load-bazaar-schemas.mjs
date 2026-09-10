import { build } from "esbuild";
import { fileURLToPath } from "node:url";

export async function loadBazaarSchemas() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const built = await build({
    stdin: { contents: 'import { buyInputSchema } from "./src/lib/bazaar-discovery"; import { MENU_ITEMS } from "./src/store/menu"; export default MENU_ITEMS.map(item => ({ item: item.id, schema: buyInputSchema(item) }));', resolveDir: root, sourcefile: "bazaar-schemas.ts", loader: "ts" },
    bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
  });
  return (await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"))).default;
}
