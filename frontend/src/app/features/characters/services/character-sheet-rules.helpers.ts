import {
  AbilityScoreVm,
  CharacterFeatureCardVm,
  CharacterSheetVm,
  CharacterSkillVm,
  CharacterSpellVm,
  EquipmentLoadoutItemVm,
  SavingThrowVm,
} from '../models/character-studio.models';
import {
  CampaignAdjustedRuleVm,
  CharacterSheetActionRowVm,
  STANDARD_COMBAT_ACTIONS,
} from './character-sheet-interactive.service';

export function buildCharacterSheetActionRows(
  sheet: CharacterSheetVm,
  spellMod: number,
  spellDc: number,
): CharacterSheetActionRowVm[] {
  const strMod = sheet.abilities.find((a) => a.code === 'STR')?.modifier ?? 1;
  const dexMod = sheet.abilities.find((a) => a.code === 'DEX')?.modifier ?? 2;
  const weaponMod = Math.max(strMod, dexMod);
  const atkBonus = weaponMod + sheet.proficiencyBonus;
  const spellAtkBonus = spellMod + sheet.proficiencyBonus;
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const rows: CharacterSheetActionRowVm[] = [];
  const equippedWeapons = sheet.equipment.filter(
    (e) =>
      e.equipped &&
      !e.name.toLowerCase().includes('spellbook') &&
      (e.slot.toLowerCase().includes('hand') || e.slot.toLowerCase().includes('focus')),
  );
  for (const w of equippedWeapons) {
    const lower = w.name.toLowerCase();
    const isFocus = w.slot === 'Focus' || lower.includes('focus') || lower.includes('staff') || lower.includes('wand');
    const isRanged = lower.includes('bow') || lower.includes('sling') || lower.includes('crossbow');
    const diceSides = lower.includes('greatsword') || lower.includes('warhammer') ? 10 : isFocus ? 6 : 8;
    const usedMod = isFocus ? spellMod : weaponMod;
    const usedAtk = isFocus ? spellAtkBonus : atkBonus;
    rows.push({
      id: `act-wpn-${w.id}`,
      name: w.name,
      subtitle: isFocus ? `Arcane Focus Conduit (${w.slot})` : `${w.slot} Weapon`,
      filterCategory: 'ATTACK',
      actionSlotCost: 'action',
      rangeLabel: isFocus ? '60 ft. / 5 ft.' : isRanged ? '80/320 ft.' : '5 ft. Reach',
      hitOrDcLabel: fmt(usedAtk),
      attackBonus: usedAtk,
      damageFormula: `1d${diceSides}${fmt(usedMod)}`,
      damageDiceCount: 1,
      damageDiceSides: diceSides,
      damageBonus: usedMod,
      damageType: isFocus ? 'Force' : isRanged ? 'Piercing' : 'Slashing',
      notes: w.summary,
      description: `Channel or strike with ${w.name} for ${sheet.name} (Lv.${sheet.level} ${sheet.classOrArchetype}). Attack Roll: 1d20 ${fmt(usedAtk)} (${isFocus ? 'Spell Mod' : 'Weapon Mod'} ${fmt(usedMod)} + Prof +${sheet.proficiencyBonus}). Damage: 1d${diceSides} ${fmt(usedMod)}.`,
      campaignRuleNote: `Campaign Rule: ${sheet.name}'s ${w.name} channels arcane resonance (+${sheet.proficiencyBonus} proficiency) and logs combat telemetry when an encounter is live.`,
    });
  }
  rows.push(
    {
      id: 'act-cantrip-strike', name: 'Fire Bolt / Arcane Lance', subtitle: 'Evocation Cantrip Attack',
      filterCategory: 'ATTACK', actionSlotCost: 'action', rangeLabel: '120 ft.', hitOrDcLabel: fmt(spellAtkBonus),
      attackBonus: spellAtkBonus, damageFormula: '2d10', damageDiceCount: 2, damageDiceSides: 10, damageBonus: 0,
      damageType: 'Fire', notes: `V/S · Lv.${sheet.level} Scaling (2d10)`,
      description: `${sheet.name} hurls a mote of arcane fire at a creature or object within 120 ft. Spell Attack: 1d20 ${fmt(spellAtkBonus)}. At Level ${sheet.level}, damage scales to 2d10 Fire.`,
      campaignRuleNote: 'Campaign Rule: Ignites flammable oil barrels and illuminates 10 ft of VTT dynamic fog of war for 1 round.',
    },
    {
      id: 'act-unarmed', name: 'Unarmed Strike', subtitle: 'Melee Weapon Attack',
      filterCategory: 'ATTACK', actionSlotCost: 'action', rangeLabel: '5 ft. Reach', hitOrDcLabel: fmt(strMod + sheet.proficiencyBonus),
      attackBonus: strMod + sheet.proficiencyBonus, damageFormula: `1d4${fmt(strMod)}`, damageDiceCount: 1, damageDiceSides: 4,
      damageBonus: strMod, damageType: 'Bludgeoning', notes: `Strike, Grapple, or Shove (DC ${8 + strMod + sheet.proficiencyBonus})`,
      description: `Melee unarmed strike by ${sheet.name}. Attack Roll: 1d20 ${fmt(strMod + sheet.proficiencyBonus)} (STR ${fmt(strMod)} + Prof +${sheet.proficiencyBonus}). Can also initiate Grapple or Shove (Save DC ${8 + strMod + sheet.proficiencyBonus}).`,
      campaignRuleNote: 'Campaign Rule: Unarmed Strike may deal Bludgeoning damage OR force a STR/DEX save against Grapple or Shove.',
    },
    {
      id: 'act-bonus-misty-step', name: 'Misty Step / Fey-Step', subtitle: '2nd-Level Bonus Action Teleport',
      filterCategory: 'BONUS ACTION', actionSlotCost: 'bonus', rangeLabel: '30 ft. Self', hitOrDcLabel: fmt(spellAtkBonus),
      attackBonus: spellAtkBonus, damageFormula: `1d20+${spellMod}`, damageDiceCount: 1, damageDiceSides: 20, damageBonus: spellMod,
      damageType: 'Teleport', notes: 'Bonus Action · No OA',
      description: `${sheet.name} is briefly surrounded by silvery arcane mist and teleports up to 30 feet to an unoccupied visible space.`,
      campaignRuleNote: 'Campaign Rule: Does not provoke Opportunity Attacks and bypasses grapples.',
      limitedUseId: 'lu-fey-step', limitedUseMax: 2, resetOn: 'Short Rest',
    },
    {
      id: 'act-bonus-second-wind', name: 'Tactical Surge / Healing Draught', subtitle: 'Bonus Action Recovery',
      filterCategory: 'BONUS ACTION', actionSlotCost: 'bonus', rangeLabel: 'Self (5 ft.)', hitOrDcLabel: fmt(sheet.proficiencyBonus),
      attackBonus: sheet.proficiencyBonus, damageFormula: `2d4+${sheet.proficiencyBonus}`, damageDiceCount: 2, damageDiceSides: 4,
      damageBonus: sheet.proficiencyBonus, damageType: 'Healing', notes: 'Bonus Action · Restores HP',
      description: `${sheet.name} draws on reserve stamina or consumes a healing potion as a Bonus Action to restore 2d4 + ${sheet.proficiencyBonus} HP.`,
      campaignRuleNote: 'House Rule: Drinking a potion yourself is a Bonus Action; administering to a downed ally is 1 Action.',
      limitedUseId: 'lu-tactical-surge', limitedUseMax: 2, resetOn: 'Short Rest',
    },
    {
      id: 'act-react-shield', name: 'Shield / Arcane Deflection', subtitle: '1st-Level Abjuration Reaction',
      filterCategory: 'REACTION', actionSlotCost: 'reaction', rangeLabel: 'Self', hitOrDcLabel: '+5 AC',
      attackBonus: spellAtkBonus, damageFormula: `1d20+${spellAtkBonus}`, damageDiceCount: 1, damageDiceSides: 20, damageBonus: 5,
      damageType: 'Abjuration Ward', notes: `Raises ${sheet.name} AC from ${sheet.armorClass} to ${sheet.armorClass + 5}`,
      description: `An invisible barrier of magical force protects ${sheet.name}, raising AC from ${sheet.armorClass} to ${sheet.armorClass + 5} until the start of their next turn.`,
      campaignRuleNote: 'Campaign Telemetry: When triggered against an enemy strike, records an Interrupted Attack or Reduced Damage event in live encounter analytics.',
      spellSlotLevel: 1,
    },
    {
      id: 'act-react-opportunity', name: 'Opportunity Attack', subtitle: 'Combat Reaction Strike',
      filterCategory: 'REACTION', actionSlotCost: 'reaction', rangeLabel: '5 ft. Reach', hitOrDcLabel: fmt(atkBonus),
      attackBonus: atkBonus, damageFormula: `1d8${fmt(weaponMod)}`, damageDiceCount: 1, damageDiceSides: 8, damageBonus: weaponMod,
      damageType: 'Slashing', notes: 'Triggered when hostile leaves reach',
      description: `${sheet.name} makes one melee attack as a Reaction when a visible hostile creature moves out of 5 ft reach.`,
      campaignRuleNote: 'Warcaster feat allows casting a 1-Action single-target spell in place of a melee weapon Opportunity Attack.',
    },
    {
      id: 'act-lu-arcane-recovery', name: 'Arcane Recovery', subtitle: 'Class Feature · Limited Use',
      filterCategory: 'LIMITED USE', actionSlotCost: 'action', rangeLabel: 'Self', hitOrDcLabel: `DC ${spellDc}`,
      attackBonus: spellAtkBonus, damageFormula: `1d20+${spellMod}`, damageDiceCount: 1, damageDiceSides: 20, damageBonus: spellMod,
      damageType: 'Slot Recovery', notes: `Recover up to ${Math.ceil(sheet.level / 2)} Spell Slot Levels`,
      description: `${sheet.name} (Level ${sheet.level} ${sheet.classOrArchetype}) can recover expended spell slots with a combined level up to ${Math.ceil(sheet.level / 2)} once per day during a Short Rest.`,
      campaignRuleNote: 'Near a magical leyline node, also grants +1d4 temporary HP per slot level recovered.',
      limitedUseId: 'lu-anelith-recovery', limitedUseMax: 1, resetOn: 'Long Rest',
    },
  );
  return rows;
}

