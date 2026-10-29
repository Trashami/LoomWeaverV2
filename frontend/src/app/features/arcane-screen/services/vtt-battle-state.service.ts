import { Injectable, computed, inject, signal } from '@angular/core';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { VttTokenVm } from '../../effects/engine/effect-timeline.contract';
import {
  clampLineToRangeAndWalls,
  computeClampedGridMovePath,
  computeVisibilityPolygonSvgPoints,
  distanceInFeet,
  findClosestSnapToken,
  findTokensInAoe,
  hasLineOfSight,
  snapToFiveFootGrid,
  worldToSvgX,
  worldToSvgY,
} from '../engine/vtt-los-and-grid.engine';
import {
  VttActionBarSettingsVm,
  VttChatMessageVm,
  VttFogMode,
  VttMeasureSubMode,
  VttOpenDmDrawer,
  VttPoint2D,
  VttRevealedLoreVm,
  VttRightTabId,
  VttScopedNpcVm,
  VttScopedQuestVm,
  VttTacticalAbilityVm,
  VttTurnActionCategory,
  VttWallSegmentVm,
} from '../models/vtt-battle.models';
import {
  SEED_TACTICAL_TURN_ABILITIES,
  SEED_VTT_CHAT_MESSAGES,
  SEED_VTT_REVEALED_LORE,
  SEED_VTT_SCOPED_NPCS,
  SEED_VTT_SCOPED_QUESTS,
  SEED_VTT_WALL_SEGMENTS,
} from './vtt-battle.seed';
import { VttCombatService } from './vtt-combat.service';

@Injectable({ providedIn: 'root' })
export class VttBattleStateService {
  private readonly store = inject(LoomWeaverStoreService);
  private readonly vtt = inject(VttCombatService);

  // Right Collapsible Panel State
  readonly rightPanelCollapsed = signal<boolean>(false);
  readonly activeRightTab = signal<VttRightTabId>('initiative');

  // Floating Battle Map Drawers & Action Bar Settings Modal
  readonly openDmDrawer = signal<VttOpenDmDrawer>('none');
  readonly settingsModalOpen = signal<boolean>(false);
  readonly mapMode3D = signal<boolean>(false);

  readonly actionBarSettings = signal<VttActionBarSettingsVm>({
    opacity: 95,
    compactMode: false,
    snapSensitivityFeet: 10,
    showHotbarKeybinds: true,
    showMapRangeLabels: true,
    autoCenterActiveTurn: true,
  });

  // Per-Encounter GM Fog of War & Vision Settings
  readonly fogMode = signal<VttFogMode>('explored-los');
  readonly hideOutOfSightMonsters = signal<boolean>(true);
  readonly playerSightDistanceFeet = signal<number>(60);
  readonly gmPreviewPlayerVision = signal<boolean>(false);

  // Wall segments for current battlemap
  readonly walls = signal<readonly VttWallSegmentVm[]>(SEED_VTT_WALL_SEGMENTS);

  // Explored trail points for 'explored-los' ("Fog of war based on where they have traveled")
  readonly exploredTrailPoints = signal<readonly { x: number; z: number; radiusFeet: number }[]>([
    { x: -7, z: -3, radiusFeet: 45 },
    { x: -4, z: -5, radiusFeet: 45 },
    { x: -5, z: 1, radiusFeet: 45 },
    { x: 0, z: 0, radiusFeet: 45 },
  ]);

  // Cursor position on the battlemap in world coordinates
  readonly cursorWorldPos = signal<VttPoint2D>({ x: 4, z: 1 });

  // Direct Token Drag-and-Drop Movement State
  readonly draggingTokenKey = signal<string | null>(null);
  readonly dragStartWorldPos = signal<VttPoint2D | null>(null);

  // Measure Tool State (Spell Measure vs Stealth Movement Measure)
  readonly measureEnabled = signal<boolean>(false);
  readonly measureSubMode = signal<VttMeasureSubMode>('spell');
  readonly measuredAbilityId = signal<string>('act-kildrid-seal');
  readonly usedMovementFeetByToken = signal<Record<string, number>>({});

