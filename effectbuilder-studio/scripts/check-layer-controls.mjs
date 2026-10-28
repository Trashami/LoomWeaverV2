import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['scripts/layer-controls.test.ts'],bundle:true,packages:'external',platform:'node',format:'esm',outfile:'dist/layer-controls.test.mjs'});
process.exitCode=spawnSync(process.execPath,['dist/layer-controls.test.mjs'],{stdio:'inherit'}).status??1;
