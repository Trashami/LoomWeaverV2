import { Mesh, MeshBuilder, PBRMaterial, Scene, Vector3 } from '@babylonjs/core';
import { DicePolyhedronType } from './dice-model.types';
import { getPolyhedronRawTable } from './polyhedra-tables.model';

/** Hollow edge cage surrounding inset numbered panels; children share the die transform. */
export function addDiceModelFrame(parent: Mesh, type: DicePolyhedronType, radius: number,
  material: PBRMaterial, scene: Scene): void {
  const table = getPolyhedronRawTable(type);
  const radiusScale = Math.max(...table.vertices.map(v => Math.hypot(...v)));
  const vertices = table.vertices.map(v => Vector3.FromArray(v).scale(radius * table.scaleFactor / radiusScale));
  const frameMaterial = material.clone(`${parent.name}-frame-material`)!;
  frameMaterial.alpha = 1;
  frameMaterial.metallic = 0.85;
  frameMaterial.roughness = 0.28;
  const edges = new Set<string>();
  for (const face of table.faces) {
    const ids = face.slice(0, -1);
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i + 1) % ids.length];
      const key = [a, b].sort((x, y) => x - y).join(':');
      if (edges.has(key)) continue;
      edges.add(key);
      const strut = MeshBuilder.CreateTube(`${parent.name}-cage-${key}`, {
        path: [vertices[a], vertices[b]], radius: radius * 0.025, tessellation: 6,
      }, scene);
      strut.parent = parent;
      strut.material = frameMaterial;
    }
  }
  parent.onDisposeObservable.addOnce(() => frameMaterial.dispose(false, false));
}
