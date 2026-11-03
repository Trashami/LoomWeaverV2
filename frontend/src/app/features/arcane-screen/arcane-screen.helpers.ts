import { effect, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwButtonComponent,
  LwContextSwitcherComponent,
  LwContextSwitcherOption,
} from '../../shared/ui/public-api';
import { LwIconComponent } from '../../shared/ui/icon/icon.component';
import { FullscreenDiceOverlayService } from '../dice/engine/fullscreen-dice-overlay.service';
import { BabylonEffectStageService } from '../effects/engine/babylon-effect-stage.service';
import { CombatResolutionLogVm } from '../effects/engine/effect-timeline.contract';
import { VttActionDockComponent } from './components/vtt-action-dock/vtt-action-dock.component';
import { VttDmDrawersComponent } from './components/vtt-dm-drawers/vtt-dm-drawers.component';
import { VttGmGuidePanelComponent } from './components/vtt-gm/vtt-gm-guide-panel.component';
import { VttGmRailComponent } from './components/vtt-gm/vtt-gm-rail.component';
import { VttGmTrackersPanelComponent } from './components/vtt-gm/vtt-gm-trackers-panel.component';
import { VttHandoutModalComponent } from './components/vtt-handout-modal/vtt-handout-modal.component';
import { VttMapToolsComponent } from './components/vtt-map-tools/vtt-map-tools.component';
import { VttSettingsModalComponent } from './components/vtt-settings-modal/vtt-settings-modal.component';
import { VttSettingsPanelComponent } from './components/vtt-settings-panel/vtt-settings-panel.component';
import { VttTokenContextMenuComponent } from './components/vtt-token-context-menu/vtt-token-context-menu.component';
import { VttCombatOrderModalComponent } from './components/vtt-combat-order-modal/vtt-combat-order-modal.component';
import {
  BASE_GRID_CELL_SVG_PX,
  clampLineToRangeAndWalls,
  getActiveCellStepWorld,
  svgToWorldPoint,
  worldToSvgX,
  worldToSvgY,
} from './engine/vtt-los-and-grid.engine';
import { getEffectiveTokenVisionFeet } from './engine/vtt-fog-of-war.engine';
import { extractSceneOccludersFromMapState } from './engine/vtt-scene-occluders.helper';
import { VttBattleStateService } from './services/vtt-battle-state.service';
import { VttCombatService } from './services/vtt-combat.service';
import { VttCombatWorkflowService } from './services/vtt-combat-workflow.service';
import { VttDisplaySettingsService } from './services/vtt-display-settings.service';
import { VttMapView2dService } from './services/vtt-map-view-2d.service';

export const ARCANE_SCREEN_PAGE_IMPORTS = [
  FormsModule,
  RouterLink,
  NgpButton,
  LwButtonComponent,
  LwContextSwitcherComponent,
  LwIconComponent,
  VttActionDockComponent,
  VttGmRailComponent,
  VttGmGuidePanelComponent,
  VttGmTrackersPanelComponent,
  VttSettingsModalComponent,
  VttDmDrawersComponent,
  VttMapToolsComponent,
  VttSettingsPanelComponent,
  VttHandoutModalComponent,
  VttTokenContextMenuComponent,
  VttCombatOrderModalComponent,
] as const;

export interface CalibStartPoint {
  x: number;
  y: number;
  localX: number;
  localY: number;
}

export const VTT_RIGHT_TAB_TITLES: Record<string, string> = {
  'combat-log': 'Combat Roll Log',
  chat: 'Campaign Table Chat',
  initiative: 'Initiative Order',
  quests: 'Active Quests & Missions',
  npcs: 'Session NPCs',
  guide: 'Adventure Scene Guide',
  trackers: 'Traps & Trackers',
  lore: 'World Lore',
  settings: 'VTT Display Settings',
};

