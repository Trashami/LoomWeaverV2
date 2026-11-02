import { ForageHarvestItem, ForageRollResult, ForagingAbundance, ForagingBiome } from '../models/crafting.models';

export const FORAGING_BIOMES: readonly { readonly id: ForagingBiome; readonly label: string; readonly description: string; readonly icon: string }[] = [
  { id: 'forest', label: 'Temperate Forest', description: 'Canopies of oak and birch teeming with healing herbs, game, and spring waters.', icon: 'park' },
  { id: 'mountain', label: 'Craggy Mountains', description: 'Granite peaks and rocky crevices rich in iron ores, sulfur, and hardy mosses.', icon: 'terrain' },
  { id: 'coastal', label: 'Coastal / Tidepools', description: 'Salty shores and rocky shallows yielding kelp, brine, crustaceans, and pearls.', icon: 'waves' },
  { id: 'swamp', label: 'Murky Swamps', description: 'Miasmic bogs overgrown with venomous roots, bloodmoss, and serpent venom sacs.', icon: 'water' },
  { id: 'underdark', label: 'Underdark Caverns', description: 'Subterranean chasms blooming with bioluminescent glowcaps and pyrite crystal veins.', icon: 'nightlight' },
  { id: 'plains', label: 'Windswept Plains', description: 'Vast grasslands abundant in wild grains, running game, and sweet roots.', icon: 'grass' },
  { id: 'desert', label: 'Arid Wastes', description: 'Scorching dunes hiding quartz sands, night-blooming cactus, and scorpions.', icon: 'wb_sunny' },
  { id: 'ruins', label: 'Ancient Ruins', description: 'Crumbling arcane stonework harboring enchanted inks, scrap metal, and parchment.', icon: 'account_balance' },
];

export const FORAGING_ABUNDANCE_LEVELS: readonly { readonly id: ForagingAbundance; readonly label: string; readonly dc: number; readonly description: string }[] = [
  { id: 'abundant', label: 'Abundant Waters & Flora', dc: 10, description: 'Lush ecosystem; berries, springs, and wildlife are plentiful.' },
  { id: 'limited', label: 'Limited Wilderness', dc: 15, description: 'Rocky terrain or picked-over grounds; requires seasoned tracking.' },
  { id: 'sparse', label: 'Sparse / Barren Desolation', dc: 20, description: 'Severe scarcity; clean water is hidden and edible roots rare.' },
];

