import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener,
  OnDestroy, ViewChild, computed, inject, signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdventureGuideService } from '../../core/services/adventure-guide.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { VttReturnRouteService } from '../../core/services/vtt-return-route.service';
import { LwContextSwitcherOption } from '../../shared/ui/public-api';
import { WebAudioAmbienceService } from '../assets/engine/web-audio-ambience.service';
import { FullscreenDiceOverlayService } from '../dice/engine/fullscreen-dice-overlay.service';
import { BabylonEffectStageService } from '../effects/engine/babylon-effect-stage.service';
import { getDndSizeScale, getTokenBaseColorHex, getTokenRimColorHex, VttTokenVm } from '../effects/engine/effect-timeline.contract';
import { feetToSvgPx, worldToSvgX, worldToSvgY } from './engine/vtt-los-and-grid.engine';
import { VttRightTabId, VttTacticalAbilityVm } from './models/vtt-battle.models';
import { toDockAction, toDockToken } from './components/vtt-action-dock/vtt-action-dock.adapter';
import type { DockAction, DockToken } from './components/vtt-action-dock/vtt-action-dock.models';
import { VttBattleStateService } from './services/vtt-battle-state.service';
import { VttCombatService } from './services/vtt-combat.service';
import { VttCombatWorkflowService } from './services/vtt-combat-workflow.service';
import { VttDisplaySettingsService } from './services/vtt-display-settings.service';
import { VttEncounterTimerService } from './services/vtt-encounter-timer.service';
import { VttFogService } from './services/vtt-fog.service';
import { VttHandoutService } from './services/vtt-handout.service';
import { VttMapView2dService } from './services/vtt-map-view-2d.service';
import { VttServerSyncService } from './services/vtt-server-sync.service';
import {
  ARCANE_SCREEN_PAGE_IMPORTS, buildVttSessionSwitcherOptions, CalibStartPoint,
  computeCalibDragBox, computeSvgGridLines, executeBattlefieldDiceRoll, finishGridCalibration,
  handleVttWindowKeydown, openDockTokenContextMenu, paintFogBrushAtScreenPoint,
  registerArcaneScreenStageEffects, runPendingAbilityCastAndFx, triggerQuickDcCheckRoll,
  update2dMapPointerPosition, VTT_RIGHT_TAB_TITLES,
} from './arcane-screen.helpers';

