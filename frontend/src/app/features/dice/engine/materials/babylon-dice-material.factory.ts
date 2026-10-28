import { setNumberWorldSize } from './number-layout';
import { addDiceModelFrame } from '../models/model-frame.builder';
import {
  Color3,
  CubeTexture,
  PBRMaterial,
  Mesh,
  MultiMaterial,
  Scene,
  SceneLoader,
  SubMesh
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { DicePulseWaveform } from '../dice-physics.types';
import {
  buildBabylonDieVertexData,
  BuiltBabylonDieGeometry,
  DICE_SIZE_SCALE_MAP,
  DiceModelDefinition,
  DicePolyhedronType,
  FACE_VALUES, resolveDiceModel
} from '../models';
import { DiceCustomRuntimeConfig, DiceSkinConfig } from '../skins/dice-skin.types';
import {
  createBevelCanvas,
  createD4FaceCanvas,
  createFaceCanvas
} from './face-overlays.drawer';
import { hexToRgbTuple } from './face-patterns.drawer';
import {
  createBabylonDynamicTextureFromCanvas,
  createBabylonNormalTextureFromHeightCanvas
} from './normal-emissive.generator';

export interface BuiltBabylonDieInstance {
  mesh: Mesh;
  dieType: DicePolyhedronType;
  faceMaterials: PBRMaterial[];
  multiMaterial: MultiMaterial;
  builtGeometry: BuiltBabylonDieGeometry;
}

export function hexToColor3(hex: string): Color3 {
  const [r, g, b] = hexToRgbTuple(hex);
  return new Color3(r / 255, g / 255, b / 255);
}

function evaluateWaveform(waveform: DicePulseWaveform, tSec: number, speedHz: number, minVal: number, maxVal: number): number {
  const phase = tSec * Math.max(0.1, speedHz);
  let norm = 0.5;
  switch (waveform) {
    case 'heartbeat': {
      const p1 = Math.max(0, Math.sin(phase * Math.PI * 2));
      const p2 = Math.max(0, Math.sin(phase * Math.PI * 2 - 0.65)) * 0.55;
      norm = Math.min(1, p1 + p2);
      break;
    }
    case 'sawtooth':
      norm = phase - Math.floor(phase);
      break;
    case 'flicker':
      norm = 0.5 + 0.35 * Math.sin(phase * 9.7) + 0.15 * Math.cos(phase * 23.3);
      break;
    case 'sine':
    default:
      norm = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      break;
  }
  const lo = Math.min(minVal, maxVal);
  const hi = Math.max(minVal, maxVal);
  return lo + Math.max(0, Math.min(1, norm)) * (hi - lo);
}

export function buildDieFaceMaterials(
  type: DicePolyhedronType,
  skin: DiceSkinConfig,
  custom: DiceCustomRuntimeConfig,
  scene: Scene,
  geometry?: BuiltBabylonDieGeometry
): PBRMaterial[] {
  const model = resolveDiceModel(custom.modelId);
  const layoutGeometry = geometry ?? buildBabylonDieVertexData(type);
  const worldFontSize = setNumberWorldSize(custom, skin, model);
  const materials: PBRMaterial[] = [];
  const surface = custom.surfaceStyleOverride ?? skin.surfaceStyle;
  if (!scene.environmentTexture) {
    scene.environmentTexture = CubeTexture.CreateFromPrefilteredData('/assets/object-library/studio.env', scene);
  }
  const metallic = Math.max(0, Math.min(1, custom.reflectionMetallic ?? skin.metalness));
  const roughness = Math.max(0.04, Math.min(1, custom.surfaceRoughness ?? skin.roughness));
  const glowColor3 = hexToColor3(custom.glowColorHex || skin.emissiveColor);
  const coreAlpha = Math.max(0.12, Math.min(1, custom.coreOpacity ?? 1.0));
  const bumpIntensity = Math.max(0, Math.min(3.0, custom.bumpMapIntensity ?? 1.0));
  const numberDepth = Math.abs(custom.numberDepth ?? 0.75);

  const configure = (mat: PBRMaterial) => {
    mat.metallic = surface === 'metal' ? Math.max(0.75, metallic) : 0;
    mat.roughness = surface === 'stone' ? Math.max(0.78, roughness)
      : surface === 'wood' ? Math.max(0.48, roughness)
      : surface === 'obsidian' ? 0.065 : surface === 'glass' ? 0.035 : roughness;
    mat.environmentIntensity = surface === 'stone' ? 0.4 : 1.05;
    mat.clearCoat.isEnabled = ['glass', 'obsidian', 'resin'].includes(surface);
    mat.clearCoat.intensity = surface === 'obsidian' ? 1 : 0.65;
    mat.clearCoat.roughness = 0.04;
    if (surface === 'glass') {
      mat.subSurface.isRefractionEnabled = true;
      mat.subSurface.indexOfRefraction = 1.5;
      mat.subSurface.minimumThickness = 0.15;
      mat.subSurface.maximumThickness = 1.8;
      mat.subSurface.tintColor = Color3.Lerp(Color3.White(), hexToColor3(custom.coreColorHex || '#e3f3ee'), 0.12);
      mat.subSurface.tintColorAtDistance = 3;
      mat.subSurface.refractionIntensity = 0.9;
      mat.subSurface.linkRefractionWithTransparency = false;
      mat.alpha = Math.min(0.5, coreAlpha);
      mat.backFaceCulling = false;
      mat.separateCullingPass = true;
    }
  };

  // Slot 0: Chamfer bevel / frame material
  const bevelMat = new PBRMaterial(`lw-die-bevel-${type}-${skin.id}`, scene);
  const bevelCanvas = createBevelCanvas(skin, custom, 128);
  bevelMat.albedoTexture = createBabylonDynamicTextureFromCanvas(
    `lw-bevel-diff-${type}-${skin.id}`,
    bevelCanvas,
    scene
  );
  configure(bevelMat);
  if (custom.coreOuterGlowEnabled) {
    const cGlow = hexToColor3(custom.coreOuterGlowColor || custom.glowColorHex || skin.emissiveColor);
    bevelMat.emissiveColor = cGlow.scale(Math.max(custom.glowIntensity, custom.coreOuterGlowOpacity ?? 0) * 0.18);
  }
  if (surface !== 'glass' && coreAlpha < 0.99) {
    bevelMat.alpha = Math.min(0.96, coreAlpha + 0.06);
  }
  materials.push(bevelMat);

  // Slots 1..N: Numbered polyhedral faces
  const faceVals = FACE_VALUES[type];
  const texSize = type === 'd20' || type === 'd12' ? 256 : 384;
  const normalStrength = 3.5;

  for (let i = 0; i < faceVals.length; i++) {
    const val = faceVals[i];
    const label = type === 'd100' ? (val === 10 ? '00' : `${val * 10}`) : type === 'd10' && val === 10 ? '0' : String(val);

    const layout = layoutGeometry.faceLayouts.get(val)!;
    const canvases =
      type === 'd4'
        ? createD4FaceCanvas(layout, skin, custom, texSize, worldFontSize)
        : createFaceCanvas(label, skin, custom, texSize, layout, worldFontSize);

    const faceMat = new PBRMaterial(`lw-die-face-${type}-${i + 1}`, scene);
    faceMat.albedoTexture = createBabylonDynamicTextureFromCanvas(
      `lw-face-diff-${type}-${i + 1}`,
      canvases.diffuseCanvas,
      scene
    );
    faceMat.bumpTexture = createBabylonNormalTextureFromHeightCanvas(
      `lw-face-norm-${type}-${i + 1}`,
      canvases.heightCanvas,
      scene,
      normalStrength
    );
    faceMat.bumpTexture.level = 1;
    faceMat.useParallax = surface !== 'glass' && numberDepth > 0.03;
    faceMat.useParallaxOcclusion = faceMat.useParallax;
    faceMat.parallaxScaleBias = 0.025 * numberDepth;

    const hasEmissive =
      custom.glowIntensity > 0.05 ||
      custom.coreInnerGlowEnabled ||
      custom.coreOuterGlowEnabled ||
      custom.numberInnerGlowEnabled ||
      custom.numberOuterGlowEnabled;

    if (hasEmissive) {
      faceMat.emissiveTexture = createBabylonDynamicTextureFromCanvas(
        `lw-face-emis-${type}-${i + 1}`,
        canvases.emissiveCanvas,
        scene
      );
      faceMat.emissiveColor = glowColor3.scale(0.5 + custom.glowIntensity * 0.7);
    } else {
      faceMat.emissiveColor = Color3.Black();
    }

    configure(faceMat);

    faceMat.alpha = surface === 'glass' ? Math.min(0.5, coreAlpha) : coreAlpha;

    materials.push(faceMat);
  }

  return materials;
}

export function buildBabylonPolyhedralDie(
  name: string,
  type: DicePolyhedronType,
  skin: DiceSkinConfig,
  custom: DiceCustomRuntimeConfig,
  model: DiceModelDefinition,
  scene: Scene
): BuiltBabylonDieInstance {
  const physicsScale = (custom.physics?.scale ?? 5) / 5;
  const sizeMultiplier = (DICE_SIZE_SCALE_MAP[custom.sizePreset] ?? 1.0) * (model.scaleMultiplier ?? 1.0) * physicsScale;
  const chamfer = custom.chamferBevelFactor ?? model.chamferFactor ?? 0.955;
  const builtGeometry = buildBabylonDieVertexData(
    type,
    1.15 * sizeMultiplier,
    chamfer,
    model.id === 'model-custom-glb'
  );

  const mesh = new Mesh(name, scene);
  builtGeometry.vertexData.applyToMesh(mesh, true);

  const faceMaterials = buildDieFaceMaterials(type, skin, custom, scene, builtGeometry);
  const multiMat = new MultiMaterial(`${name}-multimat`, scene);
  multiMat.subMaterials = faceMaterials.slice();
  mesh.material = multiMat;

  applySubMeshesToDieMesh(mesh, builtGeometry);
  if (model.id === 'model-caged-filigree') {
    faceMaterials[0].alpha = 0.08;
    addDiceModelFrame(mesh, type, 1.15 * sizeMultiplier, faceMaterials[0], scene);
  }

  if (model.geometryMode === 'glb-mesh' && model.glbAssetDirectory && model.glbFileName) {
    void attachOptionalGlbChildMesh(mesh, type, model, scene);
  }

  return {
    mesh,
    dieType: type,
    faceMaterials,
    multiMaterial: multiMat,
    builtGeometry
  };
}

export function applySubMeshesToDieMesh(
  mesh: Mesh,
  builtGeometry: BuiltBabylonDieGeometry
): void {
  mesh.subMeshes = [];
  const totalVertices = mesh.getTotalVertices();
  for (const range of builtGeometry.subMeshRanges) {
    new SubMesh(
      range.materialIndex,
      0,
      totalVertices,
      range.indexStart,
      range.indexCount,
      mesh
    );
  }
}

export function applyVeinPulseToDieMaterials(
  materials: PBRMaterial[],
  skin: DiceSkinConfig,
  custom: DiceCustomRuntimeConfig,
  elapsedSeconds: number
): void {
  const anyPulse = custom.veinPulse || custom.corePulseEnabled || custom.numberPulseEnabled;
  if (!anyPulse) {
    return;
  }

  const coreGlow = hexToColor3(custom.coreOuterGlowColor || custom.glowColorHex || skin.emissiveColor);
  const numGlow = hexToColor3(custom.numberOuterGlowColor || custom.glowColorHex || skin.emissiveColor);

  const coreFactor = custom.corePulseEnabled
    ? evaluateWaveform(
        custom.corePulseWaveform ?? 'heartbeat',
        elapsedSeconds,
        custom.corePulseSpeed ?? 1.4,
        custom.corePulseMin ?? 0.3,
        custom.corePulseMax ?? 1.0
      )
    : 0.65;

  const numFactor = custom.numberPulseEnabled
    ? evaluateWaveform(
        custom.numberPulseWaveform ?? 'sine',
        elapsedSeconds,
        custom.numberPulseSpeed ?? 1.6,
        custom.numberPulseMin ?? 0.4,
        custom.numberPulseMax ?? 1.0
      )
    : coreFactor;

  if (materials[0] && custom.corePulseEnabled) {
    materials[0].emissiveColor = coreGlow.scale(0.22 * coreFactor);
  }

  const blendedColor = Color3.Lerp(coreGlow, numGlow, 0.55);
  const pulseLevel = Math.max(0.1, (coreFactor * 0.45 + numFactor * 0.55) * Math.max(0.35, custom.glowIntensity));

  for (let i = 1; i < materials.length; i++) {
    materials[i].emissiveColor = blendedColor.scale(pulseLevel);
  }
}

export function disposeDieMaterials(instance: BuiltBabylonDieInstance): void {
  for (const mat of instance.faceMaterials) {
    mat.albedoTexture?.dispose();
    mat.bumpTexture?.dispose();
    mat.emissiveTexture?.dispose();
    mat.dispose();
  }
  instance.multiMaterial.dispose();
}

async function attachOptionalGlbChildMesh(
  parentMesh: Mesh,
  type: DicePolyhedronType,
  model: DiceModelDefinition,
  scene: Scene
): Promise<void> {
  try {
    const result = await SceneLoader.ImportMeshAsync(
      type,
      model.glbAssetDirectory!,
      model.glbFileName!,
      scene
    );
    for (const imported of result.meshes) {
      if (imported !== result.meshes[0]) {
        imported.parent = parentMesh;
      }
    }
  } catch {
    // Fallback gracefully to the procedural chamfered mesh
  }
}
