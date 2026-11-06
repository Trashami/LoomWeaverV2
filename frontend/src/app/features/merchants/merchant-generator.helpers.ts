import { MERCHANT_TYPES_CATALOG } from './merchant-haggle.helpers';

export interface GeneratedMerchantPreviewItem {
  readonly name: string;
  readonly itemType: string;
  readonly rarity: string;
  readonly description: string;
  readonly priceGp: number;
  readonly quantity: number;
}

export interface GeneratedMerchantPreview {
  readonly merchantType: string;
  readonly storeName: string;
  readonly npcName: string;
  readonly npcRace: string;
  readonly npcDemeanor: string;
  readonly npcQuirk: string;
  readonly persuasionDc: number;
  readonly locationName: string;
  readonly tagline: string;
  readonly greeting: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly inventory: readonly GeneratedMerchantPreviewItem[];
}

export const FANTASY_STORE_NAMES: Record<string, readonly string[]> = {
  'Blacksmith & Armory': [
    'The Iron Anvil Armory',
    'Cinder & Steel Forge',
    'The Dwarven Bulwark',
    'Hammer & Crucible Weapons',
    'Red Hearth Armaments',
    'Titan Spire Blades',
    'Obsidian Edge Smithy',
    'Oaken Shield Forge',
  ],
  'Alchemist & Apothecary': [
    'The Gilded Mortar',
    'Moonlit Elixirs & Phials',
    'Dragonbrew Apothecary',
    'The Shimmering Alembic',
    'Nightshade & Sage Herbs',
    'Verdant Spores & Draughts',
    'The Bubbling Flask',
    'Silver Cauldron Remedies',
  ],
  'Arcane & Wandmaker': [
    'The Whispering Wand',
    'Starlight Relics & Arcana',
    'The Runescribe Sanctum',
    'Aetherial Curios & Scrolls',
    'The Spellbound Grimoire',
    'Celeste Arcane Emporium',
    'The Prismatic Focus',
    'Eldritch Lantern Wonders',
  ],
  'General Goods & Provisions': [
    'Wayfarer Trading Post',
    'The Pack & Saddle Supply',
    'Cobblestone Provisions',
    'Highland Outpost Goods',
    'The Sundry Cask',
    'Roving Caravan Outfitters',
    'The Compass & Canteen',
    'Old Harbor Mercantile',
  ],
  'Jeweler & Gemcutter': [
    'The Faceted Diamond',
    'Glittering Carat Gems',
    'Sunstone & Silver Filigree',
    'The Gilded Signet',
    'Crown Jewel Lapidary',
    'Opaline Vault Baubles',
    'The Astral Carbuncle',
  ],
  'Curios & Antiquities': [
    'Oddities of the Underworld',
    'The Dust & Relic Exchange',
    'Chronicle & Curio Vault',
    'Forgotten Lore Antiquities',
    'The Sphinx Reliquary',
    'Chamber of Seven Keys',
  ],
  'Tavern & Brewer': [
    'The Frothing Flagon',
    'The Tipsy Wyvern Cask',
    'Hearth & Barrel Ales',
    'The Boar & Bramble Tap',
    'Amber Draught Brewery',
    'The Rusty Anchor Spirits',
  ],
  'Fletcher & Bowyer': [
    'Silverflight Bows & Shafts',
    'Yew & Feather Fletcher',
    'Windrunner Archery',
    'The Split Shaft Bows',
    'Hawk-Eye Precision Works',
    'Raven Quiver Outfitter',
  ],
  'Tailor & Weaver': [
    'The Loom & Needle Atelier',
    'Velvet & Spindle Attire',
    'Gossamer Thread Cloaks',
    'The Gilded Hem Robes',
    'Silken Stitches Finery',
  ],
  'Wandering Exotic Trader': [
    'The Silk Road Caravan',
    'Far Mirage Curiosities',
    'Spice & Sand Emporium',
    'The Desert Falcon Bazaar',
    'Wanderer Moon Tradepost',
  ],
};

