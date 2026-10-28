const esbuild = require('../frontend/node_modules/esbuild');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const output = path.join(os.tmpdir(), `lw-dice-enhancements-${process.pid}.cjs`);
try {
  esbuild.buildSync({ entryPoints: [path.join(__dirname, 'dice-enhancements-regression.ts')], bundle: true, platform: 'node', outfile: output });
  require(output);
} finally { fs.rmSync(output, { force: true }); }
