import type { VttTacticalAbilityVm } from '../../models/vtt-battle.models';
import type { VttTokenVm } from '../../../effects/engine/effect-timeline.contract';
import type { DockAction, DockToken } from './vtt-action-dock.models';

/** The dock keys tokens by number, so each VTT token key maps to its 1-based position. */
export function dockTokenId(tokens: readonly VttTokenVm[], key: string): number {
  const index = tokens.findIndex((t) => t.key === key);
  return index < 0 ? 0 : index + 1;
}

export function toDockToken(token: VttTokenVm, tokens: readonly VttTokenVm[]): DockToken {
  return {
    id: dockTokenId(tokens, token.key),
    name: token.name,
    hp: token.currentHp,
    maxHp: token.maxHp,
    armorClass: token.armorClass,
    entityType: token.faction === 'party' ? 'pc' : 'npc',
    sheetRef: token.key,
  };
}

export function toDockAction(ability: VttTacticalAbilityVm): DockAction {
  return {
    id: ability.id,
    name: ability.name,
    kind: dockKindOf(ability),
    cost: ability.actionCost,
    desc: ability.executeThen,
    attackFormula: ability.attackBonus ? `+${ability.attackBonus}` : null,
    damageFormula: ability.damageFormula || null,
    minRangeFeet: 0,
    maxRangeFeet: ability.rangeFeet,
    spellType: ability.category,
    aoeSizeFeet: ability.aoeRadiusFeet || null,
  };
}

function dockKindOf(ability: VttTacticalAbilityVm): DockAction['kind'] {
  if (ability.actionCost === '1 Bonus Action') return 'bonus';
  if (ability.actionCost === '1 Reaction') return 'reaction';
  return /spell|rune/i.test(ability.category) ? 'spell' : 'weapon';
}