export const FANTASY_NPC_NAMES: readonly string[] = [
  'Theron Brightwood', 'Eldrin Moonshadow', 'Bram Ironbreaker', 'Vespera Nightbreeze',
  'Dax Cogspinner', 'Kaelen Dawnbringer', 'Bari Stonehelm', 'Mira Ashford',
  'Faelar Whisperwind', 'Rowan Blackthorn', 'Greta Copperkettle', 'Ignis Emberfall',
  'Toren Goldfinger', 'Morrigan Shadowveil', 'Orin Swiftriver', 'Silas Wintermute',
  'Lyra Silverleaf', 'Hrogar Bronzebeard', 'Zephyr Gale', 'Cora Underbough',
  'Valen Sunstride', 'Astrid Deepdelver', 'Lucan Starfall', 'Baelor Stormborn',
  'Isolde Frostgale', 'Percival Highgate', 'Wren Hollowell', 'Orson Barrelchew',
  'Zoraida Voidwalker', 'Darian Fairweather', 'Bixi Nackle', 'Varis Holimion',
  'Helga Runecarver', 'Clement Goodbarrel', 'Nyssa Thornheart', 'Boric Anvilborn',
  'Amaryllis Bloom', 'Dravok Cinderhide', 'Gwenith Cobblepot', 'Tarquin Brightwood',
  'Leona Shieldheart', 'Corin Featherstone', 'Brog Ironhide', 'Kallista Hellspark',
  'Roderic Highcliff', 'Sybilla Darkwater', 'Fintan O\'Malley', 'Rowena Spellwright',
  'Balthor Kegbreaker', 'Evelina Mosswood', 'Xander Swiftblade', 'Tamsin Honeybee',
  'Varek Bloodfang', 'Lunetta Stargazer', 'Garrick Redmane', 'Zephira Wyrmspeaker',
];

