import { SeededScatterEngine } from '../../frontend/src/app/features/maps/engine/scatter/seeded-scatter.engine';
import { GlbModelCache } from '../../frontend/src/app/features/maps/engine/rendering/glb-model-cache';
import { TransformNode } from '@babylonjs/core';
import { createWaterVolume } from '../../frontend/src/app/features/maps/engine/water/water-volume';
import { groupWaterNetworks, sampleWaterNetwork } from '../../frontend/src/app/features/maps/engine/water/water-network-field';
import { createWaterNetworkMesh } from '../../frontend/src/app/features/maps/engine/water/water-network-mesh';
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
  editor.beginStroke(); editor.draw(0,0); editor.draw(2,0); editor.draw(2.01,0); editor.finish();
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

test('a slow held stroke remains one river and release ignores stale drawing callbacks',()=>{
  let scene={revision:1,waterSplines:[]} as unknown as MapSceneGraphState;
  let snapshots=0;
  const editor=new MapWaterEditor(()=>scene,update=>{scene=update(scene);},()=>snapshots++,()=>0);
  editor.beginStroke();
  for(let i=0;i<50;i++){editor.draw(i*.07,0);editor.draw(i*.07,0);}
  editor.finish();editor.draw(9,9);
  assert.equal(scene.waterSplines.length,1);assert.equal(snapshots,1);
  assert.ok(scene.waterSplines[0].points.length>15);
  const profile=buildWaterProfile(scene.waterSplines[0],()=>0);
  assert.ok(profile.samples.length>10);
});
test('tributaries merge into one surface with no foam shoreline through the junction',()=>{
  const profiles=[buildWaterProfile(river([[-6,0,0],[6,0,0]]),()=>0),
    buildWaterProfile({...river([[0,0,-6],[0,0,0]]),id:'branch'},()=>0)];
  const groups=groupWaterNetworks(profiles);assert.equal(groups.length,1);
  const junction=sampleWaterNetwork(groups[0],0,0);
  assert.ok(junction.coverage>1.4);assert.ok(junction.depth>.99);
  assert.ok(Number.isFinite(junction.dx)&&Number.isFinite(junction.dz));
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const mesh=createWaterNetworkMesh(scene,groups[0]);
    assert.equal(scene.meshes.length,1);assert.ok(mesh.getTotalVertices()>100);
    assert.ok(mesh.getVerticesData('normal')!.filter((_,i)=>i%3===1).every(n=>n>.99));
    assert.equal(mesh.getVerticesData('waterFlow')!.length,mesh.getTotalVertices()*4);
    assert.ok(mesh.getVerticesData('position')!.every(Number.isFinite));
  }finally{scene.dispose();engine.dispose();}
});
test('legacy circular dabs become a connected surface without internal cap edges',()=>{
  const profiles=Array.from({length:12},(_,i)=>buildWaterProfile({...river([[i*.7,0,0]]),id:'dab-'+i},()=>0));
  const groups=groupWaterNetworks(profiles);assert.equal(groups.length,1);
  for(let x=.5;x<7;x+=.25)assert.ok(sampleWaterNetwork(groups[0],x,0).depth>.99);
});
test('feathering broadens natural banks without changing brush width or deepening the bed repeatedly',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const ground=MeshBuilder.CreateGround('bank',{width:36,height:27,subdivisions:64},scene);
    const base=new Float32Array(ground.getVerticesData('position')!);
    const hard={...river([[-5,0,0],[5,0,0]]),settings:{...DEFAULT_WATER,bankFeathering:0}};
    WaterChannelTerrain.configure(scene,[hard]);const a=base.slice();WaterChannelTerrain.apply(scene,a,36,27);
    WaterChannelTerrain.configure(scene,[{...hard,settings:{...hard.settings,bankFeathering:100}}]);
    const b=base.slice();WaterChannelTerrain.apply(scene,b,36,27);
    assert.ok(b.filter((v,i)=>i%3===1&&v<0).length>a.filter((v,i)=>i%3===1&&v<0).length);
    const again=base.slice();WaterChannelTerrain.apply(scene,again,36,27);assert.deepEqual(b,again);
  }finally{scene.dispose();engine.dispose();}
});


test('water volume closes every surface boundary and reaches the carved bed',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const profiles=[buildWaterProfile(river([[-4,0,0],[4,0,0]]),()=>0)];
    const top=createWaterNetworkMesh(scene,profiles);
    const shell=createWaterVolume(scene,top,profiles,()=>-1.3);
    const vertices=shell.getVerticesData('position')!;
    assert.ok(vertices.every(Number.isFinite));
    const count=top.getTotalVertices();
    for(let i=0;i<count;i++) assert.ok(vertices[(count+i)*3+1]<=-1.3);
    const edges=new Map<string,number>();
    for(const triangles of [top.getIndices()!,shell.getIndices()!]) for(let i=0;i<triangles.length;i+=3) {
      for(const [a,b] of [[triangles[i],triangles[i+1]],[triangles[i+1],triangles[i+2]],[triangles[i+2],triangles[i]]]) {
        const key=Math.min(a,b)+':'+Math.max(a,b);edges.set(key,(edges.get(key)??0)+1);
      }
    }
    assert.ok([...edges.values()].every(n=>n===2),'surface plus shell is watertight');
  }finally{scene.dispose();engine.dispose();}
});

test('downhill rapids persist into runout then settle on the flat',()=>{
  const profile=buildWaterProfile(river([[0,0,0],[12,0,0]]),x=>Math.max(0,4-x));
  assert.ok(profile.samples.find(p=>p.x>2)!.fall>.8);
  assert.ok(profile.samples.find(p=>p.x>4.5)!.fall>.1);
  assert.ok(profile.samples.at(-1)!.fall<.03);
});


test('scatter repeats only the chosen asset beyond six instances and keeps Y upright',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  const original=GlbModelCache.getOrLoadTemplate;
  try {
    const pivot=new TransformNode('plant',scene);
    MeshBuilder.CreateBox('leaf',{size:1},scene).parent=pivot;
    pivot.setEnabled(false);
    const urls:string[]=[];
    GlbModelCache.getOrLoadTemplate=(_scene,url)=>{urls.push(url);return {
      url,templatePivot:pivot,rawWidth:1,rawHeight:1,rawDepth:1,baseOffsetY:0};};
    const cluster={id:'flowers',x:2,z:3,radius:4.5,density:65,seed:42,modelUrl:'/flowers.glb'};
    const render=(density:number)=>SeededScatterEngine.rebuildScatterInstances(scene,0,0,[{...cluster,density}]);
    const count=render(65);assert.ok(count>6);assert.deepEqual(urls,['/flowers.glb']);
    const placements=()=>scene.transformNodes.filter(n=>/^lw-scatter-node-flowers-\d+$/.test(n.name))
      .map(n=>[...n.position.asArray(),...n.rotation.asArray()]);
    const before=placements();assert.equal(before.length,count);
    assert.ok(before.every(p=>p[3]===0&&p[5]===0));
    assert.ok(new Set(before.map(p=>p[4])).size>6);
    assert.ok(before.every(p=>Math.hypot(p[0]-2,p[2]-3)<=4.5));
    render(65);assert.deepEqual(placements(),before);
    assert.ok(render(30)<count);assert.equal(render(0),0);
    GlbModelCache.getOrLoadTemplate=()=>null;
    assert.equal(render(65),0);
    assert.equal(scene.meshes.filter(m=>m.name.startsWith('lw-scatter-')).length,0);
  }finally{GlbModelCache.getOrLoadTemplate=original;scene.dispose();engine.dispose();}
});
