import { CharacterSheetVm, CharacterSpellVm } from '../../characters/models/character-studio.models';
import { VttTokenVm } from '../../effects/engine/effect-timeline.contract';
import { VttTacticalAbilityVm, VttTurnActionCategory } from '../models/vtt-battle.models';
import { CreatureCardVm } from '../../../shared/ui/creature-card/creature-card.component';

export function buildCharacterSheetAbilities(
  ownerKey: string,
  sheet: CharacterSheetVm,
): VttTacticalAbilityVm[] {
  const result: VttTacticalAbilityVm[] = [];
  const atkBonus = sheet.primaryAttackBonus || 7;
  const saveDc =
    8 + (sheet.proficiencyBonus || 3) + Math.max(3, ...sheet.abilities.map((a) => a.modifier));

  for (const item of sheet.equipment) {
    if (item.slot === 'Main Hand' || item.slot === 'Off Hand' || item.attackBonus > 0) {
      const lower = `${item.name} ${item.summary} ${item.bonusLabel}`.toLowerCase();
      const isRanged = /bow|slingshot|sling|crossbow|150|120/.test(lower);
      const dmgMatch = /(\d+d\d+(?:\s*[+-]\s*\d+)?)/.exec(item.bonusLabel);
      const dmg = dmgMatch ? dmgMatch[1].replace(/\s+/g, '') : '1d8+4';
      result.push({
        id: `eq-${sheet.characterKey}-${item.id}`,
        ownerKey,
        name: item.name,
        category: isRanged ? 'Ranged Weapon' : 'Melee Weapon',
        turnCategory: isRanged ? 'ranged' : 'melee',
        actionCost: '1 Action',
        rangeFeet: isRanged ? 120 : 5,
        triggerWhen: 'On Attack Action',
        conditionIf: 'Target within range',
        executeThen: `${item.summary} (${item.bonusLabel})`,
        attackBonus: atkBonus + (item.attackBonus || 0),
        saveDc: 0,
        damageDiceCount: isRanged ? 1 : 2,
        damageDiceSides: isRanged ? 8 : 6,
        damageBonus: 4,
        damageFormula: dmg,
        linkedEffectPresetId: isRanged ? 'fx-eldritch-beam' : 'fx-cinder-arc',
        canonStatus: 'approved',
        targetMode: 'single',
        maxTargets: 1,
        aoeShape: 'none',
        aoeRadiusFeet: 5,
        requiresLineOfSight: true,
      });
    }
  }

  if (!result.some((r) => r.turnCategory === 'melee')) {
    result.push(makeDefaultWeaponAbility(ownerKey, sheet, 'melee', atkBonus));
  }
  if (!result.some((r) => r.turnCategory === 'ranged')) {
    result.push(makeDefaultWeaponAbility(ownerKey, sheet, 'ranged', atkBonus));
  }

  for (const group of sheet.spellGroups) {
    for (const spell of group.spells) {
      result.push(
        mapCharacterSpellToAbility(
          ownerKey,
          sheet.characterKey,
          spell,
          group.isCantrip ? 0 : (spell.level ?? 1),
          atkBonus,
          saveDc,
        ),
      );
    }
  }

  if (!result.some((r) => r.turnCategory === 'spell')) {
    result.push({
      id: `maneuver-${sheet.characterKey}-cleave`,
      ownerKey,
      name: 'Sweeping Vanguard Cleave',
      category: 'Martial Technique · Lv.1',
      turnCategory: 'spell',
      actionCost: '1 Action',
      rangeFeet: 10,
      triggerWhen: 'On Martial Action',
      conditionIf: 'Enemies within 10ft arc',
      executeThen: 'Heavy sweeping cleave across adjacent foes.',
      attackBonus: atkBonus,
      saveDc,
      damageDiceCount: 2,
      damageDiceSides: 8,
      damageBonus: 4,
      damageFormula: '2d8+4',
      linkedEffectPresetId: 'fx-cinder-arc',
      canonStatus: 'approved',
      targetMode: 'aoe',
      maxTargets: 4,
      aoeShape: 'circle',
      aoeRadiusFeet: 10,
      requiresLineOfSight: true,
    });
  }

  if (!result.some((r) => r.turnCategory === 'bonus')) {
    const feat = sheet.featureCards[0];
    result.push({
      id: `bonus-${sheet.characterKey}-signature`,
      ownerKey,
      name: feat ? feat.title : 'Tactical Surge (Bonus)',
      category: 'Class Bonus Action',
      turnCategory: 'bonus',
      actionCost: '1 Bonus Action',
      rangeFeet: 30,
      triggerWhen: 'On Bonus Action',
      conditionIf: 'Bonus Action available',
      executeThen: feat?.summary || 'Execute a swift tactical follow-up or mark target.',
      attackBonus: atkBonus,
      saveDc,
      damageDiceCount: 1,
      damageDiceSides: 6,
      damageBonus: 3,
      damageFormula: '1d6+3',
      linkedEffectPresetId: 'fx-moonlight-sigil',
      canonStatus: 'approved',
      targetMode: 'single',
      maxTargets: 1,
      aoeShape: 'none',
      aoeRadiusFeet: 5,
      requiresLineOfSight: true,
    });
  }

  result.push({
    id: `react-${sheet.characterKey}-opp`,
    ownerKey,
    name: 'Opportunity Attack',
    category: 'Reaction · Melee',
    turnCategory: 'reaction',
    actionCost: '1 Reaction',
    rangeFeet: 5,
    triggerWhen: 'Hostile leaves 5ft reach',
    conditionIf: 'Reaction available',
    executeThen: 'Immediate melee strike against fleeing enemy.',
    attackBonus: atkBonus,
    saveDc: 0,
    damageDiceCount: 1,
    damageDiceSides: 8,
    damageBonus: 4,
    damageFormula: '1d8+4',
    linkedEffectPresetId: 'fx-cinder-arc',
    canonStatus: 'approved',
    targetMode: 'single',
    maxTargets: 1,
    aoeShape: 'none',
    aoeRadiusFeet: 5,
    requiresLineOfSight: true,
  });

  for (const feat of sheet.featureCards.slice(0, 2)) {
    result.push({
      id: `react-feat-${sheet.characterKey}-${feat.id}`,
      ownerKey,
      name: feat.title,
      category: 'Class Reaction',
      turnCategory: 'reaction',
      actionCost: '1 Reaction',
      rangeFeet: 30,
      triggerWhen: 'When ally or self is targeted',
      conditionIf: 'Within 30ft',
      executeThen: feat.summary,
      attackBonus: atkBonus,
      saveDc,
      damageDiceCount: 1,
      damageDiceSides: 6,
      damageBonus: 3,
      damageFormula: '1d6+3',
      linkedEffectPresetId: 'fx-moonlight-sigil',
      canonStatus: 'approved',
      targetMode: 'single',
      maxTargets: 1,
      aoeShape: 'none',
      aoeRadiusFeet: 5,
      requiresLineOfSight: true,
    });
  }

  return result;
}

