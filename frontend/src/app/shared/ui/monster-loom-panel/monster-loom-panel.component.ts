import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwBadgeComponent, LwBadgeTone } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import {
  LW_MONSTER_OUTCOMES,
  LwMonsterOutcome,
  LwMonsterPickOptionVm,
  LwMonsterSightingDraft,
  LwMonsterSightingVisibility,
  LwMonsterSightingVm,
} from '../monster-card/monster-card.models';

/**
 * Loom history for one creature in the active campaign: when and where the party met it and what happened.
 * The list arrives pre-filtered by the server (players only receive what their character is allowed to know);
 * the record form renders only for the campaign DM.
 */
@Component({
  selector: 'lw-monster-loom-panel',
  standalone: true,
  imports: [DatePipe, FormsModule, NgpButton, LwBadgeComponent, LwButtonComponent],
  templateUrl: './monster-loom-panel.component.html',
  styleUrl: './monster-loom-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMonsterLoomPanelComponent {
  readonly monsterName = input<string>('this creature');
  readonly sightings = input<readonly LwMonsterSightingVm[]>([]);
  readonly isGm = input<boolean>(false);
  readonly sessions = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly encounters = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly characters = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly busy = input<boolean>(false);

  readonly sightingRecorded = output<LwMonsterSightingDraft>();

  readonly outcomes = LW_MONSTER_OUTCOMES;
  readonly outcome = signal<LwMonsterOutcome>('encountered');
  readonly sessionId = signal<string>('');
  readonly encounterId = signal<string>('');
  readonly locationName = signal<string>('');
  readonly visibility = signal<LwMonsterSightingVisibility>('party');
  readonly witnesses = signal<readonly string[]>([]);
  readonly notes = signal<string>('');
  readonly formError = signal<string>('');

  readonly lastOutcome = computed(() => this.sightings()[0]?.outcome ?? null);

  witnessLabel(key: string): string {
    return this.characters().find((c) => c.id === key)?.label ?? key;
  }

  outcomeTone(outcome: string): LwBadgeTone {
    if (['killed', 'defeated', 'betrayed'].includes(outcome)) return 'crimson';
    if (['befriended', 'allied', 'saved', 'recruited', 'tamed', 'spared', 'negotiated'].includes(outcome)) return 'emerald';
    if (['captured', 'fought'].includes(outcome)) return 'gold';
    return 'neutral';
  }

  toggleWitness(key: string): void {
    this.witnesses.update((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  record(): void {
    if (this.visibility() === 'witnesses' && this.witnesses().length === 0) {
      this.formError.set('Choose at least one character who witnessed this.');
      return;
    }
    this.formError.set('');
    this.sightingRecorded.emit({
      outcome: this.outcome(),
      sessionId: this.sessionId() || this.sessions()[0]?.id || '',
      encounterId: this.encounterId(),
      locationName: this.locationName().trim(),
      witnessCharacterKeys: this.witnesses().length ? this.witnesses() : this.characters().map((c) => c.id),
      visibility: this.visibility(),
      notes: this.notes().trim(),
    });
    this.notes.set('');
  }
}