export function buildAbilityRuleVm(ab: AbilityScoreVm, sheet: CharacterSheetVm): CampaignAdjustedRuleVm {
  const modStr = ab.modifier >= 0 ? `+${ab.modifier}` : `${ab.modifier}`;
  const govSkills = sheet.skills.filter((s) => s.abilityCode === ab.code).map((s) => `${s.label} (${s.bonus >= 0 ? '+' + s.bonus : s.bonus})`).join(', ') || 'None';
  const save = sheet.savingThrows.find((s) => s.code === ab.code);
  return {
    id: `rule-ab-${ab.code}`, categoryLabel: `${sheet.name} · Ability Score`,
    title: `${ab.label} (${ab.code}) — Score ${ab.score}`,
    subtitle: `${sheet.name} (Lv.${sheet.level} ${sheet.ancestryOrClan} ${sheet.classOrArchetype}) · Modifier ${modStr}`,
    castingOrActionTime: 'Ability Check (1d20)', rangeOrArea: 'Self', componentsOrSlot: `Score ${ab.score} (${modStr})`,
    durationLabel: `Save: ${save ? (save.bonus >= 0 ? '+' + save.bonus : save.bonus) : modStr}`,
    sourceLabel: 'Character Breakdown', damageOrBonusBadge: `1d20 ${modStr}`,
    standardRuleText: `${sheet.name}'s ${ab.label} score is ${ab.score}, granting a ${modStr} modifier on raw ${ab.code} checks. Governed Skills for ${sheet.name}: ${govSkills}.`,
    campaignAdjustedRuleTitle: 'Campaign Rule',
    campaignAdjustedRuleText: `Natural 20 on a ${ab.label} Check during a Live Session unlocks bonus lore citations in The Loom and records a Critical Success for ${sheet.name}.`,
    campaignClauseFormula: `ROLL(1d20 ${modStr}) -> GovernedSkills(${govSkills})`,
    tags: [ab.code, `Score ${ab.score}`, `Mod ${modStr}`, sheet.classOrArchetype],
    rollConfig: { category: 'ability', actionSlotCost: 'none', diceSides: 20, diceCount: 1, modifier: ab.modifier },
  };
}

