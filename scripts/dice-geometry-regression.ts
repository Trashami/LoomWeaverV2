import { createFaceCanvas } from '../frontend/src/app/features/dice/engine/materials/face-overlays.drawer';
import { Vector3 } from '@babylonjs/core';
import { buildBabylonDieVertexData, getRotationForTopValue } from '../frontend/src/app/features/dice/engine/models/chamfer-geometry.builder';
import { getPolyhedronRawTable, FACE_VALUES } from '../frontend/src/app/features/dice/engine/models/polyhedra-tables.model';
import { DICE_MODEL_CATALOG } from '../frontend/src/app/features/dice/engine/models/dice-model.catalog';
import { DicePolyhedronType } from '../frontend/src/app/features/dice/engine/models/dice-model.types';
import { faceNumberPlacements, placementFits, numberFont, setNumberWorldSize } from '../frontend/src/app/features/dice/engine/materials/number-layout';
import { createDefaultRuntimeConfigFromSkin } from '../frontend/src/app/features/dice/engine/skins/dice-skin.types';
import { OBSIDIAN_SKIN } from '../frontend/src/app/features/dice/engine/skins/obsidian.skin';

export function runDiceGeometryRegression(): string {
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  const types: DicePolyhedronType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
  const signatures = new Set<string>();
  for (const model of DICE_MODEL_CATALOG) {
    const config = { ...createDefaultRuntimeConfigFromSkin(OBSIDIAN_SKIN), modelId: model.id,
      chamferBevelFactor: model.chamferFactor, fontScale: 1.45, numberStrokeWidth: 8, fontTracking: 4 };
    const em = setNumberWorldSize(config, OBSIDIAN_SKIN, model);
    check(em > setNumberWorldSize({ ...config, fontScale: 0.6 }, OBSIDIAN_SKIN, model) * 2, 'size slider must visibly increase lettering');
    const scale = model.scaleMultiplier;
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = numberFont(config, OBSIDIAN_SKIN, 100);
    check(em > 0.1, `${model.id}: lettering must remain readable`);
    for (const type of types) {
      const geometry = buildBabylonDieVertexData(type, 1.15 * scale, model.chamferFactor, model.id === 'model-custom-glb');
      const uvs = Array.from(geometry.vertexData.uvs!);
      check(uvs.every(v => v >= 0 && v <= 1), `${type}: UVs stay in the texture`);
      for (const layout of geometry.faceLayouts.values()) {
        const placements = layout.vertexValues ? faceNumberPlacements(layout, '')
          : FACE_VALUES[type].map(value => ({ label: type === 'd100' ? (value === 10 ? '00' : String(value * 10)) : type === 'd10' && value === 10 ? '0' : String(value), x: 0.5, y: 0.5, rotation: 0 }));
        let fitted = em;
        if (type === 'd4' || type === 'd100') for (let i = 0; i < 80 && !placements.every(p => placementFits(ctx, layout, p, fitted / layout.unitsPerUv, 0.185 * fitted / layout.unitsPerUv)); i++) fitted *= 0.95;
        check(fitted > 0.1, 'compact labels remain legible');
        check(placements.every(p => placementFits(ctx, layout, p, fitted / layout.unitsPerUv, 0.185 * fitted / layout.unitsPerUv)), `${model.id}/${type}: all glyphs fit`);
      }
      if (type === 'd20') signatures.add(JSON.stringify(geometry.vertexData.positions));
    }
  }
  check(signatures.size === DICE_MODEL_CATALOG.length, 'all shape profiles produce different geometry');
  const tetra = getPolyhedronRawTable('d4');
  const geometry = buildBabylonDieVertexData('d4');
  const values = new Map<number, number>();
  for (const [value, layout] of geometry.faceLayouts) {
    const face = tetra.faces.find(f => f.at(-1) === value)!;
    face.slice(0, -1).forEach((vertex, i) => {
      const label = layout.vertexValues![i];
      check(!values.has(vertex) || values.get(vertex) === label, 'three d4 labels must agree at every vertex');
      values.set(vertex, label);
      check(label !== value, 'a d4 face must contain the other three corner values');
    });
  }
  check(new Set(values.values()).size === 4, 'all four d4 outcomes are present');
  for (let result = 1; result <= 4; result++) {
    const apex = [...values].find(([, value]) => value === result)![0];
    const point = Vector3.FromArray(tetra.vertices[apex]).normalize();
    const world = new Vector3(); point.rotateByQuaternionToRef(getRotationForTopValue('d4', result), world);
    check(world.y > 0.999, `d4 roll ${result}: the matching corner must point upward`);
  }
  const direction = new Vector3(0.2, 0.7, -0.8).normalize();
  for (const type of types.filter(type => type !== 'd4')) {
    const geometry = buildBabylonDieVertexData(type);
    const normal = geometry.faceNormalsByValue.get(1)!;
    const world = new Vector3();
    normal.rotateByQuaternionToRef(getRotationForTopValue(type, type === 'd100' ? 10 : 1, 0, direction), world);
    check(Vector3.Dot(world, direction) > 0.999, `${type}: yaw must preserve the requested result-facing direction`);
  }
  return 'PASS: all faces fit, distinct catalog shapes, consistent d4 corners and all four upright outcomes.';
}


export function runDiceSurfaceRenderRegression(): string {
  const layout = buildBabylonDieVertexData('d6').faceLayouts.get(1)!;
  const config = { ...createDefaultRuntimeConfigFromSkin(OBSIDIAN_SKIN),
    numberInnerGlowEnabled: false, numberOuterGlowEnabled: false, glowIntensity: 0 };
  const digest = (canvas: HTMLCanvasElement) => {
    let hash = 2166136261;
    for (const byte of canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data) hash = Math.imul(hash ^ byte, 16777619);
    return hash;
  };
  const layers = [-1, 0, 1].map(numberDepth => createFaceCanvas('20', OBSIDIAN_SKIN, { ...config, numberDepth }, 256, layout, 0.3));
  if (new Set(layers.map(layer => digest(layer.diffuseCanvas))).size !== 3) throw new Error('Engraving must change visible number shading');
  if (new Set(layers.map(layer => digest(layer.heightCanvas))).size !== 3) throw new Error('Engraving must change signed height');
  const plain = digest(layers[0].diffuseCanvas);
  for (const faceOverlayStyle of ['recessed-plate', 'celtic-cage', 'arcane-runes'] as const) {
    const pair = createFaceCanvas('20', OBSIDIAN_SKIN, { ...config, numberDepth: -1, faceOverlayStyle }, 256, layout, 0.3);
    if (digest(pair.diffuseCanvas) !== plain) throw new Error('Saved face overlays must never restore circles');
  }
  return 'PASS: carved, flush and raised rendering differ; legacy circle settings are ignored.';
}