function makeDefaultWeaponAbility(
  ownerKey: string,
  sheet: CharacterSheetVm,
  mode: 'melee' | 'ranged',
  atkBonus: number,
): VttTacticalAbilityVm {
  const nameKey = sheet.characterKey.toLowerCase();
  const isMelee = mode === 'melee';
  const label = isMelee
    ? nameKey.includes('dal')
      ? 'Paired Edhellain Shortswords'
      : nameKey.includes('fivi')
        ? 'Fey Trickster Dagger'
        : nameKey.includes('ciaran')
          ? 'Runed Quarterstaff Strike'
          : 'Twin Blade Strike'
    : nameKey.includes('munk')
      ? 'Thrown Iron Javelin'
      : nameKey.includes('kildrid')
        ? 'Runic Crossbow Bolt'
        : 'Ranged Sidearm Shot';

  return {
    id: `def-${mode}-${sheet.characterKey}`,
    ownerKey,
    name: label,
    category: isMelee ? 'Melee Weapon' : 'Ranged Weapon',
    turnCategory: mode,
    actionCost: '1 Action',
    rangeFeet: isMelee ? 5 : 60,
    triggerWhen: 'On Attack Action',
    conditionIf: isMelee ? 'Target within 5ft' : 'Target within 60ft LoS',
    executeThen: `Standard ${mode} weapon attack.`,
    attackBonus: atkBonus,
    saveDc: 0,
    damageDiceCount: 1,
    damageDiceSides: isMelee ? 8 : 6,
    damageBonus: 4,
    damageFormula: isMelee ? '1d8+4' : '1d6+4',
    linkedEffectPresetId: isMelee ? 'fx-cinder-arc' : 'fx-eldritch-beam',
    canonStatus: 'approved',
    targetMode: 'single',
    maxTargets: 1,
    aoeShape: 'none',
    aoeRadiusFeet: 5,
    requiresLineOfSight: true,
  };
}

