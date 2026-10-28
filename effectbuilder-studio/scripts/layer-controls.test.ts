import fs from 'node:fs';
import { makeSpellTemplates } from '../src/app/effects/spell-templates';
import { makeAmbientPresets } from '../src/app/effects/ambient-presets';
import assert from 'node:assert/strict';
import { createLayer, createEffect, parseEffect, EFFECT_KINDS, VARIANTS } from '../src/app/effects/effect-definition';
import { layerControls } from '../src/app/effects/layer-control-profile';
import { parseAura } from '../src/app/effects/aura-settings';
import { evaluateNativeLayer } from '../src/app/effects/babylon/native-frame';
const from={x:0,y:0},to={x:330,y:50};
const frame=(layer:any)=>{const {layer:ignored,...render}=evaluateNativeLayer(layer,layer.delay+layer.duration*.4,from,to);return JSON.stringify(render);};
const baseLayers=EFFECT_KINDS.flatMap(kind=>VARIANTS[kind].map(v=>({...createLayer(kind),variant:v.id})));
const presetLayers=[...makeSpellTemplates(),...makeAmbientPresets().map(p=>p.effect)].flatMap(e=>parseEffect(e).layers);
for(const layer of [...baseLayers,...presetLayers]){
 const kind=layer.kind,variant={id:layer.variant};
 const controls=layerControls(layer);
 assert.ok(controls.length,kind+' has a profile');
 assert.equal(new Set(controls.map(c=>c.key)).size,controls.length);
 for(const c of controls){
  const a=structuredClone(layer),b=structuredClone(layer);
  if(c.source==='motion'){(a.motion as any)[c.key]=c.min;(b.motion as any)[c.key]=c.max;}
  else if(c.source==='aura'){a.aura={...parseAura(a.aura,a.variant),[c.key]:c.min};b.aura={...parseAura(b.aura,b.variant),[c.key]:c.max};}
  else {(a as any)[c.key]=c.min;(b as any)[c.key]=c.max;}
  assert.ok(frame(a)!==frame(b),kind+'/'+variant.id+' control must affect rendered output: '+c.key);
 }
}
const aura=createLayer('aura');aura.variant='vortex';aura.aura=parseAura({strands:6,turns:4,height:130,width:2,rotation:-2,motes:33});
const e=createEffect();e.layers=[aura];const restored=parseEffect(JSON.parse(JSON.stringify(e))).layers[0];assert.deepEqual(restored.aura,aura.aura);assert.equal(frame(restored),frame(aura));
for(const variant of ['vortex','orbit','halo']){aura.variant=variant;for(const key of ['cone','direction','drag','trail'])assert.ok(!layerControls(aura).some(c=>c.key===key));}
assert.equal(parseAura({strands:Infinity,motes:200}).motes,80);
console.log('PASS all core control profiles affect rendered output, aura settings round-trip, unsupported aura controls hidden.');

fs.writeFileSync('dist/control-fixtures.json',JSON.stringify([...EFFECT_KINDS.flatMap(kind=>VARIANTS[kind].map(v=>{const e=createEffect();e.layers=[createLayer(kind)];e.layers[0].variant=v.id;return parseEffect(e);})),...makeSpellTemplates().map(parseEffect),...makeAmbientPresets().map(p=>parseEffect(p.effect)),e]));
