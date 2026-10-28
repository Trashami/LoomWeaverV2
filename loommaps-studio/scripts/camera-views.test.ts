import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ArcRotateCamera, Camera, NullEngine, Scene, Vector3, MeshBuilder } from '@babylonjs/core';
import { MapCameraViews } from '../../frontend/src/app/features/maps/engine/rendering/map-camera-views';
function setup() {
 const engine = new NullEngine({renderWidth:1000,renderHeight:500,textureSize:512,deterministicLockstep:false,lockstepMaxSteps:4});
 const scene = new Scene(engine);
 const camera = new ArcRotateCamera('main', 0, 0.7, 25, Vector3.Zero(), scene);
 const canvas = {getBoundingClientRect:()=>({left:0,width:1000})} as HTMLCanvasElement;
 return {engine,scene,camera,views:new MapCameraViews(scene,camera,canvas)};
}
test('2D uses locked orthographic projection and retains the live scene',()=>{
 const {engine,scene,camera,views}=setup();
 const asset=MeshBuilder.CreateBox('placed-asset',{},scene);
 views.setMode('real-2d');
 assert.equal(camera.mode,Camera.ORTHOGRAPHIC_CAMERA);
 camera.inertialAlphaOffset=0.3;camera.inertialBetaOffset=0.4;
 scene.render(); views.update();
 assert.equal(camera.alpha,-Math.PI/2);assert.equal(camera.beta,0.0001);
 assert.equal(scene.getMeshByName('placed-asset'),asset);
 const before=camera.orthoRight!;camera.radius/=2;views.update();
 assert.equal(camera.orthoRight,before/2);
 views.setMode('isometric');
 assert.equal(camera.mode,Camera.PERSPECTIVE_CAMERA);assert.equal(camera.lowerAlphaLimit,null);
 assert.equal(scene.getMeshByName('placed-asset'),asset);
 engine.dispose();
});
test('split views share one scene and route picking to each viewport',()=>{
 const {engine,scene,camera,views}=setup();views.setMode('split-2d-3d');
 assert.equal(scene.activeCameras!.length,2);
 const overview=scene.activeCameras![1] as ArcRotateCamera;
 assert.equal(overview.mode,Camera.ORTHOGRAPHIC_CAMERA);
 assert.equal(overview.viewport.x,0.5);assert.equal(camera.viewport.width,0.5);
 views.pointerAt(750);assert.equal(scene.cameraToUseForPointers,overview);
 views.pointerAt(250);assert.equal(scene.cameraToUseForPointers,camera);
 views.setMode('real-2d');assert.equal(scene.activeCameras!.length,0);
 assert.equal(camera.viewport.width,1);engine.dispose();
});
