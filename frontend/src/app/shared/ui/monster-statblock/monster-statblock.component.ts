import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LwMonsterDetailVm, LwMonsterFeatureVm, lwAbilityModifier } from '../monster-card/monster-card.models';

interface StatblockSection {
  readonly title: string;
  readonly features: readonly LwMonsterFeatureVm[];
}

/** Read-only creature statblock (abilities, defenses, traits, actions, reactions, legendary actions). */
@Component({
  selector: 'lw-monster-statblock',
  standalone: true,
  templateUrl: './monster-statblock.component.html',
  styleUrl: './monster-statblock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMonsterStatblockComponent {
  readonly detail = input.required<LwMonsterDetailVm>();

  readonly abilities = computed(() => {
    const d = this.detail();
    return [
      { label: 'STR', score: d.str },
      { label: 'DEX', score: d.dex },
      { label: 'CON', score: d.con },
      { label: 'INT', score: d.int },
      { label: 'WIS', score: d.wis },
      { label: 'CHA', score: d.cha },
    ].map((a) => ({ ...a, mod: lwAbilityModifier(a.score) }));
  });

  readonly properties = computed(() => {
    const d = this.detail();
    return [
      { label: 'Saving Throws', value: d.savingThrows },
      { label: 'Skills', value: d.skills },
      { label: 'Damage Resistances', value: d.damageResistances },
      { label: 'Damage Immunities', value: d.damageImmunities },
      { label: 'Condition Immunities', value: d.conditionImmunities },
      { label: 'Senses', value: d.senses },
      { label: 'Languages', value: d.languages },
    ].filter((p) => !!p.value);
  });

  readonly sections = computed<readonly StatblockSection[]>(() => {
    const d = this.detail();
    return [
      { title: 'Traits', features: d.traits },
      { title: 'Actions', features: d.actions },
      { title: 'Bonus Actions', features: d.bonusActions },
      { title: 'Reactions', features: d.reactions },
      { title: 'Legendary Actions', features: d.legendaryActions },
    ].filter((s) => s.features.length > 0);
  });
}