export function buildSaveRuleVm(sv: SavingThrowVm, sheet: CharacterSheetVm): CampaignAdjustedRuleVm {
  const modStr = sv.bonus >= 0 ? `+${sv.bonus}` : `${sv.bonus}`;
  const abMod = sheet.abilities.find((a) => a.code === sv.code)?.modifier ?? 0;
  const breakdown = sv.proficient
    ? `${sv.code} Mod (${abMod >= 0 ? '+' + abMod : abMod}) + Proficiency Bonus (+${sheet.proficiencyBonus}) = ${modStr}`
    : `${sv.code} Mod (${abMod >= 0 ? '+' + abMod : abMod}) [Unproficient] = ${modStr}`;
  return {
    id: `rule-save-${sv.code}`, categoryLabel: `${sheet.name} · Saving Throw`,
    title: `${sv.label} Saving Throw (${modStr})`, subtitle: `${sv.proficient ? 'Proficient Save' : 'Standard Save'} · ${breakdown}`,
    castingOrActionTime: 'Free / Triggered', rangeOrArea: 'Self', componentsOrSlot: breakdown,
    durationLabel: 'Instantaneous', sourceLabel: 'Character Rule', damageOrBonusBadge: `1d20 ${modStr}`,
    standardRuleText: `${sheet.name}'s ${sv.label} Saving Throw bonus is ${modStr} (${breakdown}). Roll 1d20 ${modStr} against enemy Spell Save DCs, traps, or hazards.`,
    campaignAdjustedRuleTitle: 'Adjusted Campaign Rule (Arcane Ward)',
    campaignAdjustedRuleText: `In this campaign, rolling a Natural 20 on a Saving Throw reduces incoming AoE damage to 0 and logs a Mitigated Damage event for ${sheet.name}.`,
    campaignClauseFormula: `WHEN Save(${sv.code}) = 1d20 ${modStr} >= TargetDC THEN ResistEffect()`,
    tags: [`${sv.code} Save`, sv.proficient ? 'Proficient' : 'Standard', breakdown],
    rollConfig: { category: 'save', actionSlotCost: 'none', diceSides: 20, diceCount: 1, modifier: sv.bonus },
  };
}

