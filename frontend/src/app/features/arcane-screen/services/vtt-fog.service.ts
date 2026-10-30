import { Injectable, computed, inject } from '@angular/core';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { renderFogOfWarCanvas } from '../engine/vtt-fog-of-war.engine';
import { VttBattleStateService } from './vtt-battle-state.service';
import { VttCombatService } from './vtt-combat.service';

/**
 * Player-view fog of war. The GM sees the full map unless previewing the
 * player view. The layer is shared by the 2D SVG overlay and the 3D fog plane.
 */
@Injectable({ providedIn: 'root' })
export class VttFogService {
  private readonly battle = inject(VttBattleStateService);
  private readonly combat = inject(VttCombatService);
  private readonly store = inject(LoomWeaverStoreService);

  readonly isPlayerView = computed(
    () => this.store.viewerRole() === 'players' || this.battle.gmPreviewPlayerVision(),
  );

  /** Fog canvas in SVG viewBox space, or null when no fog applies to this viewer. */
  readonly layer = computed<HTMLCanvasElement | null>(() => {
    if (!this.isPlayerView()) return null;
    return renderFogOfWarCanvas(
      this.battle.fogObservers(),
      this.battle.walls(),
      this.battle.fogMode(),
      this.battle.exploredTrailPoints(),
    );
  });

  /** Data URL of the fog layer for the 2D SVG `<image>` element. */
  readonly layerHref = computed<string | null>(() => this.layer()?.toDataURL('image/png') ?? null);

  /** Per-token opacity for the 3D stage. Empty when the viewer sees no fog. */
  readonly opacityByKey = computed<ReadonlyMap<string, number>>(() => {
    const map = new Map<string, number>();
    if (!this.isPlayerView()) return map;
    for (const t of this.combat.tokens()) {
      map.set(t.key, this.battle.tokenOpacity(t));
    }
    return map;
  });
}
