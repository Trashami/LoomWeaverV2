import {
  Color3,
  Constants,
  Material,
  MaterialPluginBase,
  PBRBaseMaterial,
  RawTexture,
  Scene,
  StandardMaterial,
  Texture,
  UniformBuffer,
} from '@babylonjs/core';
import type { MapWallSegmentNode } from '../map-scene-contract';
import type { WallPaintDab } from './wall-surface.models';

const MAX_WORLD_PAINT_DABS = 256;
const DAB_TEXTURE_ROWS = 3;

interface ScenePaintBuffer {
  readonly data: Float32Array;
  readonly texture: RawTexture;
  readonly dabs: WallPaintDab[];
  readonly attachedMaterials: WeakSet<Material>;
}

/**
 * High-performance GPU 3D world-space volumetric surface paint shader plugin.
 * Enforces a half-space wall barrier plane per dab so strokes drawn on the floor in front of a wall
 * or on the front face of a wall transition smoothly between floor and wall without ever bleeding
 * through to the back face of the wall or the floor behind the wall.
 */
class WorldSurfacePaintPlugin extends MaterialPluginBase {
  private _isEnabled = true;
  private readonly sceneRef: Scene;

  constructor(material: Material, scene: Scene) {
    super(material, 'LwWorldSurfacePaint', 210, { LW_WORLD_SURFACE_PAINT: false });
    this.sceneRef = scene;
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['LW_WORLD_SURFACE_PAINT'] = this._isEnabled;
  }