export function buildSkillRuleVm(sk: CharacterSkillVm, sheet: CharacterSheetVm): CampaignAdjustedRuleVm {
  const modStr = sk.bonus >= 0 ? `+${sk.bonus}` : `${sk.bonus}`;
  const abMod = sheet.abilities.find((a) => a.code === sk.abilityCode)?.modifier ?? 0;
  const breakdown = sk.proficient
    ? `${sk.abilityCode} Mod (${abMod >= 0 ? '+' + abMod : abMod}) + Prof (+${sheet.proficiencyBonus}) = ${modStr}`
    : `${sk.abilityCode} Mod (${abMod >= 0 ? '+' + abMod : abMod}) = ${modStr}`;
  return {
    id: `rule-skill-${sk.id}`, categoryLabel: `${sheet.name} · Skill (${sk.abilityCode})`,
    title: `${sk.label} (${modStr})`, subtitle: `${breakdown} · Passive ${sk.label}: ${10 + sk.bonus}`,
    castingOrActionTime: '1 Action (Study / Search / Influence)', rangeOrArea: 'Self / 30 ft.',
    componentsOrSlot: breakdown, durationLabel: `Passive ${10 + sk.bonus}`,
    sourceLabel: 'Campaign Lore Rules', damageOrBonusBadge: `1d20 ${modStr}`,
    standardRuleText: `${sheet.name}'s ${sk.label} modifier is ${modStr} (${breakdown}). Passive ${sk.label} is ${10 + sk.bonus}.`,
    campaignAdjustedRuleTitle: 'Campaign Adjustment',
    campaignAdjustedRuleText:
      sk.label === 'History' || sk.label === 'Arcana' || sk.label === 'Perception'
        ? `${sheet.name} gains automatic Advantage when inspecting ancient runes, historical ledgers, or leyline stonework.`
        : `During active combat encounters, using ${sk.label} via Study, Search, or Influence consumes 1 Action unless granted as a Bonus Action.`,
    campaignClauseFormula: `ROLL(1d20 ${modStr}) · PASSIVE(${10 + sk.bonus})`,
    tags: [sk.abilityCode, sk.proficient ? 'Proficient' : 'Standard', `Passive ${10 + sk.bonus}`],
    rollConfig: { category: 'skill', actionSlotCost: 'none', diceSides: 20, diceCount: 1, modifier: sk.bonus },
  };
}

