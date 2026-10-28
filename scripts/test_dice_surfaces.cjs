const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const source = fs.readFileSync(path.join(__dirname,
  '../frontend/src/app/features/dice/engine/materials/material-surface.texture.ts'), 'utf8');
const exportsObject = {};
function context() {
  return {
    pixels: null,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(image) { this.pixels = image.data; },
    drawImage(canvas) { this.pixels = canvas.getContext().pixels; },
  };
}
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: exportsObject,
  document: { createElement: () => { const ctx = context(); return { getContext: () => ctx }; } },
});
const draw = exportsObject.drawMaterialSurface;
const render = (style, height = false, intensity = 1, color = '#353535') => {
  const ctx = context();
  assert.equal(draw(ctx, 64, style, color, height, intensity), true);
  return ctx.pixels;
};
const variance = pixels => {
  const values = Array.from(pixels).filter((_, i) => i % 4 === 0);
  const mean = values.reduce((a, b) => a + b) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
};
for (const style of ['wood', 'stone', 'glass', 'obsidian', 'plastic']) {
  const color = render(style);
  assert.deepEqual(render(style), color, `${style} must be deterministic`);
  assert.equal(color.length, 64 * 64 * 4);
  assert.ok(color.every((v, i) => i % 4 !== 3 || v === 255), 'opaque albedo for PBR');
}
assert.ok(variance(render('stone', true)) > 20, 'stone needs visible irregular relief');
assert.ok(variance(render('wood', true)) > 5, 'wood needs physical grain');
assert.ok(variance(render('obsidian', true)) < 1, 'polished obsidian must stay smooth');
assert.equal(variance(render('glass', true)), 0, 'glass must not have pitted relief');
assert.equal(variance(render('stone', true, 0)), 0, 'zero depth must flatten the surface');
assert.notDeepEqual(render('wood'), render('stone'), 'materials must be visibly distinct');
assert.notDeepEqual(render('wood', false, 1, '#ffffff'), render('wood'), 'tint cache must be isolated');
assert.equal(draw(context(), 64, 'metal', '#333333'), false, 'other materials retain their own renderer');
console.log('Dice surface regression checks passed: material identity, relief, determinism and cache isolation.');
