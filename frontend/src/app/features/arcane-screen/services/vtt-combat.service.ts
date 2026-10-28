import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { CreatureCardVm } from '../../../shared/ui/creature-card/creature-card.component';
import { EncounterCardVm } from '../../../shared/ui/encounter-card/encounter-card.component';
import { NpcCardVm } from '../../../shared/ui/npc-card/npc-card.component';
import {
  ActionRuleVm,
  CombatResolutionLogVm,
  EffectTimelinePresetVm,
  VttTokenVm,
} from '../../effects/engine/effect-timeline.contract';
import {
  CampaignSessionVm,
  EncounterDetailVm,
  MonsterTokenAssetVm,
  VttActiveConditionVm,
} from '../../encounters/models/encounter-studio.models';
import {
  SEED_CAMPAIGN_SESSIONS,
  SEED_MONSTER_TOKEN_ASSETS,
  SEED_PARTY_ROSTER_SLOTS,
  SEED_SESSION_NPC_SLOTS,
  SEED_VTT_ACTIVE_CONDITIONS,
} from '../../encounters/services/encounter-studio-assets.seed';
import { SEED_ENCOUNTER_DETAILS } from '../../encounters/services/encounter-studio.seed';
import { SEED_ADDITIONAL_ENCOUNTERS } from '../../encounters/services/encounter-studio-roster.seed';
import {
  FullscreenDiceOverlayService,
  type FullscreenDieEntry,
} from '../../dice/engine/fullscreen-dice-overlay.service';
import type { DicePolyhedronType } from '../../dice/engine/models';
import {
  SEED_ACTION_RULES,
  SEED_CREATURES,
  SEED_EFFECT_PRESETS,
  SEED_NPCS,
  SEED_VTT_TOKENS,
} from './vtt-combat.seed';

