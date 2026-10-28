// Keep Dice Forge's small recipe bundle sourced from EffectBuilder's real presets.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const esbuild = require('../frontend/node_modules/esbuild');
const root = path.resolve(__dirname, '..');
const chosen = {
  caster: ['Cinder Hands', 'Rimebound Hands', 'Storm Charge', 'Arcane Focus'],
  target: ['Thunderwake', 'Hexed Ground', 'Fractured Force', 'Fey Departure'],
};
const recipes = [];
for (const [kind, names] of Object.entries(chosen)) {
  const source = `effectbuilder-studio/src/app/effects/ambient-${kind}-presets.ts`;
  const outfile = path.join(os.tmpdir(), `lw-dice-${kind}-${process.pid}.cjs`);
  try {
    esbuild.buildSync({ entryPoints: [path.join(root, source)], outfile, bundle: true, platform: 'node', format: 'cjs' });
    const entries = require(outfile)[`${kind.toUpperCase()}_AMBIENT_SPECS`];
    for (const name of names) {
      const recipe = entries.find(e => e.name === name);
      if (!recipe) throw new Error(`Missing EffectBuilder recipe: ${name}`);
      recipes.push({ ...recipe, source, sourceKind: kind });
    }
  } finally { fs.rmSync(outfile, { force: true }); }
}
const output = path.join(root, 'frontend/src/app/features/dice/engine/effects/effectbuilder-recipes.json');
fs.writeFileSync(output, JSON.stringify(recipes, null, 2) + '\n');
console.log(`Synced ${recipes.length} EffectBuilder recipes`);
