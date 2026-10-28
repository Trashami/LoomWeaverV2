import { EquipmentLoadoutItemVm } from '../../characters/models/character-studio.models';
import {
  LwCatalogItemVm,
  LwItemCategory,
  LwItemCollectionVm,
  LwItemRarity,
} from '../../../shared/ui/item-card/item-card.models';

export const SEED_HOMEBREW_AND_CAMPAIGN_ITEMS: readonly LwCatalogItemVm[] = [
  {
    id: 'item-quiet-maw-dolly',
    name: 'The Quiet Maw (Dolly Stasis Harness)',
    imageUrl: '/assets/previews-png/obj-599ca5e831fb5ae5.png',
    shortDescription:
      'Extradimensional stasis pocket sewn inside Dolly mouth by Kycius along the road to Cinth.',
    fullDescription:
      'Hand-stitched by Kycius with spell-thread on the road to Cinth, the Quiet Maw lines Dolly mouth with a harmless pocket dimension. Targets grappled or swallowed by Dolly make a DC 16 Wisdom save or are safely contained inside the stasis pouch rather than suffering lethal bite damage.',
    loreNotes:
      'Crafted partly to keep Dolly from eating people and partly because Kycius is quietly fond of Fivi.',
    priceGp: 650,
    priceLabel: '650 GP',
    category: 'Companion Gear',
    slot: 'Companion',
    rarity: 'Very Rare',
    weightLb: 2,
    acBonus: 2,
    attackBonus: 1,
    damageOrEffectLabel: '+2 AC Ward · DC 16 Non-Lethal Extradimensional Pocket',
    requiresAttunement: true,
    properties: ['Extradimensional', 'Non-Lethal Containment', 'Companion Harness', 'Homebrew'],
    source: 'Homebrew',
    isHomebrew: true,
    creatorUsername: 'StickHazen',
    creatorAccountId: 'acc-player-kycius',
    publishedToStore: true,
    storePriceLabel: 'Free ($0.00)',
    icon: 'shield',
  },
  {
    id: 'item-fivi-tooth-slingshot',
    name: 'Tooth-Loaded Fey Slingshot',
    imageUrl: '/assets/previews-png/obj-c5b9891368937f8f.png',
    shortDescription:
      'Feywild outcast slingshot loaded with an ancient tooth that bypasses resistance on critical strikes.',
    fullDescription:
      'An unassuming fey-wood slingshot bound in mismatched leather straps. When loaded with a tooth or runic shard, ranged strikes gain +3 to attack and damage rolls (60/120 ft) and deal an extra 2d8 Force trauma against targets at their last sliver of life.',
    loreNotes:
      'Carried by Fivi from the Feywild; destined to deliver the final absurd killing blow beneath the southern mountain.',
    priceGp: 180,
    priceLabel: '180 GP',
    category: 'Weapon',
    slot: 'Main Hand',
    rarity: 'Rare',
    weightLb: 1,
    acBonus: 0,
    attackBonus: 3,
    damageOrEffectLabel: '1d8 + 3 Force/Bludgeoning · Bypass Resistance on Crit',
    requiresAttunement: true,
    properties: ['Ammunition (60/120)', 'Finesse', 'Light', 'Fey-Touched', 'Homebrew'],
    source: 'Homebrew',
    isHomebrew: true,
    creatorUsername: 'DallasCrow',
    creatorAccountId: 'acc-player-fivi',
    publishedToStore: true,
    storePriceLabel: 'Free ($0.00)',
    icon: 'target',
  },
  {
    id: 'item-cinth-arc-condenser',
    name: 'Cinth Phosphor-Bronze Arc Condenser',
    imageUrl: '/assets/5e-tools/classes/EFA/Artificer.webp',
    shortDescription:
      'Post-Moonlight Wars Artificer Guild capacitor that deflects spell attacks and unleashes a counter-arc.',
    fullDescription:
      'Engineered by the non-magical craftspeople of the Cinth Artificers Guild so ordinary citizens are never helpless before mages or undead. Grants +2 AC against spell attacks and allows the bearer to spend a Reaction to discharge 3d8 Lightning damage within 15 feet.',
    loreNotes:
      'Proves that intellect, metallurgy, and calculated risk can answer the Council of Magic monopoly.',
    priceGp: 420,
    priceLabel: '420 GP',
    category: 'Wondrous Gear',
    slot: 'Gear',
    rarity: 'Rare',
    weightLb: 4,
    acBonus: 2,
    attackBonus: 0,
    damageOrEffectLabel: '+2 Spell AC · Reaction 3d8 Lightning Counter-Arc',
    requiresAttunement: false,
    properties: ['Artificer Guild', 'Clockwork', 'Spell Ward', 'Homebrew'],
    source: 'Homebrew',
    isHomebrew: true,
    creatorUsername: 'GeoJason',
    creatorAccountId: 'acc-gm-geojason',
    publishedToStore: true,
    storePriceLabel: 'Free ($0.00)',
    icon: 'zap',
  },
  {
    id: 'item-anelith-resonance-chisel',
    name: 'Anelith Resonance Chisel',
    imageUrl: '/assets/previews-png/obj-c2079efe0c15ab06.png',
    shortDescription:
      'Dwarven runic chisel tuned to read load-bearing stone and pre-Moonlight dragon containment glyphs.',
    fullDescription:
      'Carved from deep mountain basalt and inlaid with silver tuning filaments. Grants +2 to Spell Attack rolls and Arcana/History checks involving stonework, and vibrates softly when within half a league of ancient dragon containment runes.',
    loreNotes:
      'Used by Kildrid to sense the bound dragon clawing beneath the southern mountain from the Cinth road.',
    priceGp: 350,
    priceLabel: '350 GP',
    category: 'Focus',
    slot: 'Focus',
    rarity: 'Rare',
    weightLb: 2,
    acBonus: 0,
    attackBonus: 2,
    damageOrEffectLabel: '+2 Spell Attack · 60 ft Subterranean Rune Sense',
    requiresAttunement: true,
    properties: ['Arcane Focus', 'Stonecunning', 'Dwarven Craft', 'Homebrew'],
    source: 'Homebrew',
    isHomebrew: true,
    creatorUsername: 'RyanIssak',
    creatorAccountId: 'acc-player-kildrid',
    publishedToStore: true,
    storePriceLabel: 'Free ($0.00)',
    icon: 'wand',
  },
  {
    id: 'item-chokrah-ritual-tonic',
    name: 'Refined Chokrah Ritual Phial',
    imageUrl: '/assets/previews-png/obj-a0d1518041d04e1e.png',
    shortDescription:
      'Sealed alchemical Chokrah draught recovered from Lost Isles cargo manifests; restores spell focus.',
    fullDescription:
      'A dark, aromatic preparation of refined Chokrah smuggled along the Vandia and Cinth trade routes. Consuming this phial as a Bonus Action restores 2d6 + 4 Hit Points and grants Advantage on Concentration saving throws for 10 minutes.',
    loreNotes:
      'Captain Kutler traced shipments of raw Chokrah from the Lost Isles to the Prior academies.',
    priceGp: 95,
    priceLabel: '95 GP',
    category: 'Potion & Consumable',
    slot: 'Gear',
    rarity: 'Uncommon',
    weightLb: 0.5,
    acBonus: 0,
    attackBonus: 0,
    damageOrEffectLabel: 'Bonus Action · 2d6+4 HP & Concentration Advantage',
    requiresAttunement: false,
    properties: ['Consumable', 'Chokrah Cargo', 'Alchemical', 'Homebrew'],
    source: 'Homebrew',
    isHomebrew: true,
    creatorUsername: 'GeoJason',
    creatorAccountId: 'acc-gm-geojason',
    publishedToStore: true,
    storePriceLabel: 'Free ($0.00)',
    icon: 'zap',
  },
];

