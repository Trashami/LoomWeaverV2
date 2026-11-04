import { Injectable, computed, inject, signal } from '@angular/core';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { VttTokenVm } from '../../effects/engine/effect-timeline.contract';
import {
  clampLineToRangeAndWalls, computeClampedGridMovePath, computeVisibilityPolygonSvgPoints,
  distanceInFeet, findClosestSnapToken, findTokensInAoe, hasLineOfSight, snapToFiveFootGrid,
} from '../engine/vtt-los-and-grid.engine';
import { getEffectiveTokenVisionFeet } from '../engine/vtt-fog-of-war.engine';
import {
  VttActionBarSettingsVm, VttChatMessageVm, VttFogBrushMode, VttFogBrushShape, VttFogBrushStrokeVm,
  VttFogMode, VttMeasureSubMode, VttOpenDmDrawer, VttPoint2D, VttRevealedLoreVm, VttRightTabId,
  VttScopedNpcVm, VttScopedQuestVm, VttTacticalAbilityVm, VttTokenContextMenuStateVm, VttTurnActionCategory, VttWallSegmentVm,
} from '../models/vtt-battle.models';
import {
  SEED_TACTICAL_TURN_ABILITIES, SEED_VTT_CHAT_MESSAGES, SEED_VTT_REVEALED_LORE,
  SEED_VTT_SCOPED_NPCS, SEED_VTT_SCOPED_QUESTS, SEED_VTT_WALL_SEGMENTS,
} from './vtt-battle.seed';
import { VttCombatService } from './vtt-combat.service';
import { VttPartyAndActionsService } from './vtt-party-and-actions.service';
import type { DockAction } from '../components/vtt-action-dock/vtt-action-dock.models';
import { ActionBarSkinId, DEFAULT_ACTION_BAR_SKIN, isActionBarSkin } from '../components/vtt-action-bar/action-bar-skins';

const ACTION_BAR_SKIN_KEY = 'lw.vtt.actionBarSkin';
export const VTT_FOG_MODES: readonly VttFogMode[] = ['los-only', 'explored-los', 'manual-only', 'no-fog'];

function readSavedActionBarSkin(): ActionBarSkinId {
  try { const saved = localStorage.getItem(ACTION_BAR_SKIN_KEY); return isActionBarSkin(saved) ? saved : DEFAULT_ACTION_BAR_SKIN; } catch { return DEFAULT_ACTION_BAR_SKIN; }
}

@Injectable({ providedIn: 'root' })
export class VttBattleStateService {
  private readonly store = inject(LoomWeaverStoreService);
  private readonly vtt = inject(VttCombatService);
  private readonly partyAndActions = inject(VttPartyAndActionsService);

  readonly rightPanelCollapsed = signal<boolean>(false);
  readonly activeRightTab = signal<VttRightTabId>('combat-log');
  readonly openDmDrawer = signal<VttOpenDmDrawer>('none');
  readonly settingsModalOpen = signal<boolean>(false);
  readonly mapMode3D = signal<boolean>(false);

  readonly actionBarSettings = signal<VttActionBarSettingsVm>({
    skin: readSavedActionBarSkin(), opacity: 95, compactMode: false,
    snapSensitivityFeet: 10, showHotbarKeybinds: true, showMapRangeLabels: true, autoCenterActiveTurn: true,
  });

  readonly fogMode = signal<VttFogMode>('explored-los');
  readonly losVisionEnabled = signal<boolean>(true);
  readonly losWallShadowsEnabled = signal<boolean>(true);
  readonly applyTokenVision = signal<boolean>(true);
  readonly traveledFogOpacity = signal<number>(0.5);
  readonly gmFogOpacity = signal<number>(1.0);
  readonly visionFalloffPct = signal<number>(45);
  readonly visionFalloffCurvePct = signal<number>(50);
  readonly shadowSoftnessPx = signal<number>(10);
  readonly hideOutOfSightMonsters = signal<boolean>(true);
  readonly showMonstersBeyondVision = computed<boolean>(() => !this.hideOutOfSightMonsters());
  readonly showCharactersBeyondVision = signal<boolean>(false);
  readonly playerSightDistanceFeet = signal<number>(60);
  readonly gmPreviewPlayerVision = signal<boolean>(false);
  readonly previewTokenVisionKey = signal<string | null>(null);