export function buildVttSessionSwitcherOptions(store: LoomWeaverStoreService): LwContextSwitcherOption[] {
  const activeId = store.activeSessionId();
  return store.sessions().map((session) => {
    const isSelected = session.sessionId === activeId;
    const isCurrent = session.status === 'upcoming';
    return {
      id: session.sessionId,
      title: `Session ${session.sessionNumber} — ${session.title}`,
      subtitle: `${store.formatSessionLocationLabel(session.locationLabel, session.title)} · ${isCurrent ? 'Current / Upcoming' : `Session ${session.sessionNumber}`}`,
      badgeLabel: isSelected ? 'SELECTED' : isCurrent ? 'CURRENT' : 'Switch',
      badgeTone: isSelected ? 'emerald' : isCurrent ? 'gold' : 'neutral',
      active: isSelected,
    };
  });
}

export function computeSvgGridLines(maxPx: number, gridScale: number, gridOffset: number): number[] {
  const step = Math.max(12.5, Math.round(BASE_GRID_CELL_SVG_PX * gridScale * 10) / 10);
  const offset = ((gridOffset % step) + step) % step;
  const lines: number[] = [];
  for (let p = offset; p <= maxPx; p += step) lines.push(Math.round(p * 10) / 10);
  return lines;
}

export function computeCalibDragBox(
  event: PointerEvent,
  start: CalibStartPoint,
): { x: number; y: number; w: number; h: number } {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const curX = event.clientX - rect.left;
  const curY = event.clientY - rect.top;
  return {
    x: Math.min(start.localX, curX),
    y: Math.min(start.localY, curY),
    w: Math.abs(curX - start.localX),
    h: Math.abs(curY - start.localY),
  };
}

export function finishGridCalibration(
  event: PointerEvent,
  start: CalibStartPoint,
  isHighPerformance2d: boolean,
  stage: BabylonEffectStageService,
  vttDisplay: VttDisplaySettingsService,
  svgEl?: SVGSVGElement,
): boolean {
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12) return false;
  if (!isHighPerformance2d) {
    const p1 = stage.pickGroundPoint(start.x, start.y);
    const p2 = stage.pickGroundPoint(event.clientX, event.clientY);
    if (p1 && p2) {
      vttDisplay.applyDrawnWorldSquareCalibration(p1, p2, stage.has3dSceneLoaded());
      stage.setGridVisible(true, vttDisplay.gridScale(), vttDisplay.gridOffsetX(), vttDisplay.gridOffsetY());
      return true;
    }
  }
  const r = svgEl?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) {
    vttDisplay.applyDrawnSquareCalibration(
      ((start.x - r.left) / r.width) * 1200,
      ((start.y - r.top) / r.height) * 800,
      ((event.clientX - r.left) / r.width) * 1200,
      ((event.clientY - r.top) / r.height) * 800,
    );
    return true;
  }
  return false;
}

export function paintFogBrushAtScreenPoint(
  clientX: number,
  clientY: number,
  isHighPerformance2d: boolean,
  stage: BabylonEffectStageService,
  battle: VttBattleStateService,
  svgEl: SVGSVGElement | undefined,
  onSync: () => void,
): void {
  if (!isHighPerformance2d) {
    const pt = stage.pickGroundPoint(clientX, clientY);
    if (pt) {
      battle.addFogBrushStroke(pt);
      onSync();
      return;
    }
  }
  const r = svgEl?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) {
    battle.addFogBrushStroke(svgToWorldPoint(((clientX - r.left) / r.width) * 1200, ((clientY - r.top) / r.height) * 800));
    onSync();
  }
}

