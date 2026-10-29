import type { WaterSettings } from './water/water-settings';
import type { WallPaintDab } from './walls/wall-surface.models';
import type { LegacyMapLightKind, LightSettings, MapLightKind } from './lighting/light-settings';

export type MapRenderMode = '2D Blueprint' | '3D Tabletop' | 'Linked 2D <-> 3D';

export type WallDrawMode =
  | 'room'
  | 'hexagon'
  | 'octagon'
  | 'l_shape'
  | 't_shape'
  | 'cross'
  | 'circle'
  | 'cave'
  | 'line'
  | 'freehand'
  | 'triangle';

export type CutawayPerspectiveMode = 'topdown' | 'auto' | 'heavy';
export type CutawayProjectionMode = 'inward' | 'fixed-south';

export type WallOpeningType =
  | 'door'
  | 'door_open'
  | 'double_door'
  | 'archway'
  | 'window'
  | 'bars'
  | 'breach'
  | 'secret_door';

export type PathRibbonStyle =
  | 'cobble_path'
  | 'dirt_road'
  | 'cliff_ridge'
  | 'stone_stairs'
  | 'mine_tracks'
  | 'water_stream'
  | 'waterfall';

export type MapLightFixtureKind = MapLightKind | LegacyMapLightKind;

export interface MapToolDefinition {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
}

export interface MapCommandEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly toolId: string;
  readonly summary: string;
}

export type MapObjectSurfaceFinish = 'standard' | 'matte' | 'metallic' | 'runic-glow';
export type MapObjectPlacementMode = 'floor' | 'custom';

export type MapFloorBlendMode =
  | 'multiply'
  | 'overlay'
  | 'soft-light'
  | 'color'
  | 'screen'
  | 'color-burn'
  | 'color-dodge'
  | 'source-over'
  | 'eraser';

export interface MapFloorPaintDab {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly sharpness: number;
  readonly opacity: number;
  readonly colorHex: string;
  readonly blendMode: MapFloorBlendMode;
}

export interface MapStampNode {
  readonly id: string;
  readonly label: string;
  readonly category: 'POI' | 'Prop' | 'Token' | 'Architecture' | 'DecalStamp';
  readonly entityCompositeKey?: string;
  readonly modelUrl?: string;
  readonly albedoUrl?: string;
  readonly normalUrl?: string;
  readonly thumbnailUrl?: string;
  readonly x: number;
  readonly z: number;
  readonly placementMode?: MapObjectPlacementMode;
  readonly offsetY?: number;
  readonly scale: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly scaleZ?: number;
  readonly rotationY: number;
  readonly tiltX?: number;
  readonly colorHex: string;
  readonly surfaceFinish?: MapObjectSurfaceFinish;
  readonly opacity?: number;
  readonly gmSecretOnly?: boolean;
  readonly blocksVision?: boolean;
  readonly blocksMovement?: boolean;
}

export interface WaterSplineNode {
  readonly settings?: WaterSettings;
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly flowSpeed?: number;
  readonly colorHex: string;
  readonly points: readonly (readonly [number, number, number])[];
}

type LightExtras = Partial<Omit<LightSettings, 'kind' | 'y' | 'range' | 'intensity' | 'colorHex' | 'flicker'>>;

export interface LightSourceNode extends LightExtras {
  readonly id: string;
  readonly label: string;
  readonly kind?: MapLightFixtureKind;
  readonly x: number;
  /** Emitter elevation above the floor, in meters. */
  readonly y: number;
  readonly z: number;
  readonly range: number;
  readonly widthMeters?: number;
  readonly intensity: number;
  readonly colorHex: string;
  readonly flicker?: boolean;
  readonly showFixture?: boolean;
}

export interface WallOpeningNode {
  readonly id: string;
  readonly type: WallOpeningType;
  readonly name?: string;
  readonly modelUrl?: string;
  readonly thumbnailUrl?: string;
  readonly t: number;
  readonly widthMeters: number;
  readonly heightMeters?: number;
  readonly isOpen: boolean;
  readonly isSecret: boolean;
  readonly isRevealedToPlayers: boolean;
}

