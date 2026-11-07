import { resolveDefaultTokenFromLibrary, is3dPreviewThumbnailUrl } from './vtt-token-library-resolver';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { TableRealtimeSyncService, VttRealtimeEvent } from '../../../core/services/table-realtime-sync.service';
import { CombatStateResponse, ServerVttToken, VttSceneListItem, VttSceneResponse } from '../models/vtt-server.models';
import { snapToFiveFootGrid } from '../engine/vtt-los-and-grid.engine';
import { VttBattleStateService } from './vtt-battle-state.service';
import { VttCombatService } from './vtt-combat.service';
import { VttPartyAndActionsService } from './vtt-party-and-actions.service';
import { WebAudioAmbienceService } from '../../assets/engine/web-audio-ambience.service';
import { parseVttEvent } from './vtt-realtime-events';

/** Loads combat tokens and turn state from the API and sends movement and turn requests; client-first with SignalR broadcast. */
@Injectable({ providedIn: 'root' })
export class VttServerSyncService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly vtt = inject(VttCombatService);
  private readonly battle = inject(VttBattleStateService);
  private readonly partyAndActions = inject(VttPartyAndActionsService);
  private readonly characterStudio = inject(CharacterStudioService);
  private readonly audio = inject(WebAudioAmbienceService);
  private readonly realtime = inject(TableRealtimeSyncService);
  private readonly alertify = inject(LwAlertifyService);
  private readonly destroyRef = inject(DestroyRef);
  private lastLocalMoveMs = 0;

  readonly scenes = signal<readonly VttSceneListItem[]>([]);
  readonly activeSceneKey = signal('');
  readonly activeSceneResponse = signal<VttSceneResponse | null>(null);

  constructor() {
    effect(() => {
      this.realtime.combatTick();
      untracked(() => {
        if (Date.now() - this.lastLocalMoveMs < 2000) return;
        void this.refresh();
      });
    });
    effect(() => {
      if (this.store.activeCampaignId() > 0) untracked(() => void this.loadScenes());
    });
    this.realtime.ensureConnected();
    this.realtime.vttEvents
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => this.routeRemoteEvent(evt));
  }

  /** Broadcasts a token move over SignalR and persists it to the backend without re-fetching or overwriting local selection. */
  async publishMove(key: string, x: number, z: number): Promise<boolean> {
    this.lastLocalMoveMs = Date.now();
    this.vtt.saveTokenPositionsToStorage();
    const campaignId = this.store.activeCampaignId();
    if (campaignId > 0) {
      void this.realtime.publishVtt(campaignId, 'token_moved', this.localActorKey(), { key, x, z });
    }
    void this.moveToken(key, x, z);
    return true;
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
      case 'audio_control':
        if (parsed.action === 'play') {
          if (parsed.trackId) this.audio.playTrack(parsed.trackId, parsed.playlistId, 1.0);
          else this.audio.play();
        } else if (parsed.action === 'pause') {
          this.audio.pause();
        } else if (parsed.action === 'restart') {
          if (parsed.trackId && parsed.trackId !== this.audio.activeTrackId()) {
            this.audio.playTrack(parsed.trackId, parsed.playlistId, 0.5);
          } else {
            this.audio.restartTrack();
          }
        } else if (parsed.action === 'track' && parsed.trackId) {
          this.audio.playTrack(parsed.trackId, parsed.playlistId, 1.2);
        } else if (parsed.action === 'loop' && parsed.loopMode) {
          if (this.audio.loopMode() !== parsed.loopMode) {
            this.audio.toggleLoopMode();
          }
        }
        break;
    }
  }

  publishAudioControl(
    action: 'play' | 'pause' | 'restart' | 'track' | 'loop',
    payload?: { trackId?: string; playlistId?: string; loopMode?: 'playlist' | 'track' },
  ): void {
    const campaignId = this.store.activeCampaignId();
    if (campaignId > 0) {
      void this.realtime.publishVtt(campaignId, 'audio_control', this.localActorKey(), {
        action,
        trackId: payload?.trackId ?? this.audio.activeTrackId(),
        playlistId: payload?.playlistId ?? this.audio.activePlaylistId(),
        loopMode: payload?.loopMode ?? this.audio.loopMode(),
      });
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

  /** Loads the saved map scene with 3D lights, walls, and atmosphere. */
  async loadScene(sceneKey: string, title?: string, artworkUrl?: string): Promise<VttSceneResponse | null> {
    const base = this.base();
    if (!base) return null;
    try {
      const safeArt = artworkUrl && !artworkUrl.startsWith('data:') ? artworkUrl : '';
      const url = (title || safeArt || !sceneKey || sceneKey === 'current' || sceneKey === 'active')
        ? `${base}/maps/active-scene?sceneKey=${encodeURIComponent(sceneKey || '')}&title=${encodeURIComponent(title || '')}&artworkUrl=${encodeURIComponent(safeArt)}`
        : `${base}/maps/${encodeURIComponent(sceneKey)}/vtt-scene`;

      const scene = await firstValueFrom(this.http.get<VttSceneResponse>(url));
      if (scene) {
        if (scene.walls) {
          this.battle.walls.set(
            scene.walls.map((w) => ({
              id: w.id, label: w.label, x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2,
              blocksVision: w.blocksVision, blocksMovement: w.blocksMovement,
            })),
          );
        }
        this.activeSceneKey.set(scene.sceneKey);
        this.activeSceneResponse.set(scene);
        return scene;
      }
    } catch {
      this.alertify.notifyStatus('Scene', 'Not loaded', 'That saved map could not be loaded.', 'crimson');
    }
    return null;
  }

  private base(): string | null {
    const id = this.store.activeCampaignId();
    return id > 0 ? `/api/v2/campaigns/${id}` : null;
  }

  async refresh(): Promise<void> {
    const base = this.base();
    if (!base) return;
    const campaignId = this.store.activeCampaignId() || 1;
    const preservedAttackerKey = this.vtt.selectedAttackerKey();
    try {
      const [tokens, state] = await Promise.all([
        firstValueFrom(this.http.get<readonly ServerVttToken[]>(`${base}/vtt-tokens`)),
        firstValueFrom(this.http.get<CombatStateResponse>(`${base}/combat/state`)),
      ]);
      const sheets = this.characterStudio.sheets();
      const prevByKey = new Map(this.vtt.tokens().map((t) => [t.key, t]));
      const mapped = [...tokens].map((t) => {
        const prev = prevByKey.get(t.key);
        const lowerName = (t.name || '').trim().toLowerCase();
        const matchedSheet = sheets.find(
          (s) =>
            t.key.toLowerCase().includes(s.characterKey.toLowerCase()) ||
            s.name.trim().toLowerCase() === lowerName,
        );
        const sheetPortrait =
          matchedSheet?.portraitUrl && !is3dPreviewThumbnailUrl(matchedSheet.portraitUrl)
            ? matchedSheet.portraitUrl
            : undefined;
        const preferred2dAvatar =
          sheetPortrait ||
          (t.avatarUrl && !is3dPreviewThumbnailUrl(t.avatarUrl) ? t.avatarUrl : undefined);
        const def = resolveDefaultTokenFromLibrary({
          ...t,
          avatarUrl: preferred2dAvatar || t.avatarUrl,
        });
        const snapped = snapToFiveFootGrid({ x: prev?.x ?? t.x, z: prev?.z ?? t.z });
        return {
          ...prev,
          ...t,
          x: snapped.x,
          z: snapped.z,
          movementFeet: t.movementRemainingFeet,
          canControl: t.canControl === true,
          avatarUrl: prev?.avatarUrl || def.avatarUrl,
          glbUrl: prev?.glbUrl || t.glbUrl || def.glbUrl,
        };
      });
      const mergedWithParty = this.partyAndActions
        .mergeCampaignPartyIntoTokens(mapped, campaignId)
        .map((t) => {
          const snapped = snapToFiveFootGrid({ x: t.x, z: t.z });
          return { ...t, x: snapped.x, z: snapped.z };
        })
        .sort((a, b) => b.initiative - a.initiative);
      if (mergedWithParty.length === 0) return;
      this.vtt.tokens.set(mergedWithParty);
      this.vtt.activeRound.set(state.round);
      const index = Math.max(0, mergedWithParty.findIndex((t) => t.key === state.activeTokenKey));
      this.vtt.activeTurnIndex.set(index);
      if (this.store.viewerRole() !== 'gm') {
        if (!preservedAttackerKey || !mergedWithParty.some((t) => t.key === preservedAttackerKey)) {
          const myOwned = mergedWithParty.find((t) => t.canControl);
          this.vtt.selectedAttackerKey.set(myOwned?.key ?? mergedWithParty[index].key);
        }
      } else if (preservedAttackerKey && !mergedWithParty.some((t) => t.key === preservedAttackerKey)) {
        this.vtt.selectedAttackerKey.set('');
      }
    } catch {
      const merged = this.partyAndActions.mergeCampaignPartyIntoTokens(this.vtt.tokens(), campaignId);
      if (merged.length > 0 && this.vtt.tokens().length === 0) {
        this.vtt.tokens.set(merged);
      }
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
    try {
      await firstValueFrom(this.http.post(`${base}/vtt-tokens/move`, { tokenKey: key, x, z }));
      return true;
    } catch {
      return false;
    }
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