  readonly fogBrushMode = signal<VttFogBrushMode>('none');
  readonly fogBrushShape = signal<VttFogBrushShape>('circle');
  readonly fogBrushRadiusFeet = signal<number>(20);
  readonly manualFogStrokes = signal<readonly VttFogBrushStrokeVm[]>([]);
  readonly fogRevision = signal<number>(0);
  readonly tokenContextMenu = signal<VttTokenContextMenuStateVm | null>(null);

  applyRemoteFog(mode: VttFogMode): void { if (VTT_FOG_MODES.includes(mode)) this.fogMode.set(mode); }
  setShowMonstersBeyondVision(visible: boolean): void { this.hideOutOfSightMonsters.set(!visible); }

  readonly walls = signal<readonly VttWallSegmentVm[]>(SEED_VTT_WALL_SEGMENTS);
  readonly exploredTrailPoints = signal<readonly { x: number; z: number; radiusFeet: number }[]>([]);

  readonly cursorWorldPos = signal<VttPoint2D>({ x: 4, z: 1 });
  readonly draggingTokenKey = signal<string | null>(null);
  readonly dragStartWorldPos = signal<VttPoint2D | null>(null);

  readonly measureEnabled = signal<boolean>(false);
  readonly measureSubMode = signal<VttMeasureSubMode>('spell');
  readonly measuredAbilityId = signal<string>('act-kildrid-seal');
  readonly usedMovementFeetByToken = signal<Record<string, number>>({});

  readonly activeTurnCategory = signal<VttTurnActionCategory>('all');
  readonly customTacticalAbilities = signal<readonly VttTacticalAbilityVm[]>(SEED_TACTICAL_TURN_ABILITIES);

  readonly tacticalAbilities = computed<readonly VttTacticalAbilityVm[]>(() => {
    const actor = this.activeObserverToken();
    const derived = this.partyAndActions.resolveTacticalAbilitiesForToken(actor, this.vtt.creatures());
    return derived.length > 0 ? derived : this.customTacticalAbilities();
  });

  readonly pendingAbility = signal<VttTacticalAbilityVm | null>(null);
  readonly targetSelectionMode = signal<boolean>(false);
  readonly multiTargetKeys = signal<readonly string[]>([]);
  readonly queuedTargetSequence = signal<readonly string[]>([]);
  readonly hasActiveTargetTether = signal<boolean>(false);

  readonly chatMessages = signal<readonly VttChatMessageVm[]>(SEED_VTT_CHAT_MESSAGES);
  readonly scopedQuests = signal<readonly VttScopedQuestVm[]>(SEED_VTT_SCOPED_QUESTS);
  readonly scopedNpcs = signal<readonly VttScopedNpcVm[]>(SEED_VTT_SCOPED_NPCS);
  readonly revealedLore = signal<readonly VttRevealedLoreVm[]>(SEED_VTT_REVEALED_LORE);

  readonly activeInitiativeToken = computed<VttTokenVm>(() => this.vtt.tokens()[this.vtt.activeTurnIndex()] ?? this.vtt.tokens()[0]);

  readonly activeObserverToken = computed<VttTokenVm>(() => {
    const selected = this.vtt.selectedAttacker();
    if (selected && (this.store.viewerRole() === 'gm' || this.canControlToken(selected))) return selected;
    const previewKey = this.previewTokenVisionKey();
    if (previewKey) {
      const found = this.vtt.tokens().find((t) => t.key === previewKey);
      if (found) return found;
    }
    const party = this.vtt.partyTokensInScene();
    return party.find((t) => this.canControlToken(t)) ?? party[0] ?? this.vtt.tokens()[0];
  });

  readonly fogObserverTokens = computed<readonly VttTokenVm[]>(() => {
    const previewKey = this.previewTokenVisionKey();
    if (previewKey) {
      const single = this.vtt.tokens().find((t) => t.key === previewKey);
      return single ? [single] : [];
    }
    const selected = this.vtt.selectedAttacker();
    if (selected && (this.store.viewerRole() === 'gm' || this.canControlToken(selected))) {
      return [selected];
    }
    const party = this.vtt.tokens().filter((t) => t.faction === 'party');
    return party.length > 0 ? party : this.vtt.tokens().slice(0, 1);
  });

  canControlToken(token: VttTokenVm): boolean {
    if (this.store.viewerRole() === 'gm') return true;
    return token.canControl === true || token.faction === 'party';
  }