export function buildCharacterContextRuleVm(
  kind: 'proficiency' | 'speed' | 'inspiration' | 'hp' | 'sense' | 'training' | 'defense' | 'condition',
  title: string,
  detail: string,
  sheet: CharacterSheetVm,
): CampaignAdjustedRuleVm {
  const conMod = sheet.abilities.find((a) => a.code === 'CON')?.modifier ?? 2;
  const strScore = sheet.abilities.find((a) => a.code === 'STR')?.score ?? 10;
  const strMod = sheet.abilities.find((a) => a.code === 'STR')?.modifier ?? 0;
  const summaryMap: Record<typeof kind, { sub: string; std: string; camp: string; badge: string }> = {
    proficiency: {
      sub: `Level ${sheet.level} ${sheet.classOrArchetype} Proficiency Tier`,
      std: `At Level ${sheet.level}, ${sheet.name}'s Proficiency Bonus is +${sheet.proficiencyBonus}. Added to proficient Attacks, Saving Throws, Skills, and Spell Save DC (8 + ${sheet.proficiencyBonus} + Spell Mod).`,
      camp: `Automatically scales to +4 at Level 9. Applies to ${sheet.name}'s equipped Arcane Focus and martial proficiencies.`,
      badge: `+${sheet.proficiencyBonus} Bonus`,
    },
    speed: {
      sub: `${sheet.ancestryOrClan} Base Walking Speed`,
      std: `${sheet.name} can move up to ${sheet.speedFeet} ft. on their turn (${sheet.speedFeet * 2} ft. with the Dash action). Long Jump: up to ${strScore} ft.; High Jump: ${3 + strMod} ft.`,
      camp: `In LoomWeaver VTT, movement is tracked per 5-ft grid square and automatically updates dynamic Line-of-Sight fog of war.`,
      badge: `${sheet.speedFeet} ft.`,
    },
    inspiration: {
      sub: 'Heroic Inspiration Reroll Resource',
      std: `When ${sheet.name} has Heroic Inspiration, they can expend it to gain Advantage or reroll any d20 test. Once spent, it remains unavailable until restored by a Long Rest or the GM.`,
      camp: `Awarded by the GM for roleplay, discovering Loom lore connections, or rolling a Natural 20 on key campaign checks.`,
      badge: 'Reroll d20',
    },
    hp: {
      sub: `Vitality & Hit Dice (${sheet.level}d8 · CON ${conMod >= 0 ? '+' + conMod : conMod}/lvl)`,
      std: `${sheet.name} has ${sheet.currentHp} / ${sheet.maxHp} Hit Points and ${sheet.level} Hit Dice. Synced live with the active VTT Encounter token.`,
      camp: `Dropping to 0 HP triggers Death Saving Throws (1d20, DC 10) tracked live in the VTT Encounter combat log.`,
      badge: `${sheet.currentHp}/${sheet.maxHp} HP`,
    },
    sense: {
      sub: `${sheet.name}'s Passive Awareness & Vision`,
      std: `${detail}. Passive score equals 10 + ${sheet.name}'s corresponding skill modifier (+5 with Advantage, -5 with Disadvantage).`,
      camp: `Used automatically by the VTT lighting engine to detect hidden ambushers, traps, and secret doors without rolling.`,
      badge: title,
    },
    training: {
      sub: `${sheet.classOrArchetype} & ${sheet.backgroundName} Proficiencies`,
      std: `${sheet.name} is trained in: ${detail}. Wearing armor without proficiency imposes Disadvantage on STR/DEX D20 tests and blocks spellcasting.`,
      camp: `Tool & Language proficiencies unlock translated inscriptions and Artificer crafting options in your home city.`,
      badge: 'Trained',
    },
    defense: {
      sub: `${sheet.name}'s Active Resistances & Lineage Wards`,
      std: `${detail}. Grants protective wards or Advantage on saving throws against specific magical and environmental effects.`,
      camp: `Automatically factored into incoming damage reductions in the active Encounter combat resolver.`,
      badge: 'Active Ward',
    },
    condition: {
      sub: `${sheet.name}'s Active Status Effects`,
      std: `Current Status: ${detail}. Conditions alter attack rolls, saving throws, movement speed, or action availability.`,
      camp: `Synced live with VTT token status rings and turn-start concentration/duration checks.`,
      badge: detail,
    },
  };
  const info = summaryMap[kind];
  return {
    id: `rule-ctx-${kind}-${title}`, categoryLabel: `${sheet.name} · Character Rule`,
    title, subtitle: info.sub, castingOrActionTime: 'Passive / Character Rule',
    rangeOrArea: 'Self', componentsOrSlot: sheet.name, durationLabel: 'Continuous',
    sourceLabel: 'Campaign Rules', damageOrBonusBadge: info.badge,
    standardRuleText: info.std, campaignAdjustedRuleTitle: 'Adjusted Rule for This Campaign',
    campaignAdjustedRuleText: info.camp, tags: [sheet.name, sheet.classOrArchetype, info.badge],
  };
}