  // Bottom Character Action Bar & Live Targeting / Multi-Target State
  readonly activeTurnCategory = signal<VttTurnActionCategory>('all');
  readonly tacticalAbilities = signal<readonly VttTacticalAbilityVm[]>(SEED_TACTICAL_TURN_ABILITIES);
  readonly pendingAbility = signal<VttTacticalAbilityVm | null>(null);
  readonly targetSelectionMode = signal<boolean>(false);
  readonly multiTargetKeys = signal<readonly string[]>(['1:Encounter:vamp-1']);
  // Ordered target sequence for multi-target attacks (1..3 targets, allows same target multiple times)
  readonly queuedTargetSequence = signal<readonly string[]>([]);

  // Role-Scoped Right Panel Data
  readonly chatMessages = signal<readonly VttChatMessageVm[]>(SEED_VTT_CHAT_MESSAGES);
  readonly scopedQuests = signal<readonly VttScopedQuestVm[]>(SEED_VTT_SCOPED_QUESTS);
  readonly scopedNpcs = signal<readonly VttScopedNpcVm[]>(SEED_VTT_SCOPED_NPCS);
  readonly revealedLore = signal<readonly VttRevealedLoreVm[]>(SEED_VTT_REVEALED_LORE);

  // Token whose turn it currently is in the Initiative Order & Current Round
  readonly activeInitiativeToken = computed<VttTokenVm>(
    () => this.vtt.tokens()[this.vtt.activeTurnIndex()] ?? this.vtt.tokens()[0],
  );

  // Active observer token (the selected player token whose Line of Sight is evaluated)
  readonly activeObserverToken = computed<VttTokenVm>(() => {
    const selected = this.vtt.selectedAttacker();
    if (selected && selected.faction === 'party') {
      return selected;
    }
    return this.vtt.partyTokensInScene()[0] ?? this.vtt.tokens()[0];
  });

  readonly remainingMovementFeet = computed<number>(() => {
    const observer = this.activeObserverToken();
    if (!observer) return 30;
    const spent = this.usedMovementFeetByToken()[observer.key] ?? 0;
    return Math.max(0, observer.movementFeet - spent);
  });

  /**
   * Enforces token movement rules:
   * - DM ('gm') can move ANY token at ANY time.
   * - Players ('players') can ONLY move their own token when it is their turn
   *   in the initiative order and in the current round.
   */
  canMoveToken(token: VttTokenVm): { allowed: boolean; reason: string } {
    if (this.store.viewerRole() === 'gm') {
      return { allowed: true, reason: 'DM can move any token at any time.' };
    }
    if (token.faction !== 'party') {
      return { allowed: false, reason: 'Players can only move their own party token.' };
    }
    const currentTurnToken = this.activeInitiativeToken();
    if (!currentTurnToken || currentTurnToken.key !== token.key) {
      return {
        allowed: false,
        reason: `Locked: Players can only move on their turn in Initiative (Current turn: ${currentTurnToken?.name ?? 'Unknown'}, Round ${this.vtt.activeRound()}).`,
      };
    }
    const spent = this.usedMovementFeetByToken()[token.key] ?? 0;
    if (spent >= token.movementFeet) {
      return {
        allowed: false,
        reason: `${token.name} has used all ${token.movementFeet}ft of movement for Round ${this.vtt.activeRound()}.`,
      };
    }
    return { allowed: true, reason: 'Active turn movement permitted.' };
  }

  isSingleOrMultiTargetAbility(ability: VttTacticalAbilityVm): boolean {
    return (
      ability.aoeRadiusFeet <= 5 ||
      ability.aoeShape === 'none' ||
      ability.targetMode === 'single' ||
      ability.targetMode === 'multi-target'
    );
  }

  readonly observerSightPolygonSvg = computed<string>(() => {
    const obs = this.activeObserverToken();
    if (!obs) return '';
    return computeVisibilityPolygonSvgPoints(
      { x: obs.x, z: obs.z },
      this.playerSightDistanceFeet(),
      this.walls(),
      96,
    );
  });

