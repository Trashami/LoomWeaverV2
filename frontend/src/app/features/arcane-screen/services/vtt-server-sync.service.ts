import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { TableRealtimeSyncService, VttRealtimeEvent } from '../../../core/services/table-realtime-sync.service';
import { CombatStateResponse, ServerVttToken, VttSceneListItem, VttSceneResponse } from '../models/vtt-server.models';
import { VttBattleStateService } from './vtt-battle-state.service';
import { VttCombatService } from './vtt-combat.service';
import { parseVttEvent } from './vtt-realtime-events';

/** Loads combat tokens and turn state from the API and sends movement and turn requests; the server decides what is allowed. */
@Injectable({ providedIn: 'root' })
export class VttServerSyncService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly vtt = inject(VttCombatService);
  private readonly battle = inject(VttBattleStateService);
  private readonly realtime = inject(TableRealtimeSyncService);
  private readonly alertify = inject(LwAlertifyService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scenes = signal<readonly VttSceneListItem[]>([]);
  readonly activeSceneKey = signal('');

  constructor() {
    effect(() => {
      this.realtime.combatTick();
      untracked(() => void this.refresh());
    });
    effect(() => {
      if (this.store.activeCampaignId() > 0) untracked(() => void this.loadScenes());
    });
    this.realtime.ensureConnected();
    this.realtime.vttEvents
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => this.routeRemoteEvent(evt));
  }

  /** Sends a token move to the server, then tells other clients so their 2D and 3D views follow. */
  async publishMove(key: string, x: number, z: number): Promise<boolean> {
    const campaignId = this.store.activeCampaignId();
    const ok = await this.moveToken(key, x, z);
    if (ok && campaignId > 0) {
      await this.realtime.publishVtt(campaignId, 'token_moved', this.localActorKey(), { key, x, z });
    }
    return ok;
  }

  private localActorKey(): string {
    return this.store.activeUserAccountId();
  }

  private routeRemoteEvent(evt: VttRealtimeEvent): void {
    if (evt.actorKey === this.localActorKey()) return;
    const parsed = parseVttEvent(evt);
    if (!parsed) return;
    switch (parsed.kind) {
      case 'token_moved':
        this.vtt.applyRemoteTokenMove(parsed.key, parsed.x, parsed.z);
        break;
      case 'turn_changed':
        this.vtt.applyRemoteTurn(parsed.activeKey, parsed.round);
        break;
      case 'effect_cast':
        this.vtt.applyRemoteEffect(
          parsed.presetId, parsed.startX, parsed.startZ, parsed.endX, parsed.endZ, parsed.targetKeys,
        );
        break;
      case 'fog_changed':
        this.battle.applyRemoteFog(parsed.mode);
        break;
    }
  }

  async loadScenes(): Promise<void> {
    const base = this.base();
    if (!base) return;
    try {
      this.scenes.set(await firstValueFrom(this.http.get<readonly VttSceneListItem[]>(`${base}/maps/scenes`)));
    } catch {
      this.scenes.set([]);
    }
  }

  /** Replaces the built-in demo walls with the saved map's walls. */
  async loadScene(sceneKey: string): Promise<void> {
    const base = this.base();
    if (!base || !sceneKey) return;
    try {
      const scene = await firstValueFrom(
        this.http.get<VttSceneResponse>(`${base}/maps/${encodeURIComponent(sceneKey)}/vtt-scene`),
      );
      this.battle.walls.set(
        scene.walls.map((w) => ({
          id: w.id, label: w.label, x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2,
          blocksVision: w.blocksVision, blocksMovement: w.blocksMovement,
        })),
      );
      this.activeSceneKey.set(sceneKey);
    } catch {
      this.alertify.notifyStatus('Scene', 'Not loaded', 'That saved map could not be loaded.', 'crimson');
    }
  }

  private base(): string | null {
    const id = this.store.activeCampaignId();
    return id > 0 ? `/api/v2/campaigns/${id}` : null;
  }

  async refresh(): Promise<void> {
    const base = this.base();
    if (!base) return;
    try {
      const [tokens, state] = await Promise.all([
        firstValueFrom(this.http.get<readonly ServerVttToken[]>(`${base}/vtt-tokens`)),
        firstValueFrom(this.http.get<CombatStateResponse>(`${base}/combat/state`)),
      ]);
      if (tokens.length === 0) return;
      const mapped = [...tokens]
        .map((t) => ({ ...t, movementFeet: t.movementRemainingFeet, canControl: t.canControl === true }))
        .sort((a, b) => b.initiative - a.initiative);
      this.vtt.tokens.set(mapped);
      this.vtt.activeRound.set(state.round);
      const index = Math.max(0, mapped.findIndex((t) => t.key === state.activeTokenKey));
      this.vtt.activeTurnIndex.set(index);
      this.vtt.selectedAttackerKey.set(mapped[index].key);
    } catch {
      // Not a campaign member or offline: keep the local scene untouched.
    }
  }

  /** GM only: seed the party on the server, then register the launched hostile tokens so every player sees them. */
  async publishLaunchedEncounter(): Promise<void> {
    const base = this.base();
    if (!base) return;
    const hostiles = this.vtt.tokens().filter((t) => t.faction === 'hostile').slice(0, 40);
    try {
      await firstValueFrom(this.http.post(`${base}/combat/start`, {}));
      for (const t of hostiles) {
        await firstValueFrom(
          this.http.post(`${base}/vtt-tokens`, {
            name: t.name,
            roleLabel: t.roleLabel,
            maxHp: t.maxHp,
            armorClass: t.armorClass,
            x: t.x,
            z: t.z,
            speedFeet: t.movementFeet,
          }),
        );
      }
    } catch {
      this.alertify.notifyStatus('Combat', 'Not published', 'Only the GM can publish an encounter to the table.', 'crimson');
    }
    await this.refresh();
  }

  async startCombat(): Promise<void> {
    const base = this.base();
    if (!base) return;
    await this.send(`${base}/combat/start`, {});
  }

  async moveToken(key: string, x: number, z: number): Promise<boolean> {
    const base = this.base();
    if (!base) return false;
    return this.send(`${base}/vtt-tokens/move`, { tokenKey: key, x, z });
  }

  async nextTurn(): Promise<boolean> {
    const base = this.base();
    if (!base) return false;
    const campaignId = this.store.activeCampaignId();
    const ok = await this.send(`${base}/combat/next-turn`, {});
    if (ok && campaignId > 0) {
      await this.realtime.publishVtt(campaignId, 'turn_changed', this.localActorKey(), {
        activeKey: this.vtt.selectedAttackerKey(),
        round: this.vtt.activeRound(),
      });
    }
    return ok;
  }

  private async send(url: string, body: unknown): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post(url, body));
      await this.refresh();
      return true;
    } catch (err) {
      const message = (err as { error?: { error?: string } }).error?.error ?? 'The server rejected that action.';
      this.alertify.notifyStatus('Combat', 'Not allowed', message, 'crimson');
      await this.refresh();
      return false;
    }
  }
}
