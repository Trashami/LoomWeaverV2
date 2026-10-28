import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NullEngine, Scene, MeshBuilder, StandardMaterial, TransformNode, VertexBuffer, Vector3, PointerEventTypes } from '@babylonjs/core';
import { WallBrushController } from '../../frontend/src/app/features/maps/engine/walls/wall-brush-controller';
import { DEFAULT_WALL_BRUSH } from '../../frontend/src/app/features/maps/engine/walls/wall-surface.models';
import { WallMeshBuilder } from '../../frontend/src/app/features/maps/engine/walls/wall-mesh.builder';
import { GlbModelCache } from '../../frontend/src/app/features/maps/engine/rendering/glb-model-cache';
import { wallEndExtension, featherCoverage } from '../../frontend/src/app/features/maps/engine/walls/wall-join-profile';
import { fitWallStamp, wallGroundAt } from '../../frontend/src/app/features/maps/engine/walls/wall-terrain-fit';
import { TerrainMeshBuilder } from '../../frontend/src/app/features/maps/engine/terrain/terrain-mesh.builder';
import { WallSurfacePaint } from '../../frontend/src/app/features/maps/engine/walls/wall-surface-paint';
import type { MapWallSegmentNode } from '../../frontend/src/app/features/maps/engine/map-scene-contract';
const wall = (id: string, points: readonly (readonly [number, number])[]): MapWallSegmentNode => ({
  id, points, name: id, drawMode: 'line', material: 'Stone', thicknessMeters: .5, heightMeters: 3,
  perspective: 'auto', projection: 'inward', hasCornerPosts: false, levelIndex: 0, openings: [],
});
test('T junction stops at near face; corners do not protrude; free ends keep overlap', () => {
  const through = wall('through', [[-5, 0], [5, 0]]), room = wall('room', [[0, -4], [0, 0]]);
  assert.equal(wallEndExtension([0, 0], [0, 1], room, [through, room], .3), -.225);
  assert.equal(wallEndExtension([5, 0], [0, 1], room, [through], .3), .25);
  assert.equal(wallEndExtension([0, -4], [0, 1], room, [through], .3), .3);
});
test('brush softness has a full centre, smooth falloff and no coverage outside radius', () => {
  assert.equal(featherCoverage(0, 1, 0), 1);
  assert.equal(featherCoverage(1, 1, 100), 0);
  assert.equal(featherCoverage(2, 1, 40), 0);
  assert.ok(featherCoverage(.6, 1, 80) > featherCoverage(.6, 1, 10));
});
test('stamp deforms continuously on slopes, clips terminals, and preserves source geometry', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const sample = TerrainMeshBuilder.sampleElevationAt;
  TerrainMeshBuilder.sampleElevationAt = (_scene, x) => x * .4;
  try {
    const template = MeshBuilder.CreateBox('template', { width: 4, height: 3, depth: .5 }, scene);
    const before = [...template.getVerticesData(VertexBuffer.PositionKind)!];
    const root = new TransformNode('wall', scene), piece = template.clone('piece')!;
    piece.parent = root;
    fitWallStamp(scene, root, [-1, 0], [1, 0], 2, 0, 75);
    const positions = piece.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < positions.length; i += 3) assert.ok(Math.abs(positions[i]) <= 1.00001);
    assert.deepEqual([...template.getVerticesData(VertexBuffer.PositionKind)!], before);
    assert.ok(Math.abs(wallGroundAt(scene, 1, 0, 75) - .4) < 1e-8);
    assert.ok(positions.some((v, i) => i % 3 === 1 && Math.abs(v) !== 1.5));
  } finally { TerrainMeshBuilder.sampleElevationAt = sample; scene.dispose(); engine.dispose(); }
});
test('paint projects only onto selected front face; cleanup preserves stone material', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    for (const id of ['selected', 'other']) {
      const mesh = MeshBuilder.CreateBox(id, { width: 4, height: 3, depth: .5 }, scene);
      mesh.metadata = { lwKind: 'wall', lwEntityId: id };
      mesh.material = new StandardMaterial('stone-' + id, scene);
      mesh.position.x = id === 'other' ? 5 : 0;
      mesh.computeWorldMatrix(true);
    }
    WallSurfacePaint.apply(scene, 'selected', {
      position: [0, 0, -.25], normal: [0, 0, -1], radius: .5, opacity: 35, hardness: 20, colorHex: '#4e8c57',
    });
    const decals = scene.meshes.filter(m => m.name.startsWith('lw-surface-paint-'));
    assert.ok(decals.length > 0);
    assert.ok(decals.every(d => d.name === 'lw-surface-paint-selected' && !d.isPickable));
    for (const decal of decals) {
      const positions = decal.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < positions.length; i += 3) {
        const world = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), decal.computeWorldMatrix(true));
        assert.ok(world.z < 0, 'No reverse-face paint');
      }
    }
    for (let i = 0; i < 40; i++) WallSurfacePaint.apply(scene, 'selected', {
      position: [i * .02, 0, -.25], normal: [0, 0, -1], radius: .5,
      opacity: 35, hardness: 20, colorHex: '#4e8c57',
    });
    assert.equal(scene.meshes.filter(m => m.name.startsWith('lw-surface-paint-')).length, 1,
      'Many brush dabs share a single draw mesh per material');
    WallSurfacePaint.clear(scene);
    assert.equal(scene.meshes.length, 2);
    assert.ok(scene.getMaterialByName('stone-selected'));
  } finally { scene.dispose(); engine.dispose(); }
});

