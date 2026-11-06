import { EquipmentLoadoutItemVm } from '../../characters/models/character-studio.models';
import {
  CombatResolutionLogVm,
  VttAssignedLootItemVm,
  VttLootTableId,
  VttTokenVm,
} from '../../effects/engine/effect-timeline.contract';
import {
  VTT_ASSIGNABLE_LOOT_PRESETS,
  VttCharacterLootLedgerSummaryVm,
  VttCombatantRecapStatVm,
  VttDefeatedBodyLootSummaryVm,
  VttEncounterRecapAndLootStateVm,
  VttLootClaimRecordVm,
  VttLootPoolItemVm,
  buildUpdatedLoomSummaryHelper,
  rollSingleTableForTokenBody,
} from '../models/vtt-loot.models';

export function buildCharacterLedgerHelper(
  claims: readonly VttLootClaimRecordVm[],
  party: readonly { characterKey: string; name: string }[],
): readonly VttCharacterLootLedgerSummaryVm[] {
  const map = new Map<
    string,
    {
      characterKey: string;
      characterName: string;
      totalGoldGp: number;
      items: { claimId: string; itemName: string; quantity: number; rarity: string }[];
    }
  >();
  for (const p of party) {
    map.set(p.characterKey, { characterKey: p.characterKey, characterName: p.name, totalGoldGp: 0, items: [] });
  }
  for (const c of claims) {
    let entry = map.get(c.characterKey);
    if (!entry) {
      entry = { characterKey: c.characterKey, characterName: c.characterName, totalGoldGp: 0, items: [] };
      map.set(c.characterKey, entry);
    }
    if (c.kind === 'gold') entry.totalGoldGp += c.goldGp;
    else if (c.itemName) {
      entry.items.push({ claimId: c.id, itemName: c.itemName, quantity: c.quantity, rarity: c.itemRarity || 'Common' });
    }
  }
  return Array.from(map.values());
}

export function executeDefeatedBodiesLootRollHelper(
  baseState: VttEncounterRecapAndLootStateVm,
  tokens: readonly VttTokenVm[],
): VttEncounterRecapAndLootStateVm {
  const hostiles = tokens.filter((t) => t.faction === 'hostile');
  const defeatedHostiles = hostiles.filter((t) => t.currentHp <= 0);
  const bodiesToRoll = defeatedHostiles.length > 0 ? defeatedHostiles : hostiles;
  const selectedTables = baseState.selectedRollTables.length > 0 ? baseState.selectedRollTables : (['auto-cr'] as const);

  let rolledGoldTotal = 0;
  const itemMap = new Map<string, VttLootPoolItemVm>();
  const breakdowns: VttDefeatedBodyLootSummaryVm[] = [];

  const mergeItemIntoPool = (item: VttAssignedLootItemVm, bodyName: string): void => {
    const key = item.name.trim().toLowerCase();
    const existing = itemMap.get(key);
    if (existing) {
      const sources = existing.sourceBodyNames.includes(bodyName)
        ? existing.sourceBodyNames
        : [...existing.sourceBodyNames, bodyName];
      itemMap.set(key, {
        ...existing,
        totalQuantity: existing.totalQuantity + item.quantity,
        quantityRemaining: existing.quantityRemaining + item.quantity,
        sourceBodyNames: sources,
      });
    } else {
      itemMap.set(key, {
        id: `pool-${item.id}-${Math.random().toString(36).slice(2, 6)}`,
        name: item.name,
        category: item.category,
        rarity: item.rarity,
        totalQuantity: item.quantity,
        quantityRemaining: item.quantity,
        valueGp: item.valueGp,
        statsLabel: item.statsLabel,
        sourceBodyNames: [bodyName],
      });
    }
  };

  for (const body of bodiesToRoll) {
    let bodyGold = body.assignedGoldGp ?? 0;
    const bodyItemLabels: string[] = [];
    for (const guaranteed of body.assignedLootItems ?? []) {
      mergeItemIntoPool(guaranteed, body.name);
      bodyItemLabels.push(guaranteed.quantity > 1 ? `${guaranteed.quantity}x ${guaranteed.name}` : guaranteed.name);
    }
    const tokenTable = body.lootTableId ?? 'auto-cr';
    if (tokenTable !== 'none') {
      const tablesForThisBody = Array.from(new Set<VttLootTableId>([tokenTable, ...selectedTables]));
      for (const tbl of tablesForThisBody) {
        const rolled = rollSingleTableForTokenBody(body, tbl);
        bodyGold += rolled.goldGp;
        for (const dropped of rolled.items) {
          mergeItemIntoPool(dropped, body.name);
          bodyItemLabels.push(dropped.quantity > 1 ? `${dropped.quantity}x ${dropped.name}` : dropped.name);
        }
      }
    }
    rolledGoldTotal += bodyGold;
    breakdowns.push({
      tokenKey: body.key,
      tokenName: body.name,
      roleLabel: body.roleLabel,
      lootTableId: tokenTable,
      rolledGoldGp: bodyGold,
      droppedItems: bodyItemLabels,
    });
  }

  if (bodiesToRoll.length === 0) {
    rolledGoldTotal = 25;
    mergeItemIntoPool(VTT_ASSIGNABLE_LOOT_PRESETS[0], 'Dungeon Chest');
    mergeItemIntoPool(VTT_ASSIGNABLE_LOOT_PRESETS[1], 'Dungeon Chest');
    breakdowns.push({
      tokenKey: 'dungeon-cache',
      tokenName: 'Defeated Encounter Cache',
      roleLabel: 'Encounter Spoils',
      lootTableId: 'auto-cr',
      rolledGoldGp: 25,
      droppedItems: ['Potion of Healing', 'Masterwork Longsword'],
    });
  }

  return buildUpdatedLoomSummaryHelper({
    ...baseState,
    modalOpen: true,
    lootRevealed: true,
    defeatedBodyCount: bodiesToRoll.length || 1,
    defeatedBodyNames: bodiesToRoll.length > 0 ? bodiesToRoll.map((b) => b.name) : ['Encounter Cache'],
    totalGoldGp: rolledGoldTotal,
    remainingGoldGp: rolledGoldTotal,
    items: Array.from(itemMap.values()),
    bodyBreakdowns: breakdowns,
    claims: [],
    updatedAtIso: new Date().toISOString(),
  });
}