  readonly exploredCirclesSvg = computed(() =>
    this.exploredTrailPoints().map((pt, idx) => ({
      id: `exp-${idx}`,
      cx: worldToSvgX(pt.x),
      cy: worldToSvgY(pt.z),
      r: Math.round((pt.radiusFeet / 2.5 / 24) * 1200),
    })),
  );

  isTokenInPlayerLoS(token: VttTokenVm): boolean {
    const obs = this.activeObserverToken();
    if (!obs || token.key === obs.key) return true;
    return hasLineOfSight(
      { x: obs.x, z: obs.z },
      { x: token.x, z: token.z },
      this.playerSightDistanceFeet(),
      this.walls(),
    );
  }

  readonly visibleMapTokens = computed<readonly VttTokenVm[]>(() => {
    const all = this.vtt.tokens();
    const isPlayerView =
      this.store.viewerRole() === 'players' || this.gmPreviewPlayerVision();
    if (!isPlayerView || !this.hideOutOfSightMonsters()) {
      return all;
    }
    return all.filter((t) => {
      if (t.faction === 'party') return true;
      return this.isTokenInPlayerLoS(t);
    });
  });

  readonly filteredTurnAbilities = computed<readonly VttTacticalAbilityVm[]>(() => {
    const cat = this.activeTurnCategory();
    const list = this.tacticalAbilities();
    if (cat === 'all') return list;
    return list.filter((a) => a.turnCategory === cat);
  });

  isAbilityAvailableOnTurn(ability: VttTacticalAbilityVm): boolean {
    const actor = this.activeObserverToken();
    if (!actor) return true;
    if (ability.actionCost === '1 Action') return !actor.actionUsed;
    if (ability.actionCost === '1 Bonus Action') return !actor.bonusUsed;
    if (ability.actionCost === '1 Reaction') return !actor.reactionUsed;
    return true;
  }

  readonly measuredAbility = computed<VttTacticalAbilityVm>(
    () =>
      this.tacticalAbilities().find((a) => a.id === this.measuredAbilityId()) ??
      this.tacticalAbilities()[5] ??
      this.tacticalAbilities()[0],
  );

  // Live Spell Measure OR Attack/Spell Targeting Preview
  readonly activeRangeAndAoePreview = computed(() => {
    const obs = this.activeObserverToken();
    if (!obs) return null;

    const ability = this.pendingAbility()
      ? this.pendingAbility()
      : this.measureEnabled() && this.measureSubMode() === 'spell'
        ? this.measuredAbility()
        : null;

    if (!ability) return null;

    const candidates = this.visibleMapTokens().filter((t) => t.key !== obs.key);
    const isSingleOrMulti = this.isSingleOrMultiTargetAbility(ability);
    const maxTargets = Math.max(1, ability.maxTargets || 1);

    if (isSingleOrMulti) {
      const snappedToken = findClosestSnapToken(
        { x: obs.x, z: obs.z },
        this.cursorWorldPos(),
        ability.rangeFeet,
        this.actionBarSettings().snapSensitivityFeet,
        candidates,
        this.walls(),
      );

      const desiredEnd: VttPoint2D = snappedToken
        ? { x: snappedToken.x, z: snappedToken.z }
        : this.cursorWorldPos();

      const clamped = clampLineToRangeAndWalls(
        { x: obs.x, z: obs.z },
        desiredEnd,
        ability.rangeFeet,
        this.walls(),
        false,
      );

      const highlightedTokens =
        snappedToken && !clamped.blockedByWall ? [snappedToken] : [];

      return {
        ability,
        clamped,
        isSingleOrMulti: true,
        maxTargets,
        snappedToken: !clamped.blockedByWall ? snappedToken : null,
        aoeRadiusFeet: 5,
        highlightedTokens,
        highlightedKeys: new Set(highlightedTokens.map((t) => t.key)),
      };
    }

    // True AoE (> 5ft radius circle/cone)
    const clamped = clampLineToRangeAndWalls(
      { x: obs.x, z: obs.z },
      this.cursorWorldPos(),
      ability.rangeFeet,
      this.walls(),
      false,
    );

    const aoeRadius = Math.max(10, ability.aoeRadiusFeet);
    const highlightedTokens = findTokensInAoe(clamped.end, aoeRadius, candidates);

    return {
      ability,
      clamped,
      isSingleOrMulti: false,
      maxTargets: 0,
      snappedToken: null,
      aoeRadiusFeet: aoeRadius,
      highlightedTokens,
      highlightedKeys: new Set(highlightedTokens.map((t) => t.key)),
    };
  });

