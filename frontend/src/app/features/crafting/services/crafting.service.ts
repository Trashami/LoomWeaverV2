import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { EquipmentLoadoutItemVm } from '../../characters/models/character-studio.models';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
import { CRAFTING_RECIPES } from '../data/crafting-recipes.data';
import { FORAGE_LOOT_TABLE, FORAGING_ABUNDANCE_LEVELS, FORAGING_BIOMES, resolveForagingHarvest } from '../data/foraging-tables.data';
import { CraftingProjectVm, CraftingRecipe, ForageRollResult, ForagingAbundance, ForagingBiome, RecipeCategory } from '../models/crafting.models';

@Injectable({ providedIn: 'root' })
export class CraftingService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly auth = inject(AuthSessionService);
  private readonly studio = inject(CharacterStudioService);
  private readonly alertify = inject(LwAlertifyService);

  readonly recipes = signal<readonly CraftingRecipe[]>(CRAFTING_RECIPES);
  readonly selectedCategory = signal<RecipeCategory | 'all'>('all');
  readonly searchQuery = signal<string>('');
  readonly activeProjects = signal<readonly CraftingProjectVm[]>([]);
  readonly loading = signal<boolean>(false);

  // Foraging state
  readonly selectedBiome = signal<ForagingBiome>('forest');
  readonly selectedAbundance = signal<ForagingAbundance>('abundant');
  readonly foragingResult = signal<ForageRollResult | null>(null);
  readonly isRollingForage = signal<boolean>(false);

  // Manual GM Item Granting state
  readonly manualItemName = signal<string>('Kingsbloom Herb');
  readonly manualItemQty = signal<number>(1);
  readonly manualItemCategory = signal<string>('herb');
  readonly manualItemRarity = signal<string>('Common');

  // Currently focused character for crafting
  readonly focusedCharacterKey = signal<string>('ciaran');

  readonly availableCharacters = computed(() => {
    return this.studio.sheets().map((s) => ({
      key: s.characterKey,
      name: s.name,
      level: s.level,
      ancestry: s.ancestryOrClan,
      characterClass: s.classOrArchetype,
      assignedAccountId: s.ownerAccountId,
    }));
  });

  readonly activeCharacter = computed(() => {
    const key = this.focusedCharacterKey();
    const sheets = this.studio.sheets();
    return sheets.find((s) => s.characterKey === key) ?? sheets[0] ?? null;
  });

  readonly isGm = computed(() => this.store.viewerRole() === 'gm' || this.store.isGmForActiveCampaign());

  readonly characterInventory = computed<readonly EquipmentLoadoutItemVm[]>(() => {
    const char = this.activeCharacter();
    if (!char) return [];
    return char.equipment ?? [];
  });

  readonly filteredRecipes = computed(() => {
    const cat = this.selectedCategory();
    const q = this.searchQuery().trim().toLowerCase();
    return this.recipes().filter((r) => {
      const matchCat = cat === 'all' || r.category === cat;
      const matchQ =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.requiredTool.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  });

  readonly pendingProjectsForGm = computed(() => {
    return this.activeProjects().filter((p) => p.status === 'pending');
  });

  constructor() {
    // Keep focused character updated with signed in player's character
    effect(() => {
      const char = this.studio.activeSheet();
      if (char?.characterKey) {
        this.focusedCharacterKey.set(char.characterKey);
      }
    });

    // Load projects when campaign changes
    effect(() => {
      const campaignId = this.store.activeCampaignId();
      if (campaignId > 0) {
        this.loadProjects(campaignId);
      }
    });
  }

  setFocusedCharacter(key: string): void {
    this.focusedCharacterKey.set(key);
  }

  loadProjects(campaignId?: number): void {
    const cid = campaignId ?? this.store.activeCampaignId();
    if (cid <= 0) return;
    this.loading.set(true);
    this.http.get<readonly CraftingProjectVm[]>(`/api/v2/campaigns/${cid}/crafting/projects`).subscribe({
      next: (projects) => {
        this.activeProjects.set(projects ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  hasRequiredMaterials(recipe: CraftingRecipe): boolean {
    const inv = this.characterInventory();
    return recipe.ingredients.every((ing) => {
      const matchingCount = inv.filter((item) =>
        item.name.toLowerCase().includes(ing.name.toLowerCase()) ||
        ing.name.toLowerCase().includes(item.name.toLowerCase()),
      ).length;
      return matchingCount >= ing.count;
    });
  }

  getMaterialStatus(recipe: CraftingRecipe): readonly { name: string; needed: number; have: number; satisfied: boolean }[] {
    const inv = this.characterInventory();
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

  startCrafting(recipe: CraftingRecipe, bastionDiscount = false): void {
    const cid = this.store.activeCampaignId();
    const char = this.activeCharacter();
    if (cid <= 0 || !char) {
      this.alertify.notifyStatus('Workshop', 'Notice', 'Select an active campaign and character first.', 'gold');
      return;
    }

    // Check materials
    if (!this.hasRequiredMaterials(recipe)) {
      this.alertify.notifyStatus('Workshop', 'Materials Missing', `You lack the ingredients to craft ${recipe.name}.`, 'crimson');
      return;
    }

    const durationMinutes = bastionDiscount && recipe.bastionBonusEligible ? Math.floor(recipe.durationMinutes / 2) : recipe.durationMinutes;

    // Optional skill check roll d20 + character proficiency/mod
    const d20 = Math.floor(Math.random() * 20) + 1;
    const isInstant = durationMinutes <= 0;

    const payload = {
      characterKey: char.characterKey,
      characterName: char.name,
      recipeId: recipe.id,
      recipeName: recipe.name,
      category: recipe.categoryLabel,
      durationMinutes,
      materialsConsumed: recipe.ingredients,
      outputItem: recipe.output,
      craftCheckRoll: d20,
    };

    this.loading.set(true);
    this.http.post<{ project: CraftingProjectVm; equipmentAdded?: EquipmentLoadoutItemVm }>(
      `/api/v2/campaigns/${cid}/crafting/start`,
      payload,
    ).subscribe({
      next: (res) => {
        this.loading.set(false);
        // Refresh projects and character equipment
        this.loadProjects(cid);
        this.refreshCharacterItems(cid, char.characterKey);

        if (isInstant) {
          this.alertify.notifyStatus(
            char.name,
            'Crafting Complete',
            `Crafted ${recipe.output.name}! Added to your inventory.`,
            'emerald',
            4500,
          );
        } else {
          this.alertify.notifyStatus(
            char.name,
            'Project Started',
            `${recipe.name} is in progress (${recipe.durationLabel}). Alert dispatched to the DM.`,
            'gold',
            5000,
          );
        }
      },
      error: () => {
        this.loading.set(false);
        this.alertify.notifyStatus('Workshop', 'Crafting Error', 'Unable to start project. Check permissions.', 'crimson');
      },
    });
  }

  approveProject(project: CraftingProjectVm, notes?: string): void {
    const cid = this.store.activeCampaignId();
    if (cid <= 0) return;

    this.loading.set(true);
    this.http.post<{ project: CraftingProjectVm; equipmentAdded?: EquipmentLoadoutItemVm }>(
      `/api/v2/campaigns/${cid}/crafting/projects/${project.id}/approve`,
      { notes },
    ).subscribe({
      next: () => {
        this.loading.set(false);
        this.loadProjects(cid);
        this.refreshCharacterItems(cid, project.characterKey);
        this.alertify.notifyStatus(
          'Dungeon Master',
          'Crafting Approved',
          `Approved ${project.outputItemName} for ${project.characterName}. Item deposited in inventory.`,
          'emerald',
          5000,
        );
      },
      error: () => {
        this.loading.set(false);
        this.alertify.notifyStatus('Workshop', 'Approval Error', 'Failed to approve project.', 'crimson');
      },
    });
  }

  rollForaging(survivalModifier = 2): void {
    this.isRollingForage.set(true);
    const biome = this.selectedBiome();
    const abundance = this.selectedAbundance();
    const d20 = Math.floor(Math.random() * 20) + 1;

    setTimeout(() => {
      const res = resolveForagingHarvest(biome, abundance, d20, survivalModifier);
      this.foragingResult.set(res);
      this.isRollingForage.set(false);

      if (res.isNat20) {
        this.alertify.notifyStatus('Foraging', 'CRITICAL SUCCESS', 'Natural 20! Discovered rare flora and pristine springs!', 'gold');
      } else if (res.success) {
        this.alertify.notifyStatus('Foraging', 'Foraging Success', `Harvested ${res.foodLbs} lbs food and ${res.waterGallons} gal water.`, 'emerald');
      } else {
        this.alertify.notifyStatus('Foraging', 'Sparse Yield', `Total ${res.total} failed DC ${res.dc}. Little edible flora found.`, 'crimson');
      }
    }, 400);
  }

  assignForagedHarvestToCharacter(targetCharacterKey?: string): void {
    const res = this.foragingResult();
    const cid = this.store.activeCampaignId();
    const charKey = targetCharacterKey ?? this.focusedCharacterKey();
    if (!res || cid <= 0 || !charKey) return;

    const itemsToGrant: { name: string; description: string; category: string; count: number; rarity: string; valueGp: number; weightLb: number }[] = [];

    // Add foraged flora / minerals / parts
    for (const h of res.harvestedItems) {
      if (h.count > 0) {
        itemsToGrant.push({
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

    // Add food & water if gathered
    if (res.foodLbs > 0) {
      itemsToGrant.push({
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
      itemsToGrant.push({
        name: `Fresh Spring Water (${res.waterGallons} gal)`,
        description: 'Potable water drawn from mountain spring runoff or clear pools.',
        category: 'sustenance',
        count: 1,
        rarity: 'Common',
        valueGp: Math.round(res.waterGallons * 0.1 * 10) / 10,
        weightLb: res.waterGallons * 8.3,
      });
    }

    if (itemsToGrant.length === 0) {
      this.alertify.notifyStatus('Foraging', 'No Items', 'No items in harvest to assign.', 'gold');
      return;
    }

    this.loading.set(true);
    this.http.post<{ success: boolean; count: number }>(
      `/api/v2/campaigns/${cid}/crafting/forage-harvest`,
      {
        characterKey: charKey,
        biome: res.biome,
        abundance: res.abundance,
        survivalCheck: res.total,
        items: itemsToGrant,
      },
    ).subscribe({
      next: (resp) => {
        this.loading.set(false);
        this.refreshCharacterItems(cid, charKey);
        this.alertify.notifyStatus(
          'Foraging Depot',
          'Haul Deposited',
          `Successfully assigned ${resp.count} foraged item(s) to inventory!`,
          'emerald',
          5000,
        );
        this.foragingResult.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.alertify.notifyStatus('Foraging Depot', 'Deposit Failed', 'Failed to add items to character.', 'crimson');
      },
    });
  }

  grantManualItem(targetCharacterKey?: string): void {
    const cid = this.store.activeCampaignId();
    const charKey = targetCharacterKey ?? this.focusedCharacterKey();
    const name = this.manualItemName().trim();
    const count = Math.max(1, this.manualItemQty());
    if (cid <= 0 || !charKey || !name) return;

    const catalogItem = FORAGE_LOOT_TABLE.find((it) => it.name.toLowerCase() === name.toLowerCase());

    const payload = {
      name,
      summary: catalogItem?.description ?? 'Wildcrafting raw material.',
      category: catalogItem?.category ?? this.manualItemCategory(),
      rarity: catalogItem?.rarity ?? this.manualItemRarity(),
      priceGp: catalogItem?.valueGp ?? 1,
      weightLb: catalogItem?.weightLb ?? 0.5,
      slot: 'Gear',
      icon: 'inventory_2',
    };

    this.loading.set(true);
    // Add count times
    let addedCount = 0;
    const addNext = () => {
      this.http.post<EquipmentLoadoutItemVm>(
        `/api/v2/campaigns/${cid}/characters/${encodeURIComponent(charKey)}/items/grant`,
        payload,
      ).subscribe({
        next: () => {
          addedCount++;
          if (addedCount < count) {
            addNext();
          } else {
            this.loading.set(false);
            this.refreshCharacterItems(cid, charKey);
            this.alertify.notifyStatus(
              'DM Dispatch',
              'Item Granted',
              `Granted ${count}x "${name}" to character inventory.`,
              'emerald',
              4500,
            );
          }
        },
        error: () => {
          this.loading.set(false);
          this.alertify.notifyStatus('DM Dispatch', 'Grant Error', 'Could not grant item.', 'crimson');
        },
      });
    };

    addNext();
  }

  deleteInventoryItem(itemId: string): void {
    const cid = this.store.activeCampaignId();
    const char = this.activeCharacter();
    if (cid <= 0 || !char) return;

    this.http.delete(`/api/v2/campaigns/${cid}/characters/${encodeURIComponent(char.characterKey)}/items/${encodeURIComponent(itemId)}`).subscribe({
      next: () => {
        this.refreshCharacterItems(cid, char.characterKey);
        this.alertify.notifyStatus('Inventory', 'Item Removed', 'Discarded item from inventory.', 'gold');
      },
      error: () => {},
    });
  }

  private refreshCharacterItems(campaignId: number, characterKey: string): void {
    this.http.get<readonly EquipmentLoadoutItemVm[]>(
      `/api/v2/campaigns/${campaignId}/characters/${encodeURIComponent(characterKey)}/items`,
    ).subscribe({
      next: (equipment) => {
        if (equipment) {
          this.studio.mergeCatalogInventory(campaignId, characterKey, equipment);
        }
      },
      error: () => {},
    });
  }
}
