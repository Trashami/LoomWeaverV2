import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { FullscreenDiceOverlayService } from '../../../dice/engine/fullscreen-dice-overlay.service';
import { VttCombatService } from '../../services/vtt-combat.service';
import { VTT_GM_TABLES, VttGmTable, VttGmTableId } from './vtt-gm-tables';

export type VttGmGuideSection = 'guide' | 'notes' | 'actions';

@Component({
  selector: 'lw-vtt-gm-guide',
  standalone: true,
  imports: [NgpButton],
  templateUrl: './vtt-gm-guide-panel.component.html',
  styleUrl: './vtt-gm-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttGmGuidePanelComponent {
  readonly vtt = inject(VttCombatService);
  private readonly fullscreenDice = inject(FullscreenDiceOverlayService);

  readonly readout = output<string>();

  readonly section = signal<VttGmGuideSection>('guide');
  readonly encounter = computed(() => this.vtt.activeLiveEncounter());
  readonly tables: readonly VttGmTable[] = VTT_GM_TABLES;
  readonly lastTableResult = signal<{ label: string; roll: number; text: string } | null>(null);
  readonly inspirationGranted = signal(false);

  toggleObjective(objectiveId: string): void {
    const enc = this.encounter();
    if (enc) this.vtt.toggleObjective(enc.id, objectiveId);
  }

  async copyReadAloud(): Promise<void> {
    const text = this.encounter()?.readAloudText ?? '';
    try {
      await navigator.clipboard.writeText(text);
      this.readout.emit('Read-aloud text copied to clipboard.');
    } catch {
      this.readout.emit('Clipboard unavailable. Select the text manually.');
    }
  }

  promptGroupCheck(label: string): void {
    this.readout.emit(`Prompted all active players: ${label}`);
  }

  rest(kind: 'short' | 'long'): void {
    for (const hero of this.vtt.partyTokensInScene()) {
      const delta = kind === 'short' ? 8 : hero.maxHp - hero.currentHp;
      if (delta !== 0) this.vtt.adjustCombatantHp(hero.key, delta);
    }
    this.readout.emit(
      kind === 'short'
        ? 'Short rest: party recovered 8 HP each (capped at maximum).'
        : 'Long rest: party restored to maximum HP.',
    );
  }

  grantInspiration(): void {
    this.inspirationGranted.set(true);
    this.readout.emit('Heroic Inspiration granted to the party (view flag only; not saved to characters).');
  }

  rollTable(id: VttGmTableId): void {
    const table = this.tables.find((t) => t.id === id);
    if (!table) return;
    const roll = Math.floor(Math.random() * table.die) + 1;
    const text = table.entries[roll - 1] ?? '';
    this.lastTableResult.set({ label: table.label, roll, text });
    this.readout.emit(`${table.label} (d${table.die} [${roll}]): ${text}`);
    this.fullscreenDice.triggerFullScreenRoll({
      label: table.label,
      actorName: this.vtt.selectedAttacker().name,
      expression: `1d${table.die}`,
      diceValues: [roll],
      modifier: 0,
      total: roll,
      isNat20: false,
      isCritFail: false,
    });
  }
}
