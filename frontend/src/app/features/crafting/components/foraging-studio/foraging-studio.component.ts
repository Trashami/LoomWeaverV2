import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { CharacterStudioService } from '../../../characters/services/character-studio.service';
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
  private readonly studio = inject(CharacterStudioService);

  readonly biomes = FORAGING_BIOMES;
  readonly abundanceLevels = FORAGING_ABUNDANCE_LEVELS;
  readonly reagentCatalog = FORAGE_LOOT_TABLE;

  readonly gmDispatchOpen = signal<boolean>(false);

  readonly activeCharacter = computed(() => this.crafting.activeCharacter());

  readonly survivalMod = computed(() => {
    const char = this.crafting.activeCharacter();
    if (!char) return 2;
    const wisScore = char.abilities?.find((a) => a.code === 'WIS');
    return wisScore?.modifier ?? 2;
  });

  readonly targetDc = computed(() => {
    const ab = this.abundanceLevels.find((a) => a.id === this.crafting.selectedAbundance());
    return ab?.dc ?? 15;
  });

  readonly currentBiomeLabel = computed(() => {
    const b = this.biomes.find((x) => x.id === this.crafting.selectedBiome());
    return b?.label ?? 'Wilderness';
  });

  readonly currentBiomeDescription = computed(() => {
    const b = this.biomes.find((x) => x.id === this.crafting.selectedBiome());
    return b?.description ?? 'Dense wilderness terrain with hidden botanical specimens and wildlife tracks.';
  });

  getActiveCharName(): string {
    const char = this.crafting.activeCharacter();
    return char?.name ?? this.crafting.getCharacterName();
  }

  getWisMod(charKey: string): number {
    const sheet = this.studio.sheets().find((s) => s.characterKey === charKey);
    return sheet?.abilities?.find((a) => a.code === 'WIS')?.modifier ?? 2;
  }

  selectToken(key: string): void {
    if (key) {
      this.crafting.setFocusedCharacter(key);
    }
  }

  applyHarvestToActiveCharacter(): void {
    const key = this.crafting.focusedCharacterKey();
    if (key) {
      this.crafting.assignForagedHarvestToCharacter(key);
    }
  }

  goToWorkshop(): void {
    this.crafting.activeTab.set('workshop');
  }

  grantManualDispatch(): void {
    this.crafting.grantManualItem();
  }

  quickGrant(name: string, qty: number): void {
    this.crafting.grantManualItem(this.crafting.focusedCharacterKey(), name, qty);
  }
}
