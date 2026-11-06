import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import {
  FullscreenDiceOverlayService,
  type FullscreenDieEntry,
} from '../../dice/engine/fullscreen-dice-overlay.service';
import { BabylonEffectStageService } from '../../effects/engine/babylon-effect-stage.service';
import { VttTokenVm } from '../../effects/engine/effect-timeline.contract';
import { distanceInFeet, hasLineOfSight } from '../engine/vtt-los-and-grid.engine';
import { VttTacticalAbilityVm } from '../models/vtt-battle.models';
import { CombatResolutionResult } from '../models/vtt-server.models';
import { VttBattleStateService } from './vtt-battle-state.service';
import { VttCombatService } from './vtt-combat.service';
import { VttPartyAndActionsService } from './vtt-party-and-actions.service';

export type VttRollAdvantageMode = 'advantage' | 'normal' | 'disadvantage';

export type VttCombatOrderPhase =
  | 'idle'
  | 'declare-attack'
  | 'reaction-or-save'
  | 'rolling-attack'
  | 'attack-outcome'
  | 'rolling-damage'
  | 'playing-fx';

export interface VttQualifyingReactionOption {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly acBonus: number;
  readonly halvesDamage: boolean;
  readonly countersSpell: boolean;
  readonly defenderKey: string;
  readonly defenderName: string;
}

export interface VttTargetResolutionVm {
  readonly target: VttTokenVm;
  readonly distanceFeet: number;
  readonly inRange: boolean;
  readonly hasLoS: boolean;
  readonly coverBonusAc: number;
  readonly effectiveAc: number;
  readonly saveDc: number;
  readonly saveBonus: number;
  readonly rawD20: number;
  readonly secondD20?: number;
  readonly totalRoll: number;
  readonly hit: boolean;
  readonly isCritical: boolean;
  readonly isCritFail: boolean;
  readonly savedHalf: boolean;
  readonly damageDealt: number;
  readonly remainingHp: number;
  readonly reactionAppliedLabel?: string;
}

export interface VttCombatWorkflowStateVm {
  readonly phase: VttCombatOrderPhase;
  readonly attacker: VttTokenVm;
  readonly ability: VttTacticalAbilityVm;
  readonly targets: readonly VttTokenVm[];
  readonly advantageMode: VttRollAdvantageMode;
  readonly requiresSave: boolean;
  readonly saveAbilityLabel: string;
  readonly qualifyingReactions: readonly VttQualifyingReactionOption[];
  readonly selectedReactionId: string | null;
  readonly targetOutcomes: readonly VttTargetResolutionVm[];
  readonly attackRollSummary: string;
  readonly damageRollSummary: string;
  readonly canRollDamage: boolean;
}

