import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import {
  ALL_DND5E_SKILLS,
  CREATOR_ANCESTRIES,
  CREATOR_BACKGROUNDS,
  CREATOR_CLASSES,
  CREATOR_EQUIPMENT_DATABASE,
  CREATOR_FEATS,
  calculateLevelUpAsiPoints,
  calculatePointBuySpent,
  getPointBuyCostForScore,
} from '../../../features/characters/models/character-creator-catalog.data';
import {
  AbilityScoreVm,
  CharacterCreatorDraftVm,
  CreatorAncestryOptionVm,
  CreatorBackgroundOptionVm,
  CreatorClassOptionVm,
  CreatorFeatOptionVm,
  CreatorSubraceOptionVm,
  EquipmentLoadoutItemVm,
} from '../../../features/characters/models/character-studio.models';
import { LwButtonComponent } from '../button/button.component';
import { LwCharacterPortraitPickerComponent } from '../character-portrait-picker/character-portrait-picker.component';
import { LwIconComponent } from '../icon/icon.component';

export interface LwCreatorWizardStepVm {
  readonly stepNumber: number;
  readonly id: string;
  readonly label: string;
}

@Component({
  selector: 'lw-character-creator-wizard',
  standalone: true,
  imports: [
    FormsModule,
    NgpButton,
    LwIconComponent,
    LwButtonComponent,
    LwCharacterPortraitPickerComponent,
  ],
  templateUrl: './character-creator-wizard.component.html',
  styleUrl: './character-creator-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwCharacterCreatorWizardComponent {
  readonly campaignName = input<string>('Your Campaign');
  readonly isEditMode = input<boolean>(false);
  readonly draft = input.required<CharacterCreatorDraftVm>();
  readonly ancestryOptions = input<readonly CreatorAncestryOptionVm[]>(CREATOR_ANCESTRIES);
  readonly classOptions = input<readonly CreatorClassOptionVm[]>(CREATOR_CLASSES);
  readonly backgroundOptions = input<readonly CreatorBackgroundOptionVm[]>(CREATOR_BACKGROUNDS);
  readonly featOptions = input<readonly CreatorFeatOptionVm[]>(CREATOR_FEATS);
  readonly equipmentDatabase = input<readonly EquipmentLoadoutItemVm[]>(CREATOR_EQUIPMENT_DATABASE);

  readonly activeStep = model<number>(1);
  readonly sourceFilter = model<'All' | 'PHB' | 'SRD 5.1' | 'Homebrew'>('All');
  readonly searchQuery = model<string>('');

  readonly draftPatched = output<Partial<CharacterCreatorDraftVm>>();
  readonly abilityAdjusted = output<{ code: AbilityScoreVm['code']; delta: number }>();
  readonly skillToggled = output<string>();
  readonly completed = output<void>();
  readonly closed = output<void>();

  readonly editingIdentity = signal<boolean>(false);
  readonly classSearchQuery = signal<string>('');
  readonly backgroundSearchQuery = signal<string>('');
  readonly backgroundFilterMode = signal<'all' | 'recommended'>('all');
  readonly featSearchQuery = signal<string>('');
  readonly equipmentSearchQuery = signal<string>('');
  readonly equipmentCategoryFilter = signal<'All' | 'Weapon' | 'Armor' | 'Focus' | 'Gear'>('All');

  readonly steps: readonly LwCreatorWizardStepVm[] = [
    { stepNumber: 1, id: 'ancestry', label: 'Ancestry' },
    { stepNumber: 2, id: 'class', label: 'Class' },
    { stepNumber: 3, id: 'background', label: 'Background' },
    { stepNumber: 4, id: 'abilities', label: 'Abilities' },
    { stepNumber: 5, id: 'skills', label: 'Skills' },
    { stepNumber: 6, id: 'feats', label: 'Feats & Options' },
    { stepNumber: 7, id: 'equipment', label: 'Equipment' },
    { stepNumber: 8, id: 'details', label: 'Details' },
  ];

  readonly sourceFilters: readonly ('All' | 'PHB' | 'SRD 5.1' | 'Homebrew')[] = [
    'All',
    'PHB',
    'SRD 5.1',
    'Homebrew',
  ];

  readonly allSkillsDef = ALL_DND5E_SKILLS;

  readonly filteredAncestries = computed<readonly CreatorAncestryOptionVm[]>(() => {
    const src = this.sourceFilter();
    const q = this.searchQuery().trim().toLowerCase();
    return this.ancestryOptions().filter((a) => {
      if (src !== 'All' && a.source !== src && !a.subraces.some((sr) => sr.source === src)) {
        return false;
      }
      if (
        q &&
        !a.name.toLowerCase().includes(q) &&
        !a.tagline.toLowerCase().includes(q) &&
        !a.subraces.some((sr) => sr.name.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  });

  readonly selectedAncestry = computed<CreatorAncestryOptionVm>(
    () =>
      this.ancestryOptions().find((a) => a.id === this.draft().ancestryId) ??
      this.ancestryOptions()[0] ??
      CREATOR_ANCESTRIES[0],
  );

  readonly selectedSubrace = computed<CreatorSubraceOptionVm>(
    () =>
      this.selectedAncestry().subraces.find((sr) => sr.id === this.draft().subraceId) ??
      this.selectedAncestry().subraces[0],
  );

  readonly filteredClasses = computed<readonly CreatorClassOptionVm[]>(() => {
    const q = this.classSearchQuery().trim().toLowerCase();
    return this.classOptions().filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.tagline.toLowerCase().includes(q) ||
        (c.subclasses ?? []).some((sc) => sc.toLowerCase().includes(q)),
    );
  });

  readonly selectedClass = computed<CreatorClassOptionVm>(
    () =>
      this.classOptions().find((c) => c.id === this.draft().classId) ??
      this.classOptions()[0] ??
      CREATOR_CLASSES[0],
  );

  readonly filteredBackgrounds = computed<readonly CreatorBackgroundOptionVm[]>(() => {
    const q = this.backgroundSearchQuery().trim().toLowerCase();
    const mode = this.backgroundFilterMode();
    const clsId = this.selectedClass().id.toLowerCase();
    const ancId = this.selectedAncestry().id.toLowerCase();
    return this.backgroundOptions().filter((b) => {
      if (
        q &&
        !b.name.toLowerCase().includes(q) &&
        !b.tagline.toLowerCase().includes(q) &&
        !b.skillProficiencies.some((sk) => sk.toLowerCase().includes(q))
      ) {
        return false;
      }
      if (mode === 'recommended') {
        return this.isBackgroundRecommended(b, clsId, ancId);
      }
      return true;
    });
  });

  readonly selectedBackground = computed<CreatorBackgroundOptionVm>(
    () =>
      this.backgroundOptions().find((b) => b.id === this.draft().backgroundId) ??
      this.backgroundOptions()[0] ??
      CREATOR_BACKGROUNDS[0],
  );

  readonly filteredFeats = computed<readonly CreatorFeatOptionVm[]>(() => {
    const q = this.featSearchQuery().trim().toLowerCase();
    return this.featOptions().filter(
      (f) =>
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q),
    );
  });

  readonly selectedFeat = computed<CreatorFeatOptionVm>(
    () =>
      this.featOptions().find((f) => f.id === this.draft().selectedFeatId || f.name === this.draft().selectedFeatId) ??
      this.featOptions()[0] ??
      CREATOR_FEATS[0],
  );

  readonly filteredDatabaseItems = computed<readonly EquipmentLoadoutItemVm[]>(() => {
    const q = this.equipmentSearchQuery().trim().toLowerCase();
    const cat = this.equipmentCategoryFilter();
    return this.equipmentDatabase().filter((item) => {
      if (cat === 'Weapon' && item.slot !== 'Main Hand' && item.slot !== 'Off Hand') return false;
      if (cat === 'Armor' && item.slot !== 'Armor') return false;
      if (cat === 'Focus' && item.slot !== 'Focus') return false;
      if (cat === 'Gear' && item.slot !== 'Gear') return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.summary.toLowerCase().includes(q) &&
        !item.bonusLabel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  });

  readonly equippedDraftItems = computed<readonly EquipmentLoadoutItemVm[]>(() => {
    const items = this.draft().equipmentItems ?? [];
    return items.filter((i) => i.equipped);
  });

  readonly backpackDraftItems = computed<readonly EquipmentLoadoutItemVm[]>(() => {
    const items = this.draft().equipmentItems ?? [];
    return items.filter((i) => !i.equipped);
  });

  readonly characterLevel = computed<number>(() => Math.max(1, this.draft().level ?? 1));
  readonly proficiencyBonus = computed<number>(() => 2 + Math.floor((this.characterLevel() - 1) / 4));
  readonly basePointBuyBudget = 27;
  readonly levelUpAsiPoints = computed<number>(() =>
    calculateLevelUpAsiPoints(this.characterLevel(), this.selectedClass().id),
  );
  readonly totalPointBudget = computed<number>(() => this.basePointBuyBudget + this.levelUpAsiPoints());
  readonly pointsUsed = computed<number>(() => calculatePointBuySpent(this.draft().abilities));
  readonly pointsRemaining = computed<number>(() => this.totalPointBudget() - this.pointsUsed());

  readonly summaryAbilities = computed<readonly AbilityScoreVm[]>(() => {
    const ab = this.draft().abilities;
    const codes: readonly { code: AbilityScoreVm['code']; label: string }[] = [
      { code: 'STR', label: 'Strength' },
      { code: 'DEX', label: 'Dexterity' },
      { code: 'CON', label: 'Constitution' },
      { code: 'INT', label: 'Intelligence' },
      { code: 'WIS', label: 'Wisdom' },
      { code: 'CHA', label: 'Charisma' },
    ];
    return codes.map((c) => {
      const score = ab[c.code] ?? 10;
      const modifier = Math.floor((score - 10) / 2);
      return { code: c.code, label: c.label, score, modifier };
    });
  });

  readonly computedAc = computed<number>(() => {
    const dexMod = this.summaryAbilities().find((a) => a.code === 'DEX')?.modifier ?? 0;
    const eqBonus = this.equippedDraftItems().reduce((sum, item) => sum + item.acBonus, 0);
    return 10 + Math.min(3, dexMod) + eqBonus;
  });

  readonly computedHp = computed<number>(() => {
    const conMod = this.summaryAbilities().find((a) => a.code === 'CON')?.modifier ?? 0;
    const lvl = this.characterLevel();
    const hitDie = this.selectedClass().hitDie;
    const avgPerLevel = Math.floor(hitDie / 2) + 1;
    return Math.max(6, hitDie + conMod + (lvl - 1) * Math.max(2, avgPerLevel + conMod));
  });

  readonly nextButtonLabel = computed<string>(() => {
    const step = this.activeStep();
    const nextStep = this.steps.find((s) => s.stepNumber === step + 1);
    if (nextStep) return `Next: ${nextStep.label}`;
    return this.isEditMode() ? 'Save Character Changes' : 'Complete & View Character';
  });

  isBackgroundRecommended(bg: CreatorBackgroundOptionVm, clsId?: string, ancId?: string): boolean {
    const c = (clsId ?? this.selectedClass().id).toLowerCase();
    const a = (ancId ?? this.selectedAncestry().id).toLowerCase();
    return !!(
      bg.recommendedClasses?.some((rc) => c.includes(rc)) ||
      bg.recommendedAncestries?.some((ra) => a.includes(ra))
    );
  }

  getPointCost(score: number): number {
    return getPointBuyCostForScore(score);
  }

  getAncestryBonus(code: AbilityScoreVm['code']): number {
    return this.selectedAncestry().abilityBonuses?.[code] ?? 0;
  }

  getSkillTotalBonus(abilityCode: AbilityScoreVm['code'], skillLabel: string): number {
    const mod = this.summaryAbilities().find((a) => a.code === abilityCode)?.modifier ?? 0;
    const prof = this.draft().selectedSkills.includes(skillLabel) ? this.proficiencyBonus() : 0;
    return mod + prof;
  }

  selectAncestry(ancestry: CreatorAncestryOptionVm): void {
    const defaultSub = ancestry.subraces[0];
    this.draftPatched.emit({
      ancestryId: ancestry.id,
      subraceId: defaultSub?.id ?? '',
      portraitUrl: defaultSub?.portraitUrl || ancestry.portraitUrl,
    });
  }

  selectSubrace(subrace: CreatorSubraceOptionVm): void {
    this.draftPatched.emit({
      subraceId: subrace.id,
      portraitUrl: subrace.portraitUrl,
    });
  }

  selectClass(cls: CreatorClassOptionVm): void {
    this.draftPatched.emit({
      classId: cls.id,
      subclass: cls.subclassDefault,
    });
  }

  selectSubclass(subclassName: string): void {
    this.draftPatched.emit({ subclass: subclassName });
  }

  selectBackground(bg: CreatorBackgroundOptionVm): void {
    const mergedSkills = Array.from(new Set([...this.draft().selectedSkills, ...bg.skillProficiencies]));
    this.draftPatched.emit({
      backgroundId: bg.id,
      quote: bg.defaultQuote,
      selectedSkills: mergedSkills,
      personalityTrait: bg.personality.personality,
      ideal: bg.personality.ideals,
      bond: bg.personality.bonds,
      flaw: bg.personality.flaws,
    });
  }

  selectFeat(feat: CreatorFeatOptionVm): void {
    this.draftPatched.emit({ selectedFeatId: feat.id });
  }

  addItemToDraft(item: EquipmentLoadoutItemVm, equipNow: boolean): void {
    const current = [...(this.draft().equipmentItems ?? [])];
    const existingIndex = current.findIndex((i) => i.id === item.id);
    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], equipped: equipNow };
    } else {
      current.unshift({ ...item, equipped: equipNow });
    }
    this.draftPatched.emit({ equipmentItems: current });
  }

  removeItemFromDraft(itemId: string): void {
    const current = (this.draft().equipmentItems ?? []).filter((i) => i.id !== itemId);
    this.draftPatched.emit({ equipmentItems: current });
  }

  selectPortrait(url: string): void {
    this.draftPatched.emit({ portraitUrl: url });
  }

  advanceOrComplete(): void {
    const current = this.activeStep();
    if (current < 8) {
      this.activeStep.set(current + 1);
    } else {
      this.completed.emit();
    }
  }

  formatMod(mod: number): string {
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }
}
