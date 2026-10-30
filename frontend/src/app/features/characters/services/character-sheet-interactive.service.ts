import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { VttCombatService } from '../../arcane-screen/services/vtt-combat.service';
import { FullscreenDiceOverlayService } from '../../dice/engine/fullscreen-dice-overlay.service';
import {
  CampaignAdjustedRuleVm,
  CharacterCombatTelemetryVm,
  CharacterSheetActionRowVm,
  CharacterSheetRollLogVm,
  CharacterSheetVm,
  CharacterTurnEconomyState,
  STANDARD_COMBAT_ACTIONS,
} from '../models/character-studio.models';

export {
  CampaignAdjustedRuleVm,
  CharacterCombatTelemetryVm,
  CharacterSheetActionRowVm,
  CharacterSheetRollLogVm,
  CharacterTurnEconomyState,
  STANDARD_COMBAT_ACTIONS,
};

@Injectable({ providedIn: 'root' })
export class CharacterSheetInteractiveService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly alertify = inject(LwAlertifyService);
  private readonly vttCombat = inject(VttCombatService);
  private readonly fullscreenDice = inject(FullscreenDiceOverlayService);

  readonly rightDrawerOpen = signal<boolean>(false);
  readonly inspectedRule = signal<CampaignAdjustedRuleVm | null>(null);
  readonly diceTrayOpen = signal<boolean>(false);
  readonly lastRollResult = signal<CharacterSheetRollLogVm | null>(null);

  readonly isSessionLive = signal<boolean>(true);
  readonly activeSessionId = signal<string>('session-15');
  readonly activeSessionTitle = signal<string>('Session 15 — Shadow Beneath the Ruined Chapel');
  readonly isEncounterLive = signal<boolean>(true);
  readonly activeEncounterId = signal<string>('enc-ruined-chapel');
  readonly activeEncounterTitle = signal<string>('Ruined Chapel Courtyard Ambush');

  readonly selectedTargetName = signal<string>('Training Dummy');
  readonly selectedTargetAc = signal<number>(15);
  readonly reactionOutcomeMode = signal<'none' | 'interrupted' | 'reduced'>('none');
  readonly damageReductionAmount = signal<number>(5);
  readonly rollToastBanner = signal<string | null>(null);

  private readonly economyByChar = signal<Readonly<Record<string, CharacterTurnEconomyState>>>({});
  private readonly hpByChar = signal<Readonly<Record<string, number>>>({});
  private readonly telemetryByChar = signal<Readonly<Record<string, CharacterCombatTelemetryVm>>>({});

  readonly liveTargetToken = computed(() => (this.isEncounterLive() ? this.vttCombat.selectedTarget() : null));
  readonly liveTargetLabel = computed<string>(() => {
    const t = this.liveTargetToken();
    return t ? `${t.name} (AC ${t.armorClass})` : `${this.selectedTargetName()} (AC ${this.selectedTargetAc()})`;
  });
  readonly liveTargetAc = computed<number>(() => this.liveTargetToken()?.armorClass ?? this.selectedTargetAc());
  readonly liveOutcomeLabel = computed<string>(() => {
    const mode = this.reactionOutcomeMode();
    if (mode === 'interrupted') return 'Attack Interrupted (Shield / Ward)';
    if (mode === 'reduced') return `Reduced Damage (-${this.damageReductionAmount()} Ward)`;
    return this.isEncounterLive() ? `Live Round ${this.vttCombat.activeRound()} Resolution` : 'Standard Resolution';
  });

  readonly rollLogs = signal<readonly CharacterSheetRollLogVm[]>([
    {
      id: 'cs-seed-1', characterKey: 'char-ciaran', characterName: 'Aldric Vale',
      category: 'spell-attack', itemName: 'Fire Bolt', formula: '1d20 + 7', rawRolls: [17],
      naturalDie: 17, modifier: 7, total: 24, isNat20: false, isCritFail: false, hit: true,
      damageDealt: 11, damageReduced: 0, wasInterrupted: false, wasDamageReduced: false,
      actionSlotConsumed: 'action', trackedInSession: true, trackedInEncounter: true,
      summaryMessage: 'Aldric Vale rolled Fire Bolt (1d20 + 7) = 24 [Natural 17] -> HIT Training Dummy (AC 15) for 11 Fire dmg! [Tracked: Live Session + Live Encounter]',
      sha256Digest: 'SHA256:8B1F4A92C03E771A', timestampLabel: '2m ago',
    },
  ]);

  private broadcastChannel?: BroadcastChannel;

  constructor() {
    this.initRealtimeSync();
    this.fetchLiveState('char-ciaran');
  }

  mountMiniDiceCanvas(_canvas: HTMLCanvasElement): void {}

  getEconomyFor(charKey: string): CharacterTurnEconomyState {
    const base = this.economyByChar()[charKey] ?? {
      actionUsed: false, bonusUsed: false, reactionUsed: false, movementUsedFeet: 0,
      heroicInspiration: true, shortRestSpent: false, longRestSpent: false,
      rollMode: 'normal', tempHp: 0, spellSlotsUsed: { 1: 1, 2: 0, 3: 0, 4: 0 }, limitedUsesSpent: {},
    };
    const vttToken = this.vttCombat.tokens().find((t) => t.key.endsWith(charKey));
    if (!vttToken) return base;
    const conds = this.vttCombat
      .activeConditions()
      .filter((c) => c.targetLabel.toLowerCase().includes(vttToken.name.split(' ')[0].toLowerCase()))
      .map((c) => c.name.toLowerCase());
    const derivedMode: 'normal' | 'advantage' | 'disadvantage' =
      conds.some((c: string) => c.includes('poison') || c.includes('blind') || c.includes('fright') || c.includes('prone'))
        ? 'disadvantage'
        : conds.some((c: string) => c.includes('bless') || c.includes('invis') || c.includes('inspir'))
          ? 'advantage'
          : base.rollMode;
    return {
      ...base,
      actionUsed: base.actionUsed || Boolean(vttToken.actionUsed),
      bonusUsed: base.bonusUsed || Boolean(vttToken.bonusUsed),
      reactionUsed: base.reactionUsed || Boolean(vttToken.reactionUsed),
      rollMode: derivedMode,
    };
  }

  getLiveHpFor(sheet: CharacterSheetVm): number {
    const override = this.hpByChar()[sheet.characterKey];
    if (override !== undefined) return override;
    const vttToken = this.vttCombat.tokens().find((t) => t.key.endsWith(sheet.characterKey));
    return vttToken ? vttToken.currentHp : sheet.currentHp;
  }

  applyCharacterHpChange(sheet: CharacterSheetVm, nextHp: number): void {
    const clamped = Math.max(0, Math.min(sheet.maxHp, nextHp));
    this.hpByChar.update((m) => ({ ...m, [sheet.characterKey]: clamped }));
    this.vttCombat.tokens.update((list) =>
      list.map((t) => (t.key.endsWith(sheet.characterKey) ? { ...t, currentHp: clamped } : t)),
    );
    this.broadcastChannel?.postMessage({ type: 'sheet_hp_sync', characterKey: sheet.characterKey, currentHp: clamped });
  }

  getTelemetryFor(charKey: string, charName: string): CharacterCombatTelemetryVm {
    const existing = this.telemetryByChar()[charKey];
    if (existing) return existing;
    const dist: Record<number, number> = {};
    for (let i = 1; i <= 20; i++) dist[i] = i === 20 ? 5 : i === 1 ? 2 : 3;
    return {
      characterKey: charKey, characterName: charName, totalSessionRolls: 64,
      nat20Count: 5, critFailCount: 2, rollsByNumber: dist, landedStrikes: 22,
      missedStrikes: 6, attacksInterrupted: 4, attacksReducedDamage: 5,
      totalDamageDealt: 318, totalDamageReducedOrMitigated: 86, peakSingleHit: 42,
      spellsCastCount: 14, abilitiesUsedCount: 19,
    };
  }

  fetchLiveState(characterKey: string): void {
    const cid = this.store.activeCampaignId();
    this.http
      .get<{
        liveState: { isSessionLive: boolean; activeSessionId: string; activeSessionTitle: string; isEncounterLive: boolean; activeEncounterId: string; activeEncounterTitle: string };
        telemetry: CharacterCombatTelemetryVm;
        allPartyTelemetry: CharacterCombatTelemetryVm[];
      }>(`/api/v2/campaigns/${cid}/character-sheet/live-state?characterKey=${characterKey}`)
      .subscribe({
        next: (res) => {
          if (res?.liveState) {
            this.isSessionLive.set(res.liveState.isSessionLive);
            this.activeSessionId.set(res.liveState.activeSessionId);
            this.activeSessionTitle.set(res.liveState.activeSessionTitle);
            this.isEncounterLive.set(res.liveState.isEncounterLive);
            this.activeEncounterId.set(res.liveState.activeEncounterId);
            this.activeEncounterTitle.set(res.liveState.activeEncounterTitle);
          }
          if (res?.allPartyTelemetry?.length) {
            const map: Record<string, CharacterCombatTelemetryVm> = {};
            for (const t of res.allPartyTelemetry) map[t.characterKey] = t;
            this.telemetryByChar.set(map);
          } else if (res?.telemetry) {
            this.telemetryByChar.update((cur) => ({ ...cur, [characterKey]: res.telemetry }));
          }
        },
        error: () => {},
      });
  }

  toggleSessionLive(): void {
    const next = !this.isSessionLive();
    this.isSessionLive.set(next);
    if (!next) this.isEncounterLive.set(false);
    this.syncLiveStateToBackend();
  }

  toggleEncounterLive(): void {
    const next = !this.isEncounterLive();
    if (next && !this.isSessionLive()) this.isSessionLive.set(true);
    this.isEncounterLive.set(next);
    this.syncLiveStateToBackend();
  }

  private syncLiveStateToBackend(): void {
    const cid = this.store.activeCampaignId();
    this.http
      .post(`/api/v2/campaigns/${cid}/character-sheet/live-state`, {
        isSessionLive: this.isSessionLive(), activeSessionId: this.activeSessionId(),
        activeSessionTitle: this.activeSessionTitle(), isEncounterLive: this.isEncounterLive(),
        activeEncounterId: this.activeEncounterId(), activeEncounterTitle: this.activeEncounterTitle(),
        activeRound: this.vttCombat.activeRound(),
      })
      .subscribe({ error: () => {} });
  }

  inspectRuleInDrawer(rule: CampaignAdjustedRuleVm): void {
    this.inspectedRule.set(rule);
    this.rightDrawerOpen.set(true);
  }

  spendHeroicInspiration(charKey: string): void {
    const cur = this.getEconomyFor(charKey);
    if (!cur.heroicInspiration) return;
    this.patchEconomy(charKey, { heroicInspiration: false, rollMode: 'advantage' });
    this.alertify.notifyStatus('Heroic Inspiration', 'Advantage Active', 'Heroic Inspiration expended! Advantage active on your next d20 roll.', 'gold');
  }

  toggleActionSlotManual(charKey: string, slot: 'actionUsed' | 'bonusUsed' | 'reactionUsed'): void {
    const cur = this.getEconomyFor(charKey);
    this.patchEconomy(charKey, { [slot]: !cur[slot] });
    this.vttCombat.toggleEconomySlot(`1:Character:${charKey}`, slot);
  }

  resetTurnEconomy(charKey: string): void {
    this.patchEconomy(charKey, { actionUsed: false, bonusUsed: false, reactionUsed: false, movementUsedFeet: 0 });
    this.alertify.notifyStatus('Turn Economy', 'New Turn Started', 'Action, Bonus Action, Reaction, and Movement refreshed.', 'emerald');
  }

  takeShortRest(sheet: CharacterSheetVm): void {
    const cur = this.getEconomyFor(sheet.characterKey);
    if (cur.shortRestSpent) return;
    const nextSlots = { ...cur.spellSlotsUsed, 1: Math.max(0, (cur.spellSlotsUsed[1] ?? 0) - 2) };
    this.patchEconomy(sheet.characterKey, {
      actionUsed: false, bonusUsed: false, reactionUsed: false, movementUsedFeet: 0,
      shortRestSpent: true, spellSlotsUsed: nextSlots, limitedUsesSpent: {},
    });
    const healed = Math.min(sheet.maxHp, this.getLiveHpFor(sheet) + Math.max(4, sheet.level * 2));
    this.applyCharacterHpChange(sheet, healed);
    this.alertify.notifyStatus(sheet.name, 'Short Rest Expended', 'Short-Rest features & Hit Dice healing applied.', 'emerald');
  }

  takeLongRest(sheet: CharacterSheetVm): void {
    const cur = this.getEconomyFor(sheet.characterKey);
    if (cur.longRestSpent) return;
    this.patchEconomy(sheet.characterKey, {
      actionUsed: false, bonusUsed: false, reactionUsed: false, movementUsedFeet: 0,
      heroicInspiration: true, shortRestSpent: false, longRestSpent: true, rollMode: 'normal',
      spellSlotsUsed: { 1: 0, 2: 0, 3: 0, 4: 0 }, limitedUsesSpent: {},
    });
    this.applyCharacterHpChange(sheet, sheet.maxHp);
    this.alertify.notifyStatus(sheet.name, 'Long Rest Expended', 'Full HP, Heroic Inspiration, Short Rest, & Spell Slots restored.', 'gold');
  }

  toggleSpellSlotBox(charKey: string, level: number, boxIndex: number, maxSlots: number): void {
    const cur = this.getEconomyFor(charKey);
    const used = cur.spellSlotsUsed[level] ?? 0;
    const nextUsed = boxIndex < used ? boxIndex : Math.min(maxSlots, boxIndex + 1);
    this.patchEconomy(charKey, { spellSlotsUsed: { ...cur.spellSlotsUsed, [level]: nextUsed } });
  }

  toggleLimitedUseBox(charKey: string, featureId: string, boxIndex: number, maxUses: number): void {
    const cur = this.getEconomyFor(charKey);
    const used = cur.limitedUsesSpent[featureId] ?? 0;
    const nextUsed = boxIndex < used ? boxIndex : Math.min(maxUses, boxIndex + 1);
    this.patchEconomy(charKey, { limitedUsesSpent: { ...cur.limitedUsesSpent, [featureId]: nextUsed } });
  }

  canExecuteAction(
    charKey: string,
    slotCost: 'none' | 'action' | 'bonus' | 'reaction' | 'movement',
    spellSlotLevel?: number,
    maxSpellSlots?: number,
    limitedUseId?: string,
    maxLimitedUses?: number,
  ): { allowed: boolean; reason?: string } {
    const econ = this.getEconomyFor(charKey);
    if (this.isEncounterLive()) {
      if (slotCost === 'action' && econ.actionUsed) return { allowed: false, reason: 'Action Spent This Turn' };
      if (slotCost === 'bonus' && econ.bonusUsed) return { allowed: false, reason: 'Bonus Action Spent' };
      if (slotCost === 'reaction' && econ.reactionUsed) return { allowed: false, reason: 'Reaction Spent' };
    }
    if (spellSlotLevel && spellSlotLevel > 0) {
      const used = econ.spellSlotsUsed[spellSlotLevel] ?? 0;
      if (used >= (maxSpellSlots ?? 4)) return { allowed: false, reason: `No Lv.${spellSlotLevel} Slots Left` };
    }
    if (limitedUseId && maxLimitedUses) {
      const used = econ.limitedUsesSpent[limitedUseId] ?? 0;
      if (used >= maxLimitedUses) return { allowed: false, reason: 'All Uses Expended' };
    }
    return { allowed: true };
  }

  executeSheetRollAndAction(
    sheet: CharacterSheetVm,
    params: {
      category: 'ability' | 'save' | 'skill' | 'initiative' | 'attack' | 'damage' | 'spell-attack' | 'feature' | 'combat-action';
      itemId: string; itemName: string;
      actionSlotCost: 'none' | 'action' | 'bonus' | 'reaction' | 'movement';
      diceSides: number; diceCount: number; modifier: number;
      modifiersBreakdown?: string;
      damageDiceCount?: number; damageDiceSides?: number; damageBonus?: number; damageType?: string;
      spellSlotLevel?: number; maxSpellSlots?: number; limitedUseId?: string; maxLimitedUses?: number;
    },
  ): void {
    const check = this.canExecuteAction(sheet.characterKey, params.actionSlotCost, params.spellSlotLevel, params.maxSpellSlots, params.limitedUseId, params.maxLimitedUses);
    if (!check.allowed) {
      this.alertify.notifyStatus(sheet.name, `Cannot Use ${params.itemName}`, `${check.reason}. Reset Turn or take a rest to restore.`, 'crimson');
      return;
    }
    const econ = this.getEconomyFor(sheet.characterKey);
    const rollMode = params.diceSides === 20 ? econ.rollMode : 'normal';
    this.patchEconomy(sheet.characterKey, {
      actionUsed: params.actionSlotCost === 'action' ? true : econ.actionUsed,
      bonusUsed: params.actionSlotCost === 'bonus' ? true : econ.bonusUsed,
      reactionUsed: params.actionSlotCost === 'reaction' ? true : econ.reactionUsed,
      rollMode: 'normal',
      spellSlotsUsed: params.spellSlotLevel && params.spellSlotLevel > 0
        ? { ...econ.spellSlotsUsed, [params.spellSlotLevel]: (econ.spellSlotsUsed[params.spellSlotLevel] ?? 0) + 1 }
        : econ.spellSlotsUsed,
      limitedUsesSpent: params.limitedUseId
        ? { ...econ.limitedUsesSpent, [params.limitedUseId]: (econ.limitedUsesSpent[params.limitedUseId] ?? 0) + 1 }
        : econ.limitedUsesSpent,
    });
    const cid = this.store.activeCampaignId();
    const targetName = this.liveTargetToken()?.name ?? this.selectedTargetName();
    const targetAc = this.liveTargetAc();
    const payload = {
      characterKey: sheet.characterKey, characterName: sheet.name, category: params.category,
      itemId: params.itemId, itemName: params.itemName, actionSlotCost: params.actionSlotCost,
      spellSlotLevel: params.spellSlotLevel ?? null, limitedUseId: params.limitedUseId ?? null,
      diceSides: params.diceSides, diceCount: params.diceCount, modifier: params.modifier,
      rollMode, targetName, targetAc,
      damageDiceCount: params.damageDiceCount ?? null, damageDiceSides: params.damageDiceSides ?? null,
      damageBonus: params.damageBonus ?? null, damageType: params.damageType ?? null,
      reactionOutcome: this.reactionOutcomeMode(),
      damageReducedBy: this.reactionOutcomeMode() === 'reduced' ? this.damageReductionAmount() : 0,
      isSessionLive: this.isSessionLive(), isEncounterLive: this.isEncounterLive(),
      sessionId: this.activeSessionId(), encounterId: this.activeEncounterId(),
      round: this.vttCombat.activeRound(),
    };
    this.http
      .post<{ roll: CharacterSheetRollLogVm; telemetry: CharacterCombatTelemetryVm }>(`/api/v2/campaigns/${cid}/character-sheet/roll-action`, payload)
      .subscribe({
        next: (res) => {
          if (res?.roll) {
            this.presentRollOutcome(sheet, { ...res.roll, timestampLabel: 'Just now' }, res.telemetry, params.modifiersBreakdown);
          } else {
            this.executeLocalFallbackRoll(sheet, params, rollMode, targetName, targetAc);
          }
        },
        error: () => this.executeLocalFallbackRoll(sheet, params, rollMode, targetName, targetAc),
      });
  }

  private executeLocalFallbackRoll(
    sheet: CharacterSheetVm,
    params: { category: string; itemName: string; actionSlotCost: string; diceSides: number; diceCount: number; modifier: number; modifiersBreakdown?: string; damageDiceCount?: number; damageDiceSides?: number; damageBonus?: number; damageType?: string },
    rollMode: 'normal' | 'advantage' | 'disadvantage',
    targetName: string,
    targetAc: number,
  ): void {
    const rawRolls = Array.from({ length: params.diceSides === 20 && rollMode !== 'normal' ? 2 : params.diceCount }, () => Math.floor(Math.random() * params.diceSides) + 1);
    const naturalDie = rollMode === 'advantage' ? Math.max(...rawRolls) : rollMode === 'disadvantage' ? Math.min(...rawRolls) : (rawRolls[0] ?? 10);
    const sum = params.diceSides === 20 && rollMode !== 'normal' ? naturalDie : rawRolls.reduce((a, b) => a + b, 0);
    const total = sum + params.modifier;
    const isNat20 = params.diceSides === 20 && naturalDie === 20;
    const isCritFail = params.diceSides === 20 && naturalDie === 1;
    const isAtk = params.category === 'attack' || params.category === 'spell-attack';
    const wasInterrupted = this.reactionOutcomeMode() === 'interrupted';
    const wasDamageReduced = this.reactionOutcomeMode() === 'reduced';
    const hit = isAtk ? !wasInterrupted && (isNat20 || (!isCritFail && total >= targetAc)) : null;
    let dmg = params.category === 'damage' ? Math.max(0, total) : 0;
    if (hit && params.damageDiceSides) {
      const cnt = (params.damageDiceCount ?? 1) * (isNat20 ? 2 : 1);
      for (let i = 0; i < cnt; i++) dmg += Math.floor(Math.random() * params.damageDiceSides) + 1;
      dmg = Math.max(1, dmg + (params.damageBonus ?? 0));
    }
    const reduced = wasInterrupted ? dmg : wasDamageReduced ? Math.min(dmg, this.damageReductionAmount()) : 0;
    if (wasInterrupted) dmg = 0;
    else if (wasDamageReduced) dmg = Math.max(0, dmg - reduced);
    const trackedInSession = this.isSessionLive();
    const trackedInEncounter = trackedInSession && this.isEncounterLive();
    const modStr = params.modifier >= 0 ? `+ ${params.modifier}` : `- ${Math.abs(params.modifier)}`;
    const formula = `${params.diceCount}d${params.diceSides} ${modStr}${rollMode !== 'normal' ? ` (${rollMode.toUpperCase()})` : ''}`;
    const msg = `${sheet.name} rolled ${params.itemName} (${formula}) = ${total} [Natural ${naturalDie}]${isNat20 ? ' [NAT 20!]' : isCritFail ? ' [CRIT FAIL!]' : ''}${hit === true ? ` -> HIT ${targetName} for ${dmg} dmg!` : hit === false ? ` -> MISSED ${targetName}.` : ''}`;
    this.presentRollOutcome(sheet, {
      id: `local-${Date.now()}`, characterKey: sheet.characterKey, characterName: sheet.name,
      category: params.category, itemName: params.itemName, formula, rawRolls, naturalDie,
      modifier: params.modifier, total, isNat20, isCritFail, hit, damageDealt: dmg,
      damageReduced: reduced, wasInterrupted, wasDamageReduced, actionSlotConsumed: params.actionSlotCost,
      trackedInSession, trackedInEncounter, summaryMessage: msg,
      sha256Digest: `SHA256:${Math.random().toString(16).slice(2, 18).toUpperCase()}`, timestampLabel: 'Just now',
    }, undefined, params.modifiersBreakdown);
  }

  private presentRollOutcome(
    sheet: CharacterSheetVm,
    logItem: CharacterSheetRollLogVm,
    telemetry?: CharacterCombatTelemetryVm,
    modifiersBreakdown?: string,
  ): void {
    this.lastRollResult.set(logItem);
    this.rollLogs.update((list) => [logItem, ...list.slice(0, 29)]);
    if (telemetry) this.telemetryByChar.update((cur) => ({ ...cur, [sheet.characterKey]: telemetry }));

    const targetName = this.liveTargetToken()?.name ?? this.selectedTargetName();
    const outcomeSubtext =
      logItem.hit === true
        ? `HIT ${targetName} (${logItem.damageDealt} dmg)`
        : logItem.hit === false
          ? `MISSED ${targetName}`
          : logItem.trackedInEncounter
            ? 'Tracked: Live Session + Encounter'
            : 'Tracked: Character Roll';

    this.alertify.notifyRoll({
      whoRolled: sheet.name,
      rollType: logItem.itemName,
      formula: logItem.formula,
      naturalDie: logItem.naturalDie,
      rawRolls: logItem.rawRolls,
      modifier: logItem.modifier,
      modifiersBreakdown: modifiersBreakdown || `Character Bonus ${logItem.modifier >= 0 ? '+' : ''}${logItem.modifier}`,
      adjustedTotal: logItem.total,
      isNat20: logItem.isNat20,
      isCritFail: logItem.isCritFail,
      outcomeSubtext,
    });

    const outcomeBadge = logItem.isNat20 ? 'CRITICAL HIT' : logItem.isCritFail ? 'CRITICAL FAIL' : logItem.hit === true ? `HIT · ${logItem.damageDealt} DMG` : logItem.hit === false ? 'MISS' : '';
    this.fullscreenDice.triggerFullScreenRoll({
      label: logItem.itemName, actorName: sheet.name, expression: logItem.formula,
      diceValues: [...logItem.rawRolls], modifier: logItem.modifier, total: logItem.total,
      outcomeBadge, isNat20: logItem.isNat20, isCritFail: logItem.isCritFail,
    });

    this.store.quickRollBanner.set(`${logItem.itemName}: ${logItem.total}${logItem.isNat20 ? ' (NAT 20!)' : ''}`);
    if (logItem.trackedInEncounter) {
      this.vttCombat.combatLogs.update((logs) => [
        {
          id: logItem.id, round: this.vttCombat.activeRound(), attackerName: sheet.name,
          targetName, actionName: logItem.itemName, distanceFeet: 30, hit: logItem.hit ?? true,
          isCritical: logItem.isNat20, damageDealt: logItem.damageDealt, message: logItem.summaryMessage,
        },
        ...logs.slice(0, 14),
      ]);
    }
    this.broadcastChannel?.postMessage({ type: 'sheet_roll', log: logItem, telemetry });
  }

  private patchEconomy(charKey: string, patch: Partial<CharacterTurnEconomyState>): void {
    const cur = this.getEconomyFor(charKey);
    const next = { ...cur, ...patch };
    this.economyByChar.update((map) => ({ ...map, [charKey]: next }));
    this.broadcastChannel?.postMessage({ type: 'sheet_economy_sync', characterKey: charKey, economy: next });
  }

  private initRealtimeSync(): void {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel('loomweaver_table_realtime_v2');
        this.broadcastChannel.onmessage = (ev) => {
          if (ev.data?.type === 'sheet_roll' && ev.data.log) {
            this.rollLogs.update((list) => [ev.data.log, ...list.filter((x) => x.id !== ev.data.log.id).slice(0, 29)]);
          } else if (ev.data?.type === 'sheet_hp_sync' && ev.data.characterKey) {
            this.hpByChar.update((m) => ({ ...m, [ev.data.characterKey]: ev.data.currentHp }));
          } else if (ev.data?.type === 'sheet_economy_sync' && ev.data.characterKey && ev.data.economy) {
            this.economyByChar.update((m) => ({ ...m, [ev.data.characterKey]: ev.data.economy }));
          }
        };
      }
    } catch {}
  }
}