const CATEGORY_IMAGE_MAP: Readonly<Record<LwItemCategory, string>> = {
  Weapon: '/assets/5e-tools/classes/PHB/Fighter.webp',
  Armor: '/assets/5e-tools/classes/PHB/Paladin.webp',
  Shield: '/assets/previews-png/obj-8d3be4f40910d0bf.png',
  Focus: '/assets/5e-tools/classes/PHB/Wizard.webp',
  'Wondrous Gear': '/assets/previews-png/obj-c4468a17dd78e8a4.png',
  'Potion & Consumable': '/assets/previews-png/obj-c5b9891368937f8f.png',
  'Tool & Kit': '/assets/5e-tools/classes/PHB/Rogue.webp',
  'Companion Gear': '/assets/previews-png/obj-599ca5e831fb5ae5.png',
};

export function resolveItemCategory(eq: EquipmentLoadoutItemVm): LwItemCategory {
  const nameLower = eq.name.toLowerCase();
  const sumLower = eq.summary.toLowerCase();
  if (nameLower.includes('potion') || nameLower.includes('elixir') || nameLower.includes('phial')) {
    return 'Potion & Consumable';
  }
  if (
    nameLower.includes('tools') ||
    nameLower.includes('pack') ||
    nameLower.includes('kit') ||
    sumLower.includes('lockpicks')
  ) {
    return 'Tool & Kit';
  }
  if (eq.slot === 'Armor') return 'Armor';
  if (eq.slot === 'Off Hand' && nameLower.includes('shield')) return 'Shield';
  if (eq.slot === 'Main Hand' || eq.slot === 'Off Hand') return 'Weapon';
  if (eq.slot === 'Focus') return 'Focus';
  if (eq.slot === 'Companion') return 'Companion Gear';
  return 'Wondrous Gear';
}

