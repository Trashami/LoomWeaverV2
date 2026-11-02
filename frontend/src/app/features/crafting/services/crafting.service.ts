import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { TableRealtimeSyncService } from '../../../core/services/table-realtime-sync.service';
import { EquipmentLoadoutItemVm } from '../../characters/models/character-studio.models';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
import { FullscreenDiceOverlayService, type FullscreenDieEntry } from '../../dice/engine/fullscreen-dice-overlay.service';
import type { DicePolyhedronType } from '../../dice/engine/models/dice-model.types';
import { CRAFTING_RECIPES } from '../data/crafting-recipes.data';
import { FORAGE_LOOT_TABLE, FORAGING_ABUNDANCE_LEVELS, FORAGING_BIOMES, resolveForagingHarvest } from '../data/foraging-tables.data';
import { CraftingProjectVm, CraftingRecipe, ForageRollResult, ForagingAbundance, ForagingBiome, RecipeCategory } from '../models/crafting.models';

export type CraftingPageTab = 'workshop' | 'projects' | 'foraging' | 'rules';

@Injectable({ providedIn: 'root' })
export class CraftingService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly auth = inject(AuthSessionService);
  private readonly studio = inject(CharacterStudioService);
  private readonly alertify = inject(LwAlertifyService);
  private readonly diceOverlay = inject(FullscreenDiceOverlayService);
  private readonly tableSync = inject(TableRealtimeSyncService);

  readonly activeTab = signal<CraftingPageTab>('workshop');
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

  // Currently focused character for crafting & foraging
  readonly focusedCharacterKey = signal<string>('char-dal');
  readonly loadedInventory = signal<readonly EquipmentLoadoutItemVm[]>([]);

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
    const baseEquipment = char?.equipment ?? [];
    const dbItems = this.loadedInventory();
    const dbIds = new Set(dbItems.map((i) => i.id));
    return [...dbItems, ...baseEquipment.filter((i) => !dbIds.has(i.id))];
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

  private lastLoadedCharKey = '';
  private lastLoadedCampaignId = 0;

  constructor() {
    // Keep focused character updated with active sheet if available
    effect(() => {
      const char = this.studio.activeSheet();
      if (char?.characterKey && char.characterKey !== this.focusedCharacterKey()) {
        this.focusedCharacterKey.set(char.characterKey);
      }
    });

    // Auto-load inventory and projects whenever campaign or focused character changes
    effect(() => {
      const cid = this.store.activeCampaignId();
      const charKey = this.focusedCharacterKey();
      if (cid > 0) {
        this.loadProjects(cid);
        if (charKey) {
          this.loadCharacterInventory(cid, charKey);
        }
      }
    });
  }

  setFocusedCharacter(key: string): void {
    if (!key) return;
    this.focusedCharacterKey.set(key);
    const cid = this.store.activeCampaignId();
    if (cid > 0) {
      this.loadCharacterInventory(cid, key, true);
    }
  }

  getCharacterName(key?: string): string {
    const targetKey = key ?? this.focusedCharacterKey();
    const found = this.availableCharacters().find((c) => c.key === targetKey);
    return found?.name ?? 'Character';
  }

  loadCharacterInventory(campaignId: number, characterKey: string, force = false): void {
    if (campaignId <= 0 || !characterKey) {
      this.loadedInventory.set([]);
      return;
    }
    if (!force && this.lastLoadedCharKey === characterKey && this.lastLoadedCampaignId === campaignId) {
      return;
    }
    this.lastLoadedCharKey = characterKey;
    this.lastLoadedCampaignId = campaignId;

    this.http.get<readonly EquipmentLoadoutItemVm[]>(
      `/api/v2/campaigns/${campaignId}/characters/${encodeURIComponent(characterKey)}/items`,
    ).subscribe({
      next: (items) => {
        const list = items ?? [];
        this.loadedInventory.set(list);
        if (list.length > 0) {
          this.studio.mergeCatalogInventory(campaignId, characterKey, list);
        }
      },
      error: () => {},
    });
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

    if (!this.hasRequiredMaterials(recipe)) {
      this.alertify.notifyStatus('Workshop', 'Materials Missing', `You lack the ingredients to craft ${recipe.name}.`, 'crimson');
      return;
    }

    const durationMinutes = bastionDiscount && recipe.bastionBonusEligible ? Math.floor(recipe.durationMinutes / 2) : recipe.durationMinutes;
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
      next: () => {
        this.loading.set(false);
        this.loadProjects(cid);
        this.loadCharacterInventory(cid, char.characterKey, true);

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
        this.loadCharacterInventory(cid, project.characterKey, true);
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

  rollForaging(): void {
    if (this.isRollingForage()) return;
    const cid = this.store.activeCampaignId();
    const char = this.activeCharacter();
    const charKey = char?.characterKey ?? this.focusedCharacterKey();
    const charName = char?.name ?? 'Explorer';

    const wisMod = char?.abilities?.find((a) => a.code === 'WIS')?.modifier ?? 2;
    const biome = this.selectedBiome();
    const abundance = this.selectedAbundance();
    const abundanceMeta = FORAGING_ABUNDANCE_LEVELS.find((a) => a.id === abundance);
    const dc = abundanceMeta?.dc ?? 15;

    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + wisMod;
    const isNat20 = d20 === 20;
    const isCritFail = d20 === 1;
    const isSuccess = isNat20 || total >= dc;

    this.isRollingForage.set(true);

    const dieType: DicePolyhedronType = 'd20';
    const entries: FullscreenDieEntry[] = [{ dieType, value: d20 }];

    this.diceOverlay.triggerFullScreenRoll({
      label: `${charName} · Survival Check (Foraging)`,
      actorName: charName,
      expression: `1d20 + ${wisMod}`,
      diceValues: [d20],
      diceEntries: entries,
      modifier: wisMod,
      total,
      outcomeBadge: isNat20 ? 'NATURAL 20!' : (isSuccess ? `SUCCESS (DC ${dc})` : `FAILED DC ${dc}`),
      isNat20,
      isCritFail,
      alert: {
        whoRolled: charName,
        rollType: 'Wilderness Foraging (Survival)',
        formula: `1d20 + ${wisMod}`,
        naturalDie: d20,
        modifier: wisMod,
        adjustedTotal: total,
        isNat20,
        isCritFail,
        outcomeSubtext: isSuccess ? `Harvest Succeeded! (DC ${dc})` : `Sparse harvest (DC ${dc})`,
      },
      onComplete: () => {
        this.isRollingForage.set(false);
        const harvest = resolveForagingHarvest(biome, abundance, d20, wisMod);
        this.foragingResult.set(harvest);

        if (harvest.success) {
          this.assignForagedHarvestToCharacter(charKey, harvest);
        } else {
          this.alertify.notifyStatus(
            charName,
            'Sparse Harvest',
            `Survival roll ${total} did not meet DC ${dc}. Only barren ground or picked-over roots found.`,
            'gold',
            5000,
          );
        }
      },
    });
  }

  assignForagedHarvestToCharacter(targetCharacterKey?: string, overrideResult?: ForageRollResult): void {
    const res = overrideResult ?? this.foragingResult();
    const cid = this.store.activeCampaignId();
    const charKey = targetCharacterKey ?? this.focusedCharacterKey();
    if (!res || cid <= 0 || !charKey) return;

    const charName = this.getCharacterName(charKey);
    const itemsToGrant: { name: string; description: string; category: string; count: number; rarity: string; valueGp: number; weightLb: number }[] = [];

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

    const itemNames = itemsToGrant.map((i) => (i.count > 1 ? `${i.count}x ${i.name}` : i.name)).join(', ');

    this.loading.set(true);
    this.http.post<{ success: boolean; count: number; items?: EquipmentLoadoutItemVm[] }>(
      `/api/v2/campaigns/${cid}/crafting/forage-harvest`,
      {
        characterKey: charKey,
        biome: res.biome,
        abundance: res.abundance,
        survivalCheck: res.total,
        items: itemsToGrant,
      },
    ).subscribe({
      next: () => {
        this.loading.set(false);
        this.loadCharacterInventory(cid, charKey, true);

        // Mark harvest as deposited
        res.deposited = true;
        res.depositedTo = charName;
        this.foragingResult.set({ ...res });

        this.alertify.notifyStatus(
          charName,
          'Foraged Bounty Received',
          `Added to ${charName}'s inventory: ${itemNames}`,
          'emerald',
          6500,
        );

        this.tableSync.publishTableEvent('forage_harvest', charName, `${charName} foraged: ${itemNames}`, {
          characterKey: charKey,
          items: itemsToGrant,
        });
      },
      error: () => {
        this.loading.set(false);
        this.alertify.notifyStatus('Foraging Depot', 'Deposit Failed', 'Failed to add items to character.', 'crimson');
      },
    });
  }

  grantManualItem(targetCharacterKey?: string, customName?: string, customQty?: number): void {
    const cid = this.store.activeCampaignId();
    const charKey = targetCharacterKey ?? this.focusedCharacterKey();
    const name = (customName ?? this.manualItemName()).trim();
    const count = Math.max(1, customQty ?? this.manualItemQty());
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
            this.loadCharacterInventory(cid, charKey, true);
            const charName = this.getCharacterName(charKey);
            this.alertify.notifyStatus(
              'DM Dispatch',
              'Item Granted',
              `Granted ${count}x "${name}" to ${charName}'s inventory.`,
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
    const charKey = this.focusedCharacterKey();
    if (cid <= 0 || !charKey) return;

    this.http.delete(`/api/v2/campaigns/${cid}/characters/${encodeURIComponent(charKey)}/items/${encodeURIComponent(itemId)}`).subscribe({
      next: () => {
        this.loadCharacterInventory(cid, charKey, true);
        this.alertify.notifyStatus('Inventory', 'Item Removed', 'Discarded item from inventory.', 'gold');
      },
      error: () => {},
    });
  }
}
