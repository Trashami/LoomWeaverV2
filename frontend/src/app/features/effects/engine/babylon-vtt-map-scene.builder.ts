import {
  Color3,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

export interface VttMapLightData {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly color?: string;
  readonly radius?: number;
  readonly intensity?: number;
  readonly animation?: 'steady' | 'torch' | 'campfire' | 'pulse';
  readonly preset?: string;
  readonly elevationZ?: number;
  readonly hidden?: boolean;
}

export interface VttMapWallData {
  readonly id: string;
  readonly p1: { x: number; y: number };
  readonly p2: { x: number; y: number };
  readonly door?: 'none' | 'closed' | 'open';
}

export interface VttMapStampData {
  readonly id: string;
  readonly modelUrl?: string;
  readonly x: number;
  readonly y: number;
  readonly size?: number;
  readonly rotation?: number;
}

export interface VttMapSceneDataPayload {
  readonly widthUnits?: number;
  readonly heightUnits?: number;
  readonly ambientLight?: 'bright' | 'dim' | 'darkness';
  readonly lights?: readonly VttMapLightData[];
  readonly walls?: readonly VttMapWallData[];
  readonly stamps?: readonly VttMapStampData[];
}

interface AnimatedLightState {
  readonly light: PointLight;
  readonly flameMesh?: Mesh;
  readonly baseIntensity: number;
  readonly basePos: Vector3;
  readonly animType: 'torch' | 'campfire' | 'pulse';
  readonly phase: number;
}

export class BabylonVttMapSceneBuilder {
  private animatedLights: AnimatedLightState[] = [];

  clear(scene: Scene): void {
    scene.lights
      .filter((l) => l.name.startsWith('lw-map-light-'))
      .forEach((l) => l.dispose());

    scene.meshes
      .filter((m) => m.name.startsWith('lw-map-wall-') || m.name.startsWith('lw-map-flame-') || m.name.startsWith('lw-map-door-'))
      .forEach((m) => m.dispose());

    this.animatedLights = [];
  }

  buildScene(scene: Scene, data: VttMapSceneDataPayload): void {
    this.clear(scene);

    const widthUnits = data.widthUnits || 3200;
    const heightUnits = data.heightUnits || 2400;

    // 1. Ambient lighting adjustment
    const hemi = scene.getLightByName('lw-vtt-hemi') as HemisphericLight | null;
    if (hemi) {
      if (data.ambientLight === 'darkness') {
        hemi.intensity = 0.28;
        hemi.diffuse = new Color3(0.65, 0.72, 0.85);
        hemi.groundColor = Color3.FromHexString('#030806');
      } else if (data.ambientLight === 'dim') {
        hemi.intensity = 0.55;
        hemi.diffuse = new Color3(0.85, 0.9, 0.85);
        hemi.groundColor = Color3.FromHexString('#08140e');
      } else {
        hemi.intensity = 0.88;
        hemi.diffuse = new Color3(0.98, 0.99, 0.98);
        hemi.groundColor = Color3.FromHexString('#0d1d16');
      }
    }

    // 2. Dynamic 3D Point Lights with Real Shadows & Living Animations
    if (data.lights && data.lights.length > 0) {
      for (const l of data.lights) {
        if (l.hidden) continue;

        const normX = l.x / widthUnits;
        const normZ = l.y / heightUnits;
        const wx = (normX - 0.5) * 24;
        const wz = (normZ - 0.5) * 16;
        const wy = Math.max(0.55, (l.elevationZ ?? 60) / 45);

        const pt = new PointLight(`lw-map-light-${l.id}`, new Vector3(wx, wy, wz), scene);
        const colHex = l.color || (l.preset === 'moonlight' ? '#70a4ff' : '#ffaa3b');
        const col = Color3.FromHexString(colHex);
        pt.diffuse = col;
        const baseIntensity = Math.min(2.5, Math.max(0.4, (l.intensity ?? 1.0) * 1.3));
        pt.intensity = baseIntensity;
        pt.range = Math.max(5, (l.radius ?? 150) / 20);

        const animRaw = l.animation || (l.preset === 'torch' ? 'torch' : l.preset === 'campfire' ? 'campfire' : 'steady');
        if (animRaw === 'torch' || animRaw === 'campfire' || animRaw === 'pulse') {
          this.animatedLights.push({
            light: pt,
            baseIntensity,
            basePos: new Vector3(wx, wy, wz),
            animType: animRaw,
            phase: ((l.x * 17 + l.y * 31) % 100) / 100,
          });
        }
      }
    }

    // 3. 3D Wall Geometry with Dynamic Cast Shadows
    if (data.walls && data.walls.length > 0) {
      const wallMat = new StandardMaterial('lw-map-wall-mat', scene);
      wallMat.diffuseColor = Color3.FromHexString('#333838');
      wallMat.specularColor = new Color3(0.12, 0.12, 0.12);

      const doorMat = new StandardMaterial('lw-map-door-mat', scene);
      doorMat.diffuseColor = Color3.FromHexString('#5a3d24');
      doorMat.specularColor = new Color3(0.08, 0.08, 0.08);

      for (const w of data.walls) {
        const p1X = (w.p1.x / widthUnits - 0.5) * 24;
        const p1Z = (w.p1.y / heightUnits - 0.5) * 16;
        const p2X = (w.p2.x / widthUnits - 0.5) * 24;
        const p2Z = (w.p2.y / heightUnits - 0.5) * 16;
        const dx = p2X - p1X;
        const dz = p2Z - p1Z;
        const len = Math.hypot(dx, dz);
        if (len < 0.06) continue;

        const isDoor = w.door === 'open' || w.door === 'closed';
        const height = isDoor && w.door === 'open' ? 0.35 : 1.55;
        const thickness = 0.32;

        const wallMesh = MeshBuilder.CreateBox(
          `lw-map-wall-${w.id}`,
          { width: thickness, height, depth: len },
          scene,
        );
        wallMesh.position.set((p1X + p2X) / 2, height / 2, (p1Z + p2Z) / 2);
        wallMesh.rotation.y = -Math.atan2(dz, dx) + Math.PI / 2;
        wallMesh.material = isDoor ? doorMat : wallMat;
      }
    }
  }

  updateLightFlicker(nowMs: number, reducedMotion = false): void {
    if (this.animatedLights.length === 0 || reducedMotion) return;
    const t = nowMs * 0.003;
    for (const al of this.animatedLights) {
      if (al.animType === 'torch') {
        const flicker =
          1 +
          0.16 * Math.sin(t * 8.2 + al.phase * 6.28) +
          0.09 * Math.cos(t * 13.7 + al.phase * 6.28);
        al.light.intensity = al.baseIntensity * flicker;
        al.light.position.x = al.basePos.x + 0.015 * Math.sin(t * 5.8 + al.phase * 3);
        al.light.position.z = al.basePos.z + 0.015 * Math.cos(t * 4.9 + al.phase * 4);
      } else if (al.animType === 'campfire') {
        const flicker =
          1 +
          0.22 * Math.sin(t * 6.3 + al.phase * 6.28) +
          0.14 * Math.sin(t * 11.2 + al.phase * 12.56);
        al.light.intensity = al.baseIntensity * flicker;
        al.light.position.y = al.basePos.y + 0.02 * Math.sin(t * 7.1 + al.phase * 3);
      } else if (al.animType === 'pulse') {
        al.light.intensity = al.baseIntensity * (1 + 0.28 * Math.sin(t * 3.2 + al.phase * 6.28));
      }
    }
  }
}