test('door frame is embedded and adjacent stamp geometry stops at its opening', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const load = GlbModelCache.getOrLoadTemplate;
  const sample = TerrainMeshBuilder.sampleElevationAt;
  TerrainMeshBuilder.sampleElevationAt = () => 0;
  const templatePivot = new TransformNode('template-pivot', scene);
  const source = MeshBuilder.CreateBox('stone-template', { width: 3, height: 3, depth: .5 }, scene);
  source.position.y = 1.5; source.parent = templatePivot;
  source.material = new StandardMaterial('stone', scene);
  templatePivot.setEnabled(false);
  GlbModelCache.getOrLoadTemplate = () => ({ url: 'test.glb', templatePivot,
    rawWidth: 3, rawHeight: 3, rawDepth: .5, baseOffsetY: 0 });
  try {
    const state = { ...wall('with-door', [[-5, 0], [5, 0]]), modelUrl: 'test.glb',
      openings: [{ id: 'door', type: 'archway' as const, t: .5, widthMeters: 2, heightMeters: 2.4,
        isOpen: false, isSecret: false, isRevealedToPlayers: true }] };
    WallMeshBuilder.rebuildWallMeshes(scene, [state]);
    const door = scene.getTransformNodeByName('lw-door-node-door')!;
    assert.ok(door);
    const doorBounds = door.getHierarchyBoundingVectors(true);
    assert.ok(Math.abs(doorBounds.min.y - (-.075)) < .001, 'Frame follows wall base offset');
    assert.ok(doorBounds.max.x > 1 && doorBounds.min.x < -1, 'Frame edges embed into cutout');
    const stamps = scene.transformNodes.filter(n => n.name.startsWith('lw-wall-node-'));
    assert.ok(stamps.length > 0);
    for (const stamp of stamps) {
      const box = stamp.getHierarchyBoundingVectors(true);
      assert.ok(box.max.x <= -1 + .001 || box.min.x >= 1 - .001,
        'Stamp overlap must not protrude into the doorway');
    }
  } finally {
    GlbModelCache.getOrLoadTemplate = load; TerrainMeshBuilder.sampleElevationAt = sample;
    scene.dispose(); engine.dispose();
  }
});

test('brush commits one stroke, ignores occluding walls and suppresses stationary duplicate dabs', () => {
  const engine = new NullEngine(), scene = new Scene(engine), brush = new WallBrushController();
  const mesh = MeshBuilder.CreateBox('selected', { size: .5 }, scene);
  mesh.metadata = { lwKind: 'wall', lwEntityId: 'selected' };
  mesh.material = new StandardMaterial('stone', scene); mesh.computeWorldMatrix(true);
  brush.wallId = 'selected'; brush.settings = { ...DEFAULT_WALL_BRUSH, active: true };
  let calls = 0, count = 0;
  brush.onStroke = dabs => { calls++; count = dabs.length; };
  scene.pick = (() => ({ hit: true, pickedPoint: new Vector3(0, 0, -.25), pickedMesh: mesh,
    getNormal: () => new Vector3(0, 0, -1) })) as typeof scene.pick;
  const pointer = { button: 0 } as PointerEvent;
  try {
    brush.handle(scene, PointerEventTypes.POINTERDOWN, pointer);
    brush.handle(scene, PointerEventTypes.POINTERMOVE, pointer);
    brush.handle(scene, PointerEventTypes.POINTERUP, pointer);
    brush.handle(scene, PointerEventTypes.POINTERUP, pointer);
    assert.equal(calls, 1); assert.equal(count, 1);
    mesh.metadata.lwEntityId = 'occluding-wall';
    brush.handle(scene, PointerEventTypes.POINTERDOWN, pointer);
    brush.handle(scene, PointerEventTypes.POINTERUP, pointer);
    assert.equal(calls, 1, 'No painting through another wall');
  } finally { scene.dispose(); engine.dispose(); }
});