export const FORAGE_LOOT_TABLE: readonly ForageHarvestItem[] = [
  // Herbs & Flora
  {
    name: 'Kingsbloom Herb',
    category: 'herb',
    rarity: 'Common',
    weightLb: 0.1,
    valueGp: 5,
    description: 'Golden-veined blossom prized in alchemical healing drafts.',
    minQty: 1,
    maxQty: 3,
    biomes: ['forest', 'plains'],
  },
  {
    name: 'Silverleaf Frond',
    category: 'herb',
    rarity: 'Uncommon',
    weightLb: 0.1,
    valueGp: 15,
    description: 'Silvery fern that retains moonlight glow, essential for potent restoratives.',
    minQty: 1,
    maxQty: 2,
    biomes: ['forest', 'mountain', 'underdark'],
  },
  {
    name: 'Wyrmwood Stalk',
    category: 'herb',
    rarity: 'Common',
    weightLb: 0.2,
    valueGp: 4,
    description: 'Bitter aromatic stem renowned for detoxifying serpent bites.',
    minQty: 1,
    maxQty: 3,
    biomes: ['forest', 'plains', 'swamp'],
  },
  {
    name: 'Bloodmoss Paste',
    category: 'herb',
    rarity: 'Common',
    weightLb: 0.25,
    valueGp: 6,
    description: 'Crimson bryophyte that thrives on decaying barks in stagnant wetlands.',
    minQty: 1,
    maxQty: 2,
    biomes: ['swamp', 'underdark'],
  },
  {
    name: 'Mandrake Root',
    category: 'herb',
    rarity: 'Rare',
    weightLb: 0.5,
    valueGp: 25,
    description: 'Bizarre root humanoid in shape, holding potent life resonance.',
    minQty: 1,
    maxQty: 1,
    biomes: ['forest', 'ruins', 'swamp'],
  },
  {
    name: 'Nightshade Leaf',
    category: 'herb',
    rarity: 'Common',
    weightLb: 0.1,
    valueGp: 8,
    description: 'Velvety purple leaf containing paralyzing botanical neurotoxins.',
    minQty: 1,
    maxQty: 3,
    biomes: ['swamp', 'ruins', 'forest'],
  },
  {
    name: 'Wild Roots & Herbs',
    category: 'herb',
    rarity: 'Common',
    weightLb: 0.5,
    valueGp: 1,
    description: 'Assorted edible roots, wild garlic, and peppery moss for camp stew.',
    minQty: 2,
    maxQty: 4,
    biomes: ['forest', 'plains', 'mountain', 'coastal'],
  },

  // Minerals & Earth
  {
    name: 'Iron Ore Chunk',
    category: 'mineral',
    rarity: 'Common',
    weightLb: 2.0,
    valueGp: 2,
    description: 'Raw hematite nodule ready to be smelted at a blacksmith forge.',
    minQty: 1,
    maxQty: 4,
    biomes: ['mountain', 'underdark'],
  },
  {
    name: 'Pyrite Core',
    category: 'mineral',
    rarity: 'Common',
    weightLb: 0.5,
    valueGp: 5,
    description: 'Spark-striking mineral nodule used in volatile incendiary mixtures.',
    minQty: 1,
    maxQty: 2,
    biomes: ['mountain', 'desert', 'underdark'],
  },
  {
    name: 'Volatile Pitch Oil',
    category: 'mineral',
    rarity: 'Common',
    weightLb: 1.0,
    valueGp: 8,
    description: 'Heavy, viscous natural tar seepage that burns intensely.',
    minQty: 1,
    maxQty: 2,
    biomes: ['swamp', 'coastal'],
  },
  {
    name: 'Sulfur Crystals',
    category: 'mineral',
    rarity: 'Common',
    weightLb: 0.5,
    valueGp: 6,
    description: 'Pungent yellow brimstone shards harvested from thermal vents.',
    minQty: 1,
    maxQty: 3,
    biomes: ['mountain', 'underdark', 'desert'],
  },
  {
    name: 'Alchemical Silver Ingot',
    category: 'mineral',
    rarity: 'Uncommon',
    weightLb: 1.0,
    valueGp: 25,
    description: 'Refined lunar silver fragment left behind in sacred temple crypts.',
    minQty: 1,
    maxQty: 1,
    biomes: ['ruins', 'underdark'],
  },
  {
    name: 'Enchanted Scribe Ink',
    category: 'mineral',
    rarity: 'Uncommon',
    weightLb: 0.2,
    valueGp: 20,
    description: 'Gleaming vial of crushed lapis lazuli and squid ink infused with spell weave.',
    minQty: 1,
    maxQty: 1,
    biomes: ['ruins', 'coastal'],
  },

  // Creature & Fauna Parts
  {
    name: 'Venom Sac',
    category: 'creature',
    rarity: 'Uncommon',
    weightLb: 0.25,
    valueGp: 15,
    description: 'Harvested gland from a serpent or arachnid holding concentrated poison.',
    minQty: 1,
    maxQty: 2,
    biomes: ['swamp', 'desert', 'underdark'],
  },
  {
    name: 'Cured Beast Hide',
    category: 'creature',
    rarity: 'Common',
    weightLb: 3.0,
    valueGp: 4,
    description: 'Thick pelt scraped and salt-tanned from wilderness predators.',
    minQty: 1,
    maxQty: 3,
    biomes: ['forest', 'mountain', 'plains'],
  },
  {
    name: 'Feather Bundle',
    category: 'creature',
    rarity: 'Common',
    weightLb: 0.1,
    valueGp: 1,
    description: 'Stiff flight pinions ideal for fletching arrows or calligraphy quills.',
    minQty: 2,
    maxQty: 6,
    biomes: ['forest', 'mountain', 'plains', 'coastal'],
  },

  // Wilderness Sustenance (Food & Water per DMG p. 111)
  {
    name: 'Fresh Game Meat',
    category: 'sustenance',
    rarity: 'Common',
    weightLb: 2.0,
    valueGp: 0.5,
    description: 'Dressed wilderness game (hare, fowl, or venison) for camp rations.',
    minQty: 1,
    maxQty: 4,
    biomes: ['forest', 'mountain', 'plains', 'coastal', 'swamp'],
  },
  {
    name: 'Clean Spring Water',
    category: 'sustenance',
    rarity: 'Common',
    weightLb: 2.0,
    valueGp: 0.2,
    description: 'Vial or canteen of pure fresh potable water for brewing and drinking.',
    minQty: 1,
    maxQty: 3,
    biomes: ['forest', 'mountain', 'plains', 'coastal'],
  },
  {
    name: 'Wild Berries & Nuts',
    category: 'sustenance',
    rarity: 'Common',
    weightLb: 1.0,
    valueGp: 0.3,
    description: 'Handfuls of tart blackberries, hazelnuts, and wild rosehips.',
    minQty: 1,
    maxQty: 3,
    biomes: ['forest', 'plains', 'coastal'],
  },
  {
    name: 'Hardwood Timber',
    category: 'mineral',
    rarity: 'Common',
    weightLb: 4.0,
    valueGp: 1,
    description: 'Seasoned cedar or ironwood bough suitable for shield bands or arrow shafts.',
    minQty: 1,
    maxQty: 2,
    biomes: ['forest', 'swamp'],
  },
];

