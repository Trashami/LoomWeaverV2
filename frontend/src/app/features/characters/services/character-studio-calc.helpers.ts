import { buildSavingThrows, buildSkillsList } from '../models/character-creator-catalog.data';
import {
  AbilityScoreVm, CharacterCreatorDraftVm, CharacterSheetVm,
  CreatorAncestryOptionVm, CreatorBackgroundOptionVm, CreatorClassOptionVm, CreatorFeatOptionVm,
} from '../models/character-studio.models';
import { DEFAULT_CONNECTIONS, wizardDefaultEquipment } from '../models/character-studio-seed.data';

export interface PlayerAssignmentRecord {
  readonly ownerAccountId: string;
  readonly ownerUsername: string;
  readonly ownerDisplayName: string;
}

export function roll4d6DropLowest(): number {
  const dice = [1, 2, 3, 4].map(() => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a);
  return dice[0] + dice[1] + dice[2];
}

export function rollSixStatSet(): readonly [number, number, number, number, number, number] {
  return [
    roll4d6DropLowest(), roll4d6DropLowest(), roll4d6DropLowest(),
    roll4d6DropLowest(), roll4d6DropLowest(), roll4d6DropLowest(),
  ];
}

export function buildDraftFromExistingSheet(
  fromExisting: CharacterSheetVm,
  ancestries: readonly CreatorAncestryOptionVm[],
  classes: readonly CreatorClassOptionVm[],
  backgrounds: readonly CreatorBackgroundOptionVm[],
): CharacterCreatorDraftVm {
  const scoreOf = (code: AbilityScoreVm['code']) => fromExisting.abilities.find((a) => a.code === code)?.score ?? 12;
  const matchedAncestry = ancestries.find((a) => fromExisting.ancestryOrClan.toLowerCase().includes(a.name.toLowerCase())) ?? ancestries[1];
  const matchedSubrace = matchedAncestry.subraces.find((sr) => fromExisting.subrace.toLowerCase().includes(sr.name.toLowerCase())) ?? matchedAncestry.subraces[0];
  const matchedClass = classes.find((c) => fromExisting.classOrArchetype.toLowerCase().includes(c.name.toLowerCase())) ?? classes[0];
  const matchedBg = backgrounds.find((b) => fromExisting.backgroundName.toLowerCase().includes(b.name.toLowerCase())) ?? backgrounds[0];

  return {
    name: fromExisting.name, pronouns: fromExisting.pronouns, alignment: fromExisting.alignment,
    quote: fromExisting.quote, portraitUrl: fromExisting.portraitUrl, level: fromExisting.level,
    ancestryId: matchedAncestry.id, subraceId: matchedSubrace?.id ?? matchedAncestry.subraces[0]?.id ?? 'high-elf',
    classId: matchedClass.id, subclass: fromExisting.subclass || matchedClass.subclassDefault,
    backgroundId: matchedBg.id, selectedSkills: fromExisting.skills.filter((s) => s.proficient).map((s) => s.label),
    selectedFeatId: fromExisting.featureCards.find((f) => f.category === 'feat')?.title ?? 'Warcaster',
    startingPack: 'Starting Equipment',
    equipmentItems: [...fromExisting.equipment],
    equippedItemIds: fromExisting.equipment.filter((e) => e.equipped).map((e) => e.id),
    backpackItemIds: fromExisting.equipment.filter((e) => !e.equipped).map((e) => e.id),
    personalityTrait: fromExisting.personality.personality, ideal: fromExisting.personality.ideals,
    bond: fromExisting.personality.bonds, flaw: fromExisting.personality.flaws,
    abilities: { STR: scoreOf('STR'), DEX: scoreOf('DEX'), CON: scoreOf('CON'), INT: scoreOf('INT'), WIS: scoreOf('WIS'), CHA: scoreOf('CHA') },
    assignedPlayerAccountId: fromExisting.ownerAccountId,
    assignedPlayerUsername: fromExisting.ownerUsername,
    assignedPlayerDisplayName: fromExisting.ownerDisplayName || fromExisting.ownerUsername,
  };
}