export function buildActionRowRuleVm(row: CharacterSheetActionRowVm): CampaignAdjustedRuleVm {
  return {
    id: row.id, categoryLabel: row.subtitle, title: row.name,
    subtitle: `${row.filterCategory} · ${row.rangeLabel}`,
    castingOrActionTime: row.actionSlotCost === 'bonus' ? '1 Bonus Action' : row.actionSlotCost === 'reaction' ? '1 Reaction' : '1 Action',
    rangeOrArea: row.rangeLabel,
    componentsOrSlot: row.limitedUseMax ? `Limited Use (${row.limitedUseMax}/${row.resetOn})` : row.spellSlotLevel ? `Lv.${row.spellSlotLevel} Slot` : 'At-Will',
    durationLabel: 'Instantaneous', sourceLabel: 'Action Studio Catalog',
    damageOrBonusBadge: `${row.hitOrDcLabel} | ${row.damageFormula} ${row.damageType}`,
    standardRuleText: row.description, campaignAdjustedRuleTitle: 'Adjusted Rule for This Campaign',
    campaignAdjustedRuleText: row.campaignRuleNote,
    campaignClauseFormula: `CONSUMES(${row.actionSlotCost.toUpperCase()}) -> ROLL(1d20 + ${row.attackBonus}) -> DMG(${row.damageFormula} ${row.damageType})`,
    tags: [row.filterCategory, row.damageType, row.rangeLabel],
    rollConfig: {
      category: row.filterCategory === 'ATTACK' ? 'attack' : 'feature',
      actionSlotCost: row.actionSlotCost, diceSides: 20, diceCount: 1, modifier: row.attackBonus,
      damageDiceCount: row.damageDiceCount, damageDiceSides: row.damageDiceSides, damageBonus: row.damageBonus,
      damageType: row.damageType, spellSlotLevel: row.spellSlotLevel, limitedUseId: row.limitedUseId,
    },
  };
}

export function buildSpellRuleVm(sp: CharacterSpellVm, spellAtkBonus: number, spellDc: number): CampaignAdjustedRuleVm {
  const isCantrip = (sp.level ?? 0) === 0;
  const costStr = (sp.actionCost ?? '1 Action').toLowerCase();
  const cost: 'action' | 'bonus' | 'reaction' = costStr.includes('bonus') ? 'bonus' : costStr.includes('reaction') ? 'reaction' : 'action';
  const rng = sp.range ?? '60 ft.';
  return {
    id: `rule-spell-${sp.id}`, categoryLabel: isCantrip ? `${sp.school} Cantrip` : `Level ${sp.level} ${sp.school} Spell`,
    title: sp.name, subtitle: `${sp.actionCost} · ${rng}`, castingOrActionTime: sp.actionCost, rangeOrArea: rng,
    componentsOrSlot: isCantrip ? 'At-Will (0 Slot)' : `Consumes 1 Level ${sp.level} Spell Slot`,
    durationLabel: sp.concentration ? 'Concentration, up to 1 min' : (sp.duration ?? 'Instantaneous'),
    sourceLabel: 'Spell Catalog', damageOrBonusBadge: `Hit +${spellAtkBonus} / DC ${spellDc}`,
    standardRuleText: `${sp.summary} (${sp.school}). Requires ${sp.actionCost} within ${rng}. Spell Attack Bonus +${spellAtkBonus}, Spell Save DC ${spellDc}.`,
    campaignAdjustedRuleTitle: 'Campaign Spellcasting & Slot Rule',
    campaignAdjustedRuleText: isCantrip
      ? `Cantrips scale automatically with character level and consume ${cost === 'bonus' ? '1 Bonus Action' : '1 Action'} without expending a spell slot.`
      : `Casting ${sp.name} automatically expends ${cost === 'bonus' ? '1 Bonus Action' : cost === 'reaction' ? '1 Reaction' : '1 Action'} and 1 Level ${sp.level} Spell Slot.`,
    campaignClauseFormula: `CAST(${sp.name}) -> CONSUME(${cost.toUpperCase()}${isCantrip ? '' : `, SLOT_LV_${sp.level}`}) -> ROLL(1d20 + ${spellAtkBonus})`,
    tags: [sp.school, isCantrip ? 'Cantrip' : `Level ${sp.level}`, sp.concentration ? 'Concentration' : 'Instant'],
    rollConfig: {
      category: 'spell-attack', actionSlotCost: cost, diceSides: 20, diceCount: 1, modifier: spellAtkBonus,
      damageDiceCount: isCantrip ? 2 : (sp.level ?? 1) + 1, damageDiceSides: 8, damageBonus: 0,
      damageType: 'Arcane / Force', spellSlotLevel: isCantrip ? undefined : (sp.level ?? 1),
    },
  };
}

