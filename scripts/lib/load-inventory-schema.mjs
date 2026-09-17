import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
export async function loadInventorySchema() {
 const root=fileURLToPath(new URL('../../',import.meta.url));
 // Production's evidence graph includes the canonical skill as a text module.
 const built=await build({entryPoints:[root+'scripts/lib/evidence-inventory-schema.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',loader:{'.md':'text'}});
 return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
}