export function buildFinalizedCharacterSheet(params: {
  draft: CharacterCreatorDraftVm;
  isEditing: boolean;
  existingSheet?: CharacterSheetVm;
  targetCampaignId: number;
  campaignName: string;
  systemCode: 'dnd5e' | 'pf2e' | 'vampire_v5';
  defaultOwner: PlayerAssignmentRecord;
  ancestries: readonly CreatorAncestryOptionVm[];
  classes: readonly CreatorClassOptionVm[];
  backgrounds: readonly CreatorBackgroundOptionVm[];
  feats: readonly CreatorFeatOptionVm[];
  metEntities: CharacterSheetVm['metEntities'];
  campaignHistory: CharacterSheetVm['campaignHistory'];
}): CharacterSheetVm {
  const { draft, isEditing, existingSheet, targetCampaignId, campaignName, systemCode, defaultOwner, ancestries, classes, backgrounds, feats, metEntities, campaignHistory } = params;
  const ancestry = ancestries.find((a) => a.id === draft.ancestryId) ?? ancestries[0];
  const subrace = ancestry.subraces.find((sr) => sr.id === draft.subraceId) ?? ancestry.subraces[0];
  const cls = classes.find((c) => c.id === draft.classId) ?? classes[0];
  const bg = backgrounds.find((b) => b.id === draft.backgroundId) ?? backgrounds[0];
  const featObj = feats.find((f) => f.name === draft.selectedFeatId || f.id === draft.selectedFeatId);

  const cleanName = draft.name.trim() || 'New Character';
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const charKey = existingSheet?.characterKey ?? `char-${slug}`;
  const ownerAccountId = draft.assignedPlayerAccountId || existingSheet?.ownerAccountId || defaultOwner.ownerAccountId;
  const ownerUsername = draft.assignedPlayerUsername || existingSheet?.ownerUsername || defaultOwner.ownerUsername;
  const ownerDisplayName = draft.assignedPlayerDisplayName || existingSheet?.ownerDisplayName || defaultOwner.ownerDisplayName;

  const bonusMap = ancestry.abilityBonuses ?? {};
  const abilities: AbilityScoreVm[] = (['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map((code) => ({
    code,
    label: { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' }[code],
    score: (draft.abilities[code] ?? 10) + (isEditing ? 0 : (bonusMap[code] ?? 0)),
    modifier: 0,
  }));
  const resolvedEquipment = draft.equipmentItems?.length ? [...draft.equipmentItems] : [...wizardDefaultEquipment(slug)];

  const baseSheet: CharacterSheetVm = {
    compositeKey: `${targetCampaignId}:Character:${charKey}`, characterKey: charKey,
    ownerAccountId, ownerUsername, ownerDisplayName,
    campaignId: targetCampaignId, name: cleanName, roleBadge: 'Player Character',
    portraitUrl: draft.portraitUrl || subrace?.portraitUrl || ancestry.portraitUrl,
    pronouns: draft.pronouns || 'He/Him', alignment: draft.alignment || 'Neutral Good',
    quote: draft.quote || bg.defaultQuote, ancestryOrClan: ancestry.name,
    subrace: subrace?.name ?? ancestry.name, classOrArchetype: cls.name,
    subclass: draft.subclass || cls.subclassDefault, backgroundName: bg.name, backgroundSummary: bg.summary,
    tags: ['Party Member', subrace?.name ?? ancestry.name, bg.name, cls.name],
    systemCode, level: draft.level ?? existingSheet?.level ?? 1,
    currentXp: existingSheet?.currentXp ?? 0, nextLevelXp: existingSheet?.nextLevelXp ?? 300,
    levelUpEligible: existingSheet?.levelUpEligible ?? false,
    maxHp: 32, currentHp: 32, armorClass: 15, initiativeBonus: 3, speedFeet: ancestry.speedFeet ?? 30,
    proficiencyBonus: 2, primaryAttackBonus: 5,
    actionEconomySummary: '1 Action · 1 Bonus Action · 1 Reaction · 30ft Move',
    abilities, savingThrows: buildSavingThrows(abilities, 2, cls.savingThrows),
    skills: buildSkillsList(abilities, 2, Array.from(new Set([...draft.selectedSkills, ...(bg.skillProficiencies ?? [])]))),
    spellGroups: existingSheet?.spellGroups?.length ? existingSheet.spellGroups : cls.startingSpells,
    equipment: resolvedEquipment.length ? resolvedEquipment : wizardDefaultEquipment(slug),
    featureCards: [
      ...cls.features,
      ...ancestry.traits.map((t) => ({ id: `anc-${slug}-${t.id}`, title: `${ancestry.name}: ${t.title}`, category: 'ancestry' as const, summary: t.description, icon: t.icon, tone: 'emerald' as const })),
      { id: `feat-${slug}-custom`, title: featObj?.name || draft.selectedFeatId || 'Warcaster', category: 'feat', summary: featObj ? `${featObj.summary} (${featObj.abilityBonus})` : 'Selected Feat & Tactical Mastery.', icon: 'swords', tone: 'gold' },
    ],
    features: [...cls.features.map((f) => f.title), ...ancestry.traits.map((t) => t.title), featObj?.name || draft.selectedFeatId || 'Warcaster'],
    personality: {
      personality: draft.personalityTrait || bg.personality.personality,
      ideals: draft.ideal || bg.personality.ideals,
      bonds: draft.bond || bg.personality.bonds,
      flaws: draft.flaw || bg.personality.flaws,
    },
    connections: existingSheet?.connections ?? DEFAULT_CONNECTIONS,
    notes: existingSheet?.notes ?? [`Created in Character Studio for ${campaignName}.`],
    richNotes: existingSheet?.richNotes ?? [],
    metEntities: existingSheet?.metEntities ?? metEntities,
    campaignHistory: existingSheet?.campaignHistory ?? campaignHistory,
    historyEvents: existingSheet?.historyEvents ?? [`Created as a ${subrace?.name ?? ancestry.name} ${cls.name}.`],
  };

  return recalculateCharacterSheet(baseSheet, systemCode, metEntities, campaignHistory);
}