@Component({
  selector: 'lw-arcane-screen-page',
  standalone: true,
  imports: [...ARCANE_SCREEN_PAGE_IMPORTS],
  templateUrl: './arcane-screen.page.html',
  styleUrl: './arcane-screen.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArcaneScreenPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('vttCanvas') private vttCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('battleSvg') private battleSvgRef?: ElementRef<SVGSVGElement>;

  readonly store = inject(LoomWeaverStoreService);
  readonly vtt = inject(VttCombatService);
  readonly adventureGuide = inject(AdventureGuideService);
  private readonly route = inject(ActivatedRoute);
  readonly battle = inject(VttBattleStateService);
  readonly workflow = inject(VttCombatWorkflowService);
  readonly fog = inject(VttFogService);
  readonly stage = inject(BabylonEffectStageService);
  readonly audio = inject(WebAudioAmbienceService);
  readonly fullscreenDice = inject(FullscreenDiceOverlayService);
  private readonly router = inject(Router);
  readonly view2d = inject(VttMapView2dService);
  readonly serverSync = inject(VttServerSyncService);
  readonly vttReturn = inject(VttReturnRouteService);
  readonly vttDisplay = inject(VttDisplaySettingsService);
  readonly timer = inject(VttEncounterTimerService);
  readonly handouts = inject(VttHandoutService);
  readonly showShortcuts = signal<boolean>(false);

  private stageMounted = false;
  private dragMoved = false;
  private fogBrushPainting = false;
  private calibStartClient: CalibStartPoint | null = null;
  private mapDownClient: { x: number; y: number } | null = null;

  readonly gridEnabled = signal<boolean>(false);
  readonly gmRailOpen = signal<boolean>(false);
  readonly selectedDiceFormula = signal<string>('1d20');
  readonly dmToolReadout = signal<string>('');
  readonly quickAddMonsterId = signal<string>('creat-goblin-scout-a');
  readonly quickAddNpcName = signal<string>('');
  readonly quickAddNpcTitle = signal<string>('');
  readonly quickAddNpcScope = signal<'Encounter' | 'Region'>('Encounter');
  readonly quickAddNpcDisposition = signal<'Friendly' | 'Neutral' | 'Deceptive' | 'Hostile'>('Friendly');
  readonly chatDraft = signal<string>('');
  readonly chatWhisperGmOnly = signal<boolean>(false);
  readonly calibBox = signal<{ x: number; y: number; w: number; h: number } | null>(null);

  readonly activeBattlemapBackdropUrl = computed(() => {
    const art = this.adventureGuide.guide().assignedBattlemap?.artworkUrl?.trim();
    if (art && !art.includes('showcase')) return this.vttDisplay.backdropUrl(art);
    const encArt = this.vtt.activeLiveEncounter()?.thumbnailUrl?.trim();
    return encArt && !encArt.includes('showcase') ? this.vttDisplay.backdropUrl(encArt) : '';
  });

  readonly hasConfiguredMap = computed(
    () => !!(this.activeBattlemapBackdropUrl() || this.adventureGuide.guide().assignedBattlemap?.sceneKey?.trim()),
  );

  readonly isHighPerformance2d = computed(() => false);

  readonly activeSessionTitle = computed(() => {
    const sess = this.store.sessions().find((s) => s.sessionId === this.store.activeSessionId());
    return sess ? `Session ${sess.sessionNumber} · ${sess.title}` : this.adventureGuide.guide().headerTitle || 'Current Session';
  });

  readonly sessionSwitcherOptions = computed<LwContextSwitcherOption[]>(() =>
    buildVttSessionSwitcherOptions(this.store),
  );

  onSwitchVttSession(sessionId: string): void {
    this.store.setActiveSession(sessionId);
  }

  readonly activeBattlemapTitle = computed(
    () => this.adventureGuide.guide().assignedBattlemap?.title || this.vtt.activeLiveEncounter()?.name || 'Battlefield',
  );
  readonly zoomLevel = computed(() => (!this.isHighPerformance2d() ? this.stage.zoomPercent() : this.view2d.zoom()));
  readonly toSvgX = worldToSvgX;
  readonly toSvgY = worldToSvgY;
  readonly toSvgPx = feetToSvgPx;

  readonly gridVerticalLines = computed(() =>
    computeSvgGridLines(1200, this.vttDisplay.gridScale(), this.vttDisplay.gridOffsetX()),
  );
  readonly gridHorizontalLines = computed(() =>
    computeSvgGridLines(800, this.vttDisplay.gridScale(), this.vttDisplay.gridOffsetY()),
  );

  readonly isObserverActiveTurn = computed(
    () => this.battle.activeInitiativeToken()?.key === this.battle.activeObserverToken()?.key,
  );
  readonly dockHp = (token: DockToken): number => token.hp ?? 0;
  readonly dockAc = (token: DockToken): number => token.armorClass ?? 10;
  readonly dockActiveToken = computed<DockToken>(() => toDockToken(this.battle.activeObserverToken(), this.vtt.tokens()));
  readonly dockTokenActions = computed<readonly DockAction[]>(() => this.battle.tacticalAbilities().map(toDockAction));
  readonly dockInitiativeTokenId = computed<number>(() => toDockToken(this.battle.activeInitiativeToken(), this.vtt.tokens()).id);

  readonly dockMeleeAttacks = (dt: DockToken): readonly DockAction[] => this.resolveDockCategory(dt, 'melee');
  readonly dockRangedAttacks = (dt: DockToken): readonly DockAction[] => this.resolveDockCategory(dt, 'ranged');
  readonly dockSpells = (dt: DockToken): readonly DockAction[] => this.resolveDockCategory(dt, 'spell');
  readonly dockBonusActions = (dt: DockToken): readonly DockAction[] => this.resolveDockCategory(dt, 'bonus');
  readonly dockReactions = (dt: DockToken): readonly DockAction[] => this.resolveDockCategory(dt, 'reaction');

  private resolveDockCategory(dt: DockToken, category: 'melee' | 'ranged' | 'spell' | 'bonus' | 'reaction'): readonly DockAction[] {
    const ref = typeof dt?.sheetRef === 'string' ? dt.sheetRef : undefined;
    const tok = this.vtt.tokens().find((t) => t.key === ref || t.name === dt?.name) ?? this.battle.activeObserverToken();
    return tok ? this.battle.getDockActionsForToken(tok, category) : [];
  }

  constructor() {
    registerArcaneScreenStageEffects(this);
  }
  getSceneQueryParam(): string | null { return this.route.snapshot.queryParamMap.get('scene'); }
  getAssignedSceneKey(): string | undefined { return this.adventureGuide.guide().assignedBattlemap?.sceneKey; }
  disposeStageIfMounted(): void {
    if (this.stageMounted) {
      this.stageMounted = false;
      this.stage.dispose();
    }
  }

  openMapStudio(): void { void this.router.navigate(['/maps']); }
  openCharactersPage(): void { void this.router.navigate(['/characters']); }
  onMapWheel(event: WheelEvent): void { event.preventDefault(); if (!this.isHighPerformance2d()) this.stage.zoomCamera(event.deltaY * 0.05); else this.view2d.wheel(event.deltaY); }
  onMapMouseDown(event: MouseEvent): void {
    if (this.workflow.state() !== null) return;
    this.mapDownClient = { x: event.clientX, y: event.clientY };
    if (event.button === 0 && this.battle.fogBrushMode() !== 'none') {
      this.fogBrushPainting = true;
      paintFogBrushAtScreenPoint(event.clientX, event.clientY, this.isHighPerformance2d(), this.stage, this.battle, this.battleSvgRef?.nativeElement, () => this.sync3dStage());
      return;
    }
    if (this.isHighPerformance2d()) this.view2d.start(event);
  }
  private lastPickMs = 0;
  onMapMouseMove(event: MouseEvent): void {
    if (this.workflow.state() !== null) return;
    if (this.fogBrushPainting && this.battle.fogBrushMode() !== 'none') {
      paintFogBrushAtScreenPoint(event.clientX, event.clientY, this.isHighPerformance2d(), this.stage, this.battle, this.battleSvgRef?.nativeElement, () => this.sync3dStage());
      return;
    }
    if (!this.isHighPerformance2d() && (this.battle.pendingAbility() || this.battle.measureEnabled() || this.battle.targetSelectionMode())) {
      const now = performance.now();
      if (now - this.lastPickMs < 16) return;
      this.lastPickMs = now;
      const pt = this.stage.pickGroundPoint(event.clientX, event.clientY);
      const cur = this.battle.cursorWorldPos();
      if (pt && Math.hypot(pt.x - cur.x, pt.z - cur.z) > 0.04) this.battle.cursorWorldPos.set(pt);
    }
    if (this.isHighPerformance2d()) this.view2d.move(event);
  }
  onMapMouseUp(_event?: MouseEvent): void {
    this.mapDownClient = null;
    this.fogBrushPainting = false;
    if (this.isHighPerformance2d()) { this.view2d.end(); return; }
  }
  changeZoom(amount: number): void { if (!this.isHighPerformance2d()) this.stage.zoomCamera(-amount * 0.4); else this.view2d.zoomBy(amount); }
  resetZoom(): void { if (!this.isHighPerformance2d()) this.stage.resetCamera(); else this.view2d.reset(); }
  getTokenBaseFill(token: VttTokenVm): string { return getTokenBaseColorHex(token); }
  getTokenBaseStroke(token: VttTokenVm): string {
    return getTokenRimColorHex(token);
  }
  getTokenRadius2D(token: VttTokenVm): number { return Math.max(8, Math.round(20 * this.vttDisplay.gridScale() * getDndSizeScale(token.sizeCategory))); }
  getTokenAvatarRadius2D(token: VttTokenVm): number { return Math.max(6, Math.round(18 * this.vttDisplay.gridScale() * getDndSizeScale(token.sizeCategory))); }

  mountStageIfReady(): void {
    if (this.stageMounted || !this.hasConfiguredMap() || !this.vttCanvasRef?.nativeElement) return;
    this.stageMounted = true;
    this.stage.mountStage(
      this.vttCanvasRef.nativeElement,
      this.vtt.tokens(),
      this.battle.activeObserverToken()?.key ?? this.vtt.selectedAttackerKey(),
      this.vtt.selectedTargetKey(),
      (k, shiftKey, ctrlKey) => {
        if (this.workflow.state() !== null) return;
        const tok = this.vtt.tokens().find((t) => t.key === k);
        if (tok) this.handleTokenSelectionOrCast(tok, shiftKey === true, ctrlKey === true);
      },
      (ev) => this.battle.openTokenContextMenu(ev.key, ev.clientX, ev.clientY),
      (k, evt) => {
        if (
          this.workflow.state() !== null ||
          this.battle.fogBrushMode() !== 'none' ||
          this.battle.pendingAbility() ||
          this.battle.targetSelectionMode() ||
          evt.shiftKey ||
          evt.ctrlKey ||
          evt.metaKey
        ) {
          return false;
        }
        const tok = this.vtt.tokens().find((t) => t.key === k);
        return tok ? this.battle.canMoveToken(tok).allowed : false;
      },
      (pt) => {
        if (this.workflow.state() !== null) return;
        const priorSnapped = this.battle.activeRangeAndAoePreview()?.snappedToken ?? null;
        this.battle.cursorWorldPos.set(pt);
        if (this.battle.pendingAbility()) {
          const step = this.battle.recordPendingAbilityTargetClick(priorSnapped ?? undefined);
          this.sync3dStage();
          if (step.shouldExecuteNow) void this.executePendingAbilityCast();
          return;
        }
        if (this.battle.targetSelectionMode()) {
          const snapped = this.battle.activeRangeAndAoePreview()?.snappedToken ?? priorSnapped;
          if (snapped) { this.battle.handleTokenClick(snapped, false, false); this.sync3dStage(); }
        }
      },
    );
    this.stage.setForcedTopDown(!this.battle.mapMode3D());
    this.stage.loadMapScene(this.serverSync.activeSceneResponse()?.sceneDataJson, this.activeBattlemapBackdropUrl());
    this.stage.setGridVisible(this.gridEnabled(), this.vttDisplay.gridScale(), this.vttDisplay.gridOffsetX(), this.vttDisplay.gridOffsetY());
    this.vtt.snapAllTokensToActiveGrid();
    this.sync3dStage();
  }

  ngAfterViewInit(): void {
    if (this.vtt.tokens().length === 0 && this.vtt.encounterDetails().length > 0) {
      this.vtt.launchEncounterIntoVtt(this.vtt.activeEncounterId());
    }
    this.mountStageIfReady();
    this.timer.start();
    const activeSceneKey = this.serverSync.activeSceneResponse()?.sceneKey || '*';
    const activeSceneTitle = this.activeBattlemapTitle() || 'Live VTT Battlemap';
    this.audio.fireTrigger('battlemap', activeSceneKey, activeSceneTitle, true);
  }

  ngOnDestroy(): void {
    this.timer.stop();
    this.stage.dispose();
  }

  setMapMode(is3d: boolean): void {
    this.battle.mapMode3D.set(is3d);
    if (!this.isHighPerformance2d()) this.stage.setForcedTopDown(!is3d);
    setTimeout(() => {
      this.stage.resize();
      this.sync3dStage();
    }, 50);
  }
  toggleMapMode(): void {
    this.setMapMode(!this.battle.mapMode3D());
  }

  sync3dStage(): void {
    const obs = this.battle.activeObserverToken();
    const preview = this.battle.activeRangeAndAoePreview();
    this.stage.syncSpellTemplateAndTethers(
      obs ? { x: obs.x, z: obs.z } : null,
      this.battle.activeTetherTargetPoints(),
      preview ? { active: true, casterPos: preview.clamped.start, endPos: preview.clamped.end, isSingleOrMulti: preview.isSingleOrMulti, aoeRadiusFeet: preview.aoeRadiusFeet, blockedByWall: preview.clamped.blockedByWall } : null,
    );
    this.stage.syncTokens(this.vtt.tokens(), obs?.key ?? this.vtt.selectedAttackerKey(), this.vtt.selectedTargetKey(), this.battle.allReticleTargetKeys(), this.fog.opacityByKey(), this.vttDisplay.gridScale());
    this.stage.syncFog(this.fog.layer());
  }

  onCalibPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    const host = event.currentTarget as HTMLElement;
    const rect = host.getBoundingClientRect();
    this.calibStartClient = { x: event.clientX, y: event.clientY, localX: event.clientX - rect.left, localY: event.clientY - rect.top };
    this.calibBox.set({ x: this.calibStartClient.localX, y: this.calibStartClient.localY, w: 0, h: 0 });
    try { host.setPointerCapture(event.pointerId); } catch {}
  }

  onCalibPointerMove(event: PointerEvent): void {
    if (this.calibStartClient) this.calibBox.set(computeCalibDragBox(event, this.calibStartClient));
  }

  onCalibPointerUp(event: PointerEvent): void {
    if (!this.calibStartClient) return;
    const start = this.calibStartClient;
    this.calibStartClient = null;
    this.calibBox.set(null);
    if (finishGridCalibration(event, start, this.isHighPerformance2d(), this.stage, this.vttDisplay, this.battleSvgRef?.nativeElement)) {
      this.gridEnabled.set(true);
    }
  }

  @HostListener('window:keyup', ['$event'])
  onWindowKeyup(event: KeyboardEvent): void {
    if (event.code === 'Space') this.releaseSpace();
  }

  @HostListener('window:blur')
  releaseSpace(): void {
    this.view2d.setSpaceHeld(false);
    this.stage.setRotateHeld(false);
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    handleVttWindowKeydown(
      event,
      this.battle,
      this.vtt,
      this.vttDisplay,
      this.view2d,
      this.stage,
      this.serverSync,
      () => this.gridEnabled.update((v) => !v),
      (cast) => (cast ? void this.executePendingAbilityCast() : this.sync3dStage()),
    );
  }

  onBattleMapPointerMove(event: MouseEvent): void {
    if (this.workflow.state() !== null) return;
    if (update2dMapPointerPosition(event, this.battleSvgRef?.nativeElement, this.battle)) {
      this.dragMoved = true;
    }
  }

  onTokenMouseDown(event: MouseEvent, token: VttTokenVm): void {
    if (event.button !== 0 || this.battle.pendingAbility() || event.shiftKey || this.battle.targetSelectionMode()) return;
    event.stopPropagation();
    this.dragMoved = false;
    const perm = this.battle.beginTokenDrag(token);
    if (!perm.allowed) this.dmToolReadout.set(perm.reason);
  }

  onTokenContextMenu(event: MouseEvent, token: VttTokenVm): void {
    event.preventDefault();
    event.stopPropagation();
    this.battle.openTokenContextMenu(token.key, event.clientX, event.clientY);
  }

  openTokenContextFromDock(dockToken: DockToken): void {
    openDockTokenContextMenu(dockToken.sheetRef, this.battle);
  }

  onBattleMapMouseUp(): void {
    if (!this.battle.draggingTokenKey()) return;
    const result = this.battle.endTokenDrag();
    if (result.movedToken && result.distanceFeet > 0) {
      void this.serverSync.publishMove(result.movedToken.key, result.movedToken.x, result.movedToken.z);
      this.sync3dStage();
    }
  }

  onBattleMapClick(_event: MouseEvent): void {
    if (this.view2d.consumeDragClick() || this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    if (this.battle.measureEnabled() && this.battle.measureSubMode() === 'movement') {
      this.commitMovePreview();
      return;
    }
    if (this.battle.pendingAbility()) {
      const step = this.battle.recordPendingAbilityTargetClick();
      this.sync3dStage();
      if (step.shouldExecuteNow) void this.executePendingAbilityCast();
    }
  }

  onTokenClicked(event: MouseEvent, token: VttTokenVm): void {
    event.stopPropagation();
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    this.handleTokenSelectionOrCast(token, event.shiftKey, event.ctrlKey || event.metaKey);
  }

  private handleTokenSelectionOrCast(token: VttTokenVm, shiftKey: boolean, ctrlKey = false): void {
    if (this.battle.pendingAbility()) {
      this.battle.cursorWorldPos.set({ x: token.x, z: token.z });
      const step = this.battle.recordPendingAbilityTargetClick(token);
      this.sync3dStage();
      if (step.shouldExecuteNow) void this.executePendingAbilityCast();
      return;
    }
    this.battle.handleTokenClick(token, shiftKey, ctrlKey);
    this.sync3dStage();
  }

  commitMovePreview(): void {
    const res = this.battle.commitStealthGridMove();
    if (!res.allowed) return;
    this.sync3dStage();
    const moved = this.battle.activeObserverToken();
    void this.serverSync.publishMove(moved.key, moved.x, moved.z);
  }

  selectDockAction(action: DockAction): void {
    const ab = this.battle.triggerDockAction(action);
    this.tryOpenWorkflowWithPreselectedTargets(ab);
  }
  onDockMenuAction(detail: { action: DockAction; token: DockToken }): void {
    if (typeof detail.token.sheetRef === 'string') {
      const candidate = this.vtt.tokens().find((t) => t.key === detail.token.sheetRef);
      if (this.store.viewerRole() === 'gm' || (candidate && this.battle.canControlToken(candidate))) {
        this.vtt.selectedAttackerKey.set(detail.token.sheetRef);
      }
    }
    const ab = this.battle.triggerDockAction(detail.action);
    this.tryOpenWorkflowWithPreselectedTargets(ab);
  }
  private tryOpenWorkflowWithPreselectedTargets(ability: VttTacticalAbilityVm | null): boolean {
    this.sync3dStage();
    if (!ability || !this.battle.isSingleOrMultiTargetAbility(ability) || !this.battle.hasActiveTargetTether()) {
      return false;
    }
    const obs = this.battle.activeObserverToken();
    const keys = this.battle.queuedTargetSequence().length > 0 ? this.battle.queuedTargetSequence() : this.battle.multiTargetKeys();
    const baseTargets = keys
      .filter((k) => !obs || k !== obs.key)
      .map((k) => this.vtt.tokens().find((t) => t.key === k))
      .filter((t): t is VttTokenVm => !!t);
    if (!obs || baseTargets.length === 0) return false;
    const requiredCount = Math.max(1, ability.maxTargets || 1);
    const targets: VttTokenVm[] = [...baseTargets];
    while (targets.length < requiredCount) {
      targets.push(baseTargets[baseTargets.length - 1]);
    }
    this.workflow.openWorkflow(obs, ability, targets, () => this.sync3dStage());
    return true;
  }
  dockStandardAction(detail: { action: { name: string }; token: DockToken }): void { this.dmToolReadout.set(`${detail.token.name} uses ${detail.action.name}.`); }
  dockCheck(label: string, token: DockToken): void {
    this.rollQuickDcCheck(12, label);
    this.dmToolReadout.set(`${token.name}: ${label} check rolled.`);
  }
  dockToggleMeasure(): void { this.battle.toggleMeasureTool(); }

  selectTurnAbility(ability: VttTacticalAbilityVm): void {
    if (!this.battle.isAbilityAvailableOnTurn(ability)) return;
    if (this.battle.pendingAbility()?.id === ability.id) { void this.executePendingAbilityCast(); return; }
    this.battle.beginAbilityTargeting(ability);
    this.tryOpenWorkflowWithPreselectedTargets(ability);
  }

  async executePendingAbilityCast(): Promise<void> {
    await runPendingAbilityCastAndFx(this.battle, this.vtt, this.workflow, () => this.sync3dStage());
  }

  nextTurn(): void {
    void this.serverSync.nextTurn().then(() => {
      const active = this.vtt.selectedAttacker();
      if (active) this.battle.resetTurnMovement(active.key);
      this.sync3dStage();
    });
  }

  spawnSelectedBestiaryMonster(): void {
    const pick = this.vtt.creatures().find((c) => c.id === this.quickAddMonsterId()) ?? this.vtt.creatures()[0];
    if (pick) { this.vtt.spawnCreatureIntoVtt(pick); this.sync3dStage(); }
  }

  addQuickNpcToMap(): void {
    this.battle.quickAddNpcToEncounter(this.quickAddNpcName(), this.quickAddNpcTitle(), this.quickAddNpcScope(), this.quickAddNpcDisposition(), true);
    this.quickAddNpcName.set('');
    this.sync3dStage();
  }

  rollQuickDcCheck(dc: number, label: string): void {
    triggerQuickDcCheckRoll(this.fullscreenDice, dc, label, this.vtt.selectedAttacker()?.name ?? 'Combatant');
  }

  rollSelectedDice(): void {
    const entry = executeBattlefieldDiceRoll(this.selectedDiceFormula(), this.vtt.selectedAttacker()?.name ?? 'Combatant', this.vtt.activeRound(), this.fullscreenDice);
    this.vtt.combatLogs.update((logs) => [entry, ...logs]);
  }

  submitChat(): void {
    this.battle.sendChatMessage(this.chatDraft(), this.chatWhisperGmOnly());
    this.chatDraft.set('');
  }

  selectRightTab(tab: VttRightTabId): void {
    this.battle.activeRightTab.set(tab);
    this.battle.rightPanelCollapsed.set(false);
  }

  readonly rightTabTitle = computed(() => VTT_RIGHT_TAB_TITLES[this.battle.activeRightTab()] ?? 'Encounter Drawer');
  openHandoutModal(): void { this.handouts.composeOpen.set(true); }
}
