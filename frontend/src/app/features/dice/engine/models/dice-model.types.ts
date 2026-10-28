import { DieFaceLayout } from './face-layout';
import { Quaternion, Vector3, VertexData } from '@babylonjs/core';

export type DicePolyhedronType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';
export type BabylonDieType = DicePolyhedronType;

export type DiceSizePreset = 'small' | 'medium' | 'large';

export const DICE_SIZE_SCALE_MAP: Record<DiceSizePreset, number> = {
  small: 0.78,
  medium: 1.0,
  large: 1.26
};

export type DiceModelUnlockSource = 'free' | 'reward' | 'loommarks' | 'purchase';

export interface DiceModelDefinition {
  id: string;
  name: string;
  description: string;
  geometryMode: 'procedural-chamfer' | 'glb-mesh';
  chamferFactor: number;
  scaleMultiplier: number;
  edgeSharpnessLabel: string;
  glbAssetDirectory?: string;
  glbFileName?: string;
  unlockSource: DiceModelUnlockSource;
  priceLabel: string;
  loommarksCost?: number;
  priceUsdCents?: number;
  rewardMilestoneId?: string;
  isDefaultUnlocked: boolean;
}

export interface PolyhedronRawTable {
  vertices: number[][];
  faces: number[][];
  chamfer: number;
  scaleFactor: number;
  values: number;
  margin: number;
  tab: number;
  af: number;
}

export interface SubMeshRange {
  materialIndex: number;
  indexStart: number;
  indexCount: number;
}

export interface BuiltBabylonDieGeometry {
  vertexData: VertexData;
  subMeshRanges: SubMeshRange[];
  faceNormalsByValue: Map<number, Vector3>;
  faceLayouts: Map<number, DieFaceLayout>;
}

export interface DieFaceTargetPose {
  targetValue: number;
  targetQuaternion: Quaternion;
}