export function computeCombatantRecapStatsHelper(
  tokens: readonly VttTokenVm[],
  logs: readonly CombatResolutionLogVm[],
): {
  combatantStats: readonly VttCombatantRecapStatVm[];
  totalDamageDealt: number;
  totalCriticalHits: number;
  mvpCombatantName: string;
} {
  const statsMap = new Map<string, VttCombatantRecapStatVm>();
  for (const tok of tokens) {
    statsMap.set(tok.name, {
      name: tok.name,
      faction: tok.faction,
      currentHp: tok.currentHp,
      maxHp: tok.maxHp,
      totalDamageDealt: 0,
      hitsLanded: 0,
      criticalHits: 0,
      finalBlows: 0,
    });
  }
  let totalDamageDealt = 0;
  let totalCriticalHits = 0;
  for (const log of logs) {
    if (log.actionName.startsWith('Dice Roll')) continue;
    if (log.damageDealt > 0) totalDamageDealt += log.damageDealt;
    if (log.isCritical) totalCriticalHits++;
    const cur = statsMap.get(log.attackerName);
    if (cur) {
      statsMap.set(log.attackerName, {
        ...cur,
        totalDamageDealt: cur.totalDamageDealt + Math.max(0, log.damageDealt),
        hitsLanded: cur.hitsLanded + (log.hit ? 1 : 0),
        criticalHits: cur.criticalHits + (log.isCritical ? 1 : 0),
        finalBlows: cur.finalBlows + (log.message.toLowerCase().includes('defeated') || log.message.toLowerCase().includes('0/') ? 1 : 0),
      });
    }
  }
  const combatantStats = Array.from(statsMap.values()).sort((a, b) => b.totalDamageDealt - a.totalDamageDealt || b.hitsLanded - a.hitsLanded);
  const mvpCombatantName = combatantStats.filter((c) => c.faction === 'party')[0]?.name || combatantStats[0]?.name || 'Party Vanguard';
  return { combatantStats, totalDamageDealt, totalCriticalHits, mvpCombatantName };
}

export function buildGoldPouchEquipmentItem(
  characterKey: string,
  existingEquipment: readonly EquipmentLoadoutItemVm[],
  addedGoldGp: number,
  sessionNumber: number,
  encounterTitle: string,
): { equipment: readonly EquipmentLoadoutItemVm[]; newTotalGp: number } {
  const pouchId = `pouch-gold-${characterKey}`;
  const existingPouch = existingEquipment.find((e) => e.id === pouchId || e.name.toLowerCase().startsWith('adventurer coin pouch'));
  const priorGp = existingPouch ? Number(existingPouch.name.match(/\((\d+)\s*GP\)/i)?.[1] || 0) : 0;
  const newTotalGp = priorGp + addedGoldGp;
  const pouchItem: EquipmentLoadoutItemVm = {
    id: pouchId,
    name: `Adventurer Coin Pouch (${newTotalGp} GP)`,
    slot: 'Gear',
    summary: `Contains ${newTotalGp} Gold Pieces (Last +${addedGoldGp} GP in Session ${sessionNumber} · ${encounterTitle})`,
    bonusLabel: `${newTotalGp} GP`,
    acBonus: 0,
    attackBonus: 0,
    rarity: 'Common',
    equipped: true,
    valueGp: newTotalGp,
    entitlement: 'free',
  };
  return {
    equipment: [pouchItem, ...existingEquipment.filter((e) => e.id !== pouchId && !e.name.toLowerCase().startsWith('adventurer coin pouch'))],
    newTotalGp,
  };
}