export function handleVttWindowKeydown(
  event: KeyboardEvent,
  battle: VttBattleStateService,
  vtt: VttCombatService,
  vttDisplay: VttDisplaySettingsService,
  view2d: VttMapView2dService,
  stage: BabylonEffectStageService,
  serverSync: { publishMove: (k: string, x: number, z: number) => Promise<unknown> },
  toggleGrid: () => void,
  onCastOrSync: (cast: boolean) => void,
): void {
  const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    if (event.key === 'Escape') {
      battle.cancelAllInteractiveModes();
      battle.settingsModalOpen.set(false);
      vttDisplay.calibratingGrid.set(false);
    }
    return;
  }
  if (
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown' ||
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight'
  ) {
    event.preventDefault();
    const token = battle.activeObserverToken();
    if (!token) return;
    const perm = battle.canMoveToken(token);
    if (!perm.allowed) return;
    const step = getActiveCellStepWorld();
    const is3d = stage.has3dSceneLoaded();
    const maxW = is3d ? 17.5 : 11.5;
    const maxH = is3d ? 13.0 : 7.5;
    const zSign = !stage.has3dSceneLoaded() && !battle.mapMode3D() ? -1 : 1;
    let dx = 0;
    let dz = 0;
    if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else if (event.key === 'ArrowUp') dz = step * zSign;
    else if (event.key === 'ArrowDown') dz = -step * zSign;

    const desired = {
      x: Math.max(-maxW, Math.min(maxW, Math.round((token.x + dx) * 100) / 100)),
      z: Math.max(-maxH, Math.min(maxH, Math.round((token.z + dz) * 100) / 100)),
    };
    const clamped = clampLineToRangeAndWalls({ x: token.x, z: token.z }, desired, 5, battle.walls(), true);
    if (clamped.blockedByWall) return;
    vtt.applyRemoteTokenMove(token.key, desired.x, desired.z);
    if (!battle.canControlToken(token) || token.faction === 'party') {
      battle.usedMovementFeetByToken.update((prev) => ({ ...prev, [token.key]: (prev[token.key] ?? 0) + 5 }));
      battle.exploredTrailPoints.update((pts) => [
        ...pts,
        { x: desired.x, z: desired.z, radiusFeet: getEffectiveTokenVisionFeet(token, battle.playerSightDistanceFeet(), battle.applyTokenVision()) },
      ]);
    }
    onCastOrSync(false);
    void serverSync.publishMove(token.key, desired.x, desired.z);
    return;
  }
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    view2d.setSpaceHeld(true);
    stage.setRotateHeld(true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    if (battle.targetSelectionMode() && !battle.pendingAbility()) {
      battle.targetSelectionMode.set(false);
    } else {
      battle.cancelAllInteractiveModes();
    }
    battle.openDmDrawer.set('none');
    battle.settingsModalOpen.set(false);
    vttDisplay.calibratingGrid.set(false);
    onCastOrSync(false);
  } else if (event.key === 'g' || event.key === 'G') {
    event.preventDefault();
    toggleGrid();
  } else if (event.key === 't' || event.key === 'T') {
    event.preventDefault();
    battle.targetSelectionMode.update((v) => !v);
    onCastOrSync(false);
  } else if (event.key === 'Enter' && battle.pendingAbility()) {
    event.preventDefault();
    onCastOrSync(true);
  }
}

export async function runPendingAbilityCastAndFx(
  battle: VttBattleStateService,
  vtt: VttCombatService,
  workflow: VttCombatWorkflowService,
  onSync: () => void,
): Promise<void> {
  const confirmed = battle.confirmPendingAbilityCast();
  if (!confirmed) return;
  const { ability, targets } = confirmed;
  const attacker = battle.activeObserverToken() ?? vtt.selectedAttacker();
  const targetList = targets.length > 0 ? targets : vtt.selectedTarget() ? [vtt.selectedTarget()] : [];
  if (!attacker || targetList.length === 0) return;
  workflow.openWorkflow(attacker, ability, targetList, onSync);
  onSync();
}

export function triggerQuickDcCheckRoll(
  fullscreenDice: FullscreenDiceOverlayService,
  dc: number,
  label: string,
  actorName: string,
): void {
  const d20 = Math.floor(Math.random() * 20) + 1;
  const total = d20 + 4;
  fullscreenDice.triggerFullScreenRoll({
    label: `DC ${dc} ${label} Check`,
    actorName,
    expression: '1d20 + 4',
    diceValues: [d20],
    modifier: 4,
    total,
    outcomeBadge: total >= dc ? 'SUCCESS' : 'FAILURE',
    isNat20: d20 === 20,
    isCritFail: d20 === 1,
  });
}