  override getClassName(): string {
    return 'WorldSurfacePaintPlugin';
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('lwPaintDabSampler');
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    if (!this._isEnabled) return;
    const state = WallSurfacePaint.getOrCreateSceneBuffer(this.sceneRef);
    uniformBuffer.setTexture('lwPaintDabSampler', state.texture);
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;

    const isPbr = this._material instanceof PBRBaseMaterial;
    const targetHook = isPbr
      ? 'CUSTOM_FRAGMENT_UPDATE_ALBEDO'
      : 'CUSTOM_FRAGMENT_UPDATE_DIFFUSE';
    const targetVar = isPbr ? 'surfaceAlbedo.rgb' : 'diffuseColor.rgb';

    const code = `
      #ifdef LW_WORLD_SURFACE_PAINT
        for (int di = 0; di < 128; di++) {
          float uCoord = (float(di) + 0.5) / 256.0;
          vec4 dabPosRad = texture(lwPaintDabSampler, vec2(uCoord, 0.166667));
          float dabR = dabPosRad.w;
          if (dabR <= 0.001) {
            break;
          }
          vec3 dVec = vPositionW.xyz - dabPosRad.xyz;
          if (abs(dVec.x) < dabR && abs(dVec.y) < dabR && abs(dVec.z) < dabR) {
            float dist = length(dVec);
            if (dist < dabR) {
              vec4 dabBarrier = texture(lwPaintDabSampler, vec2(uCoord, 0.5));
              vec2 bNorm = dabBarrier.xy;
              if (dot(bNorm, bNorm) > 0.25) {
                float signedSide = dot(vPositionW.xz - dabBarrier.zw, bNorm);
                if (signedSide < -0.015) {
                  continue;
                }
              }
              vec4 dabColMeta = texture(lwPaintDabSampler, vec2(uCoord, 0.833333));
              float packed = dabColMeta.w;
              float opacity = clamp(floor(packed) / 100.0, 0.01, 1.0);
              float hardness = clamp(fract(packed) * 2.0, 0.0, 0.96);
              float innerR = dabR * hardness;
              float t = clamp((dist - innerR) / max(0.005, dabR - innerR), 0.0, 1.0);
              float falloff = 0.5 * (1.0 + cos(3.14159265 * t));
              float w = opacity * falloff;
              vec3 pCol = dabColMeta.rgb;
              float baseLum = dot(${targetVar}, vec3(0.299, 0.587, 0.114));
              vec3 stained = mix(${targetVar} * pCol * 1.45, pCol * (0.42 + 0.78 * baseLum), 0.58);
              ${targetVar} = mix(${targetVar}, stained, w);
            }
          }
        }
      #endif
    `;

    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef LW_WORLD_SURFACE_PAINT
          uniform sampler2D lwPaintDabSampler;
        #endif
      `,
      [targetHook]: code,
    };
  }
}

export class WallSurfacePaint {
  private static sceneBuffers = new WeakMap<Scene, ScenePaintBuffer>();

  static getOrCreateSceneBuffer(scene: Scene): ScenePaintBuffer {
    let existing = this.sceneBuffers.get(scene);
    if (existing) {
      return existing;
    }
    const data = new Float32Array(MAX_WORLD_PAINT_DABS * DAB_TEXTURE_ROWS * 4);
    const texture = RawTexture.CreateRGBATexture(
      data,
      MAX_WORLD_PAINT_DABS,
      DAB_TEXTURE_ROWS,
      scene,
      false,
      false,
      Texture.NEAREST_SAMPLINGMODE,
      Constants.TEXTURETYPE_FLOAT,
    );
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    existing = {
      data,
      texture,
      dabs: [],
      attachedMaterials: new WeakSet<Material>(),
    };
    this.sceneBuffers.set(scene, existing);
    return existing;
  }

  static registerMaterial(scene: Scene, mat: Material | null | undefined): void {
    if (!mat) return;
    if (!(mat instanceof PBRBaseMaterial) && !(mat instanceof StandardMaterial)) return;
    const buf = this.getOrCreateSceneBuffer(scene);
    if (buf.attachedMaterials.has(mat)) return;
    buf.attachedMaterials.add(mat);
    try {
      new WorldSurfacePaintPlugin(mat, scene);
      mat.markAsDirty(Material.AllDirtyFlag);
    } catch {
      // Plugin already registered on material
    }
  }

  static attachToSceneMaterials(scene: Scene): void {
    for (const m of scene.meshes) {
      const isWallDoorOrGround =
        m.metadata?.lwKind === 'wall' ||
        m.metadata?.lwKind === 'door' ||
        m.name.startsWith('lw-wall-') ||
        m.name.startsWith('lw-door-') ||
        m.name === 'lw-terrain-ground';
      if (!isWallDoorOrGround || !m.material) continue;
      this.registerMaterial(scene, m.material);
    }
  }

  private static writeDabToBuffer(
    data: Float32Array,
    index: number,
    dab: WallPaintDab,
    walls?: readonly MapWallSegmentNode[],
  ): void {
    if (index < 0 || index >= MAX_WORLD_PAINT_DABS) return;
    const row0Offset = index * 4;
    const row1Offset = (MAX_WORLD_PAINT_DABS + index) * 4;
    const row2Offset = (MAX_WORLD_PAINT_DABS * 2 + index) * 4;

    data[row0Offset] = dab.position[0];
    data[row0Offset + 1] = dab.position[1];
    data[row0Offset + 2] = dab.position[2];
    data[row0Offset + 3] = Math.max(0.08, dab.radius);

    const barrier = dab.barrier ?? this.inferBarrierFromWalls(dab, walls);
    data[row1Offset] = barrier[0];
    data[row1Offset + 1] = barrier[1];
    data[row1Offset + 2] = barrier[2];
    data[row1Offset + 3] = barrier[3];

    const col = Color3.FromHexString(dab.colorHex || '#4e8c57');
    const opacityInt = Math.max(1, Math.min(100, Math.round(dab.opacity)));
    const hardnessFrac = Math.max(0, Math.min(0.48, (dab.hardness / 100) * 0.48));

    data[row2Offset] = col.r;
    data[row2Offset + 1] = col.g;
    data[row2Offset + 2] = col.b;
    data[row2Offset + 3] = opacityInt + hardnessFrac;
  }

  private static inferBarrierFromWalls(
    dab: WallPaintDab,
    walls?: readonly MapWallSegmentNode[],
  ): readonly [number, number, number, number] {
    const px = dab.position[0];
    const pz = dab.position[2];
    if (walls && walls.length > 0) {
      let bestDist = Infinity;
      let best: readonly [number, number, number, number] | null = null;
      for (const wall of walls) {
        const pts = wall.points;
        if (pts.length < 2) continue;
        const closed = wall.drawMode !== 'line' && wall.drawMode !== 'freehand';
        const segCount = closed ? pts.length : pts.length - 1;
        for (let i = 0; i < segCount; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const sdx = b[0] - a[0];
          const sdz = b[1] - a[1];
          const lenSq = sdx * sdx + sdz * sdz;
          if (lenSq < 0.005) continue;
          const t = Math.max(0, Math.min(1, ((px - a[0]) * sdx + (pz - a[1]) * sdz) / lenSq));
          const cx = a[0] + sdx * t;
          const cz = a[1] + sdz * t;
          const dist = Math.hypot(px - cx, pz - cz);
          if (dist < bestDist) {
            bestDist = dist;
            const segLen = Math.sqrt(lenSq);
            const nx = -sdz / segLen;
            const nz = sdx / segLen;
            const relDot = (px - cx) * nx + (pz - cz) * nz;
            const normDot = dab.normal[0] * nx + dab.normal[2] * nz;
            const sign = Math.abs(relDot) > 0.03 ? (relDot >= 0 ? 1 : -1) : normDot >= 0 ? 1 : -1;
            best = [nx * sign, nz * sign, cx, cz];
          }
        }
      }
      if (best) return best;
    }

    const horizLen = Math.hypot(dab.normal[0], dab.normal[2]);
    if (horizLen > 0.25) {
      const bnx = dab.normal[0] / horizLen;
      const bnz = dab.normal[2] / horizLen;
      return [bnx, bnz, px - bnx * 0.2, pz - bnz * 0.2];
    }
    return [0, 0, px, pz];
  }

  static clear(scene: Scene): void {
    const buf = this.sceneBuffers.get(scene);
    if (!buf) return;
    buf.dabs.length = 0;
    buf.data.fill(0);
    buf.texture.update(buf.data);
  }

  static replay(scene: Scene, walls: readonly MapWallSegmentNode[] | undefined): void {
    this.attachToSceneMaterials(scene);
    const hasAnyDabs = Boolean(walls?.some((w) => (w.paintDabs?.length ?? 0) > 0));
    if (!hasAnyDabs && !this.sceneBuffers.has(scene)) {
      return;
    }
    const buf = this.getOrCreateSceneBuffer(scene);
    buf.dabs.length = 0;
    buf.data.fill(0);
    if (walls) {
      for (const wall of walls) {
        for (const dab of wall.paintDabs ?? []) {
          if (buf.dabs.length >= MAX_WORLD_PAINT_DABS) {
            buf.dabs.shift();
          }
          buf.dabs.push(dab);
        }
      }
    }
    for (let i = 0; i < buf.dabs.length; i++) {
      this.writeDabToBuffer(buf.data, i, buf.dabs[i], walls);
    }
    buf.texture.update(buf.data);
  }

  static apply(scene: Scene, _wallId: string, dab: WallPaintDab): void {
    const buf = this.getOrCreateSceneBuffer(scene);
    this.attachToSceneMaterials(scene);
    if (buf.dabs.length >= MAX_WORLD_PAINT_DABS) {
      buf.dabs.shift();
      buf.data.fill(0);
      for (let i = 0; i < buf.dabs.length; i++) {
        this.writeDabToBuffer(buf.data, i, buf.dabs[i]);
      }
    }
    const idx = buf.dabs.length;
    buf.dabs.push(dab);
    this.writeDabToBuffer(buf.data, idx, dab);
    buf.texture.update(buf.data);
  }
}
