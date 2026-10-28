import { ChangeDetectionStrategy, Component, effect, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpSwitch, NgpSwitchThumb } from 'ng-primitives/switch';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwModalComponent } from '../modal/modal.component';
import {
  LW_CHALLENGE_RATINGS,
  LW_CREATURE_TYPES,
  LwCustomMonsterDraft,
  LwMonsterDetailVm,
  LwMonsterFeatureVm,
} from '../monster-card/monster-card.models';

type FeatureGroup = 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions';
type TextField = Exclude<keyof LwCustomMonsterDraft, FeatureGroup | 'publishToMarket' | NumberField>;
type NumberField = 'armorClass' | 'hitPoints' | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

const BLANK: LwCustomMonsterDraft = {
  name: '', shortDescription: '', loreText: '', imageUrl: '', size: 'Medium', creatureType: 'monstrosity',
  alignment: 'unaligned', challengeRating: '1', armorClass: 12, armorClassNote: '', hitPoints: 22, hitDice: '',
  speed: '30 ft.', str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, savingThrows: '', skills: '',
  damageResistances: '', damageImmunities: '', conditionImmunities: '', senses: '', languages: '',
  traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [], publishToMarket: false,
};

/** Create or edit a custom (homebrew) monster. Any user may create one; publishing to the market is always free. */
@Component({
  selector: 'lw-monster-custom-modal',
  standalone: true,
  imports: [FormsModule, NgpSwitch, NgpSwitchThumb, LwBadgeComponent, LwButtonComponent, LwModalComponent],
  templateUrl: './monster-custom-modal.component.html',
  styleUrl: './monster-custom-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMonsterCustomModalComponent {
  readonly open = model<boolean>(false);
  readonly editing = input<LwMonsterDetailVm | null>(null);
  readonly creatorUsername = input<string>('');
  readonly busy = input<boolean>(false);
  readonly errorMessage = input<string>('');

  readonly monsterSaved = output<LwCustomMonsterDraft>();

  readonly sizes = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
  readonly types = LW_CREATURE_TYPES;
  readonly crs = LW_CHALLENGE_RATINGS;
  readonly abilities: readonly { key: NumberField; label: string }[] = [
    { key: 'str', label: 'STR' }, { key: 'dex', label: 'DEX' }, { key: 'con', label: 'CON' },
    { key: 'int', label: 'INT' }, { key: 'wis', label: 'WIS' }, { key: 'cha', label: 'CHA' },
  ];
  readonly featureGroups: readonly { key: FeatureGroup; label: string }[] = [
    { key: 'traits', label: 'Traits' }, { key: 'actions', label: 'Actions' },
    { key: 'bonusActions', label: 'Bonus actions' }, { key: 'reactions', label: 'Reactions' },
    { key: 'legendaryActions', label: 'Legendary actions' },
  ];

  readonly draft = signal<LwCustomMonsterDraft>(BLANK);
  readonly featureText = signal<Record<FeatureGroup, string>>(this.emptyFeatureText());
  readonly localError = signal<string>('');

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const e = this.editing();
      this.localError.set('');
      if (!e) {
        this.draft.set(BLANK);
        this.featureText.set(this.emptyFeatureText());
        return;
      }
      const s = e.summary;
      this.draft.set({
        ...BLANK, name: s.name, shortDescription: s.shortDescription, loreText: e.loreText, imageUrl: s.imageUrl,
        size: s.size, creatureType: s.creatureType, alignment: e.alignment, challengeRating: s.challengeRating,
        armorClass: s.armorClass, hitPoints: s.hitPoints, speed: e.speedLabel, str: e.str, dex: e.dex, con: e.con,
        int: e.int, wis: e.wis, cha: e.cha, savingThrows: e.savingThrows, skills: e.skills,
        damageResistances: e.damageResistances, damageImmunities: e.damageImmunities,
        conditionImmunities: e.conditionImmunities, senses: e.senses, languages: e.languages === '-' ? '' : e.languages,
        armorClassNote: this.parenthetical(e.armorClassLabel), hitDice: this.parenthetical(e.hitPointsLabel),
        publishToMarket: s.isPublished,
      });
      this.featureText.set({
        traits: this.featuresToText(e.traits), actions: this.featuresToText(e.actions),
        bonusActions: this.featuresToText(e.bonusActions), reactions: this.featuresToText(e.reactions),
        legendaryActions: this.featuresToText(e.legendaryActions),
      });
    });
  }

  setText(field: TextField, value: string): void {
    this.draft.update((d) => ({ ...d, [field]: value }));
  }

  setNumber(field: NumberField, value: number | string): void {
    this.draft.update((d) => ({ ...d, [field]: Number(value) || 0 }));
  }

  setPublish(value: boolean): void {
    this.draft.update((d) => ({ ...d, publishToMarket: value }));
  }

  setFeatureText(group: FeatureGroup, value: string): void {
    this.featureText.update((t) => ({ ...t, [group]: value }));
  }

  save(): void {
    const d = this.draft();
    if (d.name.trim().length < 2) {
      this.localError.set('Give the creature a name (at least 2 characters).');
      return;
    }
    const t = this.featureText();
    this.localError.set('');
    this.monsterSaved.emit({
      ...d,
      name: d.name.trim(),
      traits: this.textToFeatures(t.traits),
      actions: this.textToFeatures(t.actions),
      bonusActions: this.textToFeatures(t.bonusActions),
      reactions: this.textToFeatures(t.reactions),
      legendaryActions: this.textToFeatures(t.legendaryActions),
    });
  }

  /** One feature per line: "Name. Description" (a colon also works). */
  private textToFeatures(text: string): LwMonsterFeatureVm[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.search(/[.:]\s/);
        return idx > 0
          ? { name: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
          : { name: line, text: '' };
      });
  }

  private featuresToText(list: readonly LwMonsterFeatureVm[]): string {
    return list.map((f) => (f.text ? `${f.name}. ${f.text}` : f.name)).join('\n');
  }

  private parenthetical(label: string): string {
    const m = /\((.*)\)/.exec(label);
    return m ? m[1] : '';
  }

  private emptyFeatureText(): Record<FeatureGroup, string> {
    return { traits: '', actions: '', bonusActions: '', reactions: '', legendaryActions: '' };
  }
}
