import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { build } = require('esbuild');
const temp = await mkdtemp(join(tmpdir(), 'lw-atlas-tests-'));
try {
  const out = join(temp, 'atlas-tool.test.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('./atlas-tool.test.ts', import.meta.url))],
    outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'warning' });
  const result = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }

