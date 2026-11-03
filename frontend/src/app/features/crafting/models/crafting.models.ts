export type RecipeCategory =
  | 'alchemy'
  | 'herbalism'
  | 'smithing'
  | 'leatherwork'
  | 'arcane'
  | 'provisions';

export interface RecipeIngredient {
  readonly name: string;
  readonly count: number;
  readonly category?: string;
}

export interface RecipeOutputItem {
  readonly name: string;
  readonly slot: string;
  readonly category: string;
  readonly rarity: string;
  readonly priceGp: number;
  readonly weightLb: number;
  readonly summary: string;
  readonly bonusLabel: string;
  readonly icon?: string;
}

export interface CraftingRecipe {
  readonly id: string;
  readonly name: string;
  readonly category: RecipeCategory;
  readonly categoryLabel: string;
  readonly description: string;
  readonly requiredTool: string;
  readonly durationMinutes: number;
  readonly durationLabel: string;
  readonly gpCost: number;
  readonly dcSkill?: string;
  readonly dcTarget?: number;
  readonly ingredients: readonly RecipeIngredient[];
  readonly output: RecipeOutputItem;
  readonly ruleSource: string;
  readonly bastionBonusEligible?: boolean;
}

export interface CraftingProjectVm {
  readonly id: string;
  readonly campaignId: number;
  readonly characterKey: string;
  readonly characterName: string;
  readonly recipeId: string;
  readonly recipeName: string;
  readonly outputItemName: string;
  readonly category: string;
  readonly status: 'pending' | 'completed' | 'failed';
  readonly durationMinutes: number;
  readonly startedAt: string;
  readonly completesAt: string;
  readonly materialsConsumed: readonly { name: string; count: number }[];
  readonly outputItem: RecipeOutputItem;
  readonly creatorAccountId: string;
  readonly creatorUsername: string;
  readonly craftCheckRoll?: number;
  readonly craftModifier?: number;
  readonly craftCheckTotal?: number;
  readonly recipeDc?: number;
  readonly dcSkill?: string;
  readonly mishapItem?: RecipeOutputItem;
  readonly failureReason?: string;
  readonly isCritSuccess?: boolean;
  readonly dmApprovedAt?: string;
  readonly approvedBy?: string;
  readonly dmNotes?: string;
}

export type ForagingBiome =
  | 'forest'
  | 'mountain'
  | 'coastal'
  | 'swamp'
  | 'underdark'
  | 'plains'
  | 'desert'
  | 'ruins';

export type ForagingAbundance = 'abundant' | 'limited' | 'sparse';

export interface ForageHarvestItem {
  readonly name: string;
  readonly category: 'herb' | 'mineral' | 'creature' | 'sustenance';
  readonly rarity: string;
  readonly weightLb: number;
  readonly valueGp: number;
  readonly description: string;
  readonly minQty: number;
  readonly maxQty: number;
  readonly biomes: readonly ForagingBiome[];
}

export interface ForageRollResult {
  readonly biome: ForagingBiome;
  readonly abundance: ForagingAbundance;
  readonly dc: number;
  readonly roll: number;
  readonly modifier: number;
  readonly total: number;
  readonly success: boolean;
  readonly isNat20: boolean;
  readonly isNat1: boolean;
  readonly foodLbs: number;
  readonly waterGallons: number;
  deposited?: boolean;
  depositedTo?: string;
  readonly harvestedItems: readonly {
    readonly name: string;
    count: number;
    readonly description: string;
    readonly valueGp: number;
    readonly weightLb: number;
    readonly category: string;
    readonly rarity: string;
  }[];
}
