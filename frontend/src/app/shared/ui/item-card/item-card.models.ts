import { EquipmentLoadoutItemVm } from '../../../features/characters/models/character-studio.models';

export type LwItemCategory =
  | 'Weapon'
  | 'Armor'
  | 'Shield'
  | 'Focus'
  | 'Wondrous Gear'
  | 'Potion & Consumable'
  | 'Tool & Kit'
  | 'Companion Gear';

export type LwItemRarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Very Rare'
  | 'Legendary'
  | 'Artifact';

export type LwItemSortOption =
  | 'name-asc'
  | 'name-desc'
  | 'price-asc'
  | 'price-desc'
  | 'rarity-asc'
  | 'rarity-desc'
  | 'weight-asc';

export interface LwCatalogItemVm {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly shortDescription: string;
  readonly fullDescription: string;
  readonly loreNotes?: string;
  readonly priceGp: number;
  readonly priceLabel: string;
  readonly category: LwItemCategory;
  readonly slot: EquipmentLoadoutItemVm['slot'];
  readonly rarity: LwItemRarity;
  readonly weightLb: number;
  readonly acBonus: number;
  readonly attackBonus: number;
  readonly damageOrEffectLabel: string;
  readonly requiresAttunement: boolean;
  readonly properties: readonly string[];
  readonly source: string;
  readonly isHomebrew: boolean;
  readonly creatorUsername: string;
  readonly creatorAccountId?: string;
  readonly publishedToStore: boolean;
  readonly storePriceLabel: string;
  readonly icon: string;
}

export interface LwItemCollectionVm {
  readonly id: string;
  readonly campaignId: number;
  readonly name: string;
  readonly description: string;
  readonly createdByUsername: string;
  readonly itemIds: readonly string[];
  readonly assignedMerchantName?: string;
  readonly assignedLocationKey?: string;
  readonly assignedLocationName?: string;
  readonly creatorAccountId?: string;
  readonly publishedToStore?: boolean;
  readonly updatedAtLabel: string;
}

export interface LwCreateCustomItemDraftVm {
  readonly name: string;
  readonly imageUrl: string;
  readonly shortDescription: string;
  readonly fullDescription: string;
  readonly loreNotes: string;
  readonly priceGp: number;
  readonly category: LwItemCategory;
  readonly slot: EquipmentLoadoutItemVm['slot'];
  readonly rarity: LwItemRarity;
  readonly weightLb: number;
  readonly acBonus: number;
  readonly attackBonus: number;
  readonly damageOrEffectLabel: string;
  readonly requiresAttunement: boolean;
  readonly propertiesText: string;
  readonly publishToStore: boolean;
}

export interface LwCreateItemCollectionDraftVm {
  readonly publishedToStore?: boolean;
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly itemIds: readonly string[];
  readonly assignedMerchantName: string;
  readonly assignedLocationKey: string;
  readonly assignedLocationName: string;
}
