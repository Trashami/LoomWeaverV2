import { createWaterfallSpray } from '../../frontend/src/app/features/maps/engine/water/waterfall-spray';
import { MapWaterEditor } from '../../frontend/src/app/features/maps/application/map-water-editor';
import type { MapSceneGraphState } from '../../frontend/src/app/features/maps/engine/map-scene-contract';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { DEFAULT_WATER, normalizeWater } from '../../frontend/src/app/features/maps/engine/water/water-settings';
import { buildWaterProfile, channelBed } from '../../frontend/src/app/features/maps/engine/water/water-profile';
import { buildWaterGeometry } from '../../frontend/src/app/features/maps/engine/water/water-surface-geometry';
import { WaterChannelTerrain } from '../../frontend/src/app/features/maps/engine/water/water-channel-terrain';
import type { WaterSplineNode } from '../../frontend/src/app/features/maps/engine/map-scene-contract';
const river = (points: WaterSplineNode['points'], extra = {}): WaterSplineNode => ({
  id:'river',name:'Test river',width:3,colorHex:'#44aeb0',settings:DEFAULT_WATER,points,...extra,
});
test('river is resampled downhill regardless of drawing direction and never flows uphill', () => {
  const ground = (x: number) => x*.4;
  const profile = buildWaterProfile(river([[-5,0,0],[0,0,1],[5,0,0]]),ground);
  assert.ok(profile.samples.length > 20);
  assert.ok(profile.samples[0].x > profile.samples.at(-1)!.x);
  for (let i=1;i<profile.samples.length;i++) assert.ok(profile.samples[i].level <= profile.samples[i-1].level);
});
test('steep terrain becomes a falling sheet while gentle rivers remain streams', () => {
  const steep = buildWaterProfile(river([[0,0,0],[5,0,0]]),x=>x<2?4:0);
  assert.ok(steep.samples.some(p=>p.fall>0));
  const gentle = buildWaterProfile(river([[0,0,0],[5,0,0]]),x=>x*.02);
  assert.ok(gentle.samples.every(p=>p.fall===0));
});
test('pond has a single level controlled by its lowest bank and a rounded surface', () => {
  const profile = buildWaterProfile(river([[0,0,0]],{ settings:{...DEFAULT_WATER,mode:'pond',flowSpeed:0} }),x=>x*.2);
  assert.equal(profile.samples.length,1);
  assert.ok(profile.samples[0].level < -.3);
  const geometry = buildWaterGeometry(profile);
  for (let i=1;i<geometry.positions.length;i+=3) assert.ok(Math.abs(geometry.positions[i]-(profile.samples[0].level+.018))<1e-6);
  assert.ok(geometry.indices.length>1000);
  assert.ok(geometry.normals.filter((_,i)=>i%3===1).every(v=>v>.99));
});
test('river mesh has level cross sections, finite geometry and upward winding', () => {
  const profile = buildWaterProfile(river([[-5,0,0],[0,0,2],[5,0,0]]),x=>x*.2);
  const geometry = buildWaterGeometry(profile);
  assert.ok(geometry.positions.every(Number.isFinite));
  for (let row=0;row<profile.samples.length;row++) {
    const y=geometry.positions[row*9*3+1];
    for (let j=0;j<9;j++) assert.equal(geometry.positions[(row*9+j)*3+1],y);
  }
  assert.ok(geometry.normals.filter((_,i)=>i%3===1).every(v=>v>=0));
  assert.equal(geometry.data.length,geometry.positions.length/3*4);
});
test('channel lowers terrain, feathers banks and leaves distant terrain unchanged', () => {
  const profile = buildWaterProfile(river([[-5,0,0],[5,0,0]]),()=>0);
  assert.ok(channelBed(profile,0,0,0)<-.9);
  assert.ok(channelBed(profile,0,1.8,0)<0);
  assert.equal(channelBed(profile,0,10,0),0);
});
test('rebuilds do not accumulate excavation and removing water restores sculpted terrain', () => {
  const engine = new NullEngine(),scene = new Scene(engine);
  try {
    const ground = MeshBuilder.CreateGround('ground',{width:36,height:27,subdivisions:64},scene);
    const base = new Float32Array(ground.getVerticesData('position')!);
    for (let i=1;i<base.length;i+=3) base[i]=.7;
    const water = river([[-5,0,0],[5,0,0]]);
    WaterChannelTerrain.configure(scene,[water]);
    const first = base.slice(); WaterChannelTerrain.apply(scene,first,36,27);
    const second = base.slice(); WaterChannelTerrain.apply(scene,second,36,27);
    assert.deepEqual(first,second);
    assert.ok(first.some((v,i)=>i%3===1 && v<base[i]));
    assert.ok(Math.abs(WaterChannelTerrain.sampleBase(scene,0,0)-.7)<1e-6);
    WaterChannelTerrain.configure(scene,[]);
    const restored=base.slice(); WaterChannelTerrain.apply(scene,restored,36,27);
    assert.deepEqual(restored,base);
  } finally { scene.dispose();engine.dispose(); }
});
test('duplicate points, empty paths and invalid values cannot produce broken geometry', () => {
  assert.equal(buildWaterGeometry(buildWaterProfile(river([]),()=>0)).positions.length,0);
  const profile=buildWaterProfile(river([[0,0,0],[0,0,0]]),()=>0);
  assert.ok(buildWaterGeometry(profile).positions.every(Number.isFinite));
  const settings=normalizeWater({...DEFAULT_WATER,width:Infinity,depth:-2,foam:5,deepColor:'bad'});
  assert.equal(settings.width,1); assert.equal(settings.depth,.15); assert.equal(settings.foam,1);
  assert.equal(settings.deepColor,DEFAULT_WATER.deepColor);
});

test('one drag is one history entry; settings edit the selected waterbody and deletion is undoable', () => {
  let scene = { revision:1, waterSplines:[] } as unknown as MapSceneGraphState;
  const history: MapSceneGraphState[] = [];
  const editor = new MapWaterEditor(()=>scene,update=>{scene=update(scene);},()=>history.push(scene),()=>0);
  editor.draw(0,0); editor.draw(2,0); editor.draw(2.01,0); editor.finish();
  assert.equal(history.length,1); assert.equal(scene.waterSplines.length,1);
  assert.equal(scene.waterSplines[0].points.length,2);
  editor.change({...editor.settings(),width:5,foam:.9});
  assert.equal(scene.waterSplines[0].settings?.width,5);
  assert.equal(scene.waterSplines[0].width,5);
  editor.removeSelected(); assert.equal(scene.waterSplines.length,0);
  assert.equal(history.at(-1)!.waterSplines.length,1);
  scene = history[0]; assert.equal(scene.waterSplines.length,0);
});

test('waterfall spray has a bounded emitter budget across many waterbodies', () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const profile=buildWaterProfile(river([[0,0,0],[5,0,0]]),x=>x<2?4:0);
    for(let i=0;i<20;i++) createWaterfallSpray(scene,{...profile,id:'fall-'+i});
    assert.ok(scene.particleSystems.length>0);
    assert.ok(scene.particleSystems.length<=8);
  } finally {scene.dispose();engine.dispose();}
});
