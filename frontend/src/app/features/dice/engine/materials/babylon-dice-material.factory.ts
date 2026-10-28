import { DiceLightPlugin, updateDiceLight } from './dice-light.plugin';
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
    mat.clearCoat.intensity = custom.clearcoat ?? 0.65;
    mat.clearCoat.roughness = custom.clearcoatRoughness ?? 0.04;
    if (custom.surfaceEffect === 'iridescent') { mat.iridescence.isEnabled = true; mat.iridescence.intensity = 0.85; }
    if (custom.surfaceEffect === 'frosted') { mat.roughness = 0.9; mat.clearCoat.isEnabled = false; }
    if (custom.surfaceEffect === 'polished') { mat.roughness = 0.06; mat.clearCoat.isEnabled = true; mat.clearCoat.intensity = 1; }
    if (custom.surfaceEffect === 'brushed') { mat.anisotropy.isEnabled = true; mat.anisotropy.intensity = 0.7; }
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
  new DiceLightPlugin(bevelMat, custom);
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

    faceMat.emissiveTexture = createBabylonDynamicTextureFromCanvas(
      `lw-face-emis-${type}-${i + 1}`, canvases.emissiveCanvas, scene);
    faceMat.emissiveColor = Color3.White();
    new DiceLightPlugin(faceMat, custom);

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
  updateDiceLight(materials, elapsedSeconds);
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
