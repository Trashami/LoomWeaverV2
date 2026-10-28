import { LwButtonComponent } from '../button/button.component';
import { LwWaterControlsComponent } from '../water-controls/water-controls.component';
import { DEFAULT_WATER, WaterSettings } from '../../../features/maps/engine/water/water-settings';
import type { WaterSplineNode } from '../../../features/maps/engine/map-scene-contract';
import { LwWallSurfaceControlsComponent } from '../wall-surface-controls/wall-surface-controls.component';
import { DEFAULT_WALL_BRUSH, WallBrushSettings } from '../../../features/maps/engine/walls/wall-surface.models';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import {
  MapFloorBlendMode,
  MapLightFixtureKind,
  MapObjectPlacementMode,
  MapObjectSurfaceFinish,
  WallDrawMode,
} from '../../../features/maps/engine/map-scene-contract';
import { LwIconComponent } from '../icon/icon.component';
import { LwMapMaterialPreset } from '../map-png-asset-browser/map-png-asset-browser.component';

export type LwTerrainSculptOp = 'raise' | 'lower' | 'flatten' | 'smooth';
export type LwCelestialBodyMode = 'sun' | 'moon';
export type LwCustomLightKind = MapLightFixtureKind;
export type LwObjectPlacementMode = MapObjectPlacementMode;
export type LwObjectSurfaceFinish = MapObjectSurfaceFinish;
export type LwFloorBlendMode = MapFloorBlendMode;

export interface LwPaintSwatch {
  readonly label: string;
  readonly hex: string;
}

export const DEFAULT_OBJECT_PAINT_SWATCHES: readonly LwPaintSwatch[] = [
  { label: 'Original', hex: '#ffffff' },
  { label: 'Stone', hex: '#8b9590' },
  { label: 'Moss', hex: '#4e8c57' },
  { label: 'Aged Gold', hex: '#d9b77a' },
  { label: 'Crimson', hex: '#b93838' },
  { label: 'Fey Glow', hex: '#49e892' },
  { label: 'Frost', hex: '#67e8f9' },
  { label: 'Obsidian', hex: '#3a3842' },
];

export const DEFAULT_FLOOR_BRUSH_SWATCHES: readonly LwPaintSwatch[] = [
  { label: 'Damp Moss', hex: '#3b7a47' },
  { label: 'Dark Mud', hex: '#5c432c' },
  { label: 'Dirt Path', hex: '#8c6f4e' },
  { label: 'Scorched Ash', hex: '#282426' },
  { label: 'Gold Lichen', hex: '#b8963e' },
  { label: 'Crypt Mildew', hex: '#2c5952' },
  { label: 'Blood Stain', hex: '#7a1c1c' },
  { label: 'Arcane Vein', hex: '#3be8b0' },
];

export interface LwBlendModeOption {
  readonly id: MapFloorBlendMode;
  readonly label: string;
  readonly hint: string;
}

export const FLOOR_PHOTOSHOP_BLEND_MODES: readonly LwBlendModeOption[] = [
  { id: 'multiply', label: 'Multiply', hint: 'Darkens & enriches underlying stone/grass cracks' },
  { id: 'overlay', label: 'Overlay', hint: 'Boosts contrast while tinting highlights & shadows' },
  { id: 'soft-light', label: 'Soft Light', hint: 'Subtle organic color glaze with natural texture' },
  { id: 'color', label: 'Color', hint: 'Applies hue & saturation while keeping stone luminance' },
  { id: 'screen', label: 'Screen', hint: 'Luminous glow for magical moss, frost, or runes' },
  { id: 'color-burn', label: 'Color Burn', hint: 'Deep weathered staining, soot & scorched earth' },
  { id: 'color-dodge', label: 'Color Dodge', hint: 'Intense sunlit or arcane highlights' },
  { id: 'source-over', label: 'Normal', hint: 'Direct pigment coat over floor texture' },
  { id: 'eraser', label: 'Eraser', hint: 'Softly erases painted color back to base floor' },
];

export interface LwSelectedSceneNode {
  readonly id: string;
  readonly name: string;
  readonly kind:
    | 'wall'
    | 'room'
    | 'door'
    | 'prop'
    | 'terrain'
    | 'scatter'
    | 'water'
    | 'light'
    | 'token'
    | 'annotation';
  readonly subtitle: string;
  readonly thumbnailUrl: string;
  readonly modelUrl?: string;
  readonly albedoUrl?: string;
  readonly normalUrl?: string;
  readonly heightUrl?: string;
  readonly isFloor?: boolean;
  readonly materialId: string;
  readonly heightSquares: number;
  readonly thickness: number;
  readonly gridX: number;
  readonly gridZ: number;
  readonly placementMode?: MapObjectPlacementMode;
  readonly elevationY: number;
  readonly rotationDeg: number;
  readonly tiltDeg?: number;
  readonly scale: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly scaleZ?: number;
  readonly connectionOverlap?: number;
  readonly colorHex?: string;
  readonly surfaceFinish?: MapObjectSurfaceFinish;
  readonly opacity?: number;
  readonly gmSecretOnly: boolean;
  readonly blocksMovement: boolean;
  readonly blocksVision: boolean;
}

