import {
  VttAssignedLootItemVm,
  VttLootTableId,
  VttTokenVm,
} from '../../effects/engine/effect-timeline.contract';

export interface VttLootTableOptionVm {
  readonly id: VttLootTableId;
  readonly label: string;
  readonly sublabel: string;
  readonly badgeLabel: string;
}

export interface VttLootPoolItemVm {
  readonly id: string;
  readonly name: string;
  readonly category: 'Weapon' | 'Armor' | 'Shield' | 'Wondrous' | 'Consumable' | 'Gear' | 'Treasure';
  readonly rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary';
  readonly totalQuantity: number;
  readonly quantityRemaining: number;
  readonly valueGp: number;
  readonly statsLabel: string;
  readonly sourceBodyNames: readonly string[];
}

export interface VttLootClaimRecordVm {
  readonly id: string;
  readonly timestampIso: string;
  readonly characterKey: string;
  readonly characterName: string;
  readonly claimedByUsername: string;
  readonly kind: 'gold' | 'item';
  readonly goldGp: number;
  readonly poolItemId?: string;
  readonly itemName?: string;
  readonly itemCategory?: VttLootPoolItemVm['category'];
  readonly itemRarity?: VttLootPoolItemVm['rarity'];
  readonly itemStatsLabel?: string;
  readonly itemValueGp?: number;
  readonly quantity: number;
}

export interface VttDefeatedBodyLootSummaryVm {
  readonly tokenKey: string;
  readonly tokenName: string;
  readonly roleLabel: string;
  readonly lootTableId: VttLootTableId;
  readonly rolledGoldGp: number;
  readonly droppedItems: readonly string[];
}

export interface VttCombatantRecapStatVm {
  readonly name: string;
  readonly faction: 'party' | 'hostile' | 'ally';
  readonly currentHp: number;
  readonly maxHp: number;
  readonly totalDamageDealt: number;
  readonly hitsLanded: number;
  readonly criticalHits: number;
  readonly finalBlows: number;
}

export interface VttCharacterLootLedgerSummaryVm {
  readonly characterKey: string;
  readonly characterName: string;
  readonly totalGoldGp: number;
  readonly items: readonly {
    readonly claimId: string;
    readonly itemName: string;
    readonly quantity: number;
    readonly rarity: string;
  }[];
}

export interface VttEncounterRecapAndLootStateVm {
  readonly recapId: string;
  readonly campaignId: number;
  readonly sessionId: string;
  readonly sessionNumber: number;
  readonly sessionTitle: string;
  readonly encounterId: string;
  readonly encounterTitle: string;
  readonly modalOpen: boolean;
  readonly lootRevealed: boolean;
  readonly roundsElapsed: number;
  readonly totalXpAwarded: number;
  readonly perHeroXp: number;
  readonly xpAwardedToSheets: boolean;
  readonly totalDamageDealt: number;
  readonly totalCriticalHits: number;
  readonly mvpCombatantName: string;
  readonly defeatedBodyCount: number;
  readonly defeatedBodyNames: readonly string[];
  readonly combatantStats: readonly VttCombatantRecapStatVm[];
  readonly selectedRollTables: readonly VttLootTableId[];
  readonly totalGoldGp: number;
  readonly remainingGoldGp: number;
  readonly items: readonly VttLootPoolItemVm[];
  readonly bodyBreakdowns: readonly VttDefeatedBodyLootSummaryVm[];
  readonly claims: readonly VttLootClaimRecordVm[];
  readonly loomSummaryText: string;
  readonly updatedAtIso: string;
}

export const VTT_LOOT_TABLE_OPTIONS: readonly VttLootTableOptionVm[] = [
  {
    id: 'auto-cr',
    label: 'Auto by Creature Role / CR',
    sublabel: 'Balanced coins, battle gear & consumables scaled to enemy tier',
    badgeLabel: 'Auto CR',
  },
  {
    id: 'coin-pouch',
    label: 'Coin Pouch & Trade Silver',
    sublabel: 'Heavy coin purses, trade bars & gemstones per body',
    badgeLabel: 'Coins',
  },
  {
    id: 'martial-arms',
    label: 'Martial Weapons & Armor',
    sublabel: 'Blades, bows, shields, ammunition & battlefield salvage',
    badgeLabel: 'Arms',
  },
  {
    id: 'arcane-curios',
    label: 'Potions, Scrolls & Arcane Relics',
    sublabel: 'Healing draughts, spell scrolls & enchanted curios',
    badgeLabel: 'Arcane',
  },
  {
    id: 'boss-hoard',
    label: 'Boss Treasure Hoard',
    sublabel: 'High gold yield plus rare masterwork or enchanted arms',
    badgeLabel: 'Hoard',
  },
  {
    id: 'none',
    label: 'Assigned Loot Only (No Random Roll)',
    sublabel: 'Only drops guaranteed items & gold assigned to this token',
    badgeLabel: 'Fixed Only',
  },
];