function mapCharacterSpellToAbility(
  ownerKey: string,
  charKey: string,
  spell: CharacterSpellVm,
  level: number,
  atkBonus: number,
  saveDc: number,
): VttTacticalAbilityVm {
  const lowerName = spell.name.toLowerCase();
  const costLower = (spell.actionCost || '').toLowerCase();
  const turnCategory: Exclude<VttTurnActionCategory, 'all'> = costLower.includes('bonus')
    ? 'bonus'
    : costLower.includes('reaction')
      ? 'reaction'
      : 'spell';

  const rangeMatch = /(\d+)\s*ft/i.exec(spell.range || '');
  const rangeFeet = rangeMatch ? Number(rangeMatch[1]) : lowerName.includes('touch') ? 5 : 90;

  const isMulti = /magic missile|scorching ray|eldritch blast/.test(lowerName);
  const isAoe = !isMulti && /fireball|shatter|burning hands|thunderwave|cone|wave|eruption|faerie fire|moonbeam/.test(lowerName);
  const aoeRadiusFeet = lowerName.includes('fireball') ? 20 : isAoe ? 15 : 5;
  const dmgMatch = /(\d+d\d+(?:\s*[+-]\s*\d+)?)/.exec(spell.summary || '');
  const defaultFormula = level === 0 ? '2d8' : `${Math.max(2, level + 1)}d6`;

  return {
    id: `sp-${charKey}-${spell.id}`,
    ownerKey,
    name: spell.name,
    category: level === 0 ? `${spell.school} Cantrip` : `Lv.${level} ${spell.school}`,
    turnCategory,
    actionCost:
      turnCategory === 'bonus'
        ? '1 Bonus Action'
        : turnCategory === 'reaction'
          ? '1 Reaction'
          : '1 Action',
    rangeFeet,
    triggerWhen: 'On Spell Cast',
    conditionIf: spell.concentration ? 'Requires Concentration' : 'Target in range',
    executeThen: spell.summary,
    attackBonus: atkBonus,
    saveDc: isAoe ? saveDc : 0,
    damageDiceCount: level === 0 ? 2 : Math.max(2, level + 1),
    damageDiceSides: 6,
    damageBonus: isMulti ? 3 : 0,
    damageFormula: dmgMatch ? dmgMatch[1].replace(/\s+/g, '') : defaultFormula,
    linkedEffectPresetId: isAoe ? 'fx-cinder-arc' : isMulti ? 'fx-eldritch-beam' : 'fx-moonlight-sigil',
    canonStatus: 'approved',
    targetMode: isMulti ? 'multi-target' : isAoe ? 'aoe' : 'single',
    maxTargets: isMulti ? 3 : isAoe ? 8 : 1,
    aoeShape: isAoe ? 'circle' : 'none',
    aoeRadiusFeet,
    requiresLineOfSight: true,
  };
}

export function buildCreatureOrNpcAbilities(
  token: VttTokenVm,
  creatures: readonly CreatureCardVm[],
): VttTacticalAbilityVm[] {
  const matched = creatures.find(
    (c) => c.name.toLowerCase() === token.name.toLowerCase() || token.name.toLowerCase().includes(c.name.toLowerCase()),
  );
  const atkBonus = matched?.attackBonus ?? 6;
  const saveDc = matched?.saveDc ?? 14;
  const dmg = matched?.damageFormula ?? '2d6+3';
  const sigName = matched?.signatureAttack ?? `${token.name} Strike`;

  return [
    {
      id: `mon-melee-${token.key}`,
      ownerKey: token.key,
      name: sigName,
      category: 'Melee Attack',
      turnCategory: 'melee',
      actionCost: '1 Action',
      rangeFeet: 5,
      triggerWhen: 'On Creature Turn',
      conditionIf: 'Target within 5ft',
      executeThen: `Strikes with ${sigName}.`,
      attackBonus: atkBonus,
      saveDc: 0,
      damageDiceCount: 2,
      damageDiceSides: 6,
      damageBonus: 3,
      damageFormula: dmg,
      linkedEffectPresetId: 'fx-cinder-arc',
      canonStatus: 'approved',
      targetMode: 'single',
      maxTargets: 1,
      aoeShape: 'none',
      aoeRadiusFeet: 5,
      requiresLineOfSight: true,
    },
    {
      id: `mon-ranged-${token.key}`,
      ownerKey: token.key,
      name: 'Ranged Volley / Bolt',
      category: 'Ranged Attack',
      turnCategory: 'ranged',
      actionCost: '1 Action',
      rangeFeet: 60,
      triggerWhen: 'On Creature Turn',
      conditionIf: 'Target within 60ft LoS',
      executeThen: 'Launches a ranged projectile at target.',
      attackBonus: atkBonus,
      saveDc: 0,
      damageDiceCount: 1,
      damageDiceSides: 8,
      damageBonus: 3,
      damageFormula: '1d8+3',
      linkedEffectPresetId: 'fx-eldritch-beam',
      canonStatus: 'approved',
      targetMode: 'single',
      maxTargets: 1,
      aoeShape: 'none',
      aoeRadiusFeet: 5,
      requiresLineOfSight: true,
    },
    {
      id: `mon-special-${token.key}`,
      ownerKey: token.key,
      name: 'Dark Pulse (AoE)',
      category: 'Special Ability · Lv.1',
      turnCategory: 'spell',
      actionCost: '1 Action',
      rangeFeet: 60,
      triggerWhen: 'On Creature Special',
      conditionIf: 'Targets in 15ft burst',
      executeThen: 'Unleashes an area shockwave.',
      attackBonus: atkBonus,
      saveDc,
      damageDiceCount: 3,
      damageDiceSides: 6,
      damageBonus: 0,
      damageFormula: '3d6',
      linkedEffectPresetId: 'fx-void-cone',
      canonStatus: 'approved',
      targetMode: 'aoe',
      maxTargets: 6,
      aoeShape: 'circle',
      aoeRadiusFeet: 15,
      requiresLineOfSight: true,
    },
  ];
}
