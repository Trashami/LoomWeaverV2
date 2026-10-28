const esbuild = require('../frontend/node_modules/esbuild');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const file = path.join(os.tmpdir(), `lw-dice-motion-${process.pid}.cjs`);
try {
  esbuild.buildSync({ entryPoints: [path.join(__dirname, 'dice-motion-regression.ts')],
    bundle: true, platform: 'node', format: 'cjs', outfile: file,
    nodePaths: [path.join(__dirname, '../frontend/node_modules')] });
  require(file);
} finally { if (fs.existsSync(file)) fs.unlinkSync(file); }