@Injectable({ providedIn: 'root' })
export class VttCombatService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly fullscreenDice = inject(FullscreenDiceOverlayService);

  readonly activeRound = signal<number>(2);
  readonly activeTurnIndex = signal<number>(0);
  readonly activeEncounterId = signal<string>('enc-ruined-chapel');
  readonly selectedAttackerKey = signal<string>('1:Character:char-dal');
  readonly selectedTargetKey = signal<string>('1:Encounter:vamp-1');
  readonly xpAwardBanner = signal<string | null>(null);

  readonly sessions = signal<readonly CampaignSessionVm[]>(SEED_CAMPAIGN_SESSIONS);
  readonly activeSessionId = signal<string>('all');
  readonly monsterTokenAssets = signal<readonly MonsterTokenAssetVm[]>(SEED_MONSTER_TOKEN_ASSETS);
  readonly defaultPartyRoster = signal(SEED_PARTY_ROSTER_SLOTS);
  readonly defaultSessionNpcs = signal(SEED_SESSION_NPC_SLOTS);

  readonly encounterDetails = signal<readonly EncounterDetailVm[]>([
    ...SEED_ENCOUNTER_DETAILS,
    ...SEED_ADDITIONAL_ENCOUNTERS,
  ]);

  readonly encounters = computed<readonly EncounterCardVm[]>(() =>
    this.encounterDetails().filter((e) => e.campaignId === this.store.activeCampaignId() || e.campaignId === 1),
  );

  readonly sessionsForActiveCampaign = computed<readonly CampaignSessionVm[]>(() => {
    const cid = this.store.activeCampaignId();
    const list = this.sessions().filter((s) => s.campaignId === cid);
    return list.length > 0 ? list : this.sessions().filter((s) => s.campaignId === 1);
  });

  readonly activeLiveEncounter = computed<EncounterDetailVm>(
    () =>
      this.encounterDetails().find((e) => e.id === this.activeEncounterId()) ??
      this.encounterDetails()[0],
  );

  readonly creatures = signal<readonly CreatureCardVm[]>(SEED_CREATURES);
  readonly npcs = signal<readonly NpcCardVm[]>(SEED_NPCS);
  readonly effectPresets = signal<readonly EffectTimelinePresetVm[]>(SEED_EFFECT_PRESETS);
  readonly actionRules = signal<readonly ActionRuleVm[]>(SEED_ACTION_RULES);
  readonly tokens = signal<readonly VttTokenVm[]>(SEED_VTT_TOKENS);
  readonly activeConditions = signal<readonly VttActiveConditionVm[]>(SEED_VTT_ACTIVE_CONDITIONS);

  readonly combatLogs = signal<readonly CombatResolutionLogVm[]>([
    {
      id: 'log-init',
      round: 2,
      attackerName: 'Arcane Screen VTT',
      targetName: 'Ruined Chapel',
      actionName: 'Round 2 Active',
      distanceFeet: 0,
      hit: true,
      isCritical: false,
      damageDealt: 0,
      message: 'Live Encounter active. Select an Attacker and Target from the Initiative Order or VTT canvas.',
    },
  ]);

  readonly selectedAttacker = computed(
    () => this.tokens().find((t) => t.key === this.selectedAttackerKey()) ?? this.tokens()[0],
  );

  readonly selectedTarget = computed(
    () => this.tokens().find((t) => t.key === this.selectedTargetKey()) ?? this.tokens()[2] ?? this.tokens()[0],
  );

  readonly targetDistanceFeet = computed(() => {
    const a = this.selectedAttacker();
    const b = this.selectedTarget();
    if (!a || !b) return 0;
    return Math.round(Math.hypot(a.x - b.x, a.z - b.z) * 2.5 * 10) / 10;
  });

  readonly partyTokensInScene = computed(() =>
    this.tokens().filter((t) => t.faction === 'party'),
  );

  readonly hostileTokensInScene = computed(() =>
    this.tokens().filter((t) => t.faction === 'hostile'),
  );

  saveEncounterDetail(detail: EncounterDetailVm): void {
    this.encounterDetails.update((list) => {
      const exists = list.some((e) => e.id === detail.id);
      if (exists) {
        return list.map((e) => (e.id === detail.id ? detail : e));
      }
      return [detail, ...list];
    });
    this.activeEncounterId.set(detail.id);
    this.http
      .post(`/api/v2/campaigns/${this.store.activeCampaignId()}/encounters`, detail)
      .subscribe({ error: () => {} });
  }

  toggleObjective(encounterId: string, objectiveId: string): void {
    this.encounterDetails.update((list) =>
      list.map((enc) => {
        if (enc.id !== encounterId) return enc;
        return {
          ...enc,
          objectives: enc.objectives.map((o) =>
            o.id === objectiveId ? { ...o, completed: !o.completed } : o,
          ),
        };
      }),
    );
  }

  toggleTrapArmed(encounterId: string, trapId: string): void {
    this.encounterDetails.update((list) =>
      list.map((enc) => {
        if (enc.id !== encounterId) return enc;
        return {
          ...enc,
          traps: enc.traps.map((t) => (t.id === trapId ? { ...t, armed: !t.armed } : t)),
        };
      }),
    );
  }

  launchEncounterIntoVtt(encounterId: string): void {
    const enc =
      this.encounterDetails().find((e) => e.id === encounterId) ?? this.encounterDetails()[0];
    this.activeEncounterId.set(enc.id);
    this.activeRound.set(1);
    this.activeTurnIndex.set(0);

    const partyTokens: VttTokenVm[] = enc.partyMembers
      .filter((p) => p.includedInEncounter)
      .map((p, idx) => ({
        key: p.compositeKey,
        name: p.name,
        roleLabel: `Party · ${p.classSummary}`,
        faction: 'party' as const,
        initiative: 20 - idx * 2,
        currentHp: p.currentHp,
        maxHp: p.maxHp,
        armorClass: p.armorClass,
        x: -6 + idx * 1.5,
        z: -3 + (idx % 2) * 3,
        colorHex: '#2ed39a',
        actionUsed: false,
        bonusUsed: false,
        reactionUsed: false,
        movementFeet: 30,
      }));

    const npcTokens: VttTokenVm[] = enc.sessionNpcs
      .filter((n) => n.includedInEncounter)
      .map((n, idx) => ({
        key: n.compositeKey,
        name: n.name,
        roleLabel: `Session NPC · ${n.disposition}`,
        faction: (n.disposition === 'Hostile' ? 'hostile' : 'party') as 'party' | 'hostile',
        initiative: 15 - idx * 2,
        currentHp: 42,
        maxHp: 42,
        armorClass: 15,
        x: -4 + idx * 2,
        z: 2,
        colorHex: n.disposition === 'Hostile' ? '#ef5d72' : '#d4a853',
        actionUsed: false,
        bonusUsed: false,
        reactionUsed: false,
        movementFeet: 30,
      }));

    const monsterTokens: VttTokenVm[] = [];
    enc.monsters.forEach((slot, sIdx) => {
      const instances = Math.min(4, Math.max(1, slot.count));
      for (let i = 0; i < instances; i++) {
        const suffix = instances > 1 ? ` ${String.fromCharCode(65 + i)}` : '';
        monsterTokens.push({
          key: `1:Encounter:${slot.slotId}-${i}`,
          name: `${slot.name}${suffix}`,
          roleLabel: `${slot.disposition} · CR ${slot.challengeRating} · ${slot.tokenKind.toUpperCase()}`,
          faction: 'hostile',
          initiative: Math.max(4, 19 - sIdx * 3 - i),
          currentHp: slot.maxHp,
          maxHp: slot.maxHp,
          armorClass: slot.armorClass,
          x: 4 + sIdx * 2 + (i % 2) * 1.5,
          z: -3 + i * 2.5,
          colorHex: '#ef5d72',
          actionUsed: false,
          bonusUsed: false,
          reactionUsed: false,
          movementFeet: slot.speedFeet,
        });
      }
    });

    const combined = [...partyTokens, ...npcTokens, ...monsterTokens].sort(
      (a, b) => b.initiative - a.initiative,
    );

    if (combined.length > 0) {
      this.tokens.set(combined);
      this.selectedAttackerKey.set(combined[0].key);
      const firstHostile = combined.find((t) => t.faction === 'hostile') ?? combined[0];
      this.selectedTargetKey.set(firstHostile.key);
    }

    this.combatLogs.update((logs) => [
      {
        id: `log-launch-${Date.now()}`,
        round: 1,
        attackerName: 'Arcane Screen VTT',
        targetName: enc.name,
        actionName: 'Encounter Launched',
        distanceFeet: 0,
        hit: true,
        isCritical: false,
        damageDealt: 0,
        message: `Loaded "${enc.name}" (${enc.sessionTitle}) onto "${enc.sceneName}" with ${partyTokens.length} players, ${npcTokens.length} session NPCs, ${monsterTokens.length} monster tokens, and ${enc.traps.length} traps.`,
      },
      ...logs.slice(0, 7),
    ]);
  }

  advanceTurn(): void {
    const total = this.tokens().length;
    if (total === 0) return;
    const next = (this.activeTurnIndex() + 1) % total;
    if (next === 0) {
      this.activeRound.update((r) => r + 1);
      this.tokens.update((list) =>
        list.map((t) => ({ ...t, actionUsed: false, bonusUsed: false, reactionUsed: false })),
      );
    }
    this.activeTurnIndex.set(next);
    this.selectedAttackerKey.set(this.tokens()[next].key);
  }

  toggleEconomySlot(key: string, slot: 'actionUsed' | 'bonusUsed' | 'reactionUsed'): void {
    this.tokens.update((list) =>
      list.map((t) => (t.key === key ? { ...t, [slot]: !t[slot] } : t)),
    );
  }

  adjustCombatantHp(key: string, delta: number): void {
    this.tokens.update((list) =>
      list.map((t) =>
        t.key === key
          ? { ...t, currentHp: Math.max(0, Math.min(t.maxHp, t.currentHp + delta)) }
          : t,
      ),
    );
  }

  executeActionOnTarget(rule: ActionRuleVm): {
    preset: EffectTimelinePresetVm;
    startPos: { x: number; z: number };
    endPos: { x: number; z: number };
  } {
    const attacker = this.selectedAttacker();
    const target = this.selectedTarget();
    const dist = this.targetDistanceFeet();
    const inRange = dist <= rule.rangeFeet;

    const d20 = Math.floor(Math.random() * 20) + 1;
    const isCrit = d20 === 20;
    const totalRoll = d20 + rule.attackBonus;
    const hit = inRange && (isCrit || (d20 !== 1 && totalRoll >= target.armorClass));

    let dmg = 0;
    const dmgEntries: FullscreenDieEntry[] = [];
    if (hit) {
      const dice = isCrit ? rule.damageDiceCount * 2 : rule.damageDiceCount;
      const dmgDieType = (`d${rule.damageDiceSides}` as DicePolyhedronType) || 'd8';
      for (let i = 0; i < dice; i++) {
        const r = Math.floor(Math.random() * rule.damageDiceSides) + 1;
        dmg += r;
        dmgEntries.push({ dieType: dmgDieType, value: r });
      }
      dmg += rule.damageBonus;
    }

    const allEntries: FullscreenDieEntry[] = [{ dieType: 'd20', value: d20 }, ...dmgEntries];
    const badgeText = !inRange
      ? 'OUT OF RANGE'
      : isCrit
        ? `CRITICAL HIT · ${dmg} DMG`
        : d20 === 1
          ? 'CRITICAL FAIL'
          : hit
            ? `HIT (AC ${target.armorClass}) · ${dmg} DMG`
            : `MISS (AC ${target.armorClass})`;

    this.fullscreenDice.triggerFullScreenRoll({
      label: `${rule.name} vs ${target.name}`,
      actorName: attacker.name,
      expression: `1d20+${rule.attackBonus}`,
      diceValues: [d20],
      diceEntries: allEntries,
      modifier: rule.attackBonus,
      total: totalRoll,
      outcomeBadge: badgeText,
      isNat20: isCrit,
      isCritFail: d20 === 1,
    });

    const nextHp = Math.max(0, target.currentHp - dmg);
    const slotKey =
      rule.actionCost === '1 Bonus Action'
        ? 'bonusUsed'
        : rule.actionCost === '1 Reaction'
          ? 'reactionUsed'
          : 'actionUsed';

    this.tokens.update((list) =>
      list.map((t) => {
        if (t.key === attacker.key) return { ...t, [slotKey]: true };
        if (t.key === target.key) return { ...t, currentHp: nextHp };
        return t;
      }),
    );

    const msg = !inRange
      ? `${attacker.name} tried ${rule.name}, but ${target.name} is at ${dist}ft (max ${rule.rangeFeet}ft).`
      : hit
        ? `${attacker.name} -> ${target.name} [${rule.name}]: Rolled ${d20}+${rule.attackBonus}=${totalRoll} vs AC ${target.armorClass} -> HIT for ${dmg} dmg! (${nextHp}/${target.maxHp} HP)`
        : `${attacker.name} -> ${target.name} [${rule.name}]: Rolled ${d20}+${rule.attackBonus}=${totalRoll} vs AC ${target.armorClass} -> MISS.`;

    this.combatLogs.update((logs) => [
      {
        id: `log-${Date.now()}`,
        round: this.activeRound(),
        attackerName: attacker.name,
        targetName: target.name,
        actionName: rule.name,
        distanceFeet: dist,
        hit,
        isCritical: isCrit,
        damageDealt: dmg,
        message: msg,
      },
      ...logs.slice(0, 7),
    ]);

    const preset =
      this.effectPresets().find((p) => p.id === rule.linkedEffectPresetId) ??
      this.effectPresets()[0];

    return {
      preset,
      startPos: { x: attacker.x, z: attacker.z },
      endPos: { x: target.x, z: target.z },
    };
  }

  spawnCreatureIntoVtt(creature: CreatureCardVm): void {
    const id = `1:Encounter:spawn-${Date.now().toString().slice(-4)}`;
    const rx = Math.round((Math.random() * 10 + 2) * 10) / 10;
    const rz = Math.round((Math.random() * 10 - 5) * 10) / 10;
    this.tokens.update((list) => [
      ...list,
      {
        key: id,
        name: creature.name,
        roleLabel: `Hostile · CR ${creature.challengeRating}`,
        faction: 'hostile',
        initiative: Math.floor(Math.random() * 12) + 10,
        currentHp: creature.maxHp,
        maxHp: creature.maxHp,
        armorClass: creature.armorClass,
        x: rx,
        z: rz,
        colorHex: '#ef5d72',
        actionUsed: false,
        bonusUsed: false,
        reactionUsed: false,
        movementFeet: creature.speedFeet,
      },
    ]);
    this.selectedTargetKey.set(id);
  }

  concludeEncounterAndAwardXp(encounterId: string): void {
    const enc =
      this.encounterDetails().find((e) => e.id === encounterId) ?? this.encounterDetails()[0];
    if (!enc || enc.completed || enc.campaignId !== this.store.activeCampaignId() ||
        !this.store.isGmForActiveCampaign() || this.store.viewerRole() !== 'gm') return;
    const partyCount = Math.max(1, enc.partyMembers.filter((p) => p.includedInEncounter).length);
    const perHero = Math.floor(enc.totalXp / partyCount);
    this.encounterDetails.update((list) =>
      list.map((e) => (e.id === enc.id ? { ...e, completed: true, status: 'Completed' } : e)),
    );
    this.xpAwardBanner.set(
      `Encounter Concluded: Awarded ${enc.totalXp.toLocaleString()} XP (${perHero.toLocaleString()} XP each to ${partyCount} party heroes). Level-Up Ready in Character Studio!`,
    );
    // The Loom: record that the party met (and defeated) each creature, where and when (server enforces DM-only).
    this.http
      .post(`/api/v2/campaigns/${enc.campaignId}/bestiary/encounters/concluded?role=${this.store.viewerRole()}`, {
        encounterId: enc.id, encounterLabel: enc.name, sessionId: enc.sessionId, sessionLabel: enc.sessionTitle,
        locationName: enc.sceneName || enc.environment,
        witnessCharacterKeys: enc.partyMembers.filter((p) => p.includedInEncounter).map((p) => p.compositeKey),
        monsters: enc.monsters.map((m) => ({ monsterKey: m.creatureId, monsterName: m.name, outcome: 'defeated' })),
      })
      .subscribe({ error: () => this.xpAwardBanner.update(message => `${message} Monster history could not be saved; record the meeting in the Bestiary.`) });
  }

  addCustomActionRule(
    name: string,
    category: string,
    cost: ActionRuleVm['actionCost'],
    rangeFeet: number,
    whenText: string,
    ifText: string,
    thenText: string,
    formula: string,
    effectId: string,
    isGm: boolean,
  ): void {
    const cleanName = name.trim() || 'Custom Cinth Artificer Strike';
    const created: ActionRuleVm = {
      id: `act-${Date.now()}`,
      name: cleanName,
      category,
      actionCost: cost,
      rangeFeet,
      triggerWhen: whenText,
      conditionIf: ifText,
      executeThen: thenText,
      attackBonus: 9,
      saveDc: 16,
      damageDiceCount: 3,
      damageDiceSides: 8,
      damageBonus: 5,
      damageFormula: formula,
      linkedEffectPresetId: effectId,
      canonStatus: isGm ? 'approved' : 'draft',
    };
    this.actionRules.update((prev) => [created, ...prev]);
  }
}
