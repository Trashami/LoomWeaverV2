const esbuild = require('../frontend/node_modules/esbuild');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const output = path.join(os.tmpdir(), `lw-dice-geometry-${process.pid}.cjs`);
// Conservative metrics make the algorithm test independent of platform fonts.
global.document = { createElement: () => ({ getContext: () => ({
  font: '', measureText(label) { return { width: label.length * 75,
    actualBoundingBoxLeft: label.length * 37.5, actualBoundingBoxRight: label.length * 37.5,
    actualBoundingBoxAscent: 80, actualBoundingBoxDescent: 20 }; },
}) }) };
try {
  esbuild.buildSync({ entryPoints: [path.join(__dirname, 'dice-geometry-regression.ts')],
    bundle: true, platform: 'node', format: 'cjs', outfile: output,
    nodePaths: [path.join(__dirname, '../frontend/node_modules')] });
  console.log(require(output).runDiceGeometryRegression());
} finally { if (fs.existsSync(output)) fs.unlinkSync(output); }