  readonly remainingMovementFeet = computed<number>(() => {
    const observer = this.activeObserverToken();
    if (!observer) return 30;
    return Math.max(0, observer.movementFeet - (this.usedMovementFeetByToken()[observer.key] ?? 0));
  });

  canMoveToken(token: VttTokenVm): { allowed: boolean; reason: string } {
    if (this.store.viewerRole() === 'gm') return { allowed: true, reason: 'DM can move any token at any time.' };
    if (!this.canControlToken(token)) return { allowed: false, reason: 'Players can only move their own token.' };
    const currentTurnToken = this.activeInitiativeToken();
    if (!currentTurnToken || currentTurnToken.key !== token.key) {
      return { allowed: false, reason: `Locked: Players can only move on their turn in Initiative (Current turn: ${currentTurnToken?.name ?? 'Unknown'}, Round ${this.vtt.activeRound()}).` };
    }
    if ((this.usedMovementFeetByToken()[token.key] ?? 0) >= token.movementFeet) {
      return { allowed: false, reason: `${token.name} has used all ${token.movementFeet}ft of movement for Round ${this.vtt.activeRound()}.` };
    }
    return { allowed: true, reason: 'Active turn movement permitted.' };
  }

  isSingleOrMultiTargetAbility(ability: VttTacticalAbilityVm): boolean {
    return ability.aoeRadiusFeet <= 5 || ability.aoeShape === 'none' || ability.targetMode === 'single' || ability.targetMode === 'multi-target';
  }

  readonly observerSightPolygonSvg = computed<string>(() => {
    const obs = this.activeObserverToken();
    if (!obs || !this.losVisionEnabled()) return '';
    return computeVisibilityPolygonSvgPoints({ x: obs.x, z: obs.z }, getEffectiveTokenVisionFeet(obs, this.playerSightDistanceFeet(), this.applyTokenVision()), this.losWallShadowsEnabled() ? this.walls() : [], 96);
  });

  isPointRevealedByManualStroke(pt: VttPoint2D): 'revealed' | 'covered' | 'none' {
    let state: 'revealed' | 'covered' | 'none' = 'none';
    for (const stroke of this.manualFogStrokes()) {
      if (distanceInFeet(pt, { x: stroke.x, z: stroke.z }) <= stroke.radiusFeet) state = stroke.mode === 'reveal' ? 'revealed' : 'covered';
    }
    return state;
  }

  tokenOpacity(token: VttTokenVm): number {
    if (this.fogMode() === 'no-fog' && !this.losVisionEnabled()) return 1;
    if (token.faction === 'party' && this.showCharactersBeyondVision()) return 1;
    if (token.faction === 'hostile' && !this.hideOutOfSightMonsters()) return 1;
    const manualState = this.isPointRevealedByManualStroke({ x: token.x, z: token.z });
    if (manualState === 'revealed') return 1;
    if (manualState === 'covered' || this.fogMode() === 'manual-only') return 0;
    if (!this.losVisionEnabled()) return this.fogMode() === 'no-fog' ? 1 : 0;
    const activeWalls = this.losWallShadowsEnabled() ? this.walls() : [];
    for (const obs of this.fogObserverTokens()) {
      if (obs.key === token.key) return 1;
      const sightFeet = getEffectiveTokenVisionFeet(obs, this.playerSightDistanceFeet(), this.applyTokenVision());
      if (hasLineOfSight({ x: obs.x, z: obs.z }, { x: token.x, z: token.z }, sightFeet, activeWalls)) return 1;
    }
    return 0;
  }

  isTokenInPlayerLoS(token: VttTokenVm): boolean { return this.tokenOpacity(token) > 0; }

  readonly visibleMapTokens = computed<readonly VttTokenVm[]>(() => this.vtt.tokens().filter((t) => this.isTokenInPlayerLoS(t)));
  readonly filteredTurnAbilities = computed<readonly VttTacticalAbilityVm[]>(() => this.activeTurnCategory() === 'all' ? this.tacticalAbilities() : this.tacticalAbilities().filter((a) => a.turnCategory === this.activeTurnCategory()));

  getDockActionsForToken(token: VttTokenVm, category: 'melee' | 'ranged' | 'spell' | 'bonus' | 'reaction'): DockAction[] {
    return this.partyAndActions.getDockActionsForToken(token, category, this.vtt.creatures());
  }

