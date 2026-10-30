import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CutawayPerspectiveMode,
  CutawayProjectionMode,
  MapPathRibbonNode,
  MapWallSegmentNode,
  PathRibbonStyle,
  WallDrawMode,
  WallOpeningType,
} from '../../../features/maps/engine/map-scene-contract';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import {
  ChamberBuildIntent,
  DEFAULT_WALL_PATH_ARCHITECT_CONFIG,
  MapWallPathArchitectConfig,
  PathRibbonBuildIntent,
  WallOpeningInsertIntent,
} from './map-wall-path-architect.config';

@Component({
  selector: 'lw-map-wall-path-architect',
  standalone: true,
  imports: [FormsModule, LwBadgeComponent, LwButtonComponent],
  templateUrl: './map-wall-path-architect.component.html',
  styleUrl: './map-wall-path-architect.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMapWallPathArchitectComponent {
  readonly walls = input<readonly MapWallSegmentNode[]>([]);
  readonly paths = input<readonly MapPathRibbonNode[]>([]);
  readonly config = input<MapWallPathArchitectConfig>(DEFAULT_WALL_PATH_ARCHITECT_CONFIG);

  readonly chamberName = signal<string>('Vault Annex');
  readonly selectedDrawMode = signal<WallDrawMode>('octagon');
  readonly selectedMaterial = signal<string>('Obsidian Ashlar & Gold Filigree');
  readonly chamberWidth = signal<number>(10);
  readonly chamberDepth = signal<number>(8);
  readonly wallThickness = signal<number>(0.5);
  readonly wallHeight = signal<number>(3.2);
  readonly selectedPerspective = signal<CutawayPerspectiveMode>('heavy');
  readonly selectedProjection = signal<CutawayProjectionMode>('inward');
  readonly hasCornerPosts = signal<boolean>(true);

  readonly targetWallId = signal<string>('wall-rotunda');
  readonly selectedOpeningType = signal<WallOpeningType>('double_door');
  readonly openingPositionT = signal<number>(0.5);
  readonly openingWidth = signal<number>(2.4);
  readonly openingIsOpen = signal<boolean>(true);

  readonly pathName = signal<string>('Limestone Cliff Escarpment');
  readonly selectedPathStyle = signal<PathRibbonStyle>('cliff_ridge');
  readonly pathWidth = signal<number>(2.8);
  readonly pathCurveAngle = signal<number>(35);
  readonly cliffStrataBands = signal<number>(3);

  readonly drawModes: readonly { id: WallDrawMode; label: string }[] = [
    { id: 'room', label: 'Rectangular Room' },
    { id: 'octagon', label: 'Octagon Rotunda' },
    { id: 'hexagon', label: 'Hexagon Sanctum' },
    { id: 'l_shape', label: 'L-Shape Wing' },
    { id: 'circle', label: 'Circular Tower' },
    { id: 'cave', label: 'Chaikin Cave' },
    { id: 'line', label: 'Straight Wall' },
  ];

  readonly materials = [
    'Obsidian Ashlar & Gold Filigree',
    'Gilded Marble',
    'Dwarven Runic Basalt',
    'Castle Timber & Mortar',
    'Sewer Brickwork',
  ];

  readonly openingTypes = computed<readonly { id: WallOpeningType; label: string }[]>(() => {
    const base: { id: WallOpeningType; label: string }[] = [
      { id: 'door', label: 'Oak Door (Closed)' },
      { id: 'door_open', label: 'Oak Door (Open)' },
      { id: 'double_door', label: 'Grand Double Door' },
      { id: 'archway', label: 'Gothic Archway' },
      { id: 'window', label: 'Stained Glass Window' },
      { id: 'bars', label: 'Iron Portcullis Bars' },
      { id: 'breach', label: 'Rubble Wall Breach' },
    ];
    if (this.config().allowSecretDoors !== false) {
      base.push({ id: 'secret_door', label: 'GM Secret Door' });
    }
    return base;
  });

  readonly pathStyles: readonly { id: PathRibbonStyle; label: string; colorHex: string }[] = [
    { id: 'cobble_path', label: 'Cobblestone Causeway', colorHex: '#8c7a62' },
    { id: 'dirt_road', label: 'Wagon Dirt Road', colorHex: '#7a5c43' },
    { id: 'cliff_ridge', label: 'Limestone Cliff Ridge', colorHex: '#6e7b82' },
    { id: 'stone_stairs', label: 'Carved Stone Stairs', colorHex: '#949ba1' },
    { id: 'mine_tracks', label: 'Artificer Mine Cart Tracks', colorHex: '#5c6670' },
    { id: 'water_stream', label: 'Shallow Brook Ribbon', colorHex: '#247ba0' },
  ];

  readonly chamberBuildRequested = output<ChamberBuildIntent>();
  readonly openingInsertRequested = output<WallOpeningInsertIntent>();
  readonly pathRibbonBuildRequested = output<PathRibbonBuildIntent>();
  readonly wallDeleted = output<string>();
  readonly pathDeleted = output<string>();

  onSpanChanged(widthMeters: number): void {
    this.chamberWidth.set(widthMeters);
    this.chamberDepth.set(Math.max(4, widthMeters - 2));
  }

  emitChamberBuild(): void {
    this.chamberBuildRequested.emit({
      name: this.chamberName().trim() || 'New Chamber',
      drawMode: this.selectedDrawMode(),
      material: this.selectedMaterial(),
      widthMeters: this.chamberWidth(),
      depthMeters: this.chamberDepth(),
      thicknessMeters: this.wallThickness(),
      heightMeters: this.wallHeight(),
      perspective: this.selectedPerspective(),
      projection: this.selectedProjection(),
      hasCornerPosts: this.hasCornerPosts(),
    });
  }

  emitOpeningInsert(): void {
    const fallbackWallId = this.walls()[0]?.id ?? 'wall-rotunda';
    const type = this.selectedOpeningType();
    this.openingInsertRequested.emit({
      wallId: this.targetWallId() || fallbackWallId,
      openingType: type,
      normalizedT: this.openingPositionT(),
      widthMeters: this.openingWidth(),
      isOpen: type === 'door_open' || type === 'archway' || this.openingIsOpen(),
      isSecret: type === 'secret_door',
    });
  }

  emitPathRibbonBuild(): void {
    const styleObj =
      this.pathStyles.find((s) => s.id === this.selectedPathStyle()) ?? this.pathStyles[0];
    this.pathRibbonBuildRequested.emit({
      name: this.pathName().trim() || styleObj.label,
      style: this.selectedPathStyle(),
      widthMeters: this.pathWidth(),
      curveAngleDeg: this.pathCurveAngle(),
      cliffStrataBands: this.cliffStrataBands(),
      colorHex: styleObj.colorHex,
    });
  }
}
