import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdventureGuideService } from '../../../core/services/adventure-guide.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { TableRealtimeSyncService } from '../../../core/services/table-realtime-sync.service';
import { EquipmentLoadoutItemVm } from '../../characters/models/character-studio.models';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
import { VttAssignedLootItemVm, VttLootTableId, VttTokenVm } from '../../effects/engine/effect-timeline.contract';
import {
  VTT_ASSIGNABLE_LOOT_PRESETS,
  VTT_LOOT_TABLE_OPTIONS,
  VttCharacterLootLedgerSummaryVm,
  VttEncounterRecapAndLootStateVm,
  VttLootClaimRecordVm,
  VttLootPoolItemVm,
  buildUpdatedLoomSummaryHelper,
} from '../models/vtt-loot.models';
import { VttCombatService } from './vtt-combat.service';
import {
  buildCharacterLedgerHelper,
  buildGoldPouchEquipmentItem,
  computeCombatantRecapStatsHelper,
  executeDefeatedBodiesLootRollHelper,
} from './vtt-loot-roller.helper';

const LOOT_HISTORY_STORAGE_PREFIX = 'lw_vtt_encounter_loot_history_v2_';

@Injectable({ providedIn: 'root' })
export class VttLootAndRecapService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly auth = inject(AuthSessionService);
  private readonly vtt = inject(VttCombatService);
  private readonly characterStudio = inject(CharacterStudioService);
  private readonly adventureGuide = inject(AdventureGuideService);
  private readonly realtime = inject(TableRealtimeSyncService);
  private readonly alertify = inject(LwAlertifyService);

  readonly lootTableOptions = VTT_LOOT_TABLE_OPTIONS;
  readonly assignablePresets = VTT_ASSIGNABLE_LOOT_PRESETS;
  readonly recapState = signal<VttEncounterRecapAndLootStateVm | null>(null);
  readonly localModalDismissed = signal<boolean>(false);
  readonly selectedClaimCharacterKey = signal<string>('char-dal');
  readonly customGoldClaimInput = signal<number>(1);
  readonly itemClaimQuantities = signal<Readonly<Record<string, number>>>({});
  readonly historyByCampaign = signal<readonly VttEncounterRecapAndLootStateVm[]>([]);

  readonly isModalVisible = computed<boolean>(() => {
    const st = this.recapState();
    return !!st && st.modalOpen && !this.localModalDismissed();
  });

  readonly partyCharacters = computed(() => {
    const sheets = this.characterStudio.campaignSheets();
    if (sheets.length > 0) {
      return sheets.map((s) => ({
        characterKey: s.characterKey,
        name: s.name,
        classLabel: `${s.ancestryOrClan} ${s.classOrArchetype}`,
        ownerUsername: s.ownerUsername || '',
      }));
    }
    return this.vtt.tokens().filter((t) => t.faction === 'party').map((t) => ({
      characterKey: t.key.startsWith('pc-') ? t.key.replace(/^pc-/, 'char-') : t.key,
      name: t.name,
      classLabel: t.roleLabel,
      ownerUsername: '',
    }));
  });

  readonly activeClaimCharacter = computed(() => {
    const list = this.partyCharacters();
    return list.find((c) => c.characterKey === this.selectedClaimCharacterKey()) ?? list[0] ?? {
      characterKey: 'char-dal',
      name: 'Dal Riata',
      classLabel: 'Party Adventurer',
      ownerUsername: '',
    };
  });

  readonly ledgerByCharacter = computed<readonly VttCharacterLootLedgerSummaryVm[]>(() => {
    const st = this.recapState();
    return st ? buildCharacterLedgerHelper(st.claims, this.partyCharacters()) : [];
  });

  readonly equalGoldShareAmount = computed<number>(() => {
    const st = this.recapState();
    const count = Math.max(1, this.partyCharacters().length);
    return !st || st.remainingGoldGp <= 0 ? 0 : Math.max(1, Math.floor(st.remainingGoldGp / count));
  });

  constructor() {
    this.realtime.vttEvents.pipe(takeUntilDestroyed()).subscribe((evt) => {
      if (evt.type === 'encounter_recap_sync') this.applyRemoteRecapSync(evt.payloadJson);
      else if (evt.type === 'token_loot_updated') this.applyRemoteTokenLootPatch(evt.payloadJson);
    });
    effect(() => {
      const cid = this.store.activeCampaignId() || 1;
      this.restoreLocalLootHistory(cid);
      this.fetchServerLootState(cid);
      this.syncDefaultClaimCharacter();
    }, { allowSignalWrites: true });
  }

  private syncDefaultClaimCharacter(): void {
    const owned = this.characterStudio.userOwnedSheets();
    const pick = owned[0]?.characterKey ?? this.partyCharacters()[0]?.characterKey;
    if (pick) this.selectedClaimCharacterKey.set(pick);
  }

  setTokenLootTable(tokenKey: string, lootTableId: VttLootTableId): void {
    this.patchTokenLoot(tokenKey, { lootTableId });
  }

  setTokenAssignedGold(tokenKey: string, goldGp: number): void {
    this.patchTokenLoot(tokenKey, { assignedGoldGp: Math.max(0, Math.min(100000, Math.round(Number(goldGp) || 0))) });
  }

  adjustTokenAssignedGold(tokenKey: string, deltaGp: number): void {
    const tok = this.vtt.tokens().find((t) => t.key === tokenKey);
    if (tok) this.setTokenAssignedGold(tokenKey, (tok.assignedGoldGp ?? 0) + deltaGp);
  }

  addTokenAssignedPresetItem(tokenKey: string, presetId: string): void {
    const tok = this.vtt.tokens().find((t) => t.key === tokenKey);
    const preset = this.assignablePresets.find((p) => p.id === presetId);
    if (!tok || !preset) return;
    const existing = tok.assignedLootItems ?? [];
    const idx = existing.findIndex((i) => i.name.toLowerCase() === preset.name.toLowerCase());
    const nextItems = idx >= 0
      ? existing.map((item, i) => (i === idx ? { ...item, quantity: item.quantity + preset.quantity } : item))
      : [...existing, { ...preset, id: `${preset.id}-${Date.now().toString(36).slice(-4)}` }];
    this.patchTokenLoot(tokenKey, { assignedLootItems: nextItems });
  }

  addTokenCustomLootItem(tokenKey: string, name: string, quantity: number, valueGp: number): void {
    const cleanName = name.trim();
    const tok = this.vtt.tokens().find((t) => t.key === tokenKey);
    if (!cleanName || !tok) return;
    const gp = Math.max(0, Math.round(Number(valueGp) || 10));
    const item: VttAssignedLootItemVm = {
      id: `custom-loot-${Date.now().toString(36).slice(-5)}`,
      name: cleanName,
      category: 'Treasure',
      rarity: gp >= 250 ? 'Rare' : gp >= 75 ? 'Uncommon' : 'Common',
      quantity: Math.max(1, Math.round(Number(quantity) || 1)),
      valueGp: gp,
      statsLabel: `Assigned token treasure (${gp} GP)`,
    };
    this.patchTokenLoot(tokenKey, { assignedLootItems: [...(tok.assignedLootItems ?? []), item] });
  }

  removeTokenAssignedItem(tokenKey: string, itemId: string): void {
    const tok = this.vtt.tokens().find((t) => t.key === tokenKey);
    if (tok) this.patchTokenLoot(tokenKey, { assignedLootItems: (tok.assignedLootItems ?? []).filter((i) => i.id !== itemId) });
  }

  private patchTokenLoot(tokenKey: string, patch: Partial<Pick<VttTokenVm, 'lootTableId' | 'assignedGoldGp' | 'assignedLootItems' | 'lootRolled'>>): void {
    this.vtt.tokens.update((list) => list.map((t) => (t.key === tokenKey ? { ...t, ...patch } : t)));
    void this.realtime.publishVtt(this.store.activeCampaignId() || 1, 'token_loot_updated', this.store.activeUsername() || 'GM', { tokenKey, patch });
  }

  private applyRemoteTokenLootPatch(payloadJson: string): void {
    try {
      const parsed = JSON.parse(payloadJson) as { tokenKey?: string; patch?: Partial<VttTokenVm> };
      if (parsed?.tokenKey && parsed.patch) {
        this.vtt.tokens.update((list) => list.map((t) => (t.key === parsed.tokenKey ? { ...t, ...parsed.patch } : t)));
      }
    } catch {}
  }

  endEncounterAndOpenRecap(autoRollLoot = false): void {
    const built = this.buildFreshRecapState();
    this.localModalDismissed.set(false);
    this.recapState.set(built);
    if (!built.xpAwardedToSheets && built.totalXpAwarded > 0 && this.store.viewerRole() === 'gm') {
      this.vtt.concludeEncounterAndAwardXp(built.encounterId);
    }
    if (autoRollLoot) {
      this.rollLootForDefeatedBodies();
      return;
    }
    this.broadcastAndPersistState(built);
  }

  reopenModal(): void {
    this.localModalDismissed.set(false);
    if (!this.recapState()) this.endEncounterAndOpenRecap(false);
  }

  closeModalLocal(): void {
    this.localModalDismissed.set(true);
  }

  toggleRollTableSelection(tableId: VttLootTableId): void {
    if (tableId === 'none') return;
    const st = this.recapState() ?? this.buildFreshRecapState();
    const cur = st.selectedRollTables;
    const nextTables = cur.includes(tableId) ? (cur.length > 1 ? cur.filter((id) => id !== tableId) : cur) : [...cur, tableId];
    this.recapState.set({ ...st, selectedRollTables: nextTables });
  }

  rollLootForDefeatedBodies(): void {
    const baseState = this.recapState() ?? this.buildFreshRecapState();
    const nextState = executeDefeatedBodiesLootRollHelper(baseState, this.vtt.tokens());
    this.localModalDismissed.set(false);
    this.recapState.set(nextState);
    this.broadcastAndPersistState(nextState);
  }

  addBonusPoolLoot(goldDeltaGp: number, presetId?: string): void {
    const st = this.recapState() ?? this.buildFreshRecapState();
    const addedGold = Math.max(0, Math.round(Number(goldDeltaGp) || 0));
    let items = [...st.items];
    const preset = presetId ? this.assignablePresets.find((p) => p.id === presetId) : undefined;
    if (preset) {
      const idx = items.findIndex((i) => i.name.toLowerCase() === preset.name.toLowerCase());
      if (idx >= 0) {
        items[idx] = { ...items[idx], totalQuantity: items[idx].totalQuantity + preset.quantity, quantityRemaining: items[idx].quantityRemaining + preset.quantity };
      } else {
        items = [...items, { id: `pool-bonus-${Date.now().toString(36).slice(-4)}`, name: preset.name, category: preset.category, rarity: preset.rarity, totalQuantity: preset.quantity, quantityRemaining: preset.quantity, valueGp: preset.valueGp, statsLabel: preset.statsLabel, sourceBodyNames: ['DM Bonus Spoils'] }];
      }
    }
    const nextState = buildUpdatedLoomSummaryHelper({
      ...st, modalOpen: true, lootRevealed: true, totalGoldGp: st.totalGoldGp + addedGold, remainingGoldGp: st.remainingGoldGp + addedGold, items, updatedAtIso: new Date().toISOString(),
    });
    this.recapState.set(nextState);
    this.broadcastAndPersistState(nextState);
  }

  claimGold(requestedGp: number, explicitCharacterKey?: string): void {
    const st = this.recapState();
    if (!st || st.remainingGoldGp <= 0) return;
    const amount = Math.max(1, Math.min(st.remainingGoldGp, Math.floor(Number(requestedGp) || 1)));
    const char = this.partyCharacters().find((c) => c.characterKey === (explicitCharacterKey ?? this.selectedClaimCharacterKey())) ?? this.activeClaimCharacter();
    const claim: VttLootClaimRecordVm = {
      id: `claim-gp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestampIso: new Date().toISOString(),
      characterKey: char.characterKey, characterName: char.name, claimedByUsername: this.auth.activeProfile().displayName || this.store.activeUsername() || char.name,
      kind: 'gold', goldGp: amount, quantity: amount,
    };
    this.awardGoldToCharacterSheet(char.characterKey, amount, st.sessionNumber, st.encounterTitle);
    const nextState = buildUpdatedLoomSummaryHelper({ ...st, remainingGoldGp: Math.max(0, st.remainingGoldGp - amount), claims: [claim, ...st.claims], updatedAtIso: new Date().toISOString() });
    this.recapState.set(nextState);
    this.broadcastAndPersistState(nextState);
  }

  splitRemainingGoldEvenly(): void {
    const st = this.recapState();
    const party = this.partyCharacters();
    if (!st || st.remainingGoldGp <= 0 || party.length === 0) return;
    const baseShare = Math.floor(st.remainingGoldGp / party.length);
    let remainder = st.remainingGoldGp % party.length;
    const newClaims: VttLootClaimRecordVm[] = [];
    for (const member of party) {
      const amount = baseShare + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      if (amount <= 0) continue;
      this.awardGoldToCharacterSheet(member.characterKey, amount, st.sessionNumber, st.encounterTitle);
      newClaims.push({
        id: `claim-split-${member.characterKey}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, timestampIso: new Date().toISOString(),
        characterKey: member.characterKey, characterName: member.name, claimedByUsername: this.store.activeUsername() || 'Party Split',
        kind: 'gold', goldGp: amount, quantity: amount,
      });
    }
    const nextState = buildUpdatedLoomSummaryHelper({ ...st, remainingGoldGp: 0, claims: [...newClaims, ...st.claims], updatedAtIso: new Date().toISOString() });
    this.recapState.set(nextState);
    this.broadcastAndPersistState(nextState);
  }

  setItemClaimQuantity(poolItemId: string, qty: number, maxQty: number): void {
    this.itemClaimQuantities.update((cur) => ({ ...cur, [poolItemId]: Math.max(1, Math.min(maxQty, Math.floor(Number(qty) || 1))) }));
  }

  getItemClaimQuantity(poolItem: VttLootPoolItemVm): number {
    return Math.max(1, Math.min(poolItem.quantityRemaining, this.itemClaimQuantities()[poolItem.id] ?? 1));
  }

  claimLootItem(poolItemId: string, requestedQuantity = 1, explicitCharacterKey?: string): void {
    const st = this.recapState();
    const poolItem = st?.items.find((i) => i.id === poolItemId);
    if (!st || !poolItem || poolItem.quantityRemaining <= 0) return;
    const qty = Math.max(1, Math.min(poolItem.quantityRemaining, Math.floor(Number(requestedQuantity) || 1)));
    const char = this.partyCharacters().find((c) => c.characterKey === (explicitCharacterKey ?? this.selectedClaimCharacterKey())) ?? this.activeClaimCharacter();
    const slotMap: Record<string, EquipmentLoadoutItemVm['slot']> = {
      Weapon: 'Main Hand', Armor: 'Armor', Shield: 'Off Hand', Wondrous: 'Focus', Consumable: 'Gear', Potion: 'Gear', Scroll: 'Focus', Gear: 'Gear', Treasure: 'Gear',
    };
    this.characterStudio.addEquipmentToCharacter(char.characterKey, {
      id: `loot-${poolItem.id}`, name: qty > 1 ? `${poolItem.name} (x${qty})` : poolItem.name,
      slot: slotMap[poolItem.category] ?? 'Gear',
      summary: `${poolItem.statsLabel} · Value: ${poolItem.valueGp * qty} GP`,
      bonusLabel: poolItem.statsLabel, acBonus: 0, attackBonus: 0,
      rarity: poolItem.rarity, equipped: false, valueGp: poolItem.valueGp * qty, entitlement: 'free',
    }, false);
    const claim: VttLootClaimRecordVm = {
      id: `claim-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestampIso: new Date().toISOString(),
      characterKey: char.characterKey, characterName: char.name, claimedByUsername: this.auth.activeProfile().displayName || this.store.activeUsername() || char.name,
      kind: 'item', goldGp: 0, poolItemId: poolItem.id, itemName: poolItem.name, itemCategory: poolItem.category, itemRarity: poolItem.rarity, itemStatsLabel: poolItem.statsLabel, itemValueGp: poolItem.valueGp, quantity: qty,
    };
    const items = st.items.map((i) => (i.id === poolItemId ? { ...i, quantityRemaining: Math.max(0, i.quantityRemaining - qty) } : i));
    const nextState = buildUpdatedLoomSummaryHelper({ ...st, items, claims: [claim, ...st.claims], updatedAtIso: new Date().toISOString() });
    this.recapState.set(nextState);
    this.broadcastAndPersistState(nextState);
    this.alertify.notifyStatus(char.name, 'Loot Added to Inventory', `Claimed ${qty > 1 ? `${qty}x ` : ''}${poolItem.name}.`, 'emerald');
  }

  undoClaim(claimId: string): void {
    const st = this.recapState();
    const target = st?.claims.find((c) => c.id === claimId);
    if (!st || !target) return;
    const remainingGoldGp = target.kind === 'gold' ? Math.min(st.totalGoldGp, st.remainingGoldGp + target.goldGp) : st.remainingGoldGp;
    const items = target.poolItemId ? st.items.map((i) => (i.id === target.poolItemId ? { ...i, quantityRemaining: Math.min(i.totalQuantity, i.quantityRemaining + target.quantity) } : i)) : st.items;
    const nextState = buildUpdatedLoomSummaryHelper({ ...st, remainingGoldGp, items, claims: st.claims.filter((c) => c.id !== claimId), updatedAtIso: new Date().toISOString() });
    this.recapState.set(nextState);
    this.broadcastAndPersistState(nextState);
  }

  private buildFreshRecapState(): VttEncounterRecapAndLootStateVm {
    const cid = this.store.activeCampaignId() || 1;
    const activeSess = this.store.activeSession();
    const sessionNumber = activeSess?.sessionNumber ?? this.store.activeCampaign().currentSessionNumber ?? 5;
    const sessionId = activeSess?.sessionId || `session-${sessionNumber}`;
    const sessionTitle = activeSess?.title || this.adventureGuide.guide().headerTitle || `Session ${sessionNumber}`;
    const liveEnc = this.vtt.activeLiveEncounter();
    const encounterId = liveEnc?.id || this.vtt.activeEncounterId() || 'enc-dungeon';
    const encounterTitle = liveEnc?.name || this.adventureGuide.guide().assignedBattlemap?.title || 'Dungeon Encounter';
    const tokens = this.vtt.tokens();
    const hostiles = tokens.filter((t) => t.faction === 'hostile');
    const defeated = hostiles.filter((t) => t.currentHp <= 0);
    const { combatantStats, totalDamageDealt, totalCriticalHits, mvpCombatantName } = computeCombatantRecapStatsHelper(tokens, this.vtt.combatLogs());
    const partyCount = Math.max(1, this.partyCharacters().length);
    const rawXp = (liveEnc as { xpReward?: number } | null)?.xpReward ?? Math.max(450, (defeated.length || hostiles.length || 3) * 250);
    const existing = this.recapState();
    return buildUpdatedLoomSummaryHelper({
      recapId: existing?.recapId || `recap-c${cid}-s${sessionNumber}-${encounterId}`, campaignId: cid, sessionId, sessionNumber, sessionTitle, encounterId, encounterTitle,
      modalOpen: true, lootRevealed: existing?.lootRevealed ?? false, roundsElapsed: Math.max(1, this.vtt.activeRound()),
      totalXpAwarded: rawXp, perHeroXp: Math.floor(rawXp / partyCount), xpAwardedToSheets: existing?.xpAwardedToSheets ?? false,
      totalDamageDealt, totalCriticalHits, mvpCombatantName, defeatedBodyCount: defeated.length || hostiles.length,
      defeatedBodyNames: (defeated.length > 0 ? defeated : hostiles).map((t) => t.name), combatantStats,
      selectedRollTables: existing?.selectedRollTables ?? ['auto-cr'], totalGoldGp: existing?.totalGoldGp ?? 0, remainingGoldGp: existing?.remainingGoldGp ?? 0,
      items: existing?.items ?? [], bodyBreakdowns: existing?.bodyBreakdowns ?? [], claims: existing?.claims ?? [], loomSummaryText: '', updatedAtIso: new Date().toISOString(),
    });
  }

  private awardGoldToCharacterSheet(characterKey: string, goldGp: number, sessionNumber: number, encounterTitle: string): void {
    this.characterStudio.sheets.update((list) =>
      list.map((sheet) => {
        if (sheet.characterKey !== characterKey) return sheet;
        const { equipment, newTotalGp } = buildGoldPouchEquipmentItem(sheet.characterKey, sheet.equipment, goldGp, sessionNumber, encounterTitle);
        return { ...sheet, equipment, historyEvents: [`Session ${sessionNumber} (${encounterTitle}): Claimed ${goldGp} GP (Coin Pouch total: ${newTotalGp} GP).`, ...sheet.historyEvents] };
      }),
    );
  }

  private broadcastAndPersistState(state: VttEncounterRecapAndLootStateVm): void {
    const cid = state.campaignId || this.store.activeCampaignId() || 1;
    this.upsertLocalHistory(cid, state);
    this.registerRecapInLoomStore(state);
    void this.realtime.publishVtt(cid, 'encounter_recap_sync', this.store.activeUsername() || 'Table Seat', state);
    this.http.post(`/api/v2/campaigns/${cid}/encounters/loot-sync`, {
      recapId: state.recapId, sessionNumber: state.sessionNumber, sessionId: state.sessionId, sessionTitle: state.sessionTitle,
      encounterId: state.encounterId, encounterTitle: state.encounterTitle, defeatedBodyCount: state.defeatedBodyCount,
      totalGoldGp: state.totalGoldGp, remainingGoldGp: state.remainingGoldGp, loomSummaryText: state.loomSummaryText, stateJson: state,
    }).subscribe({ error: () => {} });
  }

  private applyRemoteRecapSync(payloadJson: string): void {
    try {
      const incoming = JSON.parse(payloadJson) as VttEncounterRecapAndLootStateVm;
      if (!incoming?.recapId) return;
      const cur = this.recapState();
      if (incoming.modalOpen && (!cur || !cur.modalOpen || incoming.lootRevealed !== cur.lootRevealed)) this.localModalDismissed.set(false);
      this.recapState.set(incoming);
      this.upsertLocalHistory(incoming.campaignId || this.store.activeCampaignId() || 1, incoming);
      this.registerRecapInLoomStore(incoming);
    } catch {}
  }

  private registerRecapInLoomStore(state: VttEncounterRecapAndLootStateVm): void {
    const cid = state.campaignId || 1;
    const compositeKey = `${cid}:EncounterLoot:${state.recapId}`;
    this.store.registerEntity({
      compositeKey, entityKey: state.recapId, campaignId: cid, entityType: 'Lore',
      name: `Session ${state.sessionNumber} Loot & Battle Ledger · ${state.encounterTitle}`,
      subtitle: `${state.totalGoldGp} GP Total · ${state.defeatedBodyCount} Defeated · Session ${state.sessionNumber}`,
      visibility: 'players', canonStatus: 'approved', summary: state.loomSummaryText, routeLink: '/arcane-screen',
    });
    this.store.attachElementToSession({
      sessionId: state.sessionId, elementKind: 'Encounter', targetKey: compositeKey, elementId: state.recapId,
      title: `Session ${state.sessionNumber} Loot & Recap · ${state.encounterTitle}`,
      subtitle: `${state.totalGoldGp} GP Looted (${state.totalGoldGp - state.remainingGoldGp} GP Claimed)`,
      summary: state.loomSummaryText, routeLink: '/arcane-screen', visibility: 'players',
    });
  }

  private upsertLocalHistory(campaignId: number, state: VttEncounterRecapAndLootStateVm): void {
    this.historyByCampaign.update((cur) => {
      const next = [state, ...cur.filter((x) => x.recapId !== state.recapId)].slice(0, 25);
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(`${LOOT_HISTORY_STORAGE_PREFIX}${campaignId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  private restoreLocalLootHistory(campaignId: number): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`${LOOT_HISTORY_STORAGE_PREFIX}${campaignId}`) : null;
      const parsed = raw ? (JSON.parse(raw) as VttEncounterRecapAndLootStateVm[]) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.historyByCampaign.set(parsed);
        for (const item of parsed) this.registerRecapInLoomStore(item);
      }
    } catch {}
  }

  private fetchServerLootState(campaignId: number): void {
    if (campaignId <= 0) return;
    this.http.get<{ active?: VttEncounterRecapAndLootStateVm | null }>(`/api/v2/campaigns/${campaignId}/encounters/loot-state`).subscribe({
      next: (res) => { if (res?.active?.recapId) { this.recapState.set(res.active); this.registerRecapInLoomStore(res.active); } },
      error: () => {},
    });
  }
}