@Injectable({ providedIn: 'root' })
export class VttCombatWorkflowService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly vtt = inject(VttCombatService);
  private readonly battle = inject(VttBattleStateService);
  private readonly partyAndActions = inject(VttPartyAndActionsService);
  private readonly fullscreenDice = inject(FullscreenDiceOverlayService);
  private readonly stage = inject(BabylonEffectStageService);

  readonly state = signal<VttCombatWorkflowStateVm | null>(null);
  private onStageSyncCallback: (() => void) | null = null;

  /**
   * Opens the D&D 5e Order-of-Operations modal (`Choose -> Check -> Roll Attack -> Outcome -> Roll Damage -> FX & Persist`).
   */
  openWorkflow(attacker: VttTokenVm, ability: VttTacticalAbilityVm, targets: readonly VttTokenVm[], onStageSync?: () => void): void {
    if (targets.length === 0) return;
    this.onStageSyncCallback = onStageSync ?? null;
    const targetKeys = Array.from(new Set(targets.map((t) => t.key)));
    this.battle.pendingAbility.set(null);
    this.battle.targetSelectionMode.set(false);
    this.battle.measureEnabled.set(false);
    this.battle.multiTargetKeys.set(targetKeys);
    this.battle.queuedTargetSequence.set(targets.map((t) => t.key));
    this.battle.hasActiveTargetTether.set(targetKeys.length > 0);
    if (targetKeys[0]) {
      this.vtt.selectedTargetKey.set(targetKeys[0]);
    }
    this.stage.prefetchCampaignEffects(this.store.activeCampaignId());
    const requiresSave = ability.saveDc > 0 && ability.targetMode === 'aoe';
    this.state.set({
      phase: 'declare-attack', attacker, ability, targets, advantageMode: 'normal',
      requiresSave, saveAbilityLabel: this.inferSaveAbilityLabel(ability),
      qualifyingReactions: this.detectQualifyingReactions(ability, targets),
      selectedReactionId: null, targetOutcomes: [], attackRollSummary: '', damageRollSummary: '', canRollDamage: false,
    });
    this.onStageSyncCallback?.();
  }

  setAdvantageMode(mode: VttRollAdvantageMode): void { this.state.update((s) => (s ? { ...s, advantageMode: mode } : null)); }

  cancelWorkflow(): void {
    this.state.set(null);
    this.battle.clearTargetSelectionAfterCast();
    this.onStageSyncCallback?.();
  }

  async confirmAttackOrCastDeclaration(): Promise<void> {
    const s = this.state();
    if (!s) return;
    if (s.qualifyingReactions.length > 0 || s.requiresSave) {
      this.state.set({ ...s, phase: 'reaction-or-save' });
      return;
    }
    await this.executeAttackOrSaveRoll(null);
  }

  async resolveReactionOrSaveStep(reactionId: string | null): Promise<void> {
    await this.executeAttackOrSaveRoll(reactionId);
  }

  private async executeAttackOrSaveRoll(selectedReactionId: string | null): Promise<void> {
    const s = this.state();
    if (!s) return;

    const chosenReaction = s.qualifyingReactions.find((r) => r.id === selectedReactionId) ?? null;
    if (chosenReaction) {
      this.vtt.tokens.update((list) =>
        list.map((t) => (t.key === chosenReaction.defenderKey ? { ...t, reactionUsed: true } : t)),
      );
    }

    if (chosenReaction?.countersSpell) {
      this.state.set({
        ...s, selectedReactionId, phase: 'attack-outcome',
        targetOutcomes: s.targets.map((t) => ({
          target: t, distanceFeet: distanceInFeet({ x: s.attacker.x, z: s.attacker.z }, { x: t.x, z: t.z }),
          inRange: true, hasLoS: true, coverBonusAc: 0, effectiveAc: t.armorClass, saveDc: s.ability.saveDc, saveBonus: 0,
          rawD20: 0, totalRoll: 0, hit: false, isCritical: false, isCritFail: false, savedHalf: false,
          damageDealt: 0, remainingHp: t.currentHp, reactionAppliedLabel: `${chosenReaction.defenderName} cast Counterspell — Spell Negated`,
        })),
        attackRollSummary: `${chosenReaction.defenderName} countered ${s.ability.name} with Counterspell!`,
        canRollDamage: false,
      });
      return;
    }

    this.state.set({ ...s, selectedReactionId, phase: 'rolling-attack' });

    const r1 = Math.floor(Math.random() * 20) + 1;
    const r2 = Math.floor(Math.random() * 20) + 1;
    const useTwoDice = s.advantageMode !== 'normal' && !s.requiresSave;
    const chosenD20 = !useTwoDice
      ? r1
      : s.advantageMode === 'advantage'
        ? Math.max(r1, r2)
        : Math.min(r1, r2);

    const isCrit = !s.requiresSave && chosenD20 === 20;
    const isCritFail = !s.requiresSave && chosenD20 === 1;
    const modifier = s.requiresSave ? 2 : s.ability.attackBonus;
    const total = chosenD20 + modifier;

    const primaryTarget = s.targets[0];
    const reactionAcBonus =
      chosenReaction && chosenReaction.defenderKey === primaryTarget.key ? chosenReaction.acBonus : 0;
    const targetAc = primaryTarget.armorClass + reactionAcBonus;
    const primaryHit = s.requiresSave
      ? total < s.ability.saveDc
      : isCrit || (!isCritFail && total >= targetAc);

    const diceEntries: FullscreenDieEntry[] = useTwoDice
      ? [
          { dieType: 'd20', value: r1 },
          { dieType: 'd20', value: r2 },
        ]
      : [{ dieType: 'd20', value: chosenD20 }];

    const rollLabel = s.requiresSave
      ? `DC ${s.ability.saveDc} ${s.saveAbilityLabel} Save vs ${s.ability.name}`
      : `${s.ability.name} Attack (${s.advantageMode.toUpperCase()})`;

    const badge = s.requiresSave
      ? primaryHit
        ? `SAVE FAILED (${total} vs DC ${s.ability.saveDc})`
        : `SAVED (${total} vs DC ${s.ability.saveDc})`
      : isCrit
        ? `CRITICAL HIT! (AC ${targetAc})`
        : isCritFail
          ? 'CRITICAL MISS (NAT 1)'
          : primaryHit
            ? `HIT! (${total} vs AC ${targetAc})`
            : `MISS (${total} vs AC ${targetAc})`;

    await this.fullscreenDice.triggerFullScreenRollAndWait({
      label: rollLabel,
      actorName: s.requiresSave ? primaryTarget.name : s.attacker.name,
      expression: useTwoDice
        ? `2d20 (${s.advantageMode === 'advantage' ? 'kh1' : 'kl1'}) + ${modifier}`
        : `1d20 + ${modifier}`,
      diceValues: useTwoDice ? [r1, r2] : [chosenD20],
      diceEntries,
      modifier,
      total,
      outcomeBadge: badge,
      isNat20: isCrit,
      isCritFail,
    });

    const outcomes: VttTargetResolutionVm[] = s.targets.map((t, idx) => {
      const dist = distanceInFeet({ x: s.attacker.x, z: s.attacker.z }, { x: t.x, z: t.z });
      const inRange = dist <= Math.max(5, s.ability.rangeFeet);
      const los = hasLineOfSight(
        { x: s.attacker.x, z: s.attacker.z },
        { x: t.x, z: t.z },
        Math.max(120, s.ability.rangeFeet),
        this.battle.walls(),
      );
      const tD20 = idx === 0 ? chosenD20 : s.requiresSave ? Math.floor(Math.random() * 20) + 1 : chosenD20;
      const tTotal = tD20 + modifier;
      const rBonus = chosenReaction && chosenReaction.defenderKey === t.key ? chosenReaction.acBonus : 0;
      const effAc = t.armorClass + rBonus;
      const hit = s.requiresSave
        ? inRange && tTotal < s.ability.saveDc
        : inRange && (isCrit || (!isCritFail && tTotal >= effAc));
      const savedHalf = s.requiresSave && inRange && !hit;

      return {
        target: t,
        distanceFeet: dist,
        inRange,
        hasLoS: los,
        coverBonusAc: 0,
        effectiveAc: effAc,
        saveDc: s.ability.saveDc,
        saveBonus: 2,
        rawD20: tD20,
        secondD20: useTwoDice && idx === 0 ? (chosenD20 === r1 ? r2 : r1) : undefined,
        totalRoll: tTotal,
        hit,
        isCritical: isCrit,
        isCritFail,
        savedHalf,
        damageDealt: 0,
        remainingHp: t.currentHp,
        reactionAppliedLabel:
          chosenReaction && chosenReaction.defenderKey === t.key
            ? `${chosenReaction.name} (${rBonus > 0 ? `+${rBonus} AC` : 'Half Damage'})`
            : undefined,
      };
    });

    const anyHitOrHalf = outcomes.some((o) => o.hit || o.savedHalf);
    const summary = s.requiresSave
      ? `${outcomes.filter((o) => o.hit).length} failed save, ${outcomes.filter((o) => o.savedHalf).length} succeeded (half damage).`
      : `${s.attacker.name} rolled ${chosenD20} + ${modifier} = ${total} — ${
          isCrit ? 'CRITICAL HIT!' : anyHitOrHalf ? 'HIT!' : 'MISS'
        }`;

    this.state.update((curr) =>
      curr
        ? {
            ...curr,
            phase: 'attack-outcome',
            targetOutcomes: outcomes,
            attackRollSummary: summary,
            canRollDamage: anyHitOrHalf,
          }
        : null,
    );
  }

  /**
   * Step 4 -> Step 5: Caster clicks "Roll Damage" (or "Complete Action" on a miss).
   * Rolls the 3D damage dice, waits for the dice overlay to fade out, then plays the EffectBuilder 3D animation,
   * clears the green target line & reticles, logs to Combat Roll Log, and persists to SQL & The Loom.
   */
  async rollDamageAndComplete(): Promise<void> {
    const s = this.state();
    if (!s) return;

    if (!s.canRollDamage) {
      await this.finalizeCombatAction(s, 0);
      return;
    }

    this.state.set({ ...s, phase: 'rolling-damage' });

    const anyCrit = s.targetOutcomes.some((o) => o.isCritical && o.hit);
    const baseCount = Math.max(1, s.ability.damageDiceCount || 1);
    const diceCount = anyCrit ? baseCount * 2 : baseCount;
    const sides = (s.ability.damageDiceSides || 8) as 4 | 6 | 8 | 10 | 12 | 20;
    const dieType = (`d${[4, 6, 8, 10, 12, 20].includes(sides) ? sides : 8}`) as FullscreenDieEntry['dieType'];
    const dmgRolls = Array.from({ length: diceCount }, () => Math.floor(Math.random() * sides) + 1);
    const dmgMod = s.ability.damageBonus || 0;
    const rawDamageTotal = Math.max(1, dmgRolls.reduce((a, b) => a + b, 0) + dmgMod);

    const expr = `${diceCount}${dieType}${dmgMod > 0 ? `+${dmgMod}` : dmgMod < 0 ? `${dmgMod}` : ''}`;

    await this.fullscreenDice.triggerFullScreenRollAndWait({
      label: `${s.ability.name} Damage${anyCrit ? ' (CRITICAL 2x DICE)' : ''}`,
      actorName: s.attacker.name,
      expression: expr,
      diceValues: dmgRolls,
      diceEntries: dmgRolls.map((v) => ({ dieType, value: v })),
      modifier: dmgMod,
      total: rawDamageTotal,
      outcomeBadge: `${rawDamageTotal} DAMAGE`,
      isNat20: anyCrit,
    });

    await this.finalizeCombatAction(s, rawDamageTotal);
  }

  private async finalizeCombatAction(
    s: VttCombatWorkflowStateVm,
    rolledDamageTotal: number,
  ): Promise<void> {
    const chosenReaction = s.qualifyingReactions.find((r) => r.id === s.selectedReactionId) ?? null;

    // Close modal & clear target selection + green line immediately before playing the 3D spell FX
    this.state.set(null);
    this.battle.clearTargetSelectionAfterCast();
    this.onStageSyncCallback?.();

    const preset =
      this.vtt.effectPresets().find((p) => p.id === s.ability.linkedEffectPresetId) ??
      this.vtt.effectPresets()[0];

    const slotKey =
      s.ability.actionCost === '1 Bonus Action'
        ? 'bonusUsed'
        : s.ability.actionCost === '1 Reaction'
          ? 'reactionUsed'
          : 'actionUsed';

    const updatedOutcomes: VttTargetResolutionVm[] = s.targetOutcomes.map((out) => {
      let dmg = 0;
      if (out.hit) {
        dmg = rolledDamageTotal;
      } else if (out.savedHalf) {
        dmg = Math.max(1, Math.floor(rolledDamageTotal / 2));
      }
      if (chosenReaction?.halvesDamage && chosenReaction.defenderKey === out.target.key && dmg > 0) {
        dmg = Math.max(1, Math.floor(dmg / 2));
      }
      const rem = Math.max(0, out.target.currentHp - dmg);
      return { ...out, damageDealt: dmg, remainingHp: rem };
    });

    // Apply HP changes and spend attacker action slot
    const hpByTargetKey = new Map<string, number>();
    for (const o of updatedOutcomes) {
      hpByTargetKey.set(o.target.key, o.remainingHp);
    }

    this.vtt.tokens.update((list) =>
      list.map((t) => {
        const nextHp = hpByTargetKey.get(t.key);
        const spentSlot = t.key === s.attacker.key ? { [slotKey]: true } : {};
        return nextHp !== undefined ? { ...t, ...spentSlot, currentHp: nextHp } : { ...t, ...spentSlot };
      }),
    );

    this.onStageSyncCallback?.();

    // Play EffectBuilder 3D animation from caster to all targets
    if (preset && updatedOutcomes.length > 0) {
      const targetPts = updatedOutcomes.map((out) => ({ x: out.target.x, z: out.target.z }));
      this.stage.playTrajectoryEffect(preset, { x: s.attacker.x, z: s.attacker.z }, targetPts[0], {
        abilityName: s.ability.name,
        campaignId: this.store.activeCampaignId(),
        targets: targetPts,
      });
    }

    // Add concise, unified entries to the Combat Roll Log & persist to SQL + The Loom
    const round = this.vtt.activeRound();
    for (const out of updatedOutcomes) {
      const hitOrSaved = out.hit || out.savedHalf;
      const msg = out.hit
        ? `${s.attacker.name} -> ${out.target.name} [${s.ability.name}]: ${
            s.requiresSave
              ? `Save ${out.totalRoll} vs DC ${out.saveDc} (FAILED)`
              : `Roll ${out.rawD20}+${s.ability.attackBonus}=${out.totalRoll} vs AC ${out.effectiveAc}`
          }${out.reactionAppliedLabel ? ` [${out.reactionAppliedLabel}]` : ''} -> ${
            out.isCritical ? 'CRITICAL HIT' : 'HIT'
          } for ${out.damageDealt} dmg (${out.remainingHp}/${out.target.maxHp} HP).`
        : out.savedHalf
          ? `${s.attacker.name} -> ${out.target.name} [${s.ability.name}]: Save ${out.totalRoll} vs DC ${out.saveDc} (SAVED) -> ${out.damageDealt} half dmg (${out.remainingHp}/${out.target.maxHp} HP).`
          : `${s.attacker.name} -> ${out.target.name} [${s.ability.name}]: ${
              out.reactionAppliedLabel || `Roll ${out.totalRoll} vs AC ${out.effectiveAc}`
            } -> MISS.`;

      this.vtt.combatLogs.update((logs) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          round,
          attackerName: s.attacker.name,
          targetName: out.target.name,
          actionName: s.ability.name,
          distanceFeet: out.distanceFeet,
          hit: hitOrSaved,
          isCritical: out.isCritical,
          damageDealt: out.damageDealt,
          message: msg,
        },
        ...logs.slice(0, 24),
      ]);

      // Persist to SQL database & The Loom session memory
      const slot =
        s.ability.actionCost === '1 Bonus Action'
          ? 'bonus'
          : s.ability.actionCost === '1 Reaction'
            ? 'reaction'
            : 'action';
      void firstValueFrom(
        this.http.post<CombatResolutionResult>(
          `/api/v2/campaigns/${this.store.activeCampaignId()}/combat/resolve`,
          {
            attackerKey: s.attacker.key,
            targetKey: out.target.key,
            actionName: s.ability.name,
            actionSlot: slot,
            rangeFeet: s.ability.rangeFeet,
            attackBonus: s.ability.attackBonus,
            saveDc: s.ability.saveDc,
            damageDiceCount: s.ability.damageDiceCount,
            damageDiceSides: s.ability.damageDiceSides,
            damageBonus: s.ability.damageBonus,
            particlePresetId: s.ability.linkedEffectPresetId,
            viewerRole: this.store.viewerRole(),
          },
        ),
      ).catch(() => {});
    }
  }

  private inferSaveAbilityLabel(ability: VttTacticalAbilityVm): string {
    const text = `${ability.name} ${ability.executeThen} ${ability.conditionIf}`.toLowerCase();
    if (text.includes('wis') || text.includes('fear') || text.includes('charm')) return 'Wisdom';
    if (text.includes('con') || text.includes('poison') || text.includes('thunder') || text.includes('cold'))
      return 'Constitution';
    if (text.includes('str') || text.includes('push') || text.includes('prone')) return 'Strength';
    return 'Dexterity';
  }

  /**
   * Inspects targeted tokens' D&D 5e reactions (`turnCategory === 'reaction'`) and class features
   * to see if any defender has an unused Reaction that qualifies for this specific trigger.
   */
  private detectQualifyingReactions(
    ability: VttTacticalAbilityVm,
    targets: readonly VttTokenVm[],
  ): VttQualifyingReactionOption[] {
    const options: VttQualifyingReactionOption[] = [];
    const isSpell = ability.turnCategory === 'spell';

    for (const defender of targets) {
      if (defender.reactionUsed || defender.currentHp <= 0) continue;
      const abilities = this.partyAndActions.resolveTacticalAbilitiesForToken(
        defender,
        this.vtt.creatures(),
      );
      const reactions = abilities.filter((a) => a.turnCategory === 'reaction');

      for (const r of reactions) {
        const lower = `${r.name} ${r.executeThen}`.toLowerCase();
        if (lower.includes('opportunity attack')) continue;
        if (lower.includes('counterspell') && isSpell) {
          options.push({ id: `${defender.key}:${r.id}`, name: r.name, summary: `${defender.name} uses Reaction to interrupt ${ability.name}.`, acBonus: 0, halvesDamage: false, countersSpell: true, defenderKey: defender.key, defenderName: defender.name });
        } else if (lower.includes('shield') || lower.includes('parry') || lower.includes('deflect')) {
          const bonus = lower.includes('shield') ? 5 : 3;
          options.push({ id: `${defender.key}:${r.id}`, name: `${r.name} (+${bonus} AC)`, summary: `${defender.name} uses Reaction to raise AC by +${bonus} against ${ability.name}.`, acBonus: bonus, halvesDamage: false, countersSpell: false, defenderKey: defender.key, defenderName: defender.name });
        } else if (lower.includes('uncanny dodge') || lower.includes('absorb elements') || lower.includes('ward') || lower.includes('veil') || lower.includes('step')) {
          options.push({ id: `${defender.key}:${r.id}`, name: `${r.name} (Half Damage)`, summary: `${defender.name} uses Reaction (${r.name}) to halve incoming damage from ${ability.name}.`, acBonus: 2, halvesDamage: true, countersSpell: false, defenderKey: defender.key, defenderName: defender.name });
        }
      }
    }

    return options;
  }
}
