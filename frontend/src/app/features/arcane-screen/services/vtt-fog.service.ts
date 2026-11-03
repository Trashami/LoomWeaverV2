import { Injectable, computed, effect, inject } from '@angular/core';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { VttFogOfWarEngine } from '../engine/vtt-fog-of-war.engine';
import { VttBattleStateService } from './vtt-battle-state.service';
import { VttCombatService } from './vtt-combat.service';

/**
 * MythWeaver-style Fog of War service shared by the 2D SVG overlay and the 3D
 * terrain-conforming Babylon fog plane.
 * - Unexplored areas render pure black (`1.0` alpha for players, or `gmFogOpacity` default `1.0`).
 * - Active Line-of-Sight areas are 100% clear (`0.0` fog alpha) with configurable
 *   feathered vision falloff (`visionFalloffPct`) and soft shadow edges (`shadowSoftnessPx`).
 * - Traveled areas in `explored-los` mode clear out to `traveledFogOpacity`.
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
      const visionFalloffPct = this.battle.visionFalloffPct();
      const shadowSoftnessPx = this.battle.shadowSoftnessPx();
      void this.combat.selectedAttackerKey();
      void this.battle.fogRevision();

      const unexploredFogOpacity = isPlayer ? 1.0 : gmOpacity;
      const effectiveTraveledOpacity = isPlayer
        ? traveledOpacity
        : Math.min(gmOpacity, traveledOpacity);

      return this.engine.render({
        encounterId,
        mode,
        observers,
        walls,
        defaultSightFeet,
        applyTokenVision,
        traveledFogOpacity: effectiveTraveledOpacity,
        unexploredFogOpacity,
        visionFalloffPct,
        shadowSoftnessPx,
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

  /** Per-token opacity for the 3D/2D Babylon stage. Out-of-sight tokens are hidden (0). */
  readonly opacityByKey = computed<ReadonlyMap<string, number>>(() => {
    const map = new Map<string, number>();
    for (const t of this.combat.tokens()) {
      map.set(t.key, this.battle.tokenOpacity(t));
    }
    return map;
  });
}