export function mapEquipmentToCatalogItem(eq: EquipmentLoadoutItemVm): LwCatalogItemVm {
  const category = resolveItemCategory(eq);
  const priceGp = eq.valueGp ?? 25;
  const rarity = (eq.rarity as LwItemRarity) || 'Common';
  const isHomebrew = (eq.source || '').toLowerCase() === 'homebrew';
  const requiresAttunement =
    eq.summary.toLowerCase().includes('attuned') ||
    (rarity === 'Rare' && category === 'Wondrous Gear');

  return {
    id: eq.id,
    name: eq.name,
    imageUrl: CATEGORY_IMAGE_MAP[category],
    shortDescription: `${eq.summary} — ${eq.bonusLabel}.`,
    fullDescription: `${eq.name} (${category}, ${rarity}). ${eq.summary}. Mechanical profile: ${eq.bonusLabel}. Equips in the ${eq.slot} slot${eq.acBonus ? ` (+${eq.acBonus} AC)` : ''}${eq.attackBonus ? ` (+${eq.attackBonus} Attack)` : ''}.`,
    loreNotes: isHomebrew
      ? 'Custom campaign homebrew equipment.'
      : `Standard ruleset item (${eq.source || 'PHB / DMG'}).`,
    priceGp,
    priceLabel: `${priceGp} GP`,
    category,
    slot: eq.slot,
    rarity,
    weightLb: eq.weightLb ?? 2,
    acBonus: eq.acBonus,
    attackBonus: eq.attackBonus,
    damageOrEffectLabel: eq.bonusLabel,
    requiresAttunement,
    properties: [category, eq.slot, rarity, ...(isHomebrew ? ['Homebrew'] : [eq.source || 'PHB'])],
    source: eq.source || 'PHB',
    isHomebrew,
    creatorUsername: isHomebrew ? 'GeoJason' : 'Core Ruleset',
    publishedToStore: isHomebrew,
    storePriceLabel: isHomebrew ? 'Free ($0.00)' : `${priceGp} GP`,
    icon: eq.icon || 'layers',
  };
}

export const SEED_GM_ITEM_COLLECTIONS: readonly LwItemCollectionVm[] = [
  {
    id: 'col-cinth-artificer-armory',
    campaignId: 1,
    name: 'Cinth Artificers Guild Foundry Stock',
    description:
      'Calibrated brass sidearms, phosphor-bronze condensers, and runic chisels crafted in Cinth.',
    createdByUsername: 'GeoJason',
    itemIds: [
      'item-cinth-arc-condenser',
      'item-anelith-resonance-chisel',
      'db-hand-crossbow',
      'db-gauntlets-ogre',
      'db-mithral-breastplate',
      'db-thieves-tools',
    ],
    assignedMerchantName: 'Guildmaster Bram — Brass Foundry Quartermaster',
    assignedLocationKey: 'loc-cinth',
    assignedLocationName: 'City of Cinth',
    updatedAtLabel: 'Synced with Cinth Foundry',
  },
  {
    id: 'col-vandia-harbor-curios',
    campaignId: 1,
    name: 'Vandia Cliffside & Harbor Provisions',
    description:
      'Coastal travel supplies, healing draughts, and Chokrah cargo curios along the southwest coast.',
    createdByUsername: 'GeoJason',
    itemIds: [
      'item-chokrah-ritual-tonic',
      'db-healing-potion',
      'db-bag-holding',
      'db-cloak-protection',
      'db-dungeoneer-pack',
      'db-reliquary-symbol',
    ],
    assignedMerchantName: 'Harbormaster Vaelen — Bay of Forgotten Treasures',
    assignedLocationKey: 'loc-vandia',
    assignedLocationName: 'Vandia & The Cliff House',
    updatedAtLabel: 'Synced with Vandia Dock',
  },
  {
    id: 'col-absalom-bazaar-vault',
    campaignId: 2,
    name: 'Absalom Grand Bazaar Relics',
    description: 'Clockwork and arcane curiosities available in the Grand Bazaar.',
    createdByUsername: 'GregMeinert',
    itemIds: ['db-arcane-grimoire', 'db-ring-protection', 'db-boots-elvenkind', 'db-longbow'],
    assignedMerchantName: 'Archivist Sera — Starstone Exchange',
    assignedLocationKey: 'loc-absalom-bazaar',
    assignedLocationName: 'Absalom Grand Bazaar',
    updatedAtLabel: 'Synced with Grand Bazaar',
  },
];