export function resolveForagingHarvest(
  biome: ForagingBiome,
  abundance: ForagingAbundance,
  roll: number,
  wisModifier: number,
): ForageRollResult {
  const level = FORAGING_ABUNDANCE_LEVELS.find((a) => a.id === abundance) ?? FORAGING_ABUNDANCE_LEVELS[0];
  const total = roll + wisModifier;
  const isNat20 = roll === 20;
  const isNat1 = roll === 1;
  const success = (total >= level.dc && !isNat1) || isNat20;

  // 5e DMG p. 111: "A successful check yields 1d6 + Wisdom modifier pounds of food and 1d6 + Wisdom modifier gallons of water."
  let foodLbs = 0;
  let waterGallons = 0;

  if (success) {
    const foodDie = Math.floor(Math.random() * 6) + 1;
    const waterDie = Math.floor(Math.random() * 6) + 1;
    const bonus = isNat20 ? 4 : 0;
    foodLbs = Math.max(1, foodDie + wisModifier + bonus);
    waterGallons = Math.max(1, waterDie + wisModifier + bonus);
  }

  // Filter items matching the chosen biome
  const availableItems = FORAGE_LOOT_TABLE.filter((it) => it.biomes.includes(biome));
  const harvested: {
    name: string;
    count: number;
    description: string;
    valueGp: number;
    weightLb: number;
    category: string;
    rarity: string;
  }[] = [];

  if (success && availableItems.length > 0) {
    // Number of distinct harvest types found: 1 to 3 items (more on high rolls or nat 20)
    const harvestCount = isNat20 ? 4 : total >= level.dc + 5 ? 3 : 2;
    // Shuffle available
    const shuffled = [...availableItems].sort(() => 0.5 - Math.random());
    const picked = shuffled.slice(0, Math.min(harvestCount, shuffled.length));

    for (const item of picked) {
      const spread = item.maxQty - item.minQty;
      const count = Math.max(1, item.minQty + Math.floor(Math.random() * (spread + 1)) + (isNat20 ? 1 : 0));
      harvested.push({
        name: item.name,
        count,
        description: item.description,
        valueGp: item.valueGp,
        weightLb: item.weightLb,
        category: item.category,
        rarity: item.rarity,
      });
    }
  }

  return {
    biome,
    abundance,
    dc: level.dc,
    roll,
    modifier: wisModifier,
    total,
    success,
    isNat20,
    isNat1,
    foodLbs,
    waterGallons,
    harvestedItems: harvested,
  };
}
