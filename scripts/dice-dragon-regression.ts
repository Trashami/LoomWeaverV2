import { Scene } from '@babylonjs/core';
import { buildDragonSculpt } from '../frontend/src/app/features/dice/engine/models/dragon-dice.builder';
import { resolveDiceModel } from '../frontend/src/app/features/dice/engine/models/dice-model.catalog';
import { DicePolyhedronType } from '../frontend/src/app/features/dice/engine/models/dice-model.types';
import { HOLLOW_DRAGON_SKIN, DRAGON_EYE_SKIN, createDefaultRuntimeConfigFromSkin, resolveDiceSkin } from '../frontend/src/app/features/dice/engine/skins';
import { buildBabylonPolyhedralDie, disposeDieMaterials } from '../frontend/src/app/features/dice/engine/materials/babylon-dice-material.factory';
import { createFaceCanvas } from '../frontend/src/app/features/dice/engine/materials/face-overlays.drawer';
import { buildBabylonDieVertexData } from '../frontend/src/app/features/dice/engine/models/chamfer-geometry.builder';

const check = (value: boolean, message: string) => { if (!value) throw new Error(message); };
export function runDragonGeometryRegression(): string {
  const types: DicePolyhedronType[] = ['d4','d6','d8','d10','d12','d20','d100'];
  let maxVertices = 0;
  for (const skin of [HOLLOW_DRAGON_SKIN, DRAGON_EYE_SKIN]) {
    const saved = JSON.parse(JSON.stringify(createDefaultRuntimeConfigFromSkin(skin)));
    const model = resolveDiceModel(saved.modelId);
    check(model.isDefaultUnlocked && skin.isDefaultUnlocked, 'Both dragon sets are included');
    check(resolveDiceSkin(saved.skinId) === skin, 'Saved dragon skin resolves');
    for (const type of types) {
      const { metal, lens } = buildDragonSculpt(type, 1.15 * model.scaleMultiplier, model.chamferFactor, model.ornament);
      check(metal.positions.length > 500, `${type}: sculpted metal must exist`);
      for (const geometry of [metal, lens]) {
        check(geometry.positions.every(Number.isFinite) && geometry.normals.every(Number.isFinite), `${type}: finite vertices/normals`);
        check(geometry.indices.every(i => i >= 0 && i < geometry.positions.length / 3), `${type}: valid topology`);
      }
      check(Boolean(lens.positions.length) === (type === 'd20' && model.ornament === 'dragon-scales'), 'Eye only replaces D20 20');
      const vertices = (metal.positions.length + lens.positions.length) / 3;
      maxVertices = Math.max(maxVertices, vertices);
      check(vertices < 70000, `${type}: ornament vertex budget`);
    }
  }
  return `PASS: 14 dragon models, saved catalog IDs and bounded geometry (${maxVertices} vertices max).`;
}

export function runDragonBrowserRegression(scene: Scene): string {
  const skin = HOLLOW_DRAGON_SKIN, config = createDefaultRuntimeConfigFromSkin(skin);
  const geometry = buildBabylonDieVertexData('d6');
  const pair = createFaceCanvas('4', skin, config, 256, geometry.faceLayouts.get(4), 0.3);
  const pixels = pair.diffuseCanvas.getContext('2d')!.getImageData(0,0,256,256).data;
  let holes = 0, solid = 0;
  for (let i=3;i<pixels.length;i+=4) { if(pixels[i]===0)holes++; if(pixels[i]>128)solid++; }
  check(holes > 256*256*0.8 && solid > 50, 'Hollow faces need real transparent holes and opaque numerals');
  const before = [scene.meshes.length, scene.materials.length, scene.textures.length];
  for (const candidate of [skin, DRAGON_EYE_SKIN]) {
    const custom=createDefaultRuntimeConfigFromSkin(candidate), model=resolveDiceModel(custom.modelId);
    const die=buildBabylonPolyhedralDie('regression','d20',candidate,custom,model,scene);
    check(die.builtGeometry.faceNormalsByValue.has(20), 'Eye retains authoritative value 20');
    check(die.mesh.getChildMeshes().length === (candidate===skin ? 1 : 3), 'Ornaments use one metal mesh, a solid core when needed and at most one lens');
    disposeDieMaterials(die); die.mesh.dispose();
  }
  check([scene.meshes.length, scene.materials.length, scene.textures.length].every((n,i)=>n===before[i]), 'Rebuilding must dispose owned GPU resources');
  return 'PASS: open faces, D20 value mapping, bounded draw calls and GPU cleanup.';
}