export function buildCombatActionRuleVm(ca: (typeof STANDARD_COMBAT_ACTIONS)[number], mod: number): CampaignAdjustedRuleVm {
  return {
    id: ca.id, categoryLabel: 'Action in Combat', title: ca.name,
    subtitle: `Consumes 1 ${ca.cost === 'bonus' ? 'Bonus Action' : ca.cost === 'reaction' ? 'Reaction' : 'Action'}`,
    castingOrActionTime: `1 ${ca.cost === 'bonus' ? 'Bonus Action' : ca.cost === 'reaction' ? 'Reaction' : 'Action'}`,
    rangeOrArea: 'Combat Space', componentsOrSlot: ca.cost.toUpperCase(), durationLabel: '1 Turn',
    sourceLabel: 'Combat Rules', damageOrBonusBadge: `1 ${ca.cost}`,
    standardRuleText: ca.summary, campaignAdjustedRuleTitle: 'Adjusted Rule for This Campaign',
    campaignAdjustedRuleText: ca.campaignAdjustment,
    campaignClauseFormula: `ACTION_ECONOMY.CONSUME(${ca.cost.toUpperCase()})`,
    tags: ['Combat Action', ca.cost.toUpperCase(), 'VTT Synced'],
    rollConfig: { category: 'combat-action', actionSlotCost: ca.cost, diceSides: 20, diceCount: 1, modifier: mod },
  };
}

export function buildFeatureOrItemRuleVm(
  item: CharacterFeatureCardVm | EquipmentLoadoutItemVm,
  kind: 'feature' | 'item',
  mod: number,
): CampaignAdjustedRuleVm {
  const isFeat = kind === 'feature';
  const f = item as CharacterFeatureCardVm;
  const e = item as EquipmentLoadoutItemVm;
  return {
    id: `rule-${kind}-${item.id}`, categoryLabel: isFeat ? f.category.toUpperCase() : `Item (${e.slot})`,
    title: isFeat ? f.title : e.name,
    subtitle: isFeat ? f.category.toUpperCase() : e.equipped ? 'Equipped on Character' : 'Stowed in Backpack',
    castingOrActionTime: '1 Action / Passive', rangeOrArea: 'Self / Reach',
    componentsOrSlot: isFeat ? 'Class / Ancestry Trait' : `${e.weightLb ?? 2} lbs · ${e.rarity ?? 'Common'}`,
    durationLabel: 'Continuous / Instant', sourceLabel: 'Campaign Catalog',
    damageOrBonusBadge: isFeat ? 'Trait Check' : (e.bonusLabel || e.slot),
    standardRuleText: isFeat ? f.summary : `${e.summary} (${e.bonusLabel}).`,
    campaignAdjustedRuleTitle: 'Campaign Integration & Lore Rule',
    campaignAdjustedRuleText: isFeat
      ? 'This trait integrates directly with VTT lighting, saving throws, and The Loom knowledge citations.'
      : `Items equipped in ${e.slot} automatically update Armor Class, attack rows, and encumbrance across Character Sheet and Edit Character.`,
    tags: isFeat ? [f.category, 'Trait'] : [e.slot, e.rarity ?? 'Standard', e.equipped ? 'Equipped' : 'Backpack'],
    rollConfig: { category: 'feature', actionSlotCost: 'none', diceSides: 20, diceCount: 1, modifier: mod },
  };
}

