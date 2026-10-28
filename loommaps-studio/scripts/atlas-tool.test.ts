import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAtlas, applyAtlasBrush, sampleAtlas, strokePoints } from '../../frontend/src/app/features/maps/engine/atlas/atlas-terrain';
import { cloneAtlas, DEFAULT_ATLAS_BRUSH, validateAtlas } from '../../frontend/src/app/features/maps/engine/atlas/atlas-document';
import { atlasPreview } from '../../frontend/src/app/features/maps/engine/atlas/atlas-export';

test('landmass generation is deterministic, bounded, and includes coast, sea and high land',()=>{
  const a=createAtlas(91,64),b=createAtlas(91,64);assert.deepEqual(a.heights,b.heights);
  assert.notDeepEqual(a.heights,createAtlas(92,64).heights);assert.ok(Math.min(...a.heights)<-.2);assert.ok(Math.max(...a.heights)>.35);
  assert.equal(validateAtlas(a),a);
});
test('sculpting raises the center, feathers the edge, and preserves remote terrain',()=>{
  const d=createAtlas(91,64);d.heights.fill(0);applyAtlasBrush(d,'raise',0,0,{...DEFAULT_ATLAS_BRUSH,radius:30});
  assert.ok(sampleAtlas(d,0,0)>sampleAtlas(d,26,0));assert.equal(sampleAtlas(d,50,0),0);
  applyAtlasBrush(d,'lower',0,0,{...DEFAULT_ATLAS_BRUSH,radius:30});assert.ok(Math.abs(sampleAtlas(d,0,0))<1e-8);
});
test('slow and fast drag samples produce a continuous brush path',()=>{
  const points=strokePoints({x:-70,z:0},{x:70,z:0},8);assert.ok(points.length>60);
  const d=createAtlas(91,64);d.heights.fill(0);for(const p of points)applyAtlasBrush(d,'raise',p.x,p.z,{...DEFAULT_ATLAS_BRUSH,radius:8});
  for(let x=-65;x<65;x+=4)assert.ok(sampleAtlas(d,x,0)>0);
});
test('biome painting changes the material layer without changing elevations',()=>{
  const d=createAtlas(91,64),before=d.heights.slice();applyAtlasBrush(d,'biome',0,0,{...DEFAULT_ATLAS_BRUSH,radius:20,biome:3});
  assert.deepEqual(d.heights,before);assert.ok(d.biomes.includes(3));assert.equal(d.biomes[0],0);
});
test('mountain brush makes varied ridges and smoothing reduces a spike',()=>{
  const d=createAtlas(91,64);d.heights.fill(0);for(let i=0;i<8;i++)applyAtlasBrush(d,'mountains',0,0,{...DEFAULT_ATLAS_BRUSH,radius:30});
  assert.ok(Math.max(...d.heights)>.3);const k=32*65+32;d.heights[k]=2;
  applyAtlasBrush(d,'smooth',0,0,{...DEFAULT_ATLAS_BRUSH,radius:25,strength:1});assert.ok(d.heights[k]<2);
});
test('JSON round trip preserves the scene and stable campaign location references',()=>{
  const d=createAtlas(91,64);d.markers.push({id:'test-village',locationKey:'loc-old-campaign-id',name:'Willowford',kind:'village',x:0,z:0,color:'#d9b77a',visibility:'gm'});
  const loaded=validateAtlas(JSON.parse(JSON.stringify(d)));assert.deepEqual(d,loaded);
  const undo=cloneAtlas(d);d.heights[0]=1;d.markers[0].name='Changed';assert.notEqual(d.heights[0],undo.heights[0]);assert.equal(undo.markers[0].name,'Willowford');
});
test('malformed imports, nonfinite terrain and duplicate location links are rejected',()=>{
  const d=createAtlas(91,64);d.heights[0]=NaN;assert.throws(()=>validateAtlas(d));d.heights[0]=0;
  d.markers.push({id:'a',locationKey:'loc-a',name:'A',kind:'city',x:0,z:0,color:'#aabbcc',visibility:'gm'});d.markers.push({...d.markers[0],id:'b'});assert.throws(()=>validateAtlas(d));
  assert.throws(()=>validateAtlas({schemaVersion:2}));
});
test('player raster export never draws a GM-only location name',()=>{
  const names:string[]=[],context={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{},
    beginPath:()=>{},arc:()=>{},fill:()=>{},stroke:()=>{},strokeText:()=>{},fillText:(name:string)=>names.push(name)};
  const previous=globalThis.document;
  Object.assign(globalThis,{document:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
  try{
    const d=createAtlas(91,32);d.markers=[
      {id:'private',locationKey:'secret',name:'Secret Vault',kind:'ruin',x:0,z:0,color:'#ffffff',visibility:'gm'},
      {id:'known',locationKey:'village',name:'Known Village',kind:'village',x:10,z:10,color:'#ffffff',visibility:'players'},
    ];
    atlasPreview(d,32,true);assert.deepEqual(names,['Known Village']);names.length=0;
    atlasPreview(d,32,false);assert.deepEqual(names,['Secret Vault','Known Village']);
  }finally{Object.assign(globalThis,{document:previous});}
});
