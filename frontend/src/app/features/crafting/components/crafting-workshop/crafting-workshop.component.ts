import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { CraftingService } from '../../services/crafting.service';

@Component({
  selector: 'lw-crafting-workshop',
  standalone: true,
  imports: [NgpButton, LwIconComponent],
  templateUrl: './crafting-workshop.component.html',
  styleUrl: './crafting-workshop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CraftingWorkshopComponent {
  readonly crafting = inject(CraftingService);

  readonly inventoryFilter = signal<'materials' | 'all'>('materials');
  readonly bastionBonusActive = signal<boolean>(false);

  readonly filteredInventory = computed(() => {
    const inv = this.crafting.characterInventory();
    if (this.inventoryFilter() === 'all') {
      return inv;
    }
    // Filter to known materials, reagents, herbs, tools, parts, sustenance
    const materialKeywords = [
      'herb', 'leaf', 'root', 'ore', 'crystal', 'ingot', 'dust', 'powder',
      'moss', 'wood', 'timber', 'pitch', 'hide', 'feather', 'sac', 'brine',
      'sulfur', 'pyrite', 'silver', 'iron', 'water', 'meat', 'berries',
      'rations', 'kit', 'supplies', 'tools', 'vellum', 'ink', 'balm', 'bandages',
      'reagent', 'flora', 'mineral', 'chitin', 'scales', 'fang', 'venom',
    ];
    return inv.filter((item) => {
      const name = item.name.toLowerCase();
      const bonus = (item.bonusLabel || '').toLowerCase();
      const summary = (item.summary || '').toLowerCase();
      const source = ((item as { source?: string }).source || '').toLowerCase();
      return (
        source.includes('foraged') ||
        source.includes('crafted') ||
        bonus.includes('reagent') ||
        bonus.includes('flora') ||
        bonus.includes('mineral') ||
        bonus.includes('sustenance') ||
        materialKeywords.some((k) => name.includes(k) || bonus.includes(k) || summary.includes(k))
      );
    });
  });

  onCharacterChanged(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    if (key) {
      this.crafting.setFocusedCharacter(key);
    }
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.crafting.searchQuery.set(query);
  }

  getRecipeMod(recipe: import('../../models/crafting.models').CraftingRecipe) {
    return this.crafting.getCharacterRecipeModifier(this.crafting.focusedCharacterKey(), recipe);
  }
}
