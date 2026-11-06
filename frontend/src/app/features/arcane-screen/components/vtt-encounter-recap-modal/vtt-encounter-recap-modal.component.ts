import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { VttLootAndRecapService } from '../../services/vtt-loot-and-recap.service';

@Component({
  selector: 'lw-vtt-encounter-recap-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LwIconComponent],
  templateUrl: './vtt-encounter-recap-modal.component.html',
  styleUrl: './vtt-encounter-recap-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttEncounterRecapModalComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly loot = inject(VttLootAndRecapService);

  readonly showPerBodyBreakdown = signal<boolean>(false);
  readonly showCombatStatsTable = signal<boolean>(true);
  readonly bonusGoldInput = signal<number>(10);
  readonly bonusPresetId = signal<string>('loot-potion-healing');

  isTableSelected(tableId: string): boolean {
    const st = this.loot.recapState();
    return st ? st.selectedRollTables.includes(tableId as never) : tableId === 'auto-cr';
  }

  addBonusGold(): void {
    this.loot.addBonusPoolLoot(this.bonusGoldInput(), undefined);
  }

  addBonusItem(): void {
    this.loot.addBonusPoolLoot(0, this.bonusPresetId());
  }

  openLoomWithLootQuestion(): void {
    const st = this.loot.recapState();
    const sessionNum = st?.sessionNumber ?? 5;
    this.loot.closeModalLocal();
    this.store.setLoomSearchQuery(
      `How much gold and what loot did we get after defeating the dungeon in session ${sessionNum}?`,
    );
    this.store.toggleLoomDrawer(true);
  }
}
