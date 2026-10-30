import {
  CharacterConnectionsVm,
  CharacterSheetVm,
  EquipmentLoadoutItemVm,
} from './character-studio.models';

export const DEFAULT_CONNECTIONS: CharacterConnectionsVm = {
  locations: [],
  npcs: [],
  factions: [],
};

export function wizardDefaultEquipment(prefix: string): readonly EquipmentLoadoutItemVm[] {
  return [
    { id: `${prefix}-focus`, name: 'Arcane Focus', slot: 'Focus', summary: 'Crystal-tipped staff', bonusLabel: '+2 Spell Attack · Runed Conduit', acBonus: 0, attackBonus: 2, equipped: true, entitlement: 'free', icon: 'wand' },
    { id: `${prefix}-spellbook`, name: 'Spellbook', slot: 'Off Hand', summary: 'Embroidered leather', bonusLabel: 'Evocation Folio · 12 Inscribed Spells', acBonus: 0, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'book-open' },
    { id: `${prefix}-robes`, name: 'Robes of the Apprentice', slot: 'Armor', summary: "Fine scholar's robes", bonusLabel: '+2 AC · Abjuration Weave', acBonus: 2, attackBonus: 0, equipped: true, entitlement: 'included', icon: 'shield' },
    { id: `${prefix}-belt`, name: 'Belt of Utility', slot: 'Gear', summary: 'Pouches and tools', bonusLabel: 'Quick-Draw Component Slots', acBonus: 0, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'layers' },
    { id: `${prefix}-ring`, name: 'Ring of Protection', slot: 'Gear', summary: '+1 AC while worn', bonusLabel: '+1 AC · +1 Saving Throws', acBonus: 1, attackBonus: 0, equipped: false, entitlement: 'included', icon: 'shield-check' },
    { id: `${prefix}-pack`, name: 'Exploration Pack', slot: 'Gear', summary: 'Rations, tools, and supplies', bonusLabel: 'Dungeon & Road Gear', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'free', icon: 'compass' },
  ];
}

export function buildSeedPartySheets(): readonly CharacterSheetVm[] {
  return [];
}
