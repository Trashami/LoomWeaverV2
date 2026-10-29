import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwButtonComponent,
  LwIconComponent,
} from '../../shared/ui/public-api';
import { WebAudioAmbienceService } from '../assets/engine/web-audio-ambience.service';
import { FullscreenDiceOverlayService } from '../dice/engine/fullscreen-dice-overlay.service';
import { BabylonEffectStageService } from '../effects/engine/babylon-effect-stage.service';
import { VttTokenVm } from '../effects/engine/effect-timeline.contract';
import {
  feetToSvgPx,
  svgToWorldPoint,
  worldToSvgX,
  worldToSvgY,
} from './engine/vtt-los-and-grid.engine';
import { VttTacticalAbilityVm } from './models/vtt-battle.models';
import { VttBattleStateService } from './services/vtt-battle-state.service';
import { VttCombatService } from './services/vtt-combat.service';

@Component({
  selector: 'lw-arcane-screen-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgpButton,
    LwButtonComponent,
    LwIconComponent,
  ],
  templateUrl: './arcane-screen.page.html',
  styleUrl: './arcane-screen.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArcaneScreenPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('vttCanvas') private vttCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('battleSvg') private battleSvgRef?: ElementRef<SVGSVGElement>;

  readonly store = inject(LoomWeaverStoreService);
  readonly vtt = inject(VttCombatService);
  readonly battle = inject(VttBattleStateService);
  readonly stage = inject(BabylonEffectStageService);
  readonly audio = inject(WebAudioAmbienceService);
  readonly fullscreenDice = inject(FullscreenDiceOverlayService);
  private readonly router = inject(Router);

  readonly gridEnabled = signal<boolean>(true);
  private dragMoved = false;

  readonly timerSeconds = signal<number>(872);
  readonly timerRunning = signal<boolean>(true);
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  readonly selectedDiceFormula = signal<string>('1d20');
  readonly dmToolReadout = signal<string>(
    'Session Ready: DM can drag any token; Players move on their Initiative turn. Click an ability below to aim & cast.',
  );

  // Quick-Add Monster & NPC Form State
  readonly quickAddMonsterId = signal<string>('creat-goblin-scout-a');
  readonly quickAddNpcName = signal<string>('');
  readonly quickAddNpcTitle = signal<string>('Cinth Artificer Scout');
  readonly quickAddNpcScope = signal<'Encounter' | 'Region'>('Encounter');
  readonly quickAddNpcDisposition = signal<'Friendly' | 'Neutral' | 'Deceptive' | 'Hostile'>('Friendly');

  // Chat Composer State
  readonly chatDraft = signal<string>('');
  readonly chatWhisperGmOnly = signal<boolean>(false);

  // Coordinate helpers exposed to template
  readonly toSvgX = worldToSvgX;
  readonly toSvgY = worldToSvgY;
  readonly toSvgPx = feetToSvgPx;

  readonly gridVerticalLines = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
  readonly gridHorizontalLines = [100, 200, 300, 400, 500, 600, 700];

  readonly formattedTimer = computed(() => {
    const total = this.timerSeconds();
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  });

  readonly shouldRenderPlayerFog = computed(
    () =>
      this.battle.fogMode() !== 'no-fog' &&
      (this.store.viewerRole() === 'players' || this.battle.gmPreviewPlayerVision()),
  );

  readonly isObserverActiveTurn = computed(
    () => this.battle.activeInitiativeToken()?.key === this.battle.activeObserverToken()?.key,
  );

  ngAfterViewInit(): void {
    const canvas = this.vttCanvasRef?.nativeElement;
    if (canvas) {
      this.stage.mountStage(
        canvas,
        this.vtt.tokens(),
        this.vtt.selectedAttackerKey(),
        this.vtt.selectedTargetKey(),
        (clickedKey) => {
          const tok = this.vtt.tokens().find((t) => t.key === clickedKey);
          if (tok) {
            this.handleTokenSelectionOrCast(tok, false);
          }
        },
      );
      this.sync3dStage();
    }
    this.timerHandle = setInterval(() => {
      if (this.timerRunning()) {
        this.timerSeconds.update((s) => s + 1);
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    this.stage.dispose();
  }

  sync3dStage(): void {
    this.stage.syncTokens(
      this.vtt.tokens(),
      this.vtt.selectedAttackerKey(),
      this.vtt.selectedTargetKey(),
      this.battle.allReticleTargetKeys(),
    );
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (event.key === 'Escape') {
        this.battle.cancelAllInteractiveModes();
        this.battle.settingsModalOpen.set(false);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.battle.cancelAllInteractiveModes();
      this.battle.openDmDrawer.set('none');
      this.battle.settingsModalOpen.set(false);
      this.sync3dStage();
      this.dmToolReadout.set('Exited targeting / measure mode (Esc).');
    } else if (event.key === 't' || event.key === 'T') {
      event.preventDefault();
      this.battle.targetSelectionMode.update((v) => !v);
      this.dmToolReadout.set(
        this.battle.targetSelectionMode()
          ? 'Multi-Target Mode [T] Active: Click tokens to lock targets (same or multiple). Press Esc to exit.'
          : 'Multi-Target Mode [T] Deactivated.',
      );
    } else if (event.key === 'Enter' && this.battle.pendingAbility()) {
      event.preventDefault();
      this.executePendingAbilityCast();
    }
  }

  onBattleMapPointerMove(event: MouseEvent): void {
    const svg = this.battleSvgRef?.nativeElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * 1200;
    const svgY = ((event.clientY - rect.top) / rect.height) * 800;
    const worldPt = svgToWorldPoint(svgX, svgY);

    if (this.battle.draggingTokenKey()) {
      this.dragMoved = true;
      this.battle.updateDraggedTokenPosition(worldPt);
      return;
    }

    this.battle.cursorWorldPos.set(worldPt);
  }

  onTokenMouseDown(event: MouseEvent, token: VttTokenVm): void {
    if (event.button !== 0) return;
    if (this.battle.pendingAbility() || event.shiftKey || this.battle.targetSelectionMode()) {
      return;
    }
    event.stopPropagation();
    this.dragMoved = false;
    const perm = this.battle.beginTokenDrag(token);
    if (!perm.allowed) {
      this.dmToolReadout.set(perm.reason);
    }
  }

  onBattleMapMouseUp(): void {
    if (!this.battle.draggingTokenKey()) return;
    const result = this.battle.endTokenDrag();
    if (result.movedToken && result.distanceFeet > 0) {
      this.sync3dStage();
      this.dmToolReadout.set(
        `${this.store.viewerRole() === 'gm' ? 'DM Moved' : 'Moved'} ${result.movedToken.name} (${result.distanceFeet} ft).`,
      );
    }
  }

  onBattleMapClick(event: MouseEvent): void {
    if (this.dragMoved) {
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
      if (step.shouldExecuteNow) {
        this.executePendingAbilityCast();
      } else if (step.selectedCount > 0) {
        this.dmToolReadout.set(
          `Target ${step.selectedCount} of ${step.maxTargets} locked. Click another target (or same target again) to continue.`,
        );
      }
    }
  }

  onTokenClicked(event: MouseEvent, token: VttTokenVm): void {
    event.stopPropagation();
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    this.handleTokenSelectionOrCast(token, event.shiftKey);
  }

  private handleTokenSelectionOrCast(token: VttTokenVm, shiftKey: boolean): void {
    if (this.battle.pendingAbility()) {
      this.battle.cursorWorldPos.set({ x: token.x, z: token.z });
      const step = this.battle.recordPendingAbilityTargetClick(token);
      this.sync3dStage();
      if (step.shouldExecuteNow) {
        this.executePendingAbilityCast();
      } else {
        this.dmToolReadout.set(
          `Target ${step.selectedCount} of ${step.maxTargets} locked on ${token.name}. Select remaining target(s) (same or different).`,
        );
      }
      return;
    }

    this.battle.handleTokenClick(token, shiftKey);
    this.sync3dStage();
  }

  commitMovePreview(): void {
    const res = this.battle.commitStealthGridMove();
    if (!res.allowed) {
      this.dmToolReadout.set(res.reason);
      return;
    }
    this.sync3dStage();
    this.dmToolReadout.set(
      `Moved ${this.battle.activeObserverToken().name} ${res.distanceFeet} ft along the 5-ft grid.`,
    );
  }

  selectTurnAbility(ability: VttTacticalAbilityVm): void {
    if (!this.battle.isAbilityAvailableOnTurn(ability)) {
      this.dmToolReadout.set(`${ability.actionCost} already spent this turn.`);
      return;
    }
    if (this.battle.pendingAbility()?.id === ability.id) {
      this.executePendingAbilityCast();
      return;
    }
    this.battle.beginAbilityTargeting(ability);
    const isSingleOrMulti = this.battle.isSingleOrMultiTargetAbility(ability);
    const modeDesc = isSingleOrMulti
      ? ability.maxTargets > 1
        ? `Select up to ${ability.maxTargets} targets (can stack on same target)`
        : 'Snap to single target & click to strike'
      : `${ability.aoeRadiusFeet}ft AoE circle auto-targets tokens in red`;
    this.dmToolReadout.set(
      `Aiming "${ability.name}" (${ability.rangeFeet}ft range · ${modeDesc}). Press Esc to cancel.`,
    );
  }

  async executePendingAbilityCast(): Promise<void> {
    const confirmed = this.battle.confirmPendingAbilityCast();
    if (!confirmed) return;
    const { ability, targets } = confirmed;
    const targetList = targets.length > 0 ? targets : [this.vtt.selectedTarget()];

    let lastFx: Awaited<ReturnType<typeof this.vtt.executeActionOnTarget>> = null;
    for (const target of targetList) {
      this.vtt.selectedTargetKey.set(target.key);
      lastFx = (await this.vtt.executeActionOnTarget(ability)) ?? lastFx;
    }

    this.sync3dStage();
    if (lastFx) {
      this.stage.playTrajectoryEffect(lastFx.preset, lastFx.startPos, lastFx.endPos);
    }
    this.dmToolReadout.set(
      `Cast ${ability.name} against ${targetList.map((t) => t.name).join(', ')} (${targetList.length} hit roll${targetList.length > 1 ? 's' : ''}).`,
    );
  }

  switchLiveEncounter(encounterId: string): void {
    this.vtt.launchEncounterIntoVtt(encounterId);
    this.sync3dStage();
  }

  nextTurn(): void {
    this.vtt.advanceTurn();
    const active = this.vtt.selectedAttacker();
    if (active) {
      this.battle.resetTurnMovement(active.key);
    }
    this.sync3dStage();
    this.dmToolReadout.set(
      `Round ${this.vtt.activeRound()} · Active Initiative Turn: ${this.battle.activeInitiativeToken().name}`,
    );
  }

  spawnSelectedBestiaryMonster(): void {
    const pick =
      this.vtt.creatures().find((c) => c.id === this.quickAddMonsterId()) ??
      this.vtt.creatures()[0];
    if (!pick) return;
    this.vtt.spawnCreatureIntoVtt(pick);
    this.sync3dStage();
    this.dmToolReadout.set(`Added ${pick.name} onto the battle map.`);
  }

  addQuickNpcToMap(): void {
    this.battle.quickAddNpcToEncounter(
      this.quickAddNpcName(),
      this.quickAddNpcTitle(),
      this.quickAddNpcScope(),
      this.quickAddNpcDisposition(),
      true,
    );
    this.quickAddNpcName.set('');
    this.sync3dStage();
    this.dmToolReadout.set('Added NPC to Encounter & Battle Map.');
  }

  rollQuickDcCheck(dc: number, label: string): void {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + 4;
    this.dmToolReadout.set(
      `Quick DC ${dc} (${label}): Rolled ${d20} + 4 = ${total} -> ${total >= dc ? 'SUCCESS' : 'FAILURE'}`,
    );
    this.fullscreenDice.triggerFullScreenRoll({
      label: `DC ${dc} ${label} Check`,
      actorName: this.vtt.selectedAttacker().name,
      expression: '1d20 + 4',
      diceValues: [d20],
      modifier: 4,
      total,
      outcomeBadge: total >= dc ? 'SUCCESS' : 'FAILURE',
      isNat20: d20 === 20,
      isCritFail: d20 === 1,
    });
  }

  rollSelectedDice(): void {
    const f = this.selectedDiceFormula();
    const [countStr, sidesStr] = f.toLowerCase().split('d');
    const count = Math.max(1, Number(countStr) || 1);
    const sides = Math.max(4, Number(sidesStr) || 20);
    let sum = 0;
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.floor(Math.random() * sides) + 1;
      rolls.push(r);
      sum += r;
    }
    this.dmToolReadout.set(`Rolled ${f}: [${rolls.join(', ')}] = ${sum}`);
    this.fullscreenDice.triggerFullScreenRoll({
      label: 'Battlefield Roll',
      actorName: this.vtt.selectedAttacker().name,
      expression: f,
      diceValues: rolls,
      modifier: 0,
      total: sum,
      isNat20: sides === 20 && rolls.includes(20),
      isCritFail: sides === 20 && rolls.includes(1),
    });
  }

  submitChat(): void {
    this.battle.sendChatMessage(this.chatDraft(), this.chatWhisperGmOnly());
    this.chatDraft.set('');
  }

  openEditCurrentEncounter(): void {
    void this.router.navigate(['/encounters'], {
      queryParams: { edit: this.vtt.activeEncounterId() },
    });
  }

  resetActionBarSettings(): void {
    this.battle.actionBarSettings.set({
      opacity: 95,
      compactMode: false,
      snapSensitivityFeet: 10,
      showHotbarKeybinds: true,
      showMapRangeLabels: true,
      autoCenterActiveTurn: true,
    });
  }
}