export function executeBattlefieldDiceRoll(
  formula: string,
  actorName: string,
  round: number,
  fullscreenDice: FullscreenDiceOverlayService,
): CombatResolutionLogVm {
  const f = formula || '1d20';
  const [countStr, sidesStr] = f.toLowerCase().split('d');
  const count = Math.max(1, Number(countStr) || 1);
  const sides = Math.max(4, Number(sidesStr) || 20);
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const sum = rolls.reduce((a, b) => a + b, 0);
  const isNat20 = sides === 20 && rolls.includes(20);
  const isCritFail = sides === 20 && rolls.includes(1);
  const suffix = isNat20 ? ' (CRITICAL HIT!)' : isCritFail ? ' (CRITICAL FAIL!)' : '';

  fullscreenDice.triggerFullScreenRoll({
    label: 'Battlefield Roll',
    actorName,
    expression: f,
    diceValues: rolls,
    modifier: 0,
    total: sum,
    isNat20,
    isCritFail,
  });

  return {
    id: `dice-${Date.now()}`,
    round,
    attackerName: actorName,
    targetName: 'Battlefield',
    actionName: `Dice Roll (${f})`,
    distanceFeet: 0,
    hit: !isCritFail,
    isCritical: isNat20,
    damageDealt: 0,
    message: `${actorName} rolled ${f}: [${rolls.join(', ')}] = ${sum}${suffix}`,
  };
}

export function openDockTokenContextMenu(
  sheetRef: unknown,
  battle: VttBattleStateService,
): void {
  const ref = typeof sheetRef === 'string' ? sheetRef : undefined;
  const key = ref || battle.activeObserverToken()?.key;
  if (!key) return;
  const cx = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.25) : 320;
  const cy = typeof window !== 'undefined' ? Math.round(window.innerHeight - 480) : 340;
  battle.openTokenContextMenu(key, cx, cy);
}

export function update2dMapPointerPosition(
  event: MouseEvent,
  svgEl: SVGSVGElement | undefined,
  battle: VttBattleStateService,
): boolean {
  const rect = svgEl?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const worldPt = svgToWorldPoint(
    ((event.clientX - rect.left) / rect.width) * 1200,
    ((event.clientY - rect.top) / rect.height) * 800,
  );
  if (battle.draggingTokenKey()) {
    battle.updateDraggedTokenPosition(worldPt);
    return true;
  }
  battle.cursorWorldPos.set(worldPt);
  return false;
}