  triggerDockAction(dockAction: DockAction): VttTacticalAbilityVm | null {
    const abilities = this.tacticalAbilities();
    const matched = abilities.find((a) => a.id === dockAction.id) ?? abilities.find((a) => a.name.toLowerCase() === dockAction.name.toLowerCase()) ?? abilities[0] ?? null;
    if (matched) this.beginAbilityTargeting(matched);
    return matched;
  }

  isAbilityAvailableOnTurn(ability: VttTacticalAbilityVm): boolean {
    if (this.store.viewerRole() === 'gm') return true;
    const actor = this.activeObserverToken();
    if (!actor) return true;
    if (ability.actionCost === '1 Action') return !actor.actionUsed;
    if (ability.actionCost === '1 Bonus Action') return !actor.bonusUsed;
    if (ability.actionCost === '1 Reaction') return !actor.reactionUsed;
    return true;
  }

  readonly measuredAbility = computed<VttTacticalAbilityVm>(
    () => this.tacticalAbilities().find((a) => a.id === this.measuredAbilityId()) ?? this.tacticalAbilities()[0] ?? SEED_TACTICAL_TURN_ABILITIES[0],
  );

  readonly activeRangeAndAoePreview = computed(() => {
    const obs = this.activeObserverToken();
    if (!obs) return null;
    const ability = this.pendingAbility() ? this.pendingAbility() : this.measureEnabled() && this.measureSubMode() === 'spell' ? this.measuredAbility() : this.targetSelectionMode() ? (this.tacticalAbilities()[0] ?? SEED_TACTICAL_TURN_ABILITIES[0]) : null;
    if (!ability) return null;
    const isSingleOrMulti = this.targetSelectionMode() && !this.pendingAbility() ? true : this.isSingleOrMultiTargetAbility(ability);
    const maxTargets = Math.max(1, ability.maxTargets || 1);
    const rangeFt = this.targetSelectionMode() && !this.pendingAbility() ? Math.max(120, ability.rangeFeet) : ability.rangeFeet;

    if (isSingleOrMulti) {
      const candidates = this.visibleMapTokens().filter((t) => t.key !== obs.key);
      const snappedToken = findClosestSnapToken({ x: obs.x, z: obs.z }, this.cursorWorldPos(), rangeFt, this.actionBarSettings().snapSensitivityFeet, candidates, this.walls());
      const desiredEnd: VttPoint2D = snappedToken ? { x: snappedToken.x, z: snappedToken.z } : this.cursorWorldPos();
      const clamped = clampLineToRangeAndWalls({ x: obs.x, z: obs.z }, desiredEnd, rangeFt, this.walls(), false);
      const highlightedTokens = snappedToken && !clamped.blockedByWall ? [snappedToken] : [];
      return { ability, clamped, isSingleOrMulti: true, maxTargets, snappedToken: !clamped.blockedByWall ? snappedToken : null, aoeRadiusFeet: 5, highlightedTokens, highlightedKeys: new Set(highlightedTokens.map((t) => t.key)) };
    }

    const clamped = clampLineToRangeAndWalls({ x: obs.x, z: obs.z }, this.cursorWorldPos(), ability.rangeFeet, this.walls(), false);
    const aoeRadius = Math.max(10, ability.aoeRadiusFeet);
    const highlightedTokens = findTokensInAoe(clamped.end, aoeRadius, this.visibleMapTokens());
    return { ability, clamped, isSingleOrMulti: false, maxTargets: 0, snappedToken: null, aoeRadiusFeet: aoeRadius, highlightedTokens, highlightedKeys: new Set(highlightedTokens.map((t) => t.key)) };
  });

  isTokenTargetedWithReticle(tokenKey: string): boolean {
    const preview = this.activeRangeAndAoePreview();
    if (preview && !preview.isSingleOrMulti) return preview.highlightedKeys.has(tokenKey);
    return !!preview?.highlightedKeys?.has(tokenKey) || this.queuedTargetSequence().includes(tokenKey) || this.multiTargetKeys().includes(tokenKey);
  }

  getTargetStackCount(tokenKey: string): number {
    const seq = this.queuedTargetSequence();
    return (seq.length > 0 ? seq : this.multiTargetKeys()).filter((k) => k === tokenKey).length;
  }