export function recalculateCharacterSheet(
  sheet: CharacterSheetVm,
  systemCode: 'dnd5e' | 'pf2e' | 'vampire_v5',
  fallbackMetEntities: CharacterSheetVm['metEntities'],
  fallbackHistory: CharacterSheetVm['campaignHistory'],
): CharacterSheetVm {
  const abilities: AbilityScoreVm[] = sheet.abilities.map((a) => ({
    ...a,
    modifier: systemCode === 'vampire_v5' ? Math.max(1, Math.min(5, Math.round(a.score / 4))) : Math.floor((a.score - 10) / 2),
  }));
  const dexMod = abilities.find((a) => a.code === 'DEX')?.modifier ?? 2;
  const conMod = abilities.find((a) => a.code === 'CON')?.modifier ?? 2;
  const strMod = abilities.find((a) => a.code === 'STR')?.modifier ?? 2;
  const intMod = abilities.find((a) => a.code === 'INT')?.modifier ?? 2;
  const prof = systemCode === 'pf2e' ? sheet.level + 2 : systemCode === 'vampire_v5' ? Math.min(5, 1 + Math.floor(sheet.level / 3)) : 2 + Math.floor((sheet.level - 1) / 4);
  const eqAc = sheet.equipment.filter((e) => e.equipped).reduce((s, e) => s + e.acBonus, 0);
  const eqAtk = sheet.equipment.filter((e) => e.equipped).reduce((s, e) => s + e.attackBonus, 0);
  const isWizard = sheet.classOrArchetype.toLowerCase().includes('wizard');
  const baseAc = systemCode === 'pf2e' ? 10 + prof : isWizard ? 10 : 12;
  const armorClass = baseAc + Math.min(3, dexMod) + eqAc;
  const maxHp = isWizard ? (4 + conMod) * sheet.level + 2 : (7 + conMod) * sheet.level + 12;
  const primaryStatMod = isWizard ? intMod : Math.max(strMod, dexMod);
  const primaryAttackBonus = primaryStatMod + prof + eqAtk;
  const proficientSaves = sheet.savingThrows.filter((s) => s.proficient).map((s) => s.code);
  const savingThrows = buildSavingThrows(abilities, prof, proficientSaves.length ? proficientSaves : ['INT', 'WIS']);
  const proficientSkills = sheet.skills.filter((sk) => sk.proficient).map((sk) => sk.label);
  const skills = buildSkillsList(abilities, prof, proficientSkills);

  return {
    ...sheet, systemCode, abilities, savingThrows, skills,
    proficiencyBonus: prof, armorClass, maxHp, currentHp: maxHp,
    initiativeBonus: dexMod, primaryAttackBonus,
    actionEconomySummary: '1 Action · 1 Bonus Action · 1 Reaction · 30ft Move',
    metEntities: sheet.metEntities ?? fallbackMetEntities,
    campaignHistory: sheet.campaignHistory ?? fallbackHistory,
    levelUpEligible: sheet.currentXp >= sheet.nextLevelXp || sheet.levelUpEligible,
  };
}
