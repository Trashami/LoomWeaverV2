import { resolveDefaultTokenFromLibrary } from './vtt-token-library-resolver';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
import { CharacterSheetVm } from '../../characters/models/character-studio.models';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { CreatureCardVm } from '../../../shared/ui/creature-card/creature-card.component';
import { EncounterCardVm } from '../../../shared/ui/encounter-card/encounter-card.component';
import { NpcCardVm } from '../../../shared/ui/npc-card/npc-card.component';
import {
  ActionRuleVm,
  CombatResolutionLogVm,
  EffectTimelinePresetVm,
  DndSizeCategory,
  DND_SIZE_ORDER,
  VttConditionKey,
  VttTokenLightPreset,
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
import { FullscreenDiceOverlayService, type FullscreenDieEntry } from '../../dice/engine/fullscreen-dice-overlay.service';
import { SEED_ACTION_RULES, SEED_CREATURES, SEED_EFFECT_PRESETS, SEED_NPCS, SEED_VTT_TOKENS } from './vtt-combat.seed';
import { VttPartyAndActionsService } from './vtt-party-and-actions.service';
import { snapToFiveFootGrid } from '../engine/vtt-los-and-grid.engine';
import type { CombatResolutionResult, EncounterCompletionResult } from '../models/vtt-server.models';
import type { LwMonsterSummaryVm } from '../../../shared/ui/public-api';

export interface VttRemoteEffectCue {
  readonly seq: number;
  readonly preset: EffectTimelinePresetVm;
  readonly startPos: { x: number; z: number };
  readonly endPos: { x: number; z: number };
  readonly targetKeys: readonly string[];
}

const LIGHT_PRESET_MAP: Record<string, { emitsLight: boolean; bright: number; dim: number; color: string; flicker: number }> = {
  none: { emitsLight: false, bright: 0, dim: 0, color: '#ff9922', flicker: 0 },
  torch: { emitsLight: true, bright: 20, dim: 40, color: '#ff9922', flicker: 0.45 },
  'lantern-hooded': { emitsLight: true, bright: 30, dim: 60, color: '#ffc838', flicker: 0.2 },
  lantern_hooded: { emitsLight: true, bright: 30, dim: 60, color: '#ffc838', flicker: 0.2 },
  'lantern-bullseye': { emitsLight: true, bright: 60, dim: 120, color: '#ffe380', flicker: 0.12 },
  lantern_bullseye: { emitsLight: true, bright: 60, dim: 120, color: '#ffe380', flicker: 0.12 },
  candle: { emitsLight: true, bright: 5, dim: 10, color: '#ffaa44', flicker: 0.55 },
  'spell-light': { emitsLight: true, bright: 20, dim: 40, color: '#49e892', flicker: 0.08 },
  spell_light: { emitsLight: true, bright: 20, dim: 40, color: '#49e892', flicker: 0.08 },
  daylight: { emitsLight: true, bright: 60, dim: 120, color: '#fffbe8', flicker: 0 },
};

@Injectable({ providedIn: 'root' })
export class VttCombatService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly fullscreenDice = inject(FullscreenDiceOverlayService);
  private readonly characterStudio = inject(CharacterStudioService);
  private readonly partyAndActions = inject(VttPartyAndActionsService);

  readonly activeRound = signal<number>(2);
  readonly activeTurnIndex = signal<number>(0);
  readonly activeEncounterId = signal<string>('enc-ruined-chapel');
  readonly selectedAttackerKey = signal<string>('1:Character:char-dal');
  readonly selectedTargetKey = signal<string>('1:Encounter:vamp-1');
  readonly xpAwardBanner = signal<string | null>(null);
  readonly remoteEffectCue = signal<VttRemoteEffectCue | null>(null);

  readonly sessions = signal<readonly CampaignSessionVm[]>(SEED_CAMPAIGN_SESSIONS);
  readonly activeSessionId = signal<string>('all');
  readonly monsterTokenAssets = signal<readonly MonsterTokenAssetVm[]>(SEED_MONSTER_TOKEN_ASSETS);
  readonly defaultPartyRoster = signal(SEED_PARTY_ROSTER_SLOTS);
  readonly defaultSessionNpcs = signal(SEED_SESSION_NPC_SLOTS);
  readonly encounterDetails = signal<readonly EncounterDetailVm[]>([...SEED_ENCOUNTER_DETAILS, ...SEED_ADDITIONAL_ENCOUNTERS]);

  readonly encounters = computed<readonly EncounterCardVm[]>(() => {
    const filtered = this.encounterDetails().filter((e) => e.campaignId === this.store.activeCampaignId());
    return filtered.length > 0 ? filtered : this.encounterDetails();
  });

  readonly sessionsForActiveCampaign = computed<readonly CampaignSessionVm[]>(() => {
    const cid = this.store.activeCampaignId();
    const filtered = this.sessions().filter((s) => s.campaignId === cid);
    return filtered.length > 0 ? filtered : this.sessions();
  });

  readonly activeLiveEncounter = computed<EncounterDetailVm | null>(() => {
    const list = this.encounters() as readonly EncounterDetailVm[];
    return list.find((e) => e.id === this.activeEncounterId()) ?? list[0] ?? null;
  });

  readonly creatures = signal<readonly CreatureCardVm[]>(SEED_CREATURES);
  readonly monsterCatalog = this.creatures;
  readonly npcs = signal<readonly NpcCardVm[]>(SEED_NPCS);
  readonly effectPresets = signal<readonly EffectTimelinePresetVm[]>(SEED_EFFECT_PRESETS);
  readonly actionRules = signal<readonly ActionRuleVm[]>(SEED_ACTION_RULES);
  readonly tokens = signal<readonly VttTokenVm[]>(SEED_VTT_TOKENS);
  readonly activeConditions = signal<readonly VttActiveConditionVm[]>(SEED_VTT_ACTIVE_CONDITIONS);

  readonly combatLogs = signal<readonly CombatResolutionLogVm[]>([
    {
      id: 'log-init', round: 2, attackerName: 'Arcane Screen VTT', targetName: 'Ruined Chapel',
      actionName: 'Round 2 Active', distanceFeet: 0, hit: true, isCritical: false, damageDealt: 0,
      message: 'Live Encounter active. Select an Attacker and Target from the Initiative Order or VTT canvas.',
    },
  ]);

  readonly selectedAttacker = computed(() => this.tokens().find((t) => t.key === this.selectedAttackerKey()) ?? this.tokens()[0]);
  readonly selectedTarget = computed(() => this.tokens().find((t) => t.key === this.selectedTargetKey()) ?? this.tokens()[2] ?? this.tokens()[0]);
  readonly targetDistanceFeet = computed(() => {
    const a = this.selectedAttacker();
    const b = this.selectedTarget();
    return a && b ? Math.round(Math.hypot(a.x - b.x, a.z - b.z) * 2.5 * 10) / 10 : 0;
  });
  readonly partyTokensInScene = computed(() => this.tokens().filter((t) => t.faction === 'party'));
  readonly hostileTokensInScene = computed(() => this.tokens().filter((t) => t.faction === 'hostile'));

  constructor() {
    if (this.tokens().length === 0 && this.encounterDetails().length > 0) {
      this.launchEncounterIntoVtt(this.activeEncounterId());
    } else {
      this.ensureCampaignPartyTokens();
      this.snapAllTokensToActiveGrid();
    }
    effect(() => {
      const sheets = this.characterStudio.campaignSheets();
      const cid = this.store.activeCampaignId() || 1;
      if (sheets.length > 0) untracked(() => this.ensureCampaignPartyTokens(cid));
    });
  }

  private getSavedPositionsMap(): Record<string, { x: number; z: number; facingY?: number }> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`lw.vtt.tokenPositions.${this.store.activeCampaignId() || 1}.${this.activeEncounterId() || 'default'}`);
      return raw ? (JSON.parse(raw) as Record<string, { x: number; z: number; facingY?: number }>) : {};
    } catch { return {}; }
  }

  saveTokenPositionsToStorage(list: readonly VttTokenVm[] = this.tokens()): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const map: Record<string, { x: number; z: number; facingY?: number }> = {};
      for (const t of list) map[t.key] = { x: t.x, z: t.z, facingY: t.facingY };
      localStorage.setItem(`lw.vtt.tokenPositions.${this.store.activeCampaignId() || 1}.${this.activeEncounterId() || 'default'}`, JSON.stringify(map));
    } catch {}
  }

  snapAllTokensToActiveGrid(): void {
    const saved = this.getSavedPositionsMap();
    this.tokens.update((list) => {
      let changed = false;
      const next = list.map((t) => {
        const entry = saved[t.key];
        const snapped = snapToFiveFootGrid(entry ?? { x: t.x, z: t.z });
        const nextFacing = entry?.facingY ?? t.facingY;
        if (Math.abs(snapped.x - t.x) > 0.001 || Math.abs(snapped.z - t.z) > 0.001 || nextFacing !== t.facingY) {
          changed = true;
          return { ...t, x: snapped.x, z: snapped.z, facingY: nextFacing };
        }
        return t;
      });
      if (changed) this.saveTokenPositionsToStorage(next);
      return changed ? next : list;
    });
  }

  ensureCampaignPartyTokens(campaignId: number = this.store.activeCampaignId() || 1): void {
    const saved = this.getSavedPositionsMap();
    const merged = this.partyAndActions.mergeCampaignPartyIntoTokens(this.tokens(), campaignId).map((t) => ({ ...t, ...snapToFiveFootGrid(saved[t.key] ?? { x: t.x, z: t.z }) }));
    if (merged.length > 0) {
      this.tokens.set(merged);
      if (!merged.some((t) => t.key === this.selectedAttackerKey())) this.selectedAttackerKey.set(merged[0].key);
    }
  }

  saveEncounterDetail(detail: EncounterDetailVm): void {
    this.encounterDetails.update((list) =>
      list.some((e) => e.id === detail.id) ? list.map((e) => (e.id === detail.id ? detail : e)) : [detail, ...list],
    );
    this.activeEncounterId.set(detail.id);
    this.http.post(`/api/v2/campaigns/${this.store.activeCampaignId()}/encounters`, detail).subscribe({ error: () => {} });
  }

  toggleObjective(encounterId: string, objectiveId: string): void {
    this.encounterDetails.update((list) =>
      list.map((enc) => (enc.id !== encounterId ? enc : { ...enc, objectives: enc.objectives.map((o) => (o.id === objectiveId ? { ...o, completed: !o.completed } : o)) })),
    );
  }

  toggleTrapArmed(encounterId: string, trapId: string): void {
    this.encounterDetails.update((list) =>
      list.map((enc) => (enc.id !== encounterId ? enc : { ...enc, traps: enc.traps.map((t) => (t.id === trapId ? { ...t, armed: !t.armed } : t)) })),
    );
  }

  launchEncounterIntoVtt(encounterId: string): void {
    const enc = this.encounterDetails().find((e) => e.id === encounterId) ?? this.encounterDetails()[0];
    if (!enc) { this.ensureCampaignPartyTokens(); return; }
    this.activeEncounterId.set(enc.id);
    this.activeRound.set(1);
    this.activeTurnIndex.set(0);

    const npcTokens: VttTokenVm[] = enc.sessionNpcs.filter((n) => n.includedInEncounter).map((n, idx) => {
      const faction = (n.disposition === 'Hostile' ? 'hostile' : 'ally') as 'ally' | 'hostile';
      const resolved = resolveDefaultTokenFromLibrary({ name: n.name, roleLabel: n.role, faction, avatarUrl: n.avatarUrl });
      const snapped = snapToFiveFootGrid({ x: -4 + idx * 2, z: -1 });
      return {
        key: n.compositeKey, name: n.name, roleLabel: `Session NPC · ${n.disposition}`, faction,
        initiative: 15 - idx * 2, currentHp: 42, maxHp: 42, armorClass: 15, x: snapped.x, z: snapped.z,
        colorHex: n.disposition === 'Hostile' ? '#ef4444' : '#38bdf8',
        actionUsed: false, bonusUsed: false, reactionUsed: false, movementFeet: 30,
        avatarUrl: resolved.avatarUrl, glbUrl: resolved.glbUrl,
      };
    });

    const monsterTokens: VttTokenVm[] = [];
    enc.monsters.forEach((slot, sIdx) => {
      const instances = Math.min(4, Math.max(1, slot.count));
      for (let i = 0; i < instances; i++) {
        const suffix = instances > 1 ? ` ${String.fromCharCode(65 + i)}` : '';
        const resolved = resolveDefaultTokenFromLibrary({ name: slot.name, roleLabel: slot.disposition, faction: 'hostile', avatarUrl: slot.tokenPreviewUrl, glbUrl: slot.tokenGlbUrl });
        const snapped = snapToFiveFootGrid({ x: 4 + sIdx * 2 + (i % 2) * 1.5, z: -3 + i * 2.5 });
        monsterTokens.push({
          key: `1:Encounter:${slot.slotId}-${i}`, name: `${slot.name}${suffix}`, roleLabel: `${slot.disposition} · CR ${slot.challengeRating}`,
          faction: 'hostile', initiative: Math.max(4, 19 - sIdx * 3 - i), currentHp: slot.maxHp, maxHp: slot.maxHp, armorClass: slot.armorClass,
          x: snapped.x, z: snapped.z, colorHex: '#ef4444',
          actionUsed: false, bonusUsed: false, reactionUsed: false, movementFeet: slot.speedFeet,
          avatarUrl: resolved.avatarUrl, glbUrl: resolved.glbUrl,
        });
      }
    });

    const saved = this.getSavedPositionsMap();
    const combined = this.partyAndActions
      .mergeCampaignPartyIntoTokens([...npcTokens, ...monsterTokens], this.store.activeCampaignId() || 1)
      .map((t) => {
        const pos = saved[t.key] ?? { x: t.x, z: t.z };
        const snapped = snapToFiveFootGrid(pos);
        return { ...t, x: snapped.x, z: snapped.z };
      })
      .sort((a, b) => b.initiative - a.initiative);
    if (combined.length > 0) {
      this.tokens.set(combined);
      this.selectedAttackerKey.set(combined[0].key);
      this.selectedTargetKey.set((combined.find((t) => t.faction === 'hostile') ?? combined[0]).key);
    }
  }

  advanceTurn(): void {
    const total = this.tokens().length;
    if (total === 0) return;
    const next = (this.activeTurnIndex() + 1) % total;
    if (next === 0) {
      this.activeRound.update((r) => r + 1);
      this.tokens.update((list) => list.map((t) => ({ ...t, actionUsed: false, bonusUsed: false, reactionUsed: false })));
    }
    this.activeTurnIndex.set(next);
    this.selectedAttackerKey.set(this.tokens()[next].key);
  }

  toggleEconomySlot(key: string, slot: 'actionUsed' | 'bonusUsed' | 'reactionUsed'): void {
    this.tokens.update((list) => list.map((t) => (t.key === key ? { ...t, [slot]: !t[slot] } : t)));
  }

  adjustCombatantHp(key: string, delta: number): void {
    this.tokens.update((list) => list.map((t) => (t.key === key ? { ...t, currentHp: Math.max(0, Math.min(t.maxHp, t.currentHp + delta)) } : t)));
  }
  adjustTokenHp(key: string, delta: number): void { this.adjustCombatantHp(key, delta); }

  toggleTokenCondition(tokenKey: string, cond: VttConditionKey): void {
    this.tokens.update((list) =>
      list.map((t) => {
        if (t.key !== tokenKey) return t;
        const curr = t.conditions ?? [];
        const next = curr.includes(cond) ? curr.filter((c) => c !== cond) : [...curr, cond];
        return { ...t, conditions: next };
      }),
    );
  }

  setTokenSizeCategory(tokenKey: string, sizeCategory: DndSizeCategory): void {
    this.tokens.update((list) => list.map((t) => (t.key === tokenKey ? { ...t, sizeCategory } : t)));
  }

  cycleTokenSize(tokenKey: string, direction: 'increase' | 'decrease'): void {
    this.tokens.update((list) =>
      list.map((t) => {
        if (t.key !== tokenKey) return t;
        const idx = DND_SIZE_ORDER.indexOf((t.sizeCategory || 'medium') as DndSizeCategory);
        const nextIdx = direction === 'increase' ? Math.min(DND_SIZE_ORDER.length - 1, (idx >= 0 ? idx : 2) + 1) : Math.max(0, (idx >= 0 ? idx : 2) - 1);
        return { ...t, sizeCategory: DND_SIZE_ORDER[nextIdx] };
      }),
    );
  }

  setTokenLightPreset(tokenKey: string, preset: VttTokenLightPreset, customColorHex?: string): void {
    const cfg = LIGHT_PRESET_MAP[preset] ?? LIGHT_PRESET_MAP['none'];
    this.tokens.update((list) =>
      list.map((t) => (t.key === tokenKey ? { ...t, lightPreset: preset, emitsLight: cfg.emitsLight, lightBrightFeet: cfg.bright, lightDimFeet: cfg.dim, lightColorHex: customColorHex || cfg.color, lightFlicker: cfg.flicker } : t)),
    );
  }

  setTokenVision(tokenKey: string, sightFeet: number, darkvisionFeet: number): void {
    this.tokens.update((list) => list.map((t) => (t.key === tokenKey ? { ...t, sightFeet, darkvisionFeet } : t)));
  }

  updateTokenAppearance(tokenKey: string, patch: Partial<VttTokenVm>): void {
    this.tokens.update((list) => list.map((t) => (t.key === tokenKey ? { ...t, ...patch } : t)));
  }

  removeTokenFromVtt(tokenKey: string): void {
    this.tokens.update((list) => list.filter((t) => t.key !== tokenKey));
  }

  addCampaignCharacterToMap(idOrSheet: string | CharacterSheetVm): void {
    const cid = this.store.activeCampaignId() || 1;
    const sheet = typeof idOrSheet === 'string'
      ? this.characterStudio.campaignSheets().find((s) => s.characterKey === idOrSheet || s.compositeKey === idOrSheet)
      : idOrSheet;
    this.ensureCampaignPartyTokens(cid);
    if (!sheet) return;
    const found = this.tokens().find((t) => t.name === sheet.name || t.key.endsWith(`:${sheet.characterKey}`));
    if (found) this.selectedAttackerKey.set(found.key);
  }

  addNpcToEncounter(npcId: string): void {
    const npc = this.npcs().find((n) => n.compositeKey === npcId || n.name === npcId);
    if (!npc) return;
    const faction = (npc.disposition === 'Hostile' ? 'hostile' : 'ally') as 'ally' | 'hostile';
    const resolved = resolveDefaultTokenFromLibrary({ name: npc.name, roleLabel: npc.title, faction });
    const id = `1:NPC:${npc.compositeKey}-${Date.now().toString(36).slice(-3)}`;
    const snapped = snapToFiveFootGrid({ x: 1, z: -2 });
    this.tokens.update((list) => [
      ...list,
      {
        key: id, name: npc.name, roleLabel: `${npc.title} · ${npc.disposition}`, faction,
        initiative: 14, currentHp: 38, maxHp: 38, armorClass: 15, x: snapped.x, z: snapped.z,
        colorHex: faction === 'hostile' ? '#ef4444' : '#38bdf8',
        actionUsed: false, bonusUsed: false, reactionUsed: false, movementFeet: 30,
        sightFeet: 60, darkvisionFeet: 0, avatarUrl: resolved.avatarUrl, glbUrl: resolved.glbUrl,
      },
    ]);
  }

  addBestiaryMonsterToMap(monster: LwMonsterSummaryVm, count: number = 1): void {
    const cid = this.store.activeCampaignId() || 1;
    const qty = Math.max(1, Math.min(8, count));
    const sizeLower = (monster.size || 'medium').toLowerCase() as DndSizeCategory;
    const sizeCategory: DndSizeCategory = DND_SIZE_ORDER.includes(sizeLower) ? sizeLower : 'medium';
    const resolved = resolveDefaultTokenFromLibrary({ name: monster.name, roleLabel: monster.creatureType, faction: 'hostile' });

    const additions: VttTokenVm[] = [];
    for (let i = 0; i < qty; i++) {
      const suffix = qty > 1 ? ` ${String.fromCharCode(65 + i)}` : '';
      const id = `${cid}:Encounter:bst-${monster.key}-${Date.now().toString(36).slice(-4)}-${i}`;
      const snapped = snapToFiveFootGrid({ x: Math.random() * 8 + 2 + i * 1.2, z: Math.random() * 8 - 4 });
      additions.push({
        key: id, name: `${monster.name}${suffix}`, roleLabel: `${monster.creatureType} · CR ${monster.challengeRating}`,
        faction: 'hostile', initiative: Math.floor(Math.random() * 14) + 8,
        currentHp: Math.max(1, monster.hitPoints || 28), maxHp: Math.max(1, monster.hitPoints || 28),
        armorClass: monster.armorClass || 13, x: snapped.x,
        z: snapped.z, colorHex: '#ef4444',
        actionUsed: false, bonusUsed: false, reactionUsed: false, movementFeet: 30,
        sightFeet: 60, darkvisionFeet: 60, avatarUrl: resolved.avatarUrl || monster.tokenUrl, glbUrl: resolved.glbUrl, sizeCategory,
      });
    }
    this.tokens.update((list) => [...list, ...additions]);
    if (additions[0]) this.selectedTargetKey.set(additions[0].key);
  }

  async executeActionOnTarget(rule: ActionRuleVm): Promise<{
    preset: EffectTimelinePresetVm;
    startPos: { x: number; z: number };
    endPos: { x: number; z: number };
  } | null> {
    const attacker = this.selectedAttacker();
    const target = this.selectedTarget();
    if (!attacker || !target) return null;
    const slot = rule.actionCost === '1 Bonus Action' ? 'bonus' : rule.actionCost === '1 Reaction' ? 'reaction' : 'action';
    let result: CombatResolutionResult;
    try {
      result = await firstValueFrom(
        this.http.post<CombatResolutionResult>(`/api/v2/campaigns/${this.store.activeCampaignId()}/combat/resolve`, {
          attackerKey: attacker.key, targetKey: target.key, actionName: rule.name, actionSlot: slot,
          rangeFeet: rule.rangeFeet, attackBonus: rule.attackBonus, saveDc: rule.saveDc,
          damageDiceCount: rule.damageDiceCount, damageDiceSides: rule.damageDiceSides,
          damageBonus: rule.damageBonus, particlePresetId: rule.linkedEffectPresetId, viewerRole: '',
        }),
      );
    } catch {
      const dist = Math.round(Math.hypot(attacker.x - target.x, attacker.z - target.z) * 2.5 * 10) / 10;
      const inRange = dist <= Math.max(5, rule.rangeFeet);
      const d20 = Math.floor(Math.random() * 20) + 1;
      const isCrit = d20 === 20;
      const total = d20 + rule.attackBonus;
      const hit = inRange && (isCrit || (d20 !== 1 && total >= target.armorClass));
      const dmg = hit ? Math.max(1, rule.damageDiceCount * Math.ceil(rule.damageDiceSides / 2) + rule.damageBonus) : 0;
      const rem = Math.max(0, target.currentHp - dmg);
      result = {
        distanceFeet: dist, inRange, rawD20: d20, totalAttackOrSave: total,
        hit, isCritical: isCrit, damageDealt: dmg, targetRemainingHp: rem,
      };
    }

    const d20 = result.rawD20;
    const isCrit = result.isCritical;
    const totalRoll = result.totalAttackOrSave;
    const hit = result.hit;
    const dmg = result.damageDealt;
    const allEntries: FullscreenDieEntry[] = [{ dieType: 'd20', value: d20 }];
    const badgeText = !result.inRange ? 'OUT OF RANGE' : isCrit ? `CRITICAL HIT · ${dmg} DMG` : d20 === 1 ? 'CRITICAL FAIL' : hit ? `HIT (AC ${target.armorClass}) · ${dmg} DMG` : `MISS (AC ${target.armorClass})`;

    this.fullscreenDice.triggerFullScreenRoll({
      label: `${rule.name} vs ${target.name}`, actorName: attacker.name, expression: `1d20+${rule.attackBonus}`,
      diceValues: [d20], diceEntries: allEntries, modifier: rule.attackBonus, total: totalRoll,
      outcomeBadge: badgeText, isNat20: isCrit, isCritFail: d20 === 1,
    });

    const slotKey = rule.actionCost === '1 Bonus Action' ? 'bonusUsed' : rule.actionCost === '1 Reaction' ? 'reactionUsed' : 'actionUsed';
    this.tokens.update((list) =>
      list.map((t) => (t.key === attacker.key ? { ...t, [slotKey]: true } : t.key === target.key ? { ...t, currentHp: result.targetRemainingHp } : t)),
    );

    const msg = hit
      ? `${attacker.name} -> ${target.name} [${rule.name}]: Rolled ${d20}+${rule.attackBonus}=${totalRoll} vs AC ${target.armorClass} -> HIT for ${dmg} dmg! (${result.targetRemainingHp}/${target.maxHp} HP)`
      : `${attacker.name} -> ${target.name} [${rule.name}]: Rolled ${d20}+${rule.attackBonus}=${totalRoll} vs AC ${target.armorClass} -> MISS.`;

    this.combatLogs.update((logs) => [
      { id: `log-${Date.now()}`, round: this.activeRound(), attackerName: attacker.name, targetName: target.name, actionName: rule.name, distanceFeet: result.distanceFeet, hit, isCritical: isCrit, damageDealt: dmg, message: msg },
      ...logs.slice(0, 7),
    ]);

    const preset = this.effectPresets().find((p) => p.id === rule.linkedEffectPresetId) ?? this.effectPresets()[0];
    return { preset, startPos: { x: attacker.x, z: attacker.z }, endPos: { x: target.x, z: target.z } };
  }

  applyRemoteTokenMove(key: string, x: number, z: number, facingY?: number): void {
    const snapped = snapToFiveFootGrid({ x, z });
    this.tokens.update((list) => {
      const next = list.map((t) => {
        if (t.key !== key) return t;
        const dx = snapped.x - t.x;
        const dz = snapped.z - t.z;
        const nextFacing =
          facingY !== undefined
            ? facingY
            : Math.hypot(dx, dz) > 0.08
              ? Math.atan2(-dx, -dz)
              : t.facingY;
        return { ...t, x: snapped.x, z: snapped.z, facingY: nextFacing };
      });
      this.saveTokenPositionsToStorage(next);
      return next;
    });
  }

  applyRemoteTurn(activeKey: string, round: number): void {
    this.activeRound.set(round);
    const index = this.tokens().findIndex((t) => t.key === activeKey);
    if (index < 0) return;
    this.activeTurnIndex.set(index);
    this.selectedAttackerKey.set(activeKey);
  }

  applyRemoteEffect(presetId: string, startX: number, startZ: number, endX: number, endZ: number, targetKeys: readonly string[]): void {
    const preset = this.effectPresets().find((p) => p.id === presetId);
    if (!preset) return;
    this.remoteEffectCue.set({ seq: (this.remoteEffectCue()?.seq ?? 0) + 1, preset, startPos: { x: startX, z: startZ }, endPos: { x: endX, z: endZ }, targetKeys });
  }

  spawnCreatureIntoVtt(creature: CreatureCardVm): void {
    const id = `1:Encounter:spawn-${Date.now().toString().slice(-4)}`;
    const resolved = resolveDefaultTokenFromLibrary({ name: creature.name, roleLabel: creature.creatureType, faction: 'hostile' });
    const snapped = snapToFiveFootGrid({ x: Math.random() * 10 + 2, z: Math.random() * 10 - 5 });
    this.tokens.update((list) => [
      ...list,
      {
        key: id, name: creature.name, roleLabel: `Hostile · CR ${creature.challengeRating}`, faction: 'hostile',
        initiative: Math.floor(Math.random() * 12) + 10, currentHp: creature.maxHp, maxHp: creature.maxHp, armorClass: creature.armorClass,
        x: snapped.x, z: snapped.z,
        colorHex: '#ef5d72', actionUsed: false, bonusUsed: false, reactionUsed: false, movementFeet: creature.speedFeet,
        avatarUrl: resolved.avatarUrl, glbUrl: resolved.glbUrl,
      },
    ]);
    this.selectedTargetKey.set(id);
  }

  concludeEncounterAndAwardXp(encounterId: string): void {
    const enc = this.encounterDetails().find((e) => e.id === encounterId) ?? this.encounterDetails()[0];
    if (!enc || enc.completed || enc.campaignId !== this.store.activeCampaignId() || !this.store.isGmForActiveCampaign() || this.store.viewerRole() !== 'gm') return;
    const partyCount = Math.max(1, enc.partyMembers.filter((p) => p.includedInEncounter).length);
    this.http
      .post<EncounterCompletionResult>(`/api/v2/campaigns/${enc.campaignId}/encounters/${encodeURIComponent(enc.id)}/complete`, {
        encounterId: enc.id, totalXp: enc.totalXp, partySize: partyCount, viewerRole: '',
      })
      .subscribe({
        next: (result) => {
          this.encounterDetails.update((list) => list.map((e) => (e.id === enc.id ? { ...e, completed: true, status: 'Completed' } : e)));
          this.xpAwardBanner.set(`Encounter Concluded: ${result.summary}`);
        },
        error: (err: { error?: { error?: string } }) => this.xpAwardBanner.set(err.error?.error ?? 'XP could not be awarded.'),
      });
  }
}