  // Determines whether a token should show the spinning red target reticle & red highlight
  isTokenTargetedWithReticle(tokenKey: string): boolean {
    if (this.activeRangeAndAoePreview()?.highlightedKeys?.has(tokenKey)) {
      return true;
    }
    if (this.queuedTargetSequence().includes(tokenKey)) {
      return true;
    }
    return this.multiTargetKeys().includes(tokenKey);
  }

  getTargetStackCount(tokenKey: string): number {
    const seq = this.queuedTargetSequence();
    if (seq.length > 0) {
      return seq.filter((k) => k === tokenKey).length;
    }
    return this.multiTargetKeys().filter((k) => k === tokenKey).length;
  }

  readonly allReticleTargetKeys = computed<readonly string[]>(() => {
    const set = new Set<string>(this.multiTargetKeys());
    this.queuedTargetSequence().forEach((k) => set.add(k));
    this.activeRangeAndAoePreview()?.highlightedTokens.forEach((t) => set.add(t.key));
    return Array.from(set);
  });

  // Live Stealth Grid Movement Measure Preview (or Active Token Drag Preview)
  readonly activeMovementPreview = computed(() => {
    const dragKey = this.draggingTokenKey();
    const dragStart = this.dragStartWorldPos();
    if (dragKey && dragStart) {
      const token = this.vtt.tokens().find((t) => t.key === dragKey);
      if (!token) return null;
      const isGm = this.store.viewerRole() === 'gm';
      const maxFeet = isGm ? 120 : Math.max(0, token.movementFeet - (this.usedMovementFeetByToken()[token.key] ?? 0));
      return computeClampedGridMovePath(
        dragStart,
        this.cursorWorldPos(),
        maxFeet,
        isGm ? [] : this.walls(),
      );
    }

    if (!this.measureEnabled() || this.measureSubMode() !== 'movement') {
      return null;
    }
    const obs = this.activeObserverToken();
    if (!obs) return null;
    return computeClampedGridMovePath(
      { x: obs.x, z: obs.z },
      this.cursorWorldPos(),
      this.store.viewerRole() === 'gm' ? 120 : this.remainingMovementFeet(),
      this.store.viewerRole() === 'gm' ? [] : this.walls(),
    );
  });

  // Role-Scoped Right Panel Computed Lists
  readonly visibleChatMessages = computed(() =>
    this.store.viewerRole() === 'gm'
      ? this.chatMessages()
      : this.chatMessages().filter((m) => m.revealedToPlayers),
  );

  readonly visibleQuests = computed(() =>
    this.store.viewerRole() === 'gm'
      ? this.scopedQuests()
      : this.scopedQuests().filter((q) => q.revealedToPlayers),
  );

  readonly visibleNpcs = computed(() =>
    this.store.viewerRole() === 'gm'
      ? this.scopedNpcs()
      : this.scopedNpcs().filter((n) => n.revealedToPlayers),
  );

  readonly visibleLore = computed(() =>
    this.store.viewerRole() === 'gm'
      ? this.revealedLore()
      : this.revealedLore().filter((l) => l.revealedToPlayers),
  );

  toggleDmDrawer(drawer: VttOpenDmDrawer): void {
    this.openDmDrawer.update((curr) => (curr === drawer ? 'none' : drawer));
  }