export const VTT_ASSIGNABLE_LOOT_PRESETS: readonly VttAssignedLootItemVm[] = [
  {
    id: 'loot-potion-healing',
    name: 'Potion of Healing',
    category: 'Consumable',
    rarity: 'Common',
    quantity: 1,
    valueGp: 50,
    statsLabel: 'Action: Regain 2d4 + 2 HP',
  },
  {
    id: 'loot-longsword',
    name: 'Masterwork Longsword',
    category: 'Weapon',
    rarity: 'Common',
    quantity: 1,
    valueGp: 25,
    statsLabel: '1d8 slashing · Versatile (1d10)',
  },
  {
    id: 'loot-longsword-plus1',
    name: 'Longsword +1',
    category: 'Weapon',
    rarity: 'Uncommon',
    quantity: 1,
    valueGp: 350,
    statsLabel: '+1 attack & damage · 1d8+1 magical slashing',
  },
  {
    id: 'loot-shortbow-arrows',
    name: 'Bundle of Silvered Arrows',
    category: 'Gear',
    rarity: 'Uncommon',
    quantity: 5,
    valueGp: 25,
    statsLabel: 'Ammunition · Bypasses non-magical resistance',
  },
  {
    id: 'loot-shield-steel',
    name: 'Runed Steel Shield',
    category: 'Shield',
    rarity: 'Uncommon',
    quantity: 1,
    valueGp: 75,
    statsLabel: '+2 AC · Off-hand defensive ward',
  },
  {
    id: 'loot-scroll-misty-step',
    name: 'Spell Scroll: Misty Step',
    category: 'Consumable',
    rarity: 'Uncommon',
    quantity: 1,
    valueGp: 90,
    statsLabel: 'Bonus Action: Teleport 30 ft to unoccupied space',
  },
  {
    id: 'loot-cloak-protection',
    name: 'Cloak of Protection',
    category: 'Wondrous',
    rarity: 'Uncommon',
    quantity: 1,
    valueGp: 400,
    statsLabel: '+1 to AC and all Saving Throws',
  },
  {
    id: 'loot-dungeon-key',
    name: 'Iron Sanctum Key',
    category: 'Treasure',
    rarity: 'Common',
    quantity: 1,
    valueGp: 10,
    statsLabel: 'Unlocks sealed chamber doors in the dungeon',
  },
  {
    id: 'loot-bloodstone-gem',
    name: 'Polished Bloodstone Gem',
    category: 'Treasure',
    rarity: 'Common',
    quantity: 1,
    valueGp: 50,
    statsLabel: 'Cut trade gemstone (50 GP value)',
  },
];

const TABLE_ITEM_POOLS: Readonly<Record<Exclude<VttLootTableId, 'none'>, readonly VttAssignedLootItemVm[]>> = {
  'auto-cr': [
    VTT_ASSIGNABLE_LOOT_PRESETS[0],
    VTT_ASSIGNABLE_LOOT_PRESETS[1],
    VTT_ASSIGNABLE_LOOT_PRESETS[3],
    VTT_ASSIGNABLE_LOOT_PRESETS[8],
  ],
  'coin-pouch': [
    VTT_ASSIGNABLE_LOOT_PRESETS[8],
    {
      id: 'loot-silver-trade-bar',
      name: 'Stamped Silver Trade Bar',
      category: 'Treasure',
      rarity: 'Common',
      quantity: 1,
      valueGp: 15,
      statsLabel: 'Merchant guild bullion bar (15 GP)',
    },
  ],
  'martial-arms': [
    VTT_ASSIGNABLE_LOOT_PRESETS[1],
    VTT_ASSIGNABLE_LOOT_PRESETS[2],
    VTT_ASSIGNABLE_LOOT_PRESETS[3],
    VTT_ASSIGNABLE_LOOT_PRESETS[4],
    {
      id: 'loot-dagger-keen',
      name: 'Balanced Throwing Dagger',
      category: 'Weapon',
      rarity: 'Common',
      quantity: 2,
      valueGp: 8,
      statsLabel: '1d4 piercing · Finesse, Thrown (20/60)',
    },
  ],
  'arcane-curios': [
    VTT_ASSIGNABLE_LOOT_PRESETS[0],
    VTT_ASSIGNABLE_LOOT_PRESETS[5],
    {
      id: 'loot-potion-greater-healing',
      name: 'Potion of Greater Healing',
      category: 'Consumable',
      rarity: 'Uncommon',
      quantity: 1,
      valueGp: 150,
      statsLabel: 'Action: Regain 4d4 + 4 HP',
    },
    {
      id: 'loot-pearl-power-shard',
      name: 'Arcane Focus Crystal',
      category: 'Wondrous',
      rarity: 'Uncommon',
      quantity: 1,
      valueGp: 120,
      statsLabel: '+1 to spell attack rolls while held',
    },
  ],
  'boss-hoard': [
    VTT_ASSIGNABLE_LOOT_PRESETS[2],
    VTT_ASSIGNABLE_LOOT_PRESETS[6],
    VTT_ASSIGNABLE_LOOT_PRESETS[0],
    VTT_ASSIGNABLE_LOOT_PRESETS[8],
    {
      id: 'loot-flame-blade',
      name: 'Sunforged Greatsword +1',
      category: 'Weapon',
      rarity: 'Rare',
      quantity: 1,
      valueGp: 650,
      statsLabel: '2d6+1 slashing + 1d6 radiant damage',
    },
  ],
};

