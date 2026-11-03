import { EquipmentLoadoutItemVm } from '../../characters/models/character-studio.models';
import { CraftingRecipe, ForageRollResult } from '../models/crafting.models';

export interface RecipeCheckStats {
  readonly ability: string;
  readonly mod: number;
  readonly totalMod: number;
  readonly dc: number;
}

export interface MaterialStatusItem {
  readonly name: string;
  readonly needed: number;
  readonly have: number;
  readonly satisfied: boolean;
}

export interface GrantHarvestItemDto {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly count: number;
  readonly rarity: string;
  readonly valueGp: number;
  readonly weightLb: number;
}

export function resolveAbilityForRecipe(recipe: CraftingRecipe): { code: string; label: string } {
  const cat = recipe.category;
  const skill = (recipe.dcSkill || '').toLowerCase();
  if (skill.includes('wis') || cat === 'herbalism' || cat === 'provisions') return { code: 'WIS', label: 'Wisdom' };
  if (skill.includes('int') || cat === 'alchemy' || cat === 'arcane') return { code: 'INT', label: 'Intelligence' };
  if (skill.includes('str') || cat === 'smithing') return { code: 'STR', label: 'Strength' };
  if (skill.includes('dex') || cat === 'leatherwork') return { code: 'DEX', label: 'Dexterity' };
  return { code: 'WIS', label: 'Wisdom' };
}

export function getCharacterRecipeModifier(char: any, recipe: CraftingRecipe): RecipeCheckStats {
  const ability = resolveAbilityForRecipe(recipe);
  const statScore = char?.abilities?.find((a: any) => a.code === ability.code);
  const abilityMod = statScore?.modifier ?? 0;
  const profBonus = (char?.level ?? 1) >= 5 ? 3 : 2;
  return {
    ability: ability.label,
    mod: abilityMod,
    totalMod: abilityMod + profBonus,
    dc: recipe.dcTarget ?? 10,
  };
}

export function hasRequiredMaterials(recipe: CraftingRecipe, inv: readonly EquipmentLoadoutItemVm[]): boolean {
  return recipe.ingredients.every((ing) => {
    const matchingCount = inv.filter((item) =>
      item.name.toLowerCase().includes(ing.name.toLowerCase()) ||
      ing.name.toLowerCase().includes(item.name.toLowerCase()),
    ).length;
    return matchingCount >= ing.count;
  });
}

export function getMaterialStatus(recipe: CraftingRecipe, inv: readonly EquipmentLoadoutItemVm[]): readonly MaterialStatusItem[] {
  return recipe.ingredients.map((ing) => {
    const have = inv.filter((item) =>
      item.name.toLowerCase().includes(ing.name.toLowerCase()) ||
      ing.name.toLowerCase().includes(item.name.toLowerCase()),
    ).length;
    return {
      name: ing.name,
      needed: ing.count,
      have,
      satisfied: have >= ing.count,
    };
  });
}

export function buildHarvestGrantList(res: ForageRollResult): GrantHarvestItemDto[] {
  const list: GrantHarvestItemDto[] = [];
  for (const h of res.harvestedItems) {
    if (h.count > 0) {
      list.push({
        name: h.name,
        description: h.description,
        category: h.category,
        count: h.count,
        rarity: h.rarity,
        valueGp: h.valueGp,
        weightLb: h.weightLb,
      });
    }
  }
  if (res.foodLbs > 0) {
    list.push({
      name: `Wild Sustenance Rations (${res.foodLbs} lbs)`,
      description: 'Foraged wild tubers, berries, and cleaned small game meat.',
      category: 'sustenance',
      count: 1,
      rarity: 'Common',
      valueGp: Math.round(res.foodLbs * 0.2 * 10) / 10,
      weightLb: res.foodLbs,
    });
  }
  if (res.waterGallons > 0) {
    list.push({
      name: `Fresh Spring Water (${res.waterGallons} gal)`,
      description: 'Potable water drawn from mountain spring runoff or clear pools.',
      category: 'sustenance',
      count: 1,
      rarity: 'Common',
      valueGp: Math.round(res.waterGallons * 0.1 * 10) / 10,
      weightLb: res.waterGallons * 8.3,
    });
  }
  return list;
}
