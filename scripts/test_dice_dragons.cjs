const esbuild = require('../frontend/node_modules/esbuild');
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
const output = path.join(os.tmpdir(), `lw-dice-dragons-${process.pid}.cjs`);
try {
  esbuild.buildSync({ entryPoints: [path.join(__dirname, 'dice-dragon-regression.ts')], bundle: true,
    platform: 'node', format: 'cjs', outfile: output, nodePaths: [path.join(__dirname, '../frontend/node_modules')] });
  console.log(require(output).runDragonGeometryRegression());
} finally { if(fs.existsSync(output))fs.unlinkSync(output); }