export interface MapWallSegmentNode {
  readonly terrainSmoothing?: number;
  readonly paintDabs?: readonly WallPaintDab[];
  readonly id: string;
  readonly name: string;
  readonly drawMode: WallDrawMode;
  readonly material: string;
  readonly colorHex?: string;
  readonly modelUrl?: string;
  readonly albedoUrl?: string;
  readonly normalUrl?: string;
  readonly thumbnailUrl?: string;
  readonly thicknessMeters: number;
  readonly heightMeters: number;
  readonly offsetY?: number;
  readonly stampScale?: number;
  readonly connectionOverlap?: number;
  readonly rotationOffsetDeg?: number;
  readonly perspective: CutawayPerspectiveMode;
  readonly projection: CutawayProjectionMode;
  readonly hasCornerPosts: boolean;
  readonly levelIndex: number;
  readonly points: readonly (readonly [number, number])[];
  readonly openings: readonly WallOpeningNode[];
}

export interface MapPathRibbonNode {
  readonly id: string;
  readonly name: string;
  readonly style: PathRibbonStyle;
  readonly widthMeters: number;
  readonly curveAngleDeg: number;
  readonly cliffStrataBands: number;
  readonly colorHex: string;
  readonly levelIndex: number;
  readonly waypoints: readonly (readonly [number, number])[];
}

export interface MapScatterClusterNode {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly density: number;
  readonly seed: number;
  readonly modelUrl?: string;
  readonly label?: string;
}

export interface MapSceneGraphState {
  readonly sceneKey: string;
  readonly name: string;
  readonly biome: string;
  readonly revision: number;
  readonly floorAlbedoUrl?: string;
  readonly floorNormalUrl?: string;
  readonly floorHeightUrl?: string;
  readonly floorTilingScale?: number;
  readonly floorBumpIntensity?: number;
  readonly floorHeightScale?: number;
  readonly floorColorHex?: string;
  readonly floorColorStrength?: number;
  readonly floorColorBlendMode?: MapFloorBlendMode;
  readonly floorPaintDabs?: readonly MapFloorPaintDab[];
  readonly scatterSeed: number;
  readonly scatterDensity: number;
  readonly scatterClusters?: readonly MapScatterClusterNode[];
  readonly terrainRelief: number;
  readonly stamps: readonly MapStampNode[];
  readonly waterSplines: readonly WaterSplineNode[];
  readonly lights: readonly LightSourceNode[];
  readonly walls?: readonly MapWallSegmentNode[];
  readonly pathRibbons?: readonly MapPathRibbonNode[];
}

export const MAP_STUDIO_TOOLS: readonly MapToolDefinition[] = [
  { id: 'terrain', label: 'Floor & Biome Brush', icon: 'layers', description: 'Sculpt relief & blend multi-layer PBR stone, moss, and obsidian' },
  { id: 'walls', label: 'Cutaway Walls & Portals', icon: 'shield', description: 'Draw chambers, cutaway walls, fitted doors, and line-of-sight blockers' },
  { id: 'paths', label: 'Curved Paths & Cliffs', icon: 'compass', description: 'Trace curved cobblestone roads, limestone cliff ridges, and stairs' },
  { id: 'stamps', label: '2D/3D Linked Stamps', icon: 'map-pin', description: 'Click canvas to place linked 2D symbols & 3D tabletop meshes' },
  { id: 'scatter', label: 'Procedural Scatter', icon: 'book', description: 'Regenerate deterministic instanced foliage, rubble, and runes' },
  { id: 'water', label: 'Water & Lava Splines', icon: 'flame', description: 'Extend directional canal/river splines across the terrain' },
  { id: 'lighting', label: '2.5D Lighting & Fog', icon: 'eye', description: 'Click canvas to spawn dynamic point lights & shadow emitters' },
];
