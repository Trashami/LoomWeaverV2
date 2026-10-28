import { Color3, DynamicTexture, Mesh, PBRMaterial, Scene, VertexBuffer } from '@babylonjs/core';
import { DiceCustomRuntimeConfig } from '../skins/dice-skin.types';
import { BuiltBabylonDieGeometry, DiceModelDefinition, DicePolyhedronType } from './dice-model.types';
import { addDragonScales, addOpenworkDragon, sculptFaces } from './dragon-face.geometry';
import { addDragonEye, paintDragonIris } from './dragon-eye.geometry';
import { SculptMesh } from './sculpt-mesh.builder';

export function buildDragonSculpt(type: DicePolyhedronType, radius: number, chamfer: number, ornament: DiceModelDefinition['ornament']): { metal: SculptMesh; lens: SculptMesh } {
  const metal = new SculptMesh(), lens = new SculptMesh();
  for (const face of sculptFaces(type, radius, chamfer)) {
    if (ornament === 'dragon-openwork') addOpenworkDragon(metal, face);
    else {
      const eye = type === 'd20' && face.value === 20;
      addDragonScales(metal, face, eye);
      if (eye) addDragonEye(metal, lens, face);
    }
  }
  return { metal, lens };
}

export function attachDragonSculpt(parent: Mesh, type: DicePolyhedronType, radius: number, chamfer: number,
  model: DiceModelDefinition, custom: DiceCustomRuntimeConfig, geometry: BuiltBabylonDieGeometry, scene: Scene): void {
  const { metal, lens } = buildDragonSculpt(type, radius, chamfer, model.ornament);
  const material = new PBRMaterial(`${parent.name}-dragon-metal`, scene);
  material.albedoColor = Color3.FromHexString(custom.coreColorHex || '#707780');
  material.metallic = 1; material.roughness = Math.max(0.18, custom.surfaceRoughness ?? 0.28);
  material.backFaceCulling = false;
  const sculpture = new Mesh(`${parent.name}-dragon-sculpture`, scene);
  metal.data().applyToMesh(sculpture); sculpture.parent = parent; sculpture.material = material;
  sculpture.isPickable = false;
  parent.onDisposeObservable.addOnce(() => material.dispose());

  if (model.ornament === 'dragon-scales') {
    const body = new Mesh(`${parent.name}-forged-core`, scene);
    const bodyMaterial = material.clone(`${parent.name}-oxidized-recesses`);
    bodyMaterial.albedoColor = material.albedoColor.scale(0.3);
    bodyMaterial.roughness = 0.6; bodyMaterial.environmentIntensity = 0.5;
    geometry.vertexData.applyToMesh(body); body.parent = parent; body.material = bodyMaterial; body.isPickable = false;
    parent.onDisposeObservable.addOnce(() => bodyMaterial.dispose());
  }
  if (model.ornament) {
    // Lift only the visible lettering over the metal. The solid collision proxy
    // and face normals remain unchanged; transparent pixels create real holes.
    const positions = Array.from(geometry.vertexData.positions!);
    const normals = geometry.vertexData.normals!;
    const indices = geometry.vertexData.indices!;
    const faces = sculptFaces(type, radius, chamfer);
    for (const range of geometry.subMeshRanges.filter(range => range.materialIndex > 0)) {
      const face = faces.find(face => face.value === range.materialIndex)!;
      const vertices = new Set(Array.from(indices).slice(range.indexStart, range.indexStart + range.indexCount));
      for (const vertex of vertices) for (let axis = 0; axis < 3; axis++) positions[vertex * 3 + axis] += normals[vertex * 3 + axis] * face.radius * 0.16;
    }
    parent.updateVerticesData(VertexBuffer.PositionKind, positions, true);
  }

  if (lens.positions.length) {
    const eye = new Mesh(`${parent.name}-natural-20-eye`, scene);
    lens.data().applyToMesh(eye); eye.parent = parent; eye.isPickable = false;
    const eyeMaterial = new PBRMaterial(`${parent.name}-eye-glass`, scene);
    const texture = new DynamicTexture(`${parent.name}-iris`, 256, scene, true);
    paintDragonIris(texture.getContext() as CanvasRenderingContext2D, custom.numberColorHex || '#18ca82');
    texture.update(); eyeMaterial.albedoTexture = texture;
    eyeMaterial.metallic = 0.15; eyeMaterial.roughness = 0.16;
    eyeMaterial.clearCoat.isEnabled = true; eyeMaterial.clearCoat.intensity = 1; eyeMaterial.clearCoat.roughness = 0.055;
    eyeMaterial.backFaceCulling = false; eye.material = eyeMaterial;
    parent.onDisposeObservable.addOnce(() => { texture.dispose(); eyeMaterial.dispose(); });
  }
}