export function matchesItemQuickFilter(item: EquipmentLoadoutItemVm, filterId: string): boolean {
  if (!filterId || filterId === 'all') return true;
  const n = item.name.toLowerCase();
  const s = item.slot.toLowerCase();
  const r = (item.rarity ?? 'Common').toLowerCase();
  if (filterId === 'magical') return r !== 'common' || n.includes('ring') || n.includes('cloak') || n.includes('amulet') || n.includes('pearl') || n.includes('bag of holding') || n.includes('boots of') || n.includes('gauntlets');
  if (filterId === 'rings') return n.includes('ring') || n.includes('amulet') || n.includes('pearl') || n.includes('reliquary');
  if (filterId === 'weapons') return (s === 'main hand' || s === 'off hand') && !n.includes('shield');
  if (filterId === 'armor') return s === 'armor' || n.includes('shield') || n.includes('cloak') || n.includes('gauntlets');
  if (filterId === 'potions') return n.includes('potion') || n.includes('scroll') || n.includes('draught');
  if (filterId === 'focuses') return s === 'focus' || n.includes('grimoire') || n.includes('staff') || n.includes('reliquary');
  if (filterId === 'gear') return s === 'gear';
  return true;
}

export function getEquipmentItemImageUrl(item: EquipmentLoadoutItemVm): string {
  const n = item.name.toLowerCase();
  const isRare = (item.rarity ?? '').toLowerCase() === 'rare';
  const isUncommon = (item.rarity ?? '').toLowerCase() === 'uncommon';
  const stroke = isRare ? '#f3c668' : isUncommon ? '#49e892' : '#9ec0ae';
  const glow = isRare ? '#d9b77a' : '#2ee66b';
  let glyph = `<path d="M22 74 L70 26 M60 22 L74 36 M18 70 L26 78" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/><circle cx="72" cy="24" r="6" fill="${glow}"/>`;
  if (n.includes('ring') || n.includes('amulet') || n.includes('pearl')) {
    glyph = `<circle cx="48" cy="52" r="20" fill="none" stroke="${stroke}" stroke-width="5"/><polygon points="48,20 56,30 48,36 40,30" fill="${glow}"/>`;
  } else if (n.includes('potion') || n.includes('vial')) {
    glyph = `<path d="M40 22 H56 M44 22 V34 L30 56 A14 14 0 0 0 42 76 H54 A14 14 0 0 0 66 56 L52 34 V22" fill="rgba(46,230,107,0.22)" stroke="${stroke}" stroke-width="4"/>`;
  } else if (item.slot === 'Armor' || n.includes('shield') || n.includes('cloak')) {
    glyph = `<path d="M48 18 L72 28 V48 C72 64 48 78 48 78 C48 78 24 64 24 48 V28 Z" fill="rgba(217,183,122,0.16)" stroke="${stroke}" stroke-width="4"/>`;
  } else if (n.includes('bow') || n.includes('crossbow')) {
    glyph = `<path d="M32 20 C62 34 62 62 32 76" fill="none" stroke="${stroke}" stroke-width="4"/><line x1="32" y1="20" x2="32" y2="76" stroke="#d9b77a" stroke-width="2"/><line x1="22" y1="48" x2="66" y2="48" stroke="${glow}" stroke-width="3"/>`;
  } else if (item.slot === 'Focus' || n.includes('grimoire') || n.includes('pack')) {
    glyph = `<rect x="26" y="20" width="44" height="56" rx="5" fill="rgba(217,183,122,0.15)" stroke="${stroke}" stroke-width="4"/><circle cx="48" cy="48" r="10" fill="none" stroke="${glow}" stroke-width="3"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><radialGradient id="g" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#133827"/><stop offset="100%" stop-color="#06130d"/></radialGradient></defs><rect width="96" height="96" rx="14" fill="url(#g)" stroke="${stroke}" stroke-width="2"/>${glyph}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