const FANTASY_RACES = ['Dwarf', 'Elf', 'Human', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn'] as const;
const FANTASY_DEMEANORS = [
  'Gruff & Pragmatic', 'Shrewd Negotiator', 'Jovial & Hospitable',
  'Suspicious & Guarded', 'Eccentric Collector', 'Flamboyant Showman',
  'Whispering Informant', 'Hardened Veteran',
] as const;

const FANTASY_QUIRKS = [
  'Constantly polishes an ornate coin between their knuckles.',
  'Bows low with theatrical flourish whenever gold is mentioned.',
  'Speaks in quiet murmurs, always glancing toward the shop doorway.',
  'Insists on biting every coin to test its mineral purity.',
  'Keeps a pet mechanical bird on their shoulder that chirps when anyone enters.',
  'Knows every juicy rumor from the tavern down the street.',
  'Wears spectacles with three rotating tinted lenses for inspecting gemstones.',
  'Never sells an item without sharing a dramatic backstory about its origin.',
] as const;

export const THEMED_STARTER_ITEMS: Record<string, readonly GeneratedMerchantPreviewItem[]> = {
  'Blacksmith & Armory': [
    { name: 'Longsword', itemType: 'Weapon', rarity: 'common', description: 'Versatile blade forged of high-carbon steel.', priceGp: 15, quantity: 3 },
    { name: 'Shield +1', itemType: 'Armor', rarity: 'uncommon', description: '+1 magically reinforced kite shield bearing dwarven inlay.', priceGp: 250, quantity: 1 },
    { name: 'Chain Shirt', itemType: 'Armor', rarity: 'common', description: 'Interlocking metal rings worn under tunic.', priceGp: 50, quantity: 2 },
    { name: 'Warhammer', itemType: 'Weapon', rarity: 'common', description: 'Heavy bludgeoning head with a back armor-piercing spike.', priceGp: 15, quantity: 2 },
    { name: 'Fine Whetstone (3-pack)', itemType: 'Adventuring Gear', rarity: 'common', description: 'Keeps blades razor sharp.', priceGp: 5, quantity: 6 },
    { name: 'Crossbow Bolts (case of 20)', itemType: 'Ammunition', rarity: 'common', description: 'Steel-tipped quarrel bolts.', priceGp: 2, quantity: 5 },
  ],
  'Alchemist & Apothecary': [
    { name: 'Potion of Healing', itemType: 'Potion', rarity: 'common', description: 'Regains 2d4+2 hit points when consumed.', priceGp: 50, quantity: 6 },
    { name: 'Potion of Greater Healing', itemType: 'Potion', rarity: 'uncommon', description: 'Regains 4d4+4 hit points.', priceGp: 150, quantity: 2 },
    { name: 'Alchemist\'s Fire (flask)', itemType: 'Adventuring Gear', rarity: 'common', description: 'Ignites on contact with air dealing 1d4 fire damage.', priceGp: 50, quantity: 4 },
    { name: 'Antitoxin', itemType: 'Adventuring Gear', rarity: 'common', description: 'Grants advantage on saves against poison for 1 hour.', priceGp: 50, quantity: 3 },
    { name: 'Herbalism Salve', itemType: 'Adventuring Gear', rarity: 'common', description: 'Soothing poultice for wounds and burns.', priceGp: 25, quantity: 5 },
  ],
  'Arcane & Wandmaker': [
    { name: 'Spell Scroll (Shield)', itemType: 'Scroll', rarity: 'common', description: 'Instantly triggers the Shield spell when read.', priceGp: 75, quantity: 2 },
    { name: 'Wand of the War Mage +1', itemType: 'Wand', rarity: 'uncommon', description: 'Grants +1 to spell attack rolls and ignores half cover.', priceGp: 350, quantity: 1 },
    { name: 'Pearl of Power', itemType: 'Wondrous Item', rarity: 'uncommon', description: 'Allows spellcaster to regain one spell slot up to 3rd level.', priceGp: 450, quantity: 1 },
    { name: 'Component Pouch', itemType: 'Adventuring Gear', rarity: 'common', description: 'Watertight leather pouch containing spell reagents.', priceGp: 25, quantity: 3 },
    { name: 'Arcane Focus Crystal', itemType: 'Focus', rarity: 'common', description: 'Faceted quartz tuned to arcane harmonics.', priceGp: 20, quantity: 3 },
  ],
  'Jeweler & Gemcutter': [
    { name: 'Ring of Protection', itemType: 'Ring', rarity: 'rare', description: 'Grants +1 bonus to Armor Class and saving throws.', priceGp: 1200, quantity: 1 },
    { name: 'Faceted Star Sapphire', itemType: 'Valuables', rarity: 'uncommon', description: 'Deep blue gemstone reflecting a six-pointed star.', priceGp: 100, quantity: 4 },
    { name: 'Silver Signet Amulet', itemType: 'Wondrous Item', rarity: 'common', description: 'Fine filigree pendant suitable for enspelling.', priceGp: 45, quantity: 3 },
    { name: 'Cut Bloodstone Gem', itemType: 'Valuables', rarity: 'common', description: 'Dark green jasper flecked with red hematite.', priceGp: 50, quantity: 5 },
  ],
  default: [
    { name: 'Explorer\'s Pack', itemType: 'Adventuring Gear', rarity: 'common', description: 'Includes bedroll, mess kit, rations, torches, and waterskin.', priceGp: 10, quantity: 4 },
    { name: 'Silk Rope (50 feet)', itemType: 'Adventuring Gear', rarity: 'common', description: 'Lightweight, sturdy braided silk rope.', priceGp: 10, quantity: 4 },
    { name: 'Bullseye Lantern', itemType: 'Adventuring Gear', rarity: 'common', description: 'Casts bright light in a 60-foot cone.', priceGp: 10, quantity: 2 },
    { name: 'Healer\'s Kit (10 uses)', itemType: 'Adventuring Gear', rarity: 'common', description: 'Stabilizes a dying creature without a check.', priceGp: 5, quantity: 5 },
    { name: 'Merchant\'s Scale', itemType: 'Tool', rarity: 'common', description: 'Accurate brass balance scale with weights.', priceGp: 5, quantity: 2 },
  ],
};

export function generateRandomMerchantPreview(
  typeOverride?: string,
  locationOverride?: string,
): GeneratedMerchantPreview {
  const type =
    typeOverride && typeOverride !== 'random'
      ? typeOverride
      : MERCHANT_TYPES_CATALOG[Math.floor(Math.random() * MERCHANT_TYPES_CATALOG.length)];

  const storeNames = FANTASY_STORE_NAMES[type] || FANTASY_STORE_NAMES['General Goods & Provisions'];
  const storeName = storeNames[Math.floor(Math.random() * storeNames.length)];
  const npcName = FANTASY_NPC_NAMES[Math.floor(Math.random() * FANTASY_NPC_NAMES.length)];
  const npcRace = FANTASY_RACES[Math.floor(Math.random() * FANTASY_RACES.length)];
  const npcDemeanor = FANTASY_DEMEANORS[Math.floor(Math.random() * FANTASY_DEMEANORS.length)];
  const npcQuirk = FANTASY_QUIRKS[Math.floor(Math.random() * FANTASY_QUIRKS.length)];
  const persuasionDc = Math.floor(Math.random() * 5) + 12; // 12-16
  const location = locationOverride?.trim() || 'Vandia Harbor';

  const inventory = THEMED_STARTER_ITEMS[type] || THEMED_STARTER_ITEMS['default'];

  return {
    merchantType: type,
    storeName,
    npcName,
    npcRace,
    npcDemeanor,
    npcQuirk,
    persuasionDc,
    locationName: location,
    tagline: `Specialized ${type.toLowerCase()} and fine goods in ${location}.`,
    greeting: `Welcome to ${storeName}! Look around and let me know what catches your eye.`,
    description: `A reputable ${type.toLowerCase()} established in ${location}, known across the region for quality wares.`,
    imageUrl: `/assets/5e-tools/races/PHB/${npcRace}.webp`,
    inventory,
  };
}

export interface PresetMerchantAvatar {
  readonly id: string;
  readonly label: string;
  readonly race: string;
  readonly imageUrl: string;
}

export const PRESET_MERCHANT_AVATARS: readonly PresetMerchantAvatar[] = [
  { id: 'dwarf', label: 'Dwarf', race: 'Dwarf', imageUrl: '/assets/5e-tools/races/PHB/Dwarf.webp' },
  { id: 'elf', label: 'Elf', race: 'Elf', imageUrl: '/assets/5e-tools/races/PHB/Elf.webp' },
  { id: 'human', label: 'Human', race: 'Human', imageUrl: '/assets/5e-tools/races/PHB/Human.webp' },
  { id: 'halfling', label: 'Halfling', race: 'Halfling', imageUrl: '/assets/5e-tools/races/PHB/Halfling.webp' },
  { id: 'gnome', label: 'Gnome', race: 'Gnome', imageUrl: '/assets/5e-tools/races/PHB/Gnome.webp' },
  { id: 'half-elf', label: 'Half-Elf', race: 'Half-Elf', imageUrl: '/assets/5e-tools/races/PHB/Half-Elf.webp' },
  { id: 'half-orc', label: 'Half-Orc', race: 'Half-Orc', imageUrl: '/assets/5e-tools/races/PHB/Half-Orc.webp' },
  { id: 'tiefling', label: 'Tiefling', race: 'Tiefling', imageUrl: '/assets/5e-tools/races/PHB/Tiefling.webp' },
  { id: 'dragonborn', label: 'Dragonborn', race: 'Dragonborn', imageUrl: '/assets/5e-tools/races/PHB/Dragonborn.webp' },
];

export function getMerchantTypeIcon(type?: string): string {
  switch (type) {
    case 'Blacksmith & Armory':
      return 'swords';
    case 'Alchemist & Apothecary':
      return 'science';
    case 'Arcane & Wandmaker':
      return 'wand';
    case 'Jeweler & Gemcutter':
      return 'diamond';
    case 'Curios & Antiquities':
      return 'history-edu';
    case 'Tavern & Brewer':
      return 'home';
    case 'Fletcher & Bowyer':
      return 'target';
    case 'Tailor & Weaver':
      return 'layers';
    case 'Wandering Exotic Trader':
      return 'compass';
    case 'General Goods & Provisions':
    default:
      return 'store';
  }
}