export function registerArcaneScreenStageEffects(
  host: {
    hasConfiguredMap: () => boolean;
    isHighPerformance2d: () => boolean;
    activeBattlemapBackdropUrl: () => string;
    activeBattlemapTitle: () => string;
    gridEnabled: () => boolean;
    getSceneQueryParam: () => string | null;
    getAssignedSceneKey: () => string | undefined;
    mountStageIfReady: () => void;
    sync3dStage: () => void;
    disposeStageIfMounted: () => void;
    vtt: VttCombatService;
    fog: { layer: () => HTMLCanvasElement | null; opacityByKey: () => ReadonlyMap<string, number> };
    battle: VttBattleStateService;
    vttDisplay: VttDisplaySettingsService;
    serverSync: { activeSceneResponse: () => { sceneDataJson?: string | null } | null; loadScene: (k: string, t: string, u: string) => Promise<unknown>; publishMove: (k: string, x: number, z: number) => Promise<unknown> };
    stage: BabylonEffectStageService;
  },
): void {
  const { vtt, fog, battle, vttDisplay, serverSync, stage } = host;
  let lastLoadedSceneKey = '';
  effect(() => {
    if (!host.hasConfiguredMap()) {
      host.disposeStageIfMounted();
      return;
    }
    setTimeout(() => host.mountStageIfReady(), 50);
  });
  effect(() => {
    if (!host.hasConfiguredMap()) return;
    const obs = battle.activeObserverToken();
    const preview = battle.activeRangeAndAoePreview();
    const tethers = battle.activeTetherTargetPoints();
    untracked(() => {
      stage.syncSpellTemplateAndTethers(
        obs ? { x: obs.x, z: obs.z } : null,
        tethers,
        preview ? { active: true, casterPos: preview.clamped.start, endPos: preview.clamped.end, isSingleOrMulti: preview.isSingleOrMulti, aoeRadiusFeet: preview.aoeRadiusFeet, blockedByWall: preview.clamped.blockedByWall } : null,
      );
    });
  });
  effect(() => {
    if (!host.hasConfiguredMap()) return;
    const tokens = vtt.tokens();
    const attackerKey = vtt.selectedAttackerKey();
    const targetKey = vtt.selectedTargetKey();
    const reticleKeys = battle.allReticleTargetKeys();
    const opacities = fog.opacityByKey();
    const scale = vttDisplay.gridScale();
    untracked(() => {
      stage.syncTokens(tokens, attackerKey, targetKey, reticleKeys, opacities, scale);
    });
  });
  effect(() => {
    if (!host.hasConfiguredMap()) return;
    const layer = fog.layer();
    untracked(() => {
      stage.syncFog(layer);
    });
  });
  effect(() => {
    if (!host.hasConfiguredMap()) return;
    const is3d = battle.mapMode3D();
    const isPerf = host.isHighPerformance2d();
    untracked(() => {
      if (!isPerf) stage.setForcedTopDown(!is3d);
    });
  });
  effect(() => {
    if (!host.hasConfiguredMap()) return;
    const url = host.activeBattlemapBackdropUrl();
    const sceneJson = serverSync.activeSceneResponse()?.sceneDataJson;
    untracked(() => {
      battle.walls.set(extractSceneOccludersFromMapState(sceneJson));
      stage.loadMapScene(sceneJson, url);
      stage.setGridVisible(host.gridEnabled(), vttDisplay.gridScale(), vttDisplay.gridOffsetX(), vttDisplay.gridOffsetY());
      vtt.snapAllTokensToActiveGrid();
      host.sync3dStage();
    });
  });
  effect(() => {
    if (!host.hasConfiguredMap()) return;
    const visible = host.gridEnabled();
    const scale = vttDisplay.gridScale();
    const offX = vttDisplay.gridOffsetX();
    const offY = vttDisplay.gridOffsetY();
    untracked(() => {
      stage.setGridVisible(visible, scale, offX, offY);
      vtt.snapAllTokensToActiveGrid();
    });
  });
  effect(() => {
    if (!host.hasConfiguredMap()) return;
    const targetScene = host.getSceneQueryParam() || host.getAssignedSceneKey() || '';
    const title = host.activeBattlemapTitle();
    const artUrl = host.activeBattlemapBackdropUrl();
    const loadKey = `${targetScene}:${title}:${artUrl}`;
    if (loadKey !== lastLoadedSceneKey) {
      lastLoadedSceneKey = loadKey;
      untracked(() => void serverSync.loadScene(targetScene, title, artUrl));
    }
  });
  stage.tokenDragged.pipe(takeUntilDestroyed()).subscribe((p) => {
    vtt.applyRemoteTokenMove(p.key, p.x, p.z);
  });
  stage.tokenDropped.pipe(takeUntilDestroyed()).subscribe((p) => {
    vtt.applyRemoteTokenMove(p.key, p.x, p.z);
    host.sync3dStage();
    void serverSync.publishMove(p.key, p.x, p.z);
  });
  stage.tokenRightClicked.pipe(takeUntilDestroyed()).subscribe((ev) => {
    battle.openTokenContextMenu(ev.key, ev.clientX, ev.clientY);
  });
  effect(() => {
    const cue = vtt.remoteEffectCue();
    if (cue) untracked(() => stage.playTrajectoryEffect(cue.preset, cue.startPos, cue.endPos));
  });
}