export function rollSingleTableForTokenBody(
  token: VttTokenVm,
  tableId: VttLootTableId,
): { goldGp: number; items: VttAssignedLootItemVm[] } {
  if (tableId === 'none') return { goldGp: 0, items: [] };
  const tierMultiplier = token.maxHp >= 90 ? 3 : token.maxHp >= 40 ? 2 : 1;
  let baseGold = 0;
  switch (tableId) {
    case 'coin-pouch':
      baseGold = (Math.floor(Math.random() * 8) + 4) * tierMultiplier;
      break;
    case 'boss-hoard':
      baseGold = (Math.floor(Math.random() * 20) + 15) * tierMultiplier;
      break;
    case 'martial-arms':
      baseGold = (Math.floor(Math.random() * 4) + 1) * tierMultiplier;
      break;
    case 'arcane-curios':
      baseGold = (Math.floor(Math.random() * 6) + 2) * tierMultiplier;
      break;
    case 'auto-cr':
    default:
      baseGold = (Math.floor(Math.random() * 6) + 2) * tierMultiplier;
      break;
  }

  const pool = TABLE_ITEM_POOLS[tableId] ?? TABLE_ITEM_POOLS['auto-cr'];
  const dropped: VttAssignedLootItemVm[] = [];
  const dropCount = tableId === 'boss-hoard' ? 2 : Math.random() < 0.72 ? 1 : 0;
  for (let i = 0; i < dropCount; i++) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) dropped.push({ ...pick });
  }
  return { goldGp: baseGold, items: dropped };
}

export function buildUpdatedLoomSummaryHelper(
  state: VttEncounterRecapAndLootStateVm,
): VttEncounterRecapAndLootStateVm {
  const byChar = new Map<string, { name: string; gp: number; items: string[] }>();
  for (const claim of state.claims) {
    const cur = byChar.get(claim.characterKey) ?? { name: claim.characterName, gp: 0, items: [] };
    if (claim.kind === 'gold') {
      cur.gp += claim.goldGp;
    } else if (claim.itemName) {
      cur.items.push(claim.quantity > 1 ? `${claim.quantity}x ${claim.itemName}` : claim.itemName);
    }
    byChar.set(claim.characterKey, cur);
  }

  const charSummaries: string[] = [];
  for (const entry of byChar.values()) {
    const parts: string[] = [];
    if (entry.gp > 0) parts.push(`${entry.gp} GP`);
    if (entry.items.length > 0) parts.push(entry.items.join(', '));
    if (parts.length > 0) charSummaries.push(`${entry.name} claimed ${parts.join(' and ')}`);
  }

  const claimedGold = state.totalGoldGp - state.remainingGoldGp;
  const itemPoolSummary =
    state.items.length > 0
      ? state.items.map((i) => `${i.totalQuantity}x ${i.name}`).join(', ')
      : 'no equipment items';
  const distributionText =
    charSummaries.length > 0
      ? `Who got what: ${charSummaries.join('; ')}.`
      : state.lootRevealed
        ? `Loot is currently on the table awaiting player distribution (${state.remainingGoldGp} GP remaining).`
        : 'Loot has not been rolled yet.';

  const loomSummaryText =
    `In Session ${state.sessionNumber} (${state.sessionTitle} — ${state.encounterTitle}), the party fought for ${state.roundsElapsed} round(s), defeated ${state.defeatedBodyCount} enemies (${state.defeatedBodyNames.join(', ') || 'dungeon foes'}), earned ${state.totalXpAwarded} XP (${state.perHeroXp} XP per hero), and looted ${state.totalGoldGp} GP total (${claimedGold} GP claimed, ${state.remainingGoldGp} GP remaining) plus ${itemPoolSummary}. ${distributionText}`;

  return { ...state, loomSummaryText };
}

