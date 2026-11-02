import { Injectable, computed, effect, inject } from '@angular/core';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { VttFogOfWarEngine } from '../engine/vtt-fog-of-war.engine';
import { VttBattleStateService } from './vtt-battle-state.service';
import { VttCombatService } from './vtt-combat.service';

/**
 * MythWeaver-style Fog of War service shared by the 2D SVG overlay and the 3D
 * terrain-conforming Babylon fog plane.
 * - Players see full dark fog (`0.96` alpha) with traveled areas at `traveledFogOpacity`.
 * - GMs see translucent tactical fog (`gmFogOpacity`, default `0.48`) unless
 *   `fogMode === 'no-fog'`, so GMs can see token vision apertures and paint
 *   with the manual Fog Brush while still seeing the map beneath.
 */
@Injectable({ providedIn: 'root' })
export class VttFogService {
  private readonly battle = inject(VttBattleStateService);
  private readonly combat = inject(VttCombatService);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly engine = new VttFogOfWarEngine();

  constructor() {
    effect(() => {
      const rev = this.battle.fogRevision();
      const encId = this.combat.activeEncounterId() || 'default';
      if (rev > 0 && this.battle.manualFogStrokes().length === 0) {
        this.engine.resetExplored(encId);
      }
    });
  }

  readonly isPlayerView = computed(
    () =>
      this.store.viewerRole() === 'players' ||
      this.battle.gmPreviewPlayerVision() ||
      this.battle.previewTokenVisionKey() !== null,
  );

  /** Fog canvas in world space (`[-18, 18] x [-13.5, 13.5]`), or null when `no-fog`. */
  readonly layer = computed<HTMLCanvasElement | null>(
    () => {
      const mode = this.battle.fogMode();
      if (mode === 'no-fog') return null;

      // Read reactive dependencies so the canvas updates when tokens move, a token is selected, or settings change
      const encounterId = this.combat.activeEncounterId() || 'default';
      const observers = this.battle.fogObserverTokens();
      const walls = this.battle.walls();
      const defaultSightFeet = this.battle.playerSightDistanceFeet();
      const applyTokenVision = this.battle.applyTokenVision();
      const manualStrokes = this.battle.manualFogStrokes();
      const isPlayer = this.isPlayerView();
      const traveledOpacity = this.battle.traveledFogOpacity();
      const gmOpacity = this.battle.gmFogOpacity();
      void this.combat.selectedAttackerKey();
      void this.battle.fogRevision();

      const unexploredFogOpacity = isPlayer ? 0.96 : gmOpacity;
      const effectiveTraveledOpacity = isPlayer
        ? traveledOpacity
        : Math.min(gmOpacity * 0.65, traveledOpacity);

      return this.engine.render({
        encounterId,
        mode,
        observers,
        walls,
        defaultSightFeet,
        applyTokenVision,
        traveledFogOpacity: effectiveTraveledOpacity,
        unexploredFogOpacity,
        manualStrokes,
      });
    },
    { equal: () => false },
  );

  /** Data URL of the fog layer for the 2D SVG `<image>` element. */
  readonly layerHref = computed<string | null>(() => {
    const canvas = this.layer();
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  });

  /** Per-token opacity for the 3D/2D Babylon stage. */
  readonly opacityByKey = computed<ReadonlyMap<string, number>>(() => {
    const map = new Map<string, number>();
    const isPlayer = this.isPlayerView();
    for (const t of this.combat.tokens()) {
      const vis = this.battle.tokenOpacity(t);
      map.set(t.key, isPlayer ? vis : vis > 0 ? 1 : 0.42);
    }
    return map;
  });
}