@Component({
  selector: 'lw-map-properties-inspector',
  standalone: true,
  imports: [LwButtonComponent, NgpButton, LwIconComponent, LwWallSurfaceControlsComponent, LwWaterControlsComponent],
  templateUrl: './map-properties-inspector.component.html',
  styleUrl: './map-properties-inspector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMapPropertiesInspectorComponent {
  readonly waterSettings = input<WaterSettings>(DEFAULT_WATER);
  readonly waterBodies = input<readonly WaterSplineNode[]>([]);
  readonly selectedWaterId = input<string | null>(null);
  readonly waterSettingsChange = output<WaterSettings>();
  readonly waterSelected = output<string>();
  readonly waterRemoved = output<void>();
  readonly wallBrush = input<WallBrushSettings>(DEFAULT_WALL_BRUSH);
  readonly wallSmoothing = input<number>(75);
  readonly wallBrushChange = output<WallBrushSettings>();
  readonly wallSmoothingChange = output<number>();
  readonly activeToolId = input<string>('select');
  readonly selectedPlacedKind = input<'wall' | 'door' | 'object' | 'light' | null>(null);
  readonly selectedNode = input<LwSelectedSceneNode | null>(null);
  readonly hasPlacedSelection = input<boolean>(false);
  readonly wallInProgress = input<boolean>(false);
  readonly materials = input<readonly LwMapMaterialPreset[]>([]);
  readonly wallDrawMode = input<WallDrawMode>('line');
  readonly floorTilingScale = input<number>(10);
  readonly floorBumpIntensity = input<number>(135);
  readonly floorHeightScale = input<number>(100);
  readonly floorColorHex = input<string>('#ffffff');
  readonly floorColorStrength = input<number>(0);
  readonly floorColorBlendMode = input<MapFloorBlendMode>('multiply');
  readonly floorBrushActive = input<boolean>(false);
  readonly floorBrushColorHex = input<string>('#3b7a47');
  readonly floorBrushBlendMode = input<MapFloorBlendMode>('multiply');
  readonly floorBrushOpacity = input<number>(35);
  readonly floorBrushRadius = input<number>(3.0);
  readonly floorBrushSharpness = input<number>(22);
  readonly terrainSculptOp = input<LwTerrainSculptOp>('raise');
  readonly terrainBrushRadius = input<number>(4.5);
  readonly terrainBrushDelta = input<number>(0.5);
  readonly terrainGradualRate = input<number>(20);
  readonly terrainFeathering = input<number>(80);
  readonly terrainPlateauLimit = input<number>(5.5);

  readonly doorWallPositionPct = input<number>(50);
  readonly doorWidthMeters = input<number>(2.4);
  readonly doorHeightMeters = input<number>(2.6);
  readonly doorIsOpen = input<boolean>(false);

  readonly celestialMode = input<LwCelestialBodyMode>('sun');
  readonly celestialAzimuthDeg = input<number>(135);
  readonly celestialAltitudeDeg = input<number>(42);
  readonly shadowDarkness = input<number>(72);

  readonly customLightKind = input<LwCustomLightKind>('torch');
  readonly customLightColor = input<string>('#ffae52');
  readonly customLightRange = input<number>(25);
  readonly lightPlacementWidth = input<number>(2.0);
  readonly lightHeightMeters = input<number>(2.4);
  readonly torchIntensity = input<number>(125);
  readonly lightShowFixture = input<boolean>(true);

  readonly scatterDensity = input<number>(65);

  readonly paintSwatches = DEFAULT_OBJECT_PAINT_SWATCHES;
  readonly floorBrushSwatches = DEFAULT_FLOOR_BRUSH_SWATCHES;
  readonly floorBlendModes = FLOOR_PHOTOSHOP_BLEND_MODES;

  readonly openAssetModal = output<void>();
  readonly cancelPlacement = output<void>();
  readonly resetTerrain = output<void>();
  readonly floorTilingChange = output<number>();
  readonly floorBumpIntensityChange = output<number>();
  readonly floorHeightScaleChange = output<number>();
  readonly floorColorHexChange = output<string>();
  readonly floorColorStrengthChange = output<number>();
  readonly floorColorBlendModeChange = output<MapFloorBlendMode>();
  readonly floorBrushActiveChange = output<boolean>();
  readonly floorBrushColorHexChange = output<string>();
  readonly floorBrushBlendModeChange = output<MapFloorBlendMode>();
  readonly floorBrushOpacityChange = output<number>();
  readonly floorBrushRadiusChange = output<number>();
  readonly floorBrushSharpnessChange = output<number>();
  readonly clearFloorPaint = output<void>();
  readonly materialChange = output<string>();
  readonly heightSquaresChange = output<number>();
  readonly thicknessChange = output<number>();
  readonly placementModeChange = output<MapObjectPlacementMode>();
  readonly positionXChange = output<number>();
  readonly positionZChange = output<number>();
  readonly rotationChange = output<number>();
  readonly tiltChange = output<number>();
  readonly scaleChange = output<number>();
  readonly scaleXChange = output<number>();
  readonly scaleYChange = output<number>();
  readonly scaleZChange = output<number>();
  readonly gridSizePresetChange = output<number>();
  readonly colorHexChange = output<string>();
  readonly surfaceFinishChange = output<MapObjectSurfaceFinish>();
  readonly opacityChange = output<number>();
  readonly elevationChange = output<number>();
  readonly wallConnectionOverlapChange = output<number>();
  readonly wallDrawModeChange = output<WallDrawMode>();
  readonly terrainSculptOpChange = output<LwTerrainSculptOp>();
  readonly terrainRadiusChange = output<number>();
  readonly terrainDeltaChange = output<number>();
  readonly terrainGradualRateChange = output<number>();
  readonly terrainFeatheringChange = output<number>();
  readonly terrainPlateauLimitChange = output<number>();

  readonly doorPositionPctChange = output<number>();
  readonly doorWidthChange = output<number>();
  readonly doorHeightChange = output<number>();
  readonly doorOpenToggle = output<void>();

  readonly celestialModeChange = output<LwCelestialBodyMode>();
  readonly celestialAzimuthChange = output<number>();
  readonly celestialAltitudeChange = output<number>();
  readonly shadowDarknessChange = output<number>();

  readonly customLightKindChange = output<LwCustomLightKind>();
  readonly customLightColorChange = output<string>();
  readonly customLightRangeChange = output<number>();
  readonly lightPlacementWidthChange = output<number>();
  readonly lightHeightChange = output<number>();
  readonly torchIntensityChange = output<number>();
  readonly lightShowFixtureToggle = output<void>();
  readonly spawnCustomLight = output<void>();

  readonly secretToggle = output<void>();
  readonly blocksVisionToggle = output<void>();
  readonly blocksMovementToggle = output<void>();
  readonly duplicateNode = output<void>();
  readonly deleteNode = output<void>();
  readonly scatterDensityChange = output<number>();
  readonly clearScatter = output<void>();
  readonly clearWater = output<void>();

  readonly effectiveMode = computed<string>(() => {
    const tool = this.activeToolId();
    const placedKind = this.selectedPlacedKind();
    if (tool === 'select' && placedKind) {
      if (placedKind === 'wall') return 'wall';
      if (placedKind === 'door') return 'door';
      if (placedKind === 'object') return 'objects';
      if (placedKind === 'light') return 'lighting';
    }
    return tool;
  });

  readonly toolHeading = computed<string>(() => {
    const mode = this.effectiveMode();
    const isSelected = this.hasPlacedSelection();
    const map: Record<string, string> = {
      select: 'Scene Selection Inspector',
      'floor-bump': 'Flooring Bump/Height Setup',
      terrain: 'Raise / Lower Terrain Brush',
      wall: isSelected ? 'Selected 3D Wall Properties' : '3D Wall Line Placement',
      room: 'Room Shape & Wall Setup',
      door: isSelected ? 'Selected Wall Door Properties' : 'Wall-Cutout Door Placement',
      objects: isSelected ? 'Selected Object Properties' : 'Object Stamp Setup (1×1×1)',
      lighting: isSelected ? 'Selected Scene Light Properties' : 'Scene Light Fixture Setup',
      'sun-moon': 'Sun / Moon & Shadow Position',
      water: 'Water River & Pool Brush',
      scatter: '3D Surface Scatter Brush',
      annotate: 'Map Annotation Setup',
    };
    return map[mode] ?? 'Tool Settings';
  });

  readonly usesAssetPicker = computed<boolean>(() => {
    const m = this.effectiveMode();
    return (
      m === 'floor-bump' ||
      m === 'wall' ||
      m === 'room' ||
      m === 'door' ||
      m === 'objects' ||
      m === 'scatter' ||
      m === 'annotate'
    );
  });

  onNumInput(event: Event, emitter: { emit: (v: number) => void }): void {
    const el = event.target as HTMLInputElement | HTMLSelectElement | null;
    const parsed = Number(el?.value ?? 0);
    if (!Number.isNaN(parsed)) {
      emitter.emit(parsed);
    }
  }

  onStrInput<T extends string = string>(event: Event, emitter: { emit: (v: T) => void }): void {
    const el = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (el?.value !== undefined) {
      emitter.emit(el.value as T);
    }
  }

  onWallModeSelect(event: Event): void {
    const el = event.target as HTMLSelectElement | null;
    if (el?.value) {
      this.wallDrawModeChange.emit(el.value as WallDrawMode);
    }
  }

  formatPercent(val?: number): number {
    return Math.round((val ?? 1) * 100);
  }
}
