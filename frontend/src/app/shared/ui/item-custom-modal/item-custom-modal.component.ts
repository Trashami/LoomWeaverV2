import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, HostListener, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { EquipmentLoadoutItemVm } from '../../../features/characters/models/character-studio.models';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwIconComponent } from '../icon/icon.component';
import {
  LwCreateCustomItemDraftVm,
  LwItemCategory,
  LwItemRarity,
} from '../item-card/item-card.models';

export interface LwItemArtworkPreset {
  readonly label: string;
  readonly url: string;
}

@Component({
  selector: 'lw-item-custom-modal',
  standalone: true,
  imports: [A11yModule,FormsModule, NgpButton, LwBadgeComponent, LwButtonComponent, LwIconComponent],
  templateUrl: './item-custom-modal.component.html',
  styleUrl: './item-custom-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwItemCustomModalComponent {
  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.open()) this.close(); }
  readonly saveError = input<string>('');
  readonly busy = input(false);
  readonly open = model<boolean>(false);
  readonly itemCreated = output<LwCreateCustomItemDraftVm>();

  readonly categories: readonly LwItemCategory[] = [
    'Weapon',
    'Armor',
    'Shield',
    'Focus',
    'Wondrous Gear',
    'Potion & Consumable',
    'Tool & Kit',
    'Companion Gear',
  ];

  readonly slots: readonly EquipmentLoadoutItemVm['slot'][] = [
    'Main Hand',
    'Off Hand',
    'Armor',
    'Focus',
    'Gear',
    'Companion',
  ];

  readonly rarities: readonly LwItemRarity[] = [
    'Common',
    'Uncommon',
    'Rare',
    'Very Rare',
    'Legendary',
    'Artifact',
  ];

  readonly artworkPresets: readonly LwItemArtworkPreset[] = [
    { label: 'Ancient Scroll Chest', url: '/assets/previews-png/obj-c4468a17dd78e8a4.png' },
    { label: 'Emerald Lantern', url: '/assets/previews-png/obj-c5b9891368937f8f.png' },
    { label: 'Artificer Mechanism', url: '/assets/5e-tools/classes/EFA/Artificer.webp' },
    { label: 'Vanguard Blade & Plate', url: '/assets/5e-tools/classes/PHB/Fighter.webp' },
    { label: 'Arcane Tome & Focus', url: '/assets/5e-tools/classes/PHB/Wizard.webp' },
    { label: 'Ranger Bow & Cloak', url: '/assets/5e-tools/classes/PHB/Ranger.webp' },
    { label: 'Shadow Blade & Kit', url: '/assets/5e-tools/classes/PHB/Rogue.webp' },
    { label: 'Sacred Reliquary', url: '/assets/5e-tools/classes/PHB/Cleric.webp' },
    { label: 'Fey Companion Doll', url: '/assets/previews-png/obj-599ca5e831fb5ae5.png' },
    { label: 'Runic Stone Emblem', url: '/assets/previews-png/obj-c2079efe0c15ab06.png' },
  ];

  readonly name = signal<string>('');
  readonly imageUrl = signal<string>('/assets/previews-png/obj-c5b9891368937f8f.png');
  readonly shortDescription = signal<string>('');
  readonly fullDescription = signal<string>('');
  readonly loreNotes = signal<string>('');
  readonly priceGp = signal<number>(50);
  readonly category = signal<LwItemCategory>('Wondrous Gear');
  readonly slot = signal<EquipmentLoadoutItemVm['slot']>('Gear');
  readonly rarity = signal<LwItemRarity>('Uncommon');
  readonly weightLb = signal<number>(2);
  readonly acBonus = signal<number>(0);
  readonly attackBonus = signal<number>(0);
  readonly damageOrEffectLabel = signal<string>('+1 Utility / Custom Homebrew Effect');
  readonly requiresAttunement = signal<boolean>(false);
  readonly propertiesText = signal<string>('Homebrew, Custom Craft');
  readonly publishToStore = signal<boolean>(false);
  readonly validationError = signal<string>('');

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('lw-custom-item-backdrop')) {
      this.close();
    }
  }

  close(): void {
    this.validationError.set('');
    this.open.set(false);
  }

  selectPresetImage(url: string): void {
    this.imageUrl.set(url);
  }

  submitCustomItem(): void {
    const cleanName = this.name().trim();
    const cleanShort = this.shortDescription().trim();
    if (!cleanName) {
      this.validationError.set('Please enter an item name.');
      return;
    }
    if (!cleanShort) {
      this.validationError.set('Please enter a short description for the item card.');
      return;
    }

    const draft: LwCreateCustomItemDraftVm = {
      name: cleanName,
      imageUrl: this.imageUrl().trim() || '/assets/previews-png/obj-c4468a17dd78e8a4.png',
      shortDescription: cleanShort,
      fullDescription:
        this.fullDescription().trim() ||
        `${cleanShort} Crafted as a custom homebrew item in LoomWeaver.`,
      loreNotes: this.loreNotes().trim(),
      priceGp: Math.max(0, Number(this.priceGp()) || 0),
      category: this.category(),
      slot: this.slot(),
      rarity: this.rarity(),
      weightLb: Math.max(0, Number(this.weightLb()) || 0),
      acBonus: Number(this.acBonus()) || 0,
      attackBonus: Number(this.attackBonus()) || 0,
      damageOrEffectLabel:
        this.damageOrEffectLabel().trim() || `${this.category()} · ${this.rarity()}`,
      requiresAttunement: this.requiresAttunement(),
      propertiesText: this.propertiesText().trim() || 'Homebrew',
      publishToStore: this.publishToStore(),
    };

    this.itemCreated.emit(draft);

  }

  private resetForm(): void {
    this.name.set('');
    this.shortDescription.set('');
    this.fullDescription.set('');
    this.loreNotes.set('');
    this.priceGp.set(50);
    this.category.set('Wondrous Gear');
    this.slot.set('Gear');
    this.rarity.set('Uncommon');
    this.weightLb.set(2);
    this.acBonus.set(0);
    this.attackBonus.set(0);
    this.damageOrEffectLabel.set('+1 Utility / Custom Homebrew Effect');
    this.requiresAttunement.set(false);
    this.propertiesText.set('Homebrew, Custom Craft');
    this.publishToStore.set(false);
    this.validationError.set('');
  }
}
