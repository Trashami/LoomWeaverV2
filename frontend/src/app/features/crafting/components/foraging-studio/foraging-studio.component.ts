import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { FORAGE_LOOT_TABLE, FORAGING_ABUNDANCE_LEVELS, FORAGING_BIOMES } from '../../data/foraging-tables.data';
import { CraftingService } from '../../services/crafting.service';

@Component({
  selector: 'lw-foraging-studio',
  standalone: true,
  imports: [NgpButton, LwIconComponent],
  templateUrl: './foraging-studio.component.html',
  styleUrl: './foraging-studio.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForagingStudioComponent {
  readonly crafting = inject(CraftingService);

  readonly biomes = FORAGING_BIOMES;
  readonly abundanceLevels = FORAGING_ABUNDANCE_LEVELS;
  readonly reagentCatalog = FORAGE_LOOT_TABLE;

  readonly targetCharacterKey = signal<string>('ciaran');

  readonly survivalMod = computed(() => {
    // Survival modifier based on character Wisdom mod
    const char = this.crafting.activeCharacter();
    if (!char) return 2;
    const wisScore = char.abilities?.find((a) => a.code === 'WIS');
    return wisScore?.modifier ?? 2;
  });

  getTargetCharName(): string {
    const chars = this.crafting.availableCharacters();
    const match = chars.find((c) => c.key === this.targetCharacterKey());
    return match ? match.name : 'Character';
  }

  decrementItem(item: { count: number }): void {
    if (item.count > 0) item.count--;
  }

  incrementItem(item: { count: number }): void {
    if (item.count < 99) item.count++;
  }
}
