import { ARCANE_GLYPH_SKIN } from './arcane-glyph.skin';
import { BLOODSTONE_SKIN } from './bloodstone.skin';
import { CELTIC_SKIN } from './celtic.skin';
import { CLOCKWORK_BRASS_SKIN } from './clockwork-brass.skin';
import { DiceSkinConfig } from './dice-skin.types';
import { ELVEN_SKIN } from './elven.skin';
import { ENGRAVED_STEEL_SKIN } from './engraved-steel.skin';
import { GLASS_SKIN } from './glass.skin';
import { NORDIC_SKIN } from './nordic.skin';
import { OBSIDIAN_SKIN } from './obsidian.skin';
import { PLASTIC_SKIN } from './plastic.skin';
import { VOID_SKIN } from './void.skin';
import { HOLLOW_DRAGON_SKIN, DRAGON_EYE_SKIN } from './dragon-metal.skin';
export * from './dragon-metal.skin';

export * from './dice-skin.types';
export * from './obsidian.skin';
export * from './nordic.skin';
export * from './celtic.skin';
export * from './arcane-glyph.skin';
export * from './engraved-steel.skin';
export * from './glass.skin';
export * from './plastic.skin';
export * from './elven.skin';
export * from './void.skin';
export * from './bloodstone.skin';
export * from './clockwork-brass.skin';

export const DICE_SKIN_CATALOG: DiceSkinConfig[] = [
  OBSIDIAN_SKIN,
  HOLLOW_DRAGON_SKIN,
  DRAGON_EYE_SKIN,
  NORDIC_SKIN,
  PLASTIC_SKIN,
  ENGRAVED_STEEL_SKIN,
  GLASS_SKIN,
  CELTIC_SKIN,
  ARCANE_GLYPH_SKIN,
  ELVEN_SKIN,
  BLOODSTONE_SKIN,
  CLOCKWORK_BRASS_SKIN,
  VOID_SKIN
];

export function resolveDiceSkin(skinId: string | null | undefined): DiceSkinConfig {
  if (!skinId) {
    return OBSIDIAN_SKIN;
  }
  return DICE_SKIN_CATALOG.find(s => s.id === skinId) ?? OBSIDIAN_SKIN;
}

export function registerDiceSkin(skin: DiceSkinConfig): void {
  const existingIdx = DICE_SKIN_CATALOG.findIndex(s => s.id === skin.id);
  if (existingIdx >= 0) {
    DICE_SKIN_CATALOG[existingIdx] = skin;
  } else {
    DICE_SKIN_CATALOG.push(skin);
  }
}