  readonly allReticleTargetKeys = computed<readonly string[]>(() => {
    const preview = this.activeRangeAndAoePreview();
    if (preview && !preview.isSingleOrMulti) return preview.highlightedTokens.map((t) => t.key);
    const set = new Set<string>(this.multiTargetKeys());
    this.queuedTargetSequence().forEach((k) => set.add(k));
    preview?.highlightedTokens.forEach((t) => set.add(t.key));
    return Array.from(set);
  });

  readonly activeTetherTargetPoints = computed<readonly VttPoint2D[]>(() => {
    const obs = this.activeObserverToken();
    const preview = this.activeRangeAndAoePreview();
    if (preview && !preview.isSingleOrMulti) return [];
    const tokens = this.visibleMapTokens();
    const keys = this.queuedTargetSequence().length > 0 ? this.queuedTargetSequence() : this.hasActiveTargetTether() ? this.multiTargetKeys() : [];
    const pts = keys.filter((k) => !obs || k !== obs.key).map((k) => tokens.find((tok) => tok.key === k)).filter((t): t is VttTokenVm => !!t).map((t) => ({ x: t.x, z: t.z }));
    if (preview && preview.isSingleOrMulti && preview.snappedToken && !keys.includes(preview.snappedToken.key)) pts.push({ x: preview.snappedToken.x, z: preview.snappedToken.z });
    return pts;
  });

  readonly activeMovementPreview = computed(() => {
    const dragKey = this.draggingTokenKey();
    const dragStart = this.dragStartWorldPos();
    if (dragKey && dragStart) {
      const token = this.vtt.tokens().find((t) => t.key === dragKey);
      if (!token) return null;
      const isGm = this.store.viewerRole() === 'gm';
      const maxFeet = isGm ? 120 : Math.max(0, token.movementFeet - (this.usedMovementFeetByToken()[token.key] ?? 0));
      return computeClampedGridMovePath(dragStart, this.cursorWorldPos(), maxFeet, isGm ? [] : this.walls());
    }
    if (!this.measureEnabled() || this.measureSubMode() !== 'movement') return null;
    const obs = this.activeObserverToken();
    if (!obs) return null;
    return computeClampedGridMovePath({ x: obs.x, z: obs.z }, this.cursorWorldPos(), this.store.viewerRole() === 'gm' ? 120 : this.remainingMovementFeet(), this.store.viewerRole() === 'gm' ? [] : this.walls());
  });

  readonly visibleChatMessages = computed(() => this.store.viewerRole() === 'gm' ? this.chatMessages() : this.chatMessages().filter((m) => m.revealedToPlayers));
  readonly visibleQuests = computed(() => this.store.viewerRole() === 'gm' ? this.scopedQuests() : this.scopedQuests().filter((q) => q.revealedToPlayers));
  readonly visibleNpcs = computed(() => this.store.viewerRole() === 'gm' ? this.scopedNpcs() : this.scopedNpcs().filter((n) => n.revealedToPlayers));
  readonly visibleLore = computed(() => this.store.viewerRole() === 'gm' ? this.revealedLore() : this.revealedLore().filter((l) => l.revealedToPlayers));

  toggleDmDrawer(drawer: VttOpenDmDrawer): void { this.openDmDrawer.update((curr) => (curr === drawer ? 'none' : drawer)); }
  openTokenContextMenu(tokenKey: string, clientX: number, clientY: number): void { this.tokenContextMenu.set({ tokenKey, clientX, clientY }); }
  closeTokenContextMenu(): void { this.tokenContextMenu.set(null); }