  updateActionBarSettings(patch: Partial<VttActionBarSettingsVm>): void {
    this.actionBarSettings.update((curr) => ({ ...curr, ...patch }));
  }

  toggleMeasureTool(subMode?: VttMeasureSubMode): void {
    if (subMode) {
      if (this.measureEnabled() && this.measureSubMode() === subMode) {
        this.measureEnabled.set(false);
      } else {
        this.pendingAbility.set(null);
        this.queuedTargetSequence.set([]);
        this.measureSubMode.set(subMode);
        this.measureEnabled.set(true);
      }
      return;
    }
    this.measureEnabled.update((v) => !v);
    if (this.measureEnabled()) {
      this.pendingAbility.set(null);
      this.queuedTargetSequence.set([]);
    }
  }

  beginTokenDrag(token: VttTokenVm): { allowed: boolean; reason: string } {
    const check = this.canMoveToken(token);
    if (!check.allowed) {
      return check;
    }
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
      this.vtt.tokens.update((list) =>
        list.map((t) => (t.key === dragKey ? { ...t, x: snapped.x, z: snapped.z } : t)),
      );
      return;
    }

    const preview = this.activeMovementPreview();
    if (!preview) return;
    this.vtt.tokens.update((list) =>
      list.map((t) =>
        t.key === dragKey ? { ...t, x: preview.destination.x, z: preview.destination.z } : t,
      ),
    );
  }

  endTokenDrag(): { movedToken: VttTokenVm | null; distanceFeet: number } {
    const dragKey = this.draggingTokenKey();
    const dragStart = this.dragStartWorldPos();
    if (!dragKey || !dragStart) {
      this.draggingTokenKey.set(null);
      this.dragStartWorldPos.set(null);
      return { movedToken: null, distanceFeet: 0 };
    }

    const token = this.vtt.tokens().find((t) => t.key === dragKey) ?? null;
    const dist = token
      ? Math.round(distanceInFeet(dragStart, { x: token.x, z: token.z }) / 5) * 5
      : 0;

    if (token && dist > 0) {
      if (this.store.viewerRole() === 'players') {
        this.usedMovementFeetByToken.update((prev) => ({
          ...prev,
          [token.key]: (prev[token.key] ?? 0) + dist,
        }));
      }
      if (token.faction === 'party') {
        this.exploredTrailPoints.update((pts) => [
          ...pts,
          { x: token.x, z: token.z, radiusFeet: Math.min(45, this.playerSightDistanceFeet()) },
        ]);
      }
    }

    this.draggingTokenKey.set(null);
    this.dragStartWorldPos.set(null);
    return { movedToken: token, distanceFeet: dist };
  }

  commitStealthGridMove(): { allowed: boolean; reason: string; distanceFeet: number } {
    const obs = this.activeObserverToken();
    const preview = this.activeMovementPreview();
    if (!obs || !preview || preview.distanceFeet <= 0) {
      return { allowed: false, reason: 'Move cursor to a valid grid tile first.', distanceFeet: 0 };
    }
    const perm = this.canMoveToken(obs);
    if (!perm.allowed) {
      return { allowed: false, reason: perm.reason, distanceFeet: 0 };
    }

    const dest = preview.destination;
    this.vtt.tokens.update((list) =>
      list.map((t) => (t.key === obs.key ? { ...t, x: dest.x, z: dest.z } : t)),
    );
    if (this.store.viewerRole() === 'players') {
      this.usedMovementFeetByToken.update((prev) => ({
        ...prev,
        [obs.key]: (prev[obs.key] ?? 0) + preview.distanceFeet,
      }));
    }
    this.exploredTrailPoints.update((pts) => [
      ...pts,
      { x: dest.x, z: dest.z, radiusFeet: Math.min(45, this.playerSightDistanceFeet()) },
    ]);
    return { allowed: true, reason: 'Moved', distanceFeet: preview.distanceFeet };
  }

  resetTurnMovement(tokenKey: string): void {
    this.usedMovementFeetByToken.update((prev) => ({ ...prev, [tokenKey]: 0 }));
  }

  beginAbilityTargeting(ability: VttTacticalAbilityVm): void {
    if (!this.isAbilityAvailableOnTurn(ability)) return;
    this.measureEnabled.set(false);
    this.queuedTargetSequence.set([]);
    this.pendingAbility.set(ability);
  }

  /**
   * Handles clicking a token or snapped target while an ability is pending.
   * - If `maxTargets > 1` (2 or 3 targets, e.g. Magic Missile / Twin-Blade), adds the target
   *   (allowing the SAME target to be selected 2 or 3 times!) and keeps the overlay active
   *   until all target slots are filled.
   */
  recordPendingAbilityTargetClick(targetToken?: VttTokenVm): {
    shouldExecuteNow: boolean;
    selectedCount: number;
    maxTargets: number;
  } {
    const ability = this.pendingAbility();
    const preview = this.activeRangeAndAoePreview();
    if (!ability || !preview) {
      return { shouldExecuteNow: false, selectedCount: 0, maxTargets: 1 };
    }

    if (!preview.isSingleOrMulti) {
      // True AoE spell: auto-selects all visible tokens inside the green AoE circle and casts immediately
      const aoeKeys = preview.highlightedTokens.map((t) => t.key);
      if (aoeKeys.length > 0) {
        this.multiTargetKeys.set(aoeKeys);
        this.queuedTargetSequence.set(aoeKeys);
        this.vtt.selectedTargetKey.set(aoeKeys[0]);
      }
      return {
        shouldExecuteNow: true,
        selectedCount: aoeKeys.length,
        maxTargets: aoeKeys.length,
      };
    }

    const picked = targetToken ?? preview.snappedToken;
    if (!picked) {
      return {
        shouldExecuteNow: false,
        selectedCount: this.queuedTargetSequence().length,
        maxTargets: preview.maxTargets,
      };
    }

    const nextSeq = [...this.queuedTargetSequence(), picked.key];
    this.queuedTargetSequence.set(nextSeq);
    this.multiTargetKeys.set(Array.from(new Set(nextSeq)));
    this.vtt.selectedTargetKey.set(picked.key);

    const shouldExecuteNow = nextSeq.length >= preview.maxTargets;
    return {
      shouldExecuteNow,
      selectedCount: nextSeq.length,
      maxTargets: preview.maxTargets,
    };
  }

  handleTokenClick(token: VttTokenVm, shiftKey: boolean): void {
    const obs = this.activeObserverToken();
    if (
      token.faction === 'party' &&
      !shiftKey &&
      !this.targetSelectionMode() &&
      !this.pendingAbility()
    ) {
      this.vtt.selectedAttackerKey.set(token.key);
      return;
    }

    if (obs && !this.isTokenInPlayerLoS(token) && this.store.viewerRole() === 'players') {
      return;
    }

    if (shiftKey || this.targetSelectionMode()) {
      this.multiTargetKeys.update((keys) => [...keys, token.key]);
      this.queuedTargetSequence.update((seq) => [...seq, token.key]);
      this.vtt.selectedTargetKey.set(token.key);
    } else if (!this.pendingAbility()) {
      this.multiTargetKeys.set([token.key]);
      this.queuedTargetSequence.set([token.key]);
      this.vtt.selectedTargetKey.set(token.key);
    }
  }

  confirmPendingAbilityCast(): {
    ability: VttTacticalAbilityVm;
    targets: readonly VttTokenVm[];
  } | null {
    const preview = this.activeRangeAndAoePreview();
    const ability = this.pendingAbility();
    const obs = this.activeObserverToken();
    if (!preview || !ability || !obs) return null;

    const allTokens = this.vtt.tokens();
    let finalTargets: VttTokenVm[] = [];

    if (preview.isSingleOrMulti) {
      const seq = this.queuedTargetSequence();
      if (seq.length > 0) {
        finalTargets = seq
          .map((key) => allTokens.find((t) => t.key === key))
          .filter((t): t is VttTokenVm => !!t);
      } else if (preview.snappedToken) {
        finalTargets = [preview.snappedToken];
      }
    } else {
      // Auto-select all visible tokens inside the AoE circle
      finalTargets = [...preview.highlightedTokens];
    }

    if (finalTargets.length > 0) {
      const uniqueKeys = Array.from(new Set(finalTargets.map((t) => t.key)));
      this.multiTargetKeys.set(uniqueKeys);
      this.vtt.selectedTargetKey.set(finalTargets[0].key);
    }

    this.pendingAbility.set(null);
    this.queuedTargetSequence.set([]);
    return { ability, targets: finalTargets };
  }

  cancelAllInteractiveModes(): void {
    this.pendingAbility.set(null);
    this.queuedTargetSequence.set([]);
    this.targetSelectionMode.set(false);
    this.measureEnabled.set(false);
    this.draggingTokenKey.set(null);
    this.dragStartWorldPos.set(null);
  }

  sendChatMessage(text: string, gmWhisperOnly = false): void {
    const clean = text.trim();
    if (!clean) return;
    const isGm = this.store.viewerRole() === 'gm';
    const msg: VttChatMessageVm = {
      id: `chat-${Date.now()}`,
      senderName: isGm ? 'Elias Thorne (DM)' : this.activeObserverToken().name,
      senderRole: isGm ? 'gm' : 'player',
      timestamp: new Date().toTimeString().slice(0, 8),
      text: clean,
      revealedToPlayers: isGm ? !gmWhisperOnly : true,
    };
    this.chatMessages.update((list) => [...list, msg]);
  }

  toggleChatRevealed(id: string): void {
    this.chatMessages.update((list) =>
      list.map((m) => (m.id === id ? { ...m, revealedToPlayers: !m.revealedToPlayers } : m)),
    );
  }

  toggleQuestRevealed(id: string): void {
    this.scopedQuests.update((list) =>
      list.map((q) => (q.id === id ? { ...q, revealedToPlayers: !q.revealedToPlayers } : q)),
    );
  }

  toggleNpcRevealed(id: string): void {
    this.scopedNpcs.update((list) =>
      list.map((n) => (n.id === id ? { ...n, revealedToPlayers: !n.revealedToPlayers } : n)),
    );
  }

  toggleLoreRevealed(id: string): void {
    this.revealedLore.update((list) =>
      list.map((l) => (l.id === id ? { ...l, revealedToPlayers: !l.revealedToPlayers } : l)),
    );
  }

  quickAddNpcToEncounter(
    name: string,
    title: string,
    scope: 'Encounter' | 'Region',
    disposition: 'Friendly' | 'Neutral' | 'Deceptive' | 'Hostile',
    placeOnMap: boolean,
  ): void {
    const cleanName = name.trim() || 'Vistagh Scout';
    const id = `npc-${Date.now().toString().slice(-4)}`;
    const npc: VttScopedNpcVm = {
      id,
      name: cleanName,
      title: title.trim() || 'Session NPC',
      scope,
      disposition,
      locationName: this.vtt.activeLiveEncounter()?.sceneName ?? '',
      summary: `${disposition} ${scope.toLowerCase()} NPC added live during session.`,
      gmSecret: 'Added via Arcane Screen Quick-Add tool.',
      revealedToPlayers: true,
      onBattleMap: placeOnMap,
    };
    this.scopedNpcs.update((prev) => [npc, ...prev]);

    if (placeOnMap) {
      this.vtt.tokens.update((tokens) => [
        ...tokens,
        {
          key: `1:NPC:${id}`,
          name: cleanName,
          roleLabel: `${scope} NPC · ${disposition}`,
          faction: disposition === 'Hostile' ? 'hostile' : 'party',
          initiative: 14,
          currentHp: 36,
          maxHp: 36,
          armorClass: 15,
          x: 0,
          z: 2,
          colorHex: disposition === 'Hostile' ? '#ef5d72' : '#49e892',
          actionUsed: false,
          bonusUsed: false,
          reactionUsed: false,
          movementFeet: 30,
        },
      ]);
    }
  }
}
