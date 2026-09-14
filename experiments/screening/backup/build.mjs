import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
for(const name of ['restore-cli','encrypted-cli','collector','collector-cli','b2','gateway']) {
 const entry=fileURLToPath(new URL(`./${name}.ts`,import.meta.url));
 await build({entryPoints:[entry],outfile:fileURLToPath(new URL(`./.build-check/${name}.mjs`,import.meta.url)),platform:'node',format:'esm',target:'node22',bundle:true,sourcemap:true});
}