  addFogBrushStroke(worldPt: VttPoint2D): void {
    const mode = this.fogBrushMode();
    if (mode === 'none') return;
    const stroke: VttFogBrushStrokeVm = { id: `fog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, mode, shape: this.fogBrushShape(), x: Number(worldPt.x.toFixed(2)), z: Number(worldPt.z.toFixed(2)), radiusFeet: this.fogBrushRadiusFeet() };
    this.manualFogStrokes.update((prev) => [...prev.slice(-140), stroke]);
  }

  clearAllFog(): void {
    this.manualFogStrokes.set([{ id: `fog-reveal-all-${Date.now()}`, mode: 'reveal', shape: 'square', x: 0, z: 0, radiusFeet: 250 }]);
    this.fogRevision.update((v) => v + 1);
  }

  reapplyAllFog(): void {
    this.manualFogStrokes.set([]);
    this.exploredTrailPoints.set([]);
    this.fogRevision.update((v) => v + 1);
  }

  updateActionBarSettings(patch: Partial<VttActionBarSettingsVm>): void {
    this.actionBarSettings.update((curr) => ({ ...curr, ...patch }));
    if (patch.skin) { try { localStorage.setItem(ACTION_BAR_SKIN_KEY, patch.skin); } catch {} }
  }

  canMeasure(): boolean { return this.store.viewerRole() === 'gm' || !this.canControlToken(this.activeInitiativeToken()); }

  toggleMeasureTool(subMode?: VttMeasureSubMode): void {
    if (!this.canMeasure()) { this.measureEnabled.set(false); return; }
    if (subMode) {
      if (this.measureEnabled() && this.measureSubMode() === subMode) this.measureEnabled.set(false);
      else { this.pendingAbility.set(null); this.queuedTargetSequence.set([]); this.measureSubMode.set(subMode); this.measureEnabled.set(true); }
      return;
    }
    this.measureEnabled.update((v) => !v);
    if (this.measureEnabled()) { this.pendingAbility.set(null); this.queuedTargetSequence.set([]); }
  }

  beginTokenDrag(token: VttTokenVm): { allowed: boolean; reason: string } {
    const check = this.canMoveToken(token);
    if (!check.allowed) return check;
    this.draggingTokenKey.set(token.key);
    this.dragStartWorldPos.set({ x: token.x, z: token.z });
    return check;
  }

  updateDraggedTokenPosition(worldPt: VttPoint2D): void {
    this.cursorWorldPos.set(worldPt);
    const dragKey = this.draggingTokenKey();
    const dragStart = this.dragStartWorldPos();
    if (!dragKey || !dragStart) return;
    if (this.store.viewerRole() === 'gm') {
      const snapped = snapToFiveFootGrid(worldPt);
      this.vtt.tokens.update((list) => list.map((t) => (t.key === dragKey ? { ...t, x: snapped.x, z: snapped.z } : t)));
      return;
    }
    const preview = this.activeMovementPreview();
    if (preview) this.vtt.tokens.update((list) => list.map((t) => (t.key === dragKey ? { ...t, x: preview.destination.x, z: preview.destination.z } : t)));
  }

  endTokenDrag(): { movedToken: VttTokenVm | null; distanceFeet: number } {
    const dragKey = this.draggingTokenKey();
    const dragStart = this.dragStartWorldPos();
    if (!dragKey || !dragStart) { this.draggingTokenKey.set(null); this.dragStartWorldPos.set(null); return { movedToken: null, distanceFeet: 0 }; }
    const token = this.vtt.tokens().find((t) => t.key === dragKey) ?? null;
    const dist = token ? Math.round(distanceInFeet(dragStart, { x: token.x, z: token.z }) / 5) * 5 : 0;
    if (token && dist > 0) {
      if (this.store.viewerRole() === 'players') this.usedMovementFeetByToken.update((prev) => ({ ...prev, [token.key]: (prev[token.key] ?? 0) + dist }));
      const rFt = getEffectiveTokenVisionFeet(token, this.playerSightDistanceFeet(), this.applyTokenVision());
      this.exploredTrailPoints.update((pts) => [...pts, { x: dragStart.x, z: dragStart.z, radiusFeet: rFt }, { x: token.x, z: token.z, radiusFeet: rFt }]);
    }
    this.draggingTokenKey.set(null);
    this.dragStartWorldPos.set(null);
    return { movedToken: token, distanceFeet: dist };
  }

  commitStealthGridMove(): { allowed: boolean; reason: string; distanceFeet: number } {
    const obs = this.activeObserverToken();
    const preview = this.activeMovementPreview();
    if (!obs || !preview || preview.distanceFeet <= 0) return { allowed: false, reason: 'Move cursor to a valid grid tile first.', distanceFeet: 0 };
    const perm = this.canMoveToken(obs);
    if (!perm.allowed) return { allowed: false, reason: perm.reason, distanceFeet: 0 };
    const dest = preview.destination;
    this.vtt.tokens.update((list) => list.map((t) => (t.key === obs.key ? { ...t, x: dest.x, z: dest.z } : t)));
    if (this.store.viewerRole() === 'players') this.usedMovementFeetByToken.update((prev) => ({ ...prev, [obs.key]: (prev[obs.key] ?? 0) + preview.distanceFeet }));
    this.exploredTrailPoints.update((pts) => [...pts, { x: dest.x, z: dest.z, radiusFeet: getEffectiveTokenVisionFeet(obs, this.playerSightDistanceFeet(), this.applyTokenVision()) }]);
    return { allowed: true, reason: 'Moved', distanceFeet: preview.distanceFeet };
  }

  resetTurnMovement(tokenKey: string): void { this.usedMovementFeetByToken.update((prev) => ({ ...prev, [tokenKey]: 0 })); }
  beginAbilityTargeting(ability: VttTacticalAbilityVm): void {
    if (!this.isAbilityAvailableOnTurn(ability)) return;
    this.measureEnabled.set(false);
    if (!this.isSingleOrMultiTargetAbility(ability)) {
      const obs = this.activeObserverToken();
      if (obs) this.cursorWorldPos.set({ x: obs.x, z: obs.z });
      this.multiTargetKeys.set([]); this.queuedTargetSequence.set([]); this.hasActiveTargetTether.set(false);
    } else if (!this.hasActiveTargetTether()) {
      this.queuedTargetSequence.set([]);
    }
    this.pendingAbility.set(ability);
  }

  recordPendingAbilityTargetClick(targetToken?: VttTokenVm): { shouldExecuteNow: boolean; selectedCount: number; maxTargets: number } {
    const ability = this.pendingAbility();
    const preview = this.activeRangeAndAoePreview();
    if (!ability || !preview) return { shouldExecuteNow: false, selectedCount: 0, maxTargets: 1 };
    if (!preview.isSingleOrMulti) {
      const aoeKeys = preview.highlightedTokens.map((t) => t.key);
      const fallback = this.visibleMapTokens().find((t) => t.faction === 'hostile') ?? this.visibleMapTokens().find((t) => t.key !== this.activeObserverToken()?.key);
      const keys = aoeKeys.length > 0 ? aoeKeys : fallback ? [fallback.key] : [];
      if (keys.length > 0) { this.multiTargetKeys.set(keys); this.queuedTargetSequence.set(keys); this.vtt.selectedTargetKey.set(keys[0]); }
      return { shouldExecuteNow: true, selectedCount: Math.max(1, keys.length), maxTargets: Math.max(1, keys.length) };
    }
    const picked = targetToken ?? preview.snappedToken;
    if (!picked) return { shouldExecuteNow: false, selectedCount: this.queuedTargetSequence().length, maxTargets: preview.maxTargets };
    const nextSeq = [...this.queuedTargetSequence(), picked.key];
    this.queuedTargetSequence.set(nextSeq); this.multiTargetKeys.set(Array.from(new Set(nextSeq)));
    this.hasActiveTargetTether.set(true); this.vtt.selectedTargetKey.set(picked.key);
    return { shouldExecuteNow: nextSeq.length >= preview.maxTargets, selectedCount: nextSeq.length, maxTargets: preview.maxTargets };
  }

  handleTokenClick(token: VttTokenVm, shiftKey: boolean, ctrlKey = false): void {
    const obs = this.activeObserverToken();
    if (obs && !this.isTokenInPlayerLoS(token) && this.store.viewerRole() === 'players') return;
    if (shiftKey || ctrlKey || this.targetSelectionMode()) {
      if (obs && token.key === obs.key) return;
      const next = (shiftKey || ctrlKey) ? (this.multiTargetKeys().includes(token.key) ? this.multiTargetKeys().filter((k) => k !== token.key) : [...this.multiTargetKeys(), token.key]) : [token.key];
      this.multiTargetKeys.set(next); this.queuedTargetSequence.set(next); this.hasActiveTargetTether.set(next.length > 0);
      if (next.length > 0) this.vtt.selectedTargetKey.set(next[next.length - 1]);
      return;
    }
    if (!this.pendingAbility()) {
      if (this.store.viewerRole() === 'gm' || (token.faction === 'party' && this.canControlToken(token))) {
        this.vtt.selectedAttackerKey.set(token.key);
        if (this.multiTargetKeys().includes(token.key)) { const rem = this.multiTargetKeys().filter((k) => k !== token.key); this.multiTargetKeys.set(rem); this.queuedTargetSequence.set(rem); this.hasActiveTargetTether.set(rem.length > 0); }
        return;
      }
      this.multiTargetKeys.set([token.key]); this.queuedTargetSequence.set([token.key]);
      this.hasActiveTargetTether.set(true); this.vtt.selectedTargetKey.set(token.key);
    }
  }

  confirmPendingAbilityCast(): { ability: VttTacticalAbilityVm; targets: readonly VttTokenVm[] } | null {
    const preview = this.activeRangeAndAoePreview();
    const ability = this.pendingAbility();
    const obs = this.activeObserverToken();
    if (!preview || !ability || !obs) return null;
    const allTokens = this.vtt.tokens();
    let finalTargets: VttTokenVm[] = [];
    if (preview.isSingleOrMulti) {
      const seq = this.queuedTargetSequence().length > 0 ? this.queuedTargetSequence() : this.multiTargetKeys();
      if (seq.length > 0) finalTargets = seq.map((key) => allTokens.find((t) => t.key === key)).filter((t): t is VttTokenVm => !!t);
      else if (preview.snappedToken) finalTargets = [preview.snappedToken];
    } else {
      finalTargets = [...preview.highlightedTokens];
    }
    if (finalTargets.length > 0) {
      this.multiTargetKeys.set(Array.from(new Set(finalTargets.map((t) => t.key))));
      this.vtt.selectedTargetKey.set(finalTargets[0].key);
    }
    return { ability, targets: finalTargets };
  }

  clearTargetSelectionAfterCast(): void {
    this.pendingAbility.set(null); this.multiTargetKeys.set([]); this.queuedTargetSequence.set([]);
    this.hasActiveTargetTether.set(false); this.targetSelectionMode.set(false);
  }

  cancelAllInteractiveModes(): void {
    this.clearTargetSelectionAfterCast();
    this.measureEnabled.set(false); this.fogBrushMode.set('none'); this.tokenContextMenu.set(null);
    this.draggingTokenKey.set(null); this.dragStartWorldPos.set(null);
  }

  sendChatMessage(text: string, gmWhisperOnly = false): void {
    const clean = text.trim();
    if (!clean) return;
    const isGm = this.store.viewerRole() === 'gm';
    this.chatMessages.update((list) => [...list, { id: `chat-${Date.now()}`, senderName: isGm ? 'Elias Thorne (DM)' : this.activeObserverToken().name, senderRole: isGm ? 'gm' : 'player', timestamp: new Date().toTimeString().slice(0, 8), text: clean, revealedToPlayers: isGm ? !gmWhisperOnly : true }]);
  }

  toggleChatRevealed(id: string): void { this.chatMessages.update((list) => list.map((m) => (m.id === id ? { ...m, revealedToPlayers: !m.revealedToPlayers } : m))); }
  toggleQuestRevealed(id: string): void { this.scopedQuests.update((list) => list.map((q) => (q.id === id ? { ...q, revealedToPlayers: !q.revealedToPlayers } : q))); }
  toggleNpcRevealed(id: string): void { this.scopedNpcs.update((list) => list.map((n) => (n.id === id ? { ...n, revealedToPlayers: !n.revealedToPlayers } : n))); }
  toggleLoreRevealed(id: string): void { this.revealedLore.update((list) => list.map((l) => (l.id === id ? { ...l, revealedToPlayers: !l.revealedToPlayers } : l))); }

  quickAddNpcToEncounter(name: string, title: string, scope: 'Encounter' | 'Region', disposition: 'Friendly' | 'Neutral' | 'Deceptive' | 'Hostile', placeOnMap: boolean): void {
    const cleanName = name.trim() || 'Vistagh Scout';
    const id = `npc-${Date.now().toString().slice(-4)}`;
    this.scopedNpcs.update((prev) => [{ id, name: cleanName, title: title.trim() || 'Session NPC', scope, disposition, locationName: this.vtt.activeLiveEncounter()?.sceneName ?? '', summary: `${disposition} ${scope.toLowerCase()} NPC added live during session.`, gmSecret: 'Added via Arcane Screen Quick-Add tool.', revealedToPlayers: true, onBattleMap: placeOnMap }, ...prev]);
    if (placeOnMap) {
      this.vtt.tokens.update((tokens) => [...tokens, { key: `1:NPC:${id}`, name: cleanName, roleLabel: `${scope} NPC · ${disposition}`, faction: disposition === 'Hostile' ? 'hostile' : 'ally', initiative: 14, currentHp: 36, maxHp: 36, armorClass: 15, x: 0, z: 2, colorHex: disposition === 'Hostile' ? '#ef4444' : '#38bdf8', actionUsed: false, bonusUsed: false, reactionUsed: false, movementFeet: 30, sightFeet: 60, darkvisionFeet: 0 }]);
    }
  }
}
