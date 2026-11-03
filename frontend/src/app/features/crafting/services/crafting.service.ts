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
import { FORAGE_LOOT_TABLE, FORAGING_ABUNDANCE_LEVELS, resolveForagingHarvest } from '../data/foraging-tables.data';
import { CraftingProjectVm, CraftingRecipe, ForageRollResult, ForagingAbundance, ForagingBiome, RecipeCategory } from '../models/crafting.models';
import {
  buildHarvestGrantList,
  getCharacterRecipeModifier,
  getMaterialStatus,
  hasRequiredMaterials,
  MaterialStatusItem,
  RecipeCheckStats,
  resolveAbilityForRecipe,
} from './crafting-helpers';

export type CraftingPageTab = 'workshop' | 'projects' | 'foraging' | 'rules';

@Injectable({ providedIn: 'root' })
export class CraftingService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly auth = inject(AuthSessionService);
  private readonly studio = inject(CharacterStudioService);
  private readonly alertify = inject(LwAlertifyService);
  private readonly diceOverlay = inject(FullscreenDiceOverlayService);
  readonly tableSync = inject(TableRealtimeSyncService);

  readonly activeTab = signal<CraftingPageTab>('workshop');
  readonly recipes = signal<readonly CraftingRecipe[]>(CRAFTING_RECIPES);
  readonly selectedCategory = signal<RecipeCategory | 'all'>('all');
  readonly searchQuery = signal<string>('');
  readonly activeProjects = signal<readonly CraftingProjectVm[]>([]);
  readonly loading = signal<boolean>(false);

  readonly selectedBiome = signal<ForagingBiome>('forest');
  readonly selectedAbundance = signal<ForagingAbundance>('abundant');
  readonly foragingResult = signal<ForageRollResult | null>(null);
  readonly isRollingForage = signal<boolean>(false);

  readonly manualItemName = signal<string>('Kingsbloom Herb');
  readonly manualItemQty = signal<number>(1);
  readonly manualItemCategory = signal<string>('herb');
  readonly manualItemRarity = signal<string>('Common');

  readonly isGm = computed(() => {
    return this.store.viewerRole() === 'gm' || this.store.isUserGmForCampaign(this.store.activeCampaign());
  });

  readonly availableCharacters = computed(() => {
    const list = this.isGm()
      ? this.studio.campaignSheets()
      : this.studio.authorizedSheetsForActiveCampaign();
    return list.map((s) => ({
      key: s.characterKey,
      name: s.name,
      level: s.level,
      ancestry: s.ancestryOrClan,
      characterClass: s.classOrArchetype,
      assignedAccountId: s.ownerAccountId,
    }));
  });

  readonly focusedCharacterKey = signal<string>('char-dal');
  readonly characterInventoryMap = signal<Record<string, readonly EquipmentLoadoutItemVm[]>>({});

  readonly activeCharacter = computed(() => {
    const key = this.focusedCharacterKey();
    const sheets = this.isGm()
      ? this.studio.campaignSheets()
      : this.studio.authorizedSheetsForActiveCampaign();
    return sheets.find((s) => s.characterKey === key) ?? sheets[0] ?? null;
  });

  readonly characterInventory = computed<readonly EquipmentLoadoutItemVm[]>(() => {
    const char = this.activeCharacter();
    if (!char) return [];
    const key = char.characterKey;
    const dbItems = this.characterInventoryMap()[key];
    if (dbItems !== undefined) {
      return dbItems;
    }
    return (char.equipment ?? []).filter((e) => !e.id.startsWith('inv-'));
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
    effect(() => {
      const chars = this.availableCharacters();
      const current = this.focusedCharacterKey();
      if (chars.length > 0 && !chars.some((c) => c.key === current)) {
        this.focusedCharacterKey.set(chars[0].key);
      }
    });

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
    this.studio.selectCharacter(key);
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
    if (campaignId <= 0 || !characterKey) return;
    if (!force && this.characterInventoryMap()[characterKey] !== undefined) return;

    this.http.get<readonly EquipmentLoadoutItemVm[]>(
      `/api/v2/campaigns/${campaignId}/characters/${encodeURIComponent(characterKey)}/items`,
    ).subscribe({
      next: (items) => {
        const list = items ?? [];
        this.characterInventoryMap.update((map) => ({ ...map, [characterKey]: list }));
      },
      error: () => {
        this.characterInventoryMap.update((map) => ({ ...map, [characterKey]: [] }));
      },
    });
  }

  loadProjects(campaignId?: number): void {
    const cid = campaignId ?? this.store.activeCampaignId();
    if (cid <= 0) return;
    this.http.get<readonly CraftingProjectVm[]>(`/api/v2/campaigns/${cid}/crafting/projects`).subscribe({
      next: (projects) => {
        this.activeProjects.set(projects ?? []);
      },
      error: () => {},
    });
  }

  resolveAbilityForRecipe(recipe: CraftingRecipe): { code: string; label: string } {
    return resolveAbilityForRecipe(recipe);
  }

  getCharacterRecipeModifier(charKey: string, recipe: CraftingRecipe): RecipeCheckStats {
    const char = this.studio.sheets().find((s) => s.characterKey === charKey) ?? this.activeCharacter();
    return getCharacterRecipeModifier(char, recipe);
  }

  hasRequiredMaterials(recipe: CraftingRecipe): boolean {
    return hasRequiredMaterials(recipe, this.characterInventory());
  }

  getMaterialStatus(recipe: CraftingRecipe): readonly MaterialStatusItem[] {
    return getMaterialStatus(recipe, this.characterInventory());
  }

  startCrafting(recipe: CraftingRecipe, durationSecondsOverride?: number): void {
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

    const durationSeconds = durationSecondsOverride !== undefined
      ? durationSecondsOverride
      : (recipe.durationMinutes * 60);
    const isInstant = durationSeconds <= 0;
    const stats = this.getCharacterRecipeModifier(char.characterKey, recipe);
    const d20 = Math.floor(Math.random() * 20) + 1;
    const checkTotal = d20 + stats.totalMod;

    const payload = {
      characterKey: char.characterKey,
      characterName: char.name,
      recipeId: recipe.id,
      recipeName: recipe.name,
      category: recipe.categoryLabel,
      durationSeconds,
      durationMinutes: Math.max(0, Math.ceil(durationSeconds / 60)),
      materialsConsumed: recipe.ingredients,
      outputItem: recipe.output,
      craftCheckRoll: d20,
      craftModifier: stats.totalMod,
      craftCheckTotal: checkTotal,
      recipeDc: stats.dc,
      dcSkill: recipe.dcSkill ?? `${stats.ability} Check`,
    };

    this.loading.set(true);
    this.http.post<{ project: CraftingProjectVm; equipmentAdded?: EquipmentLoadoutItemVm; isSuccess?: boolean }>(
      `/api/v2/campaigns/${cid}/crafting/start`,
      payload,
    ).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.loadProjects(cid);
        this.loadCharacterInventory(cid, char.characterKey, true);

        if (isInstant) {
          const title = res.isSuccess ? 'Crafting Complete' : 'Crafting Mishap';
          const msg = res.isSuccess
            ? `Check ${checkTotal} beat DC ${stats.dc}! Crafted ${recipe.output.name} added to inventory.`
            : `Check ${checkTotal} failed DC ${stats.dc}. Materials ruined and hazardous byproduct deposited.`;
          this.alertify.notifyStatus(char.name, title, msg, res.isSuccess ? 'emerald' : 'crimson', 5000);
        } else {
          this.alertify.notifyStatus(
            char.name,
            'Project Started',
            `${recipe.name} in progress. Check: ${d20}+${stats.totalMod} (${checkTotal}) vs DC ${stats.dc}.`,
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

  completeProjectNow(project: CraftingProjectVm): void {
    const cid = this.store.activeCampaignId();
    if (cid <= 0) return;

    this.loading.set(true);
    this.http.post<{ project: CraftingProjectVm; equipmentAdded?: EquipmentLoadoutItemVm; isSuccess?: boolean }>(
      `/api/v2/campaigns/${cid}/crafting/projects/${project.id}/complete-now`,
      {},
    ).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.loadProjects(cid);
        this.loadCharacterInventory(cid, project.characterKey, true);

        const title = res.isSuccess ? 'Crafting Finished' : 'Crafting Mishap';
        const msg = res.isSuccess
          ? `${project.outputItemName} successfully forged for ${project.characterName}!`
          : `Project suffered a mishap. Byproduct placed in ${project.characterName}'s inventory.`;
        this.alertify.notifyStatus(project.characterName, title, msg, res.isSuccess ? 'emerald' : 'crimson', 5000);
      },
      error: () => {
        this.loading.set(false);
        this.loadProjects(cid);
      },
    });
  }

  approveProject(project: CraftingProjectVm, outcome: 'success' | 'mishap' | 'auto' = 'auto', notes?: string): void {
    const cid = this.store.activeCampaignId();
    if (cid <= 0) return;

    this.loading.set(true);
    this.http.post<{ project: CraftingProjectVm; equipmentAdded?: EquipmentLoadoutItemVm; isSuccess?: boolean }>(
      `/api/v2/campaigns/${cid}/crafting/projects/${project.id}/approve`,
      { outcome, notes },
    ).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.loadProjects(cid);
        this.loadCharacterInventory(cid, project.characterKey, true);

        const title = res.isSuccess ? 'Crafting Success' : 'Crafting Mishap';
        const msg = res.isSuccess
          ? `Approved ${project.outputItemName} for ${project.characterName}. Item deposited in inventory.`
          : `Project deemed failed. Dangerous byproduct delivered to ${project.characterName}.`;
        this.alertify.notifyStatus('Dungeon Master', title, msg, res.isSuccess ? 'emerald' : 'crimson', 5000);
      },
      error: () => {
        this.loading.set(false);
        this.alertify.notifyStatus('Workshop', 'Approval Error', 'Failed to resolve project.', 'crimson');
      },
    });
  }

  rollForaging(): void {
    if (this.isRollingForage()) return;
    const char = this.activeCharacter();
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

        if (!harvest.success) {
          this.alertify.notifyStatus(charName, 'Sparse Harvest', `Survival roll ${total} did not meet DC ${dc}. Only barren ground found.`, 'gold', 5000);
        }
      },
    });
  }

  assignForagedHarvestToCharacter(targetCharacterKey?: string): void {
    const res = this.foragingResult();
    const cid = this.store.activeCampaignId();
    const charKey = targetCharacterKey ?? this.focusedCharacterKey();
    if (!res || cid <= 0 || !charKey) return;

    const charName = this.getCharacterName(charKey);
    const itemsToGrant = buildHarvestGrantList(res);

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
        res.deposited = true;
        res.depositedTo = charName;
        this.foragingResult.set({ ...res });

        this.alertify.notifyStatus(charName, 'Foraged Bounty Received', `Added to ${charName}'s inventory: ${itemNames}`, 'emerald', 6500);
        this.tableSync.publishTableEvent('forage_harvest', charName, `${charName} foraged: ${itemNames}`, { characterKey: charKey, items: itemsToGrant });
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
            this.alertify.notifyStatus('DM Dispatch', 'Item Granted', `Granted ${count}x "${name}" to ${charName}'s inventory.`, 'emerald', 4500);
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
