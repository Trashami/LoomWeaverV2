import {
  AbilityScoreVm,
  CharacterCampaignHistoryEventVm,
  CharacterMetEntityVm,
  CharacterSkillVm,
  CharacterSpellVm,
  CreatorBackgroundOptionVm,
  CreatorFeatOptionVm,
  EquipmentLoadoutItemVm,
  LwNoteMentionTagVm,
  SavingThrowVm,
} from './character-studio.models';

export const CREATOR_BACKGROUNDS: readonly CreatorBackgroundOptionVm[] = [
  {
    id: 'sage', name: 'Sage', tagline: 'Researcher of ancient libraries, observatories, and arcane lore.',
    summary: 'Years spent in scriptoriums and archives deciphering pre-war chronicles and magical theory.', source: 'PHB',
    recommendedClasses: ['wizard', 'sorcerer', 'warlock', 'artificer', 'cleric', 'bard'],
    recommendedAncestries: ['elf', 'human', 'gnome', 'tiefling', 'aasimar', 'kalashtar'],
    skillProficiencies: ['Arcana', 'History'], toolProficiencies: ['Calligrapher Supplies'], featureName: 'Researcher',
    defaultQuote: '"Knowledge preserves what time would otherwise forget."',
    personality: { personality: 'Methodical, curious, and always cross-referencing inscriptions.', ideals: 'Truth should be recorded, not buried beneath politics.', bonds: 'An ancient manuscript with missing pages that points to forgotten history.', flaws: 'Will risk danger to read an unsealed rune or inscription.' },
  },
  {
    id: 'acolyte', name: 'Acolyte', tagline: 'Devoted temple initiate steeped in sacred rites and sanctuary vows.',
    summary: 'Served in the moonlit temples of a forgotten faith or an ancient monastic sanctuary tending the abandoned.', source: 'PHB',
    recommendedClasses: ['cleric', 'paladin', 'monk', 'druid', 'warlock'],
    recommendedAncestries: ['aasimar', 'human', 'dwarf', 'elf', 'dragonborn', 'firbolg'],
    skillProficiencies: ['Insight', 'Religion'], toolProficiencies: ['Herbalism Kit'], featureName: 'Shelter of the Faithful',
    defaultQuote: '"No soul left behind in the dark is truly forgotten."',
    personality: { personality: 'Compassionate, observant, and calm amidst crisis.', ideals: 'Mercy and shelter belong to the outcast first.', bonds: 'The temple sanctuary that took me in when I had nothing.', flaws: 'Judges harshly those who exploit faith for power.' },
  },
  {
    id: 'criminal', name: 'Criminal / Spy', tagline: 'Operative of shadow networks, cipher drops, and rooftop routes.',
    summary: 'Navigated smugglers coves, black-market auctions, and whispered intelligence across the free cities and their docks.', source: 'PHB',
    recommendedClasses: ['rogue', 'bard', 'ranger', 'warlock', 'monk'],
    recommendedAncestries: ['tiefling', 'halfling', 'half-elf', 'changeling', 'human', 'tabaxi'],
    skillProficiencies: ['Deception', 'Stealth'], toolProficiencies: ['Thieves Tools', 'Gaming Set'], featureName: 'Criminal Contact',
    defaultQuote: '"Every locked door is just an invitation written in brass."',
    personality: { personality: 'Always sits facing the exit and notices who is watching.', ideals: 'Loyalty to the crew outweighs the decrees of lords.', bonds: 'A debt owed to a contact who smuggled me out of captivity.', flaws: 'Struggles to leave a valuable relic unpocketed.' },
  },
  {
    id: 'soldier', name: 'Soldier', tagline: 'Seasoned vanguard of border campaigns and siege lines.',
    summary: 'Trained in formation tactics, watch-post discipline, and holding the line under arcane bombardment.', source: 'PHB',
    recommendedClasses: ['fighter', 'paladin', 'barbarian', 'ranger'],
    recommendedAncestries: ['dragonborn', 'half-orc', 'dwarf', 'goliath', 'human'],
    skillProficiencies: ['Athletics', 'Intimidation'], toolProficiencies: ['Land Vehicles', 'Gaming Set'], featureName: 'Military Rank',
    defaultQuote: '"Stand firm. The line holds where we plant our boots."',
    personality: { personality: 'Direct, watchful, and protective of companions in the rear.', ideals: 'Courage means standing between danger and those who cannot fight.', bonds: 'The mentor who taught me to hold a blade and never yield.', flaws: 'Refuses to retreat while an ally remains behind.' },
  },
  {
    id: 'noble', name: 'Noble / Exile Line', tagline: 'Heir to a storied house, royal lineage, or displaced court.',
    summary: 'Educated in statecraft, heraldry, and ancient obligation, carrying a name that opens doors or draws blades.', source: 'PHB',
    recommendedClasses: ['paladin', 'bard', 'sorcerer', 'fighter', 'wizard', 'ranger'],
    recommendedAncestries: ['elf', 'human', 'half-elf', 'dragonborn', 'tiefling', 'aasimar'],
    skillProficiencies: ['History', 'Persuasion'], toolProficiencies: ['Dragonchess Set'], featureName: 'Position of Privilege',
    defaultQuote: '"A crown is only worth the people it shelters."',
    personality: { personality: 'Composed, dignified, and acutely aware of historical duty.', ideals: 'True nobility walks beside the world rather than ruling above it.', bonds: 'An ancestral heritage that must be earned before it is claimed.', flaws: 'Bears the guilt of ancestral failures personally.' },
  },
  {
    id: 'outlander', name: 'Outlander', tagline: 'Borderland pathfinder raised beyond city walls.',
    summary: 'Tracked game and read weather patterns across the Plains of Vistagh, Duskwood, and mountain passes.', source: 'PHB',
    recommendedClasses: ['ranger', 'barbarian', 'druid', 'fighter', 'monk'],
    recommendedAncestries: ['elf', 'goliath', 'half-orc', 'firbolg', 'tabaxi', 'halfling'],
    skillProficiencies: ['Athletics', 'Survival'], toolProficiencies: ['Cartographer Tools'], featureName: 'Wanderer',
    defaultQuote: '"The wind tells you who crossed the ridge an hour ago."',
    personality: { personality: 'Alert to tracks, silence, and shifts in the stone.', ideals: 'The wild remembers older truths than city charters.', bonds: 'The border roads and companions who travel them with me.', flaws: 'Restless inside walled courts and crowded halls.' },
  },
  {
    id: 'guild-artisan', name: 'Guild Artisan', tagline: 'Sworn craftsperson of the Artificers Guild, smiths, or stonecutters.',
    summary: 'Trained in a city workshop or the dwarven holds to answer magical dominance with precision craft and metallurgy.', source: 'PHB',
    recommendedClasses: ['artificer', 'fighter', 'wizard', 'bard', 'rogue', 'cleric'],
    recommendedAncestries: ['dwarf', 'gnome', 'human', 'half-elf', 'goliath'],
    skillProficiencies: ['Insight', 'Persuasion'], toolProficiencies: ['Tinker Tools', 'Smith Tools'], featureName: 'Guild Membership',
    defaultQuote: '"Good steel and honest gears never lie about their tolerances."',
    personality: { personality: 'Inspects stonework, hinges, and mechanisms wherever they go.', ideals: 'Craft and intellect give ordinary folk an answer to tyrants.', bonds: 'The guild hall where I apprenticed and the masters who shared their blueprints.', flaws: 'Cannot resist dismantling an unfamiliar mechanism.' },
  },
  {
    id: 'charlatan', name: 'Charlatan', tagline: 'Master of assumed identities, forged seals, and silver-tongued Gambits.',
    summary: 'Talked through velvet ropes and high-society galas with quick wit and quicker fingers.', source: 'PHB',
    recommendedClasses: ['bard', 'rogue', 'warlock', 'sorcerer'],
    recommendedAncestries: ['changeling', 'tiefling', 'half-elf', 'halfling', 'human', 'fairy'],
    skillProficiencies: ['Deception', 'Sleight of Hand'], toolProficiencies: ['Disguise Kit', 'Forgery Kit'], featureName: 'False Identity',
    defaultQuote: '"People see the coat of arms they want to believe in."',
    personality: { personality: 'Charming, improvisational, and deflects serious questions with humor.', ideals: 'Freedom means never letting anyone pin down your true name.', bonds: 'A handful of misfits who know who I really am.', flaws: 'Uses jokes to avoid speaking plainly about fear.' },
  },
  {
    id: 'folk-hero', name: 'Folk Hero', tagline: 'Champion of village hearth and common folk against raiders.',
    summary: 'Rose from humble origins to defend a frontier village when no lord sent aid.', source: 'PHB',
    recommendedClasses: ['fighter', 'paladin', 'ranger', 'barbarian', 'druid', 'monk'],
    recommendedAncestries: ['human', 'halfling', 'dwarf', 'half-orc', 'goliath'],
    skillProficiencies: ['Animal Handling', 'Survival'], toolProficiencies: ['Carpenter Tools'], featureName: 'Rustic Hospitality',
    defaultQuote: '"Someone had to stand in the road. It might as well be me."',
    personality: { personality: 'Warm-hearted, plain-spoken, and fearless when innocents are threatened.', ideals: 'Strength exists to protect the village, not impress the court.', bonds: 'The village where I grew up and the mentor who trained me.', flaws: 'Charges headfirst into overwhelming odds.' },
  },
  {
    id: 'hermit', name: 'Hermit', tagline: 'Secluded seeker who uncovered an ancient, dangerous truth.',
    summary: 'Spent years in quiet exile contemplating the remnants of creation and the scars of old wars.', source: 'PHB',
    recommendedClasses: ['druid', 'monk', 'cleric', 'wizard', 'warlock', 'sorcerer'],
    recommendedAncestries: ['firbolg', 'kalashtar', 'elf', 'dwarf', 'human', 'aasimar'],
    skillProficiencies: ['Medicine', 'Religion'], toolProficiencies: ['Herbalism Kit'], featureName: 'Discovery',
    defaultQuote: '"Silence teaches what shouting scholars never hear."',
    personality: { personality: 'Thoughtful, measured, and speaks only when words matter.', ideals: 'Ancient power must be understood lest it consume the world again.', bonds: 'A secret discovery regarding the six Luminaries of creation.', flaws: 'Keeps dangerous knowledge to themselves too long.' },
  },
  {
    id: 'urchin', name: 'Urchin', tagline: 'Street survivor who knows every alley and rooftop in town.',
    summary: 'Grew up dodging harbor patrols and slipping through narrow passages unnoticed.', source: 'PHB',
    recommendedClasses: ['rogue', 'monk', 'ranger', 'bard', 'warlock'],
    recommendedAncestries: ['halfling', 'tiefling', 'goblin', 'tabaxi', 'human', 'half-elf'],
    skillProficiencies: ['Sleight of Hand', 'Stealth'], toolProficiencies: ['Disguise Kit', 'Thieves Tools'], featureName: 'City Secrets',
    defaultQuote: '"If there is a roof, there is a highway."',
    personality: { personality: 'Quick-witted, scrappy, and fiercely loyal to found family.', ideals: 'The street looks after its own when the towers look away.', bonds: 'The companions who became the first real home I ever knew.', flaws: 'Hoards odd trinkets and food out of old habit.' },
  },
  {
    id: 'sailor', name: 'Sailor / Skyship Crew', tagline: 'Corsair of the Bay of Forgotten Treasures and high skyship lanes.',
    summary: 'Sailed coastal runners out of a harbor town or crewed experimental aether-rigged skyships.', source: 'PHB',
    recommendedClasses: ['rogue', 'fighter', 'ranger', 'bard', 'artificer', 'sorcerer'],
    recommendedAncestries: ['human', 'half-orc', 'tabaxi', 'elf', 'halfling', 'dragonborn'],
    skillProficiencies: ['Athletics', 'Perception'], toolProficiencies: ['Navigator Tools', 'Water & Air Vehicles'], featureName: 'Ship Passage',
    defaultQuote: '"That ship is mine. The captain just has not accepted the paperwork yet."',
    personality: { personality: 'Bold, superstitious about weather, and at home on a pitching deck.', ideals: 'A good vessel and an open horizon beat any palace.', bonds: 'A prized ship—sea-going or sky-borne—that I claim by right.', flaws: 'Holds a lifelong grudge against anyone who loses a ship.' },
  },
  {
    id: 'feylost', name: 'Feylost', tagline: 'Outcast wanderer touched by the strange logic of the Feywild.',
    summary: 'Drifted between the Feywild and the mortal world, carrying sideways humor and an ache to belong.', source: 'Homebrew',
    recommendedClasses: ['bard', 'warlock', 'druid', 'ranger', 'sorcerer', 'rogue'],
    recommendedAncestries: ['fairy', 'satyr', 'elf', 'halfling', 'half-elf', 'goblin'],
    skillProficiencies: ['Deception', 'Survival'], toolProficiencies: ['Musical Instrument'], featureName: 'Feywild Visitor',
    defaultQuote: '"I am not lost. The road just moved while I was looking at a beetle."',
    personality: { personality: 'Makes sideways observations and sudden blunt truths when nervous.', ideals: 'Even strange outcast things deserve a place by the fire.', bonds: 'A bizarre companion item and the party that never cast me out.', flaws: 'Terrified of not belonging anywhere, hiding it behind absurd jokes.' },
  },
  {
    id: 'archaeologist', name: 'Archaeologist / Stone-Scholar', tagline: 'Delver of dwarven runes, pre-war vaults, and living architecture.',
    summary: 'Reads the history and lies carved into foundations, cavern walls, and ancient monuments.', source: 'PHB',
    recommendedClasses: ['wizard', 'artificer', 'cleric', 'bard', 'fighter', 'rogue'],
    recommendedAncestries: ['dwarf', 'gnome', 'human', 'elf', 'tabaxi'],
    skillProficiencies: ['History', 'Survival'], toolProficiencies: ['Mason Tools', 'Cartographer Tools'], featureName: 'Historical Knowledge',
    defaultQuote: '"Men lie in books. They have a harder time lying in load-bearing stone."',
    personality: { personality: 'Touches walls and pillars to feel the age and stress of the stone.', ideals: 'Understand what was built before you tear it down.', bonds: 'A vow to uncover the truth buried beneath the mountain runes.', flaws: 'Stops to examine ancient masonry even when the ceiling is collapsing.' },
  },
];

export const CREATOR_FEATS: readonly CreatorFeatOptionVm[] = [
  { id: 'Warcaster', name: 'War Caster', category: 'Spellcasting', source: 'PHB', prerequisite: 'Spellcasting or Pact Magic', abilityBonus: '+1 INT, WIS, or CHA', summary: 'Advantage on CON saves to maintain Concentration; somatic components with hands full; cast spell as opportunity attack.' },
  { id: 'Fey Touched', name: 'Fey Touched', category: 'Half-Feat', source: 'PHB', prerequisite: 'None', abilityBonus: '+1 INT, WIS, or CHA', summary: 'Learn Misty Step and one 1st-level Divination or Enchantment spell; cast each once per Long Rest without a slot.' },
  { id: 'Shadow Touched', name: 'Shadow Touched', category: 'Half-Feat', source: 'PHB', prerequisite: 'None', abilityBonus: '+1 INT, WIS, or CHA', summary: 'Learn Invisibility and one 1st-level Illusion or Necromancy spell; cast each once per Long Rest without a slot.' },
  { id: 'Telekinetic', name: 'Telekinetic', category: 'Half-Feat', source: 'PHB', prerequisite: 'None', abilityBonus: '+1 INT, WIS, or CHA', summary: 'Learn invisible Mage Hand (+30 ft range) and Bonus Action 5-foot telekinetic shove.' },
  { id: 'Alert', name: 'Alert', category: 'Origin / Tactical', source: 'PHB', prerequisite: 'None', abilityBonus: 'Proficiency Bonus to Initiative', summary: 'Add Proficiency Bonus to Initiative, swap Initiative with one willing ally, and cannot be surprised while conscious.' },
  { id: 'Tough', name: 'Tough', category: 'Origin / Survivability', source: 'PHB', prerequisite: 'None', abilityBonus: '+2 Max HP per Level', summary: 'Your Hit Point maximum increases by an amount equal to twice your character level.' },
  { id: 'Lucky', name: 'Lucky', category: 'Origin / Fate', source: 'PHB', prerequisite: 'None', abilityBonus: 'Luck Points = Prof. Bonus', summary: 'Spend Luck Points to give yourself Advantage on a d20 test or impose Disadvantage on an enemy attack roll.' },
  { id: 'Sentinel', name: 'Sentinel', category: 'Martial Combat', source: 'PHB', prerequisite: 'Level 4+, STR or DEX 13+', abilityBonus: '+1 STR or DEX', summary: 'Opportunity attacks reduce target speed to 0; reaction melee attack when an adjacent enemy attacks an ally.' },
  { id: 'Great Weapon Master', name: 'Great Weapon Master', category: 'Martial Combat', source: 'PHB', prerequisite: 'Level 4+, STR 13+', abilityBonus: '+1 STR', summary: 'Add Proficiency Bonus to Heavy weapon damage on your turn; Bonus Action attack on critical hit or reducing foe to 0 HP.' },
  { id: 'Sharpshooter', name: 'Sharpshooter', category: 'Martial Combat', source: 'PHB', prerequisite: 'Level 4+, DEX 13+', abilityBonus: '+1 DEX', summary: 'Ignore half and three-quarters cover, no long-range disadvantage, and no disadvantage firing within 5 ft of a foe.' },
  { id: 'Polearm Master', name: 'Polearm Master', category: 'Martial Combat', source: 'PHB', prerequisite: 'Level 4+, STR or DEX 13+', abilityBonus: '+1 STR or DEX', summary: 'Bonus Action 1d4 haft strike; reaction strike when an enemy enters your reach.' },
  { id: 'Resilient', name: 'Resilient', category: 'Defense', source: 'PHB', prerequisite: 'Level 4+', abilityBonus: '+1 Chosen Ability', summary: 'Increase one ability score by 1 and gain proficiency in Saving Throws using that ability.' },
  { id: 'Observant', name: 'Observant', category: 'Exploration', source: 'PHB', prerequisite: 'Level 4+, INT or WIS 13+', abilityBonus: '+1 INT or WIS', summary: 'Gain proficiency or Expertise in Investigation or Perception and take the Search action as a Bonus Action.' },
  { id: 'Mobile / Speedy', name: 'Speedy (Mobile)', category: 'Skirmisher', source: 'PHB', prerequisite: 'Level 4+, DEX or CON 13+', abilityBonus: '+1 DEX or CON', summary: 'Speed increases by 10 feet, Dash ignores difficult terrain, and opportunity attacks against you have Disadvantage.' },
  { id: 'Magic Initiate', name: 'Magic Initiate', category: 'Origin / Arcane', source: 'PHB', prerequisite: 'None', abilityBonus: '2 Cantrips + 1st-Level Spell', summary: 'Learn two cantrips and one 1st-level spell from Cleric, Druid, or Wizard; cast the 1st-level spell once free per Long Rest.' },
  { id: 'Inspiring Leader', name: 'Inspiring Leader', category: 'Leadership', source: 'PHB', prerequisite: 'Level 4+, WIS or CHA 13+', abilityBonus: '+1 WIS or CHA', summary: 'Bolster up to 6 allies after a Short or Long Rest with Temporary HP equal to Character Level + WIS/CHA modifier.' },
  { id: 'Healer', name: 'Healer', category: 'Origin / Support', source: 'PHB', prerequisite: 'None', abilityBonus: 'Battle Medic & Healing Rerolls', summary: 'Expend one use of a Healer Kit as an Action to let a creature spend a Hit Die + your Proficiency Bonus, and reroll 1s on healing.' },
  { id: 'Mage Slayer', name: 'Mage Slayer', category: 'Martial Combat', source: 'PHB', prerequisite: 'Level 4+', abilityBonus: '+1 STR or DEX', summary: 'Enemies you damage have Disadvantage on Concentration saves, and you can succeed on one failed INT, WIS, or CHA save per rest.' },
];

export const CREATOR_EQUIPMENT_DATABASE: readonly EquipmentLoadoutItemVm[] = [
  { id: 'db-longsword', name: 'Longsword', slot: 'Main Hand', summary: 'Martial Melee Weapon · Versatile', bonusLabel: '1d8 Slashing (1d10 two-handed)', acBonus: 0, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'swords', weightLb: 3, valueGp: 15, rarity: 'Common', source: 'PHB' },
  { id: 'db-rapier', name: 'Rapier', slot: 'Main Hand', summary: 'Martial Finesse Blade', bonusLabel: '1d8 Piercing · Finesse, Vex', acBonus: 0, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'swords', weightLb: 2, valueGp: 25, rarity: 'Common', source: 'PHB' },
  { id: 'db-greatsword', name: 'Greatsword', slot: 'Main Hand', summary: 'Heavy Two-Handed Blade', bonusLabel: '2d6 Slashing · Graze', acBonus: 0, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'swords', weightLb: 6, valueGp: 50, rarity: 'Common', source: 'PHB' },
  { id: 'db-greataxe', name: 'Greataxe', slot: 'Main Hand', summary: 'Heavy Two-Handed Battleaxe', bonusLabel: '1d12 Slashing · Cleave', acBonus: 0, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'swords', weightLb: 7, valueGp: 30, rarity: 'Common', source: 'PHB' },
  { id: 'db-warhammer', name: 'Dwarven Warhammer', slot: 'Main Hand', summary: 'Forged Runic Hammer', bonusLabel: '1d8 Bludgeoning (1d10 Versatile) · Push', acBonus: 0, attackBonus: 1, equipped: true, entitlement: 'free', icon: 'hammer', weightLb: 2, valueGp: 15, rarity: 'Common', source: 'PHB' },
  { id: 'db-quarterstaff', name: 'Arcane Quarterstaff', slot: 'Main Hand', summary: 'Runed Ash Staff & Focus', bonusLabel: '1d6 Bludgeoning · +1 Spell Attack', acBonus: 0, attackBonus: 1, equipped: true, entitlement: 'free', icon: 'wand', weightLb: 4, valueGp: 10, rarity: 'Common', source: 'PHB' },
  { id: 'db-dagger-silver', name: 'Silvered Dagger', slot: 'Off Hand', summary: 'Alchemically Silvered Blade', bonusLabel: '1d4 Piercing · Finesse, Light, Thrown 20/60', acBonus: 0, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'swords', weightLb: 1, valueGp: 102, rarity: 'Uncommon', source: 'PHB' },
  { id: 'db-longbow', name: 'Recurve Longbow', slot: 'Main Hand', summary: 'Martial Ranged Weapon (150/600 ft)', bonusLabel: '1d8 Piercing · Slow', acBonus: 0, attackBonus: 1, equipped: true, entitlement: 'free', icon: 'target', weightLb: 2, valueGp: 50, rarity: 'Common', source: 'PHB' },
  { id: 'db-shortbow', name: 'Shortbow & Quiver (20)', slot: 'Main Hand', summary: 'Simple Ranged Weapon (80/320 ft)', bonusLabel: '1d6 Piercing · Vex', acBonus: 0, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'target', weightLb: 2, valueGp: 25, rarity: 'Common', source: 'PHB' },
  { id: 'db-hand-crossbow', name: 'Brass Hand Crossbow', slot: 'Off Hand', summary: 'Artificer-Calibrated Sidearm', bonusLabel: '1d6 Piercing · Light, Vex (30/120 ft)', acBonus: 0, attackBonus: 1, equipped: true, entitlement: 'free', icon: 'target', weightLb: 3, valueGp: 75, rarity: 'Uncommon', source: 'Homebrew' },
  { id: 'db-studded-leather', name: 'Studded Leather Armor', slot: 'Armor', summary: 'Light Armor (AC 12 + DEX)', bonusLabel: '+2 AC Base · No Stealth Penalty', acBonus: 2, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'shield', weightLb: 13, valueGp: 45, rarity: 'Common', source: 'PHB' },
  { id: 'db-mithral-breastplate', name: 'Mithral Breastplate', slot: 'Armor', summary: 'Medium Elven Cuirass', bonusLabel: '+4 AC · No Stealth Disadvantage', acBonus: 4, attackBonus: 0, equipped: true, entitlement: 'included', icon: 'shield', weightLb: 10, valueGp: 800, rarity: 'Uncommon', source: 'DMG' },
  { id: 'db-half-plate', name: 'Half Plate Armor', slot: 'Armor', summary: 'Medium Forged Plate (AC 15 + DEX max 2)', bonusLabel: '+5 AC Base · Steel Cuirass', acBonus: 5, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'shield', weightLb: 40, valueGp: 750, rarity: 'Common', source: 'PHB' },
  { id: 'db-chain-mail', name: 'Chain Mail Hauberk', slot: 'Armor', summary: 'Heavy Armor (AC 16)', bonusLabel: '+6 AC Base · Interlocking Steel', acBonus: 6, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'shield', weightLb: 55, valueGp: 75, rarity: 'Common', source: 'PHB' },
  { id: 'db-plate-armor', name: 'Full Plate Harness', slot: 'Armor', summary: 'Masterwork Heavy Armor (AC 18)', bonusLabel: '+8 AC Base · Articulated Steel', acBonus: 8, attackBonus: 0, equipped: true, entitlement: 'included', icon: 'shield', weightLb: 65, valueGp: 1500, rarity: 'Rare', source: 'PHB' },
  { id: 'db-steel-shield', name: 'Runed Steel Shield', slot: 'Off Hand', summary: 'Emblazoned Vanguard Shield', bonusLabel: '+2 AC · Shield Wall', acBonus: 2, attackBonus: 0, equipped: true, entitlement: 'free', icon: 'shield', weightLb: 6, valueGp: 10, rarity: 'Common', source: 'PHB' },
  { id: 'db-arcane-grimoire', name: 'Arcane Grimoire (+1)', slot: 'Focus', summary: 'Gold-Leaf Wizard Spellbook', bonusLabel: '+1 Spell Attack & Spell Save DC', acBonus: 0, attackBonus: 1, equipped: true, entitlement: 'included', icon: 'book-open', weightLb: 3, valueGp: 450, rarity: 'Uncommon', source: 'TCE' },
  { id: 'db-reliquary-symbol', name: 'Silver Reliquary', slot: 'Focus', summary: 'Sacred Moon-Goddess Reliquary', bonusLabel: '+1 Divine Spell Attack & Channel Focus', acBonus: 0, attackBonus: 1, equipped: true, entitlement: 'free', icon: 'compass', weightLb: 2, valueGp: 25, rarity: 'Common', source: 'PHB' },
  { id: 'db-cloak-protection', name: 'Cloak of Protection', slot: 'Gear', summary: 'Abjuration-Woven Mantle (Attuned) · +1 AC and Saving Throws', bonusLabel: '+1 AC · +1 All Saving Throws', acBonus: 1, attackBonus: 0, equipped: true, entitlement: 'included', icon: 'shield-check', weightLb: 1, valueGp: 600, rarity: 'Uncommon', source: 'DMG' },
  { id: 'db-ring-protection', name: 'Ring of Protection', slot: 'Gear', summary: 'Runed Mithral Band · +1 bonus to AC and all Saving Throws while worn.', bonusLabel: '+1 AC · +1 All Saves', acBonus: 1, attackBonus: 0, equipped: false, entitlement: 'included', icon: 'shield', weightLb: 0, valueGp: 1200, rarity: 'Rare', source: 'DMG' },
  { id: 'db-ring-spell-storing', name: 'Ring of Spell Storing', slot: 'Gear', summary: 'Arcane Signet Ring · Stores up to 5 levels worth of spells cast into it.', bonusLabel: 'Stores 5 Spell Levels', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'included', icon: 'wand', weightLb: 0, valueGp: 2400, rarity: 'Rare', source: 'DMG' },
  { id: 'db-ring-evasion', name: 'Ring of Evasion', slot: 'Gear', summary: 'Quicksilver Band (3 Charges) · Turn a failed DEX saving throw into a success as a Reaction.', bonusLabel: '3 Charges · Auto DEX Save', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'included', icon: 'zap', weightLb: 0, valueGp: 1800, rarity: 'Rare', source: 'DMG' },
  { id: 'db-ring-feather-falling', name: 'Ring of Feather Falling', slot: 'Gear', summary: 'Wind-Etched Gold Ring · Descend 60 feet per round and take no falling damage.', bonusLabel: 'Immunity to Fall Damage', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'free', icon: 'feather', weightLb: 0, valueGp: 900, rarity: 'Rare', source: 'DMG' },
  { id: 'db-amulet-health', name: 'Amulet of Health', slot: 'Gear', summary: 'Ruby-Cored Talisman · Your Constitution score becomes 19 while you wear this amulet.', bonusLabel: 'Sets CON Score to 19', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'included', icon: 'heart', weightLb: 1, valueGp: 2000, rarity: 'Rare', source: 'DMG' },
  { id: 'db-cloak-displacement', name: 'Cloak of Displacement', slot: 'Gear', summary: 'Illusory Shadow Mantle · Projects a shifted image, imposing Disadvantage on attack rolls against you.', bonusLabel: 'Attackers have Disadvantage', acBonus: 1, attackBonus: 0, equipped: false, entitlement: 'included', icon: 'eye', weightLb: 1, valueGp: 2200, rarity: 'Rare', source: 'DMG' },
  { id: 'db-boots-elvenkind', name: 'Boots of Elvenkind', slot: 'Gear', summary: 'Silent Leaf-Stitched Boots · Your steps make no sound and you have Advantage on Stealth checks.', bonusLabel: 'Advantage on Stealth', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'free', icon: 'feather', weightLb: 1, valueGp: 500, rarity: 'Uncommon', source: 'DMG' },
  { id: 'db-pearl-power', name: 'Pearl of Power', slot: 'Focus', summary: 'Iridescent Pearl · Speak its command word as an Action to regain one expended spell slot (up to 3rd level).', bonusLabel: 'Recover up to 3rd-Lv Slot', acBonus: 0, attackBonus: 1, equipped: false, entitlement: 'included', icon: 'wand', weightLb: 0, valueGp: 1000, rarity: 'Uncommon', source: 'DMG' },
  { id: 'db-gauntlets-ogre', name: 'Gauntlets of Ogre Power', slot: 'Gear', summary: 'Brass-Riveted Gauntlets · Your Strength score is 19 while you wear these gauntlets.', bonusLabel: 'Sets STR Score to 19', acBonus: 0, attackBonus: 1, equipped: false, entitlement: 'included', icon: 'hammer', weightLb: 2, valueGp: 950, rarity: 'Uncommon', source: 'DMG' },
  { id: 'db-bag-holding', name: 'Bag of Holding', slot: 'Gear', summary: 'Extradimensional Satchel (500 lb) · Holds up to 64 cubic feet while weighing only 15 lbs.', bonusLabel: '64 Cubic Ft Capacity · Weighs 15 lb', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'included', icon: 'layers', weightLb: 15, valueGp: 500, rarity: 'Uncommon', source: 'DMG' },
  { id: 'db-healing-potion', name: 'Potion of Greater Healing (x2)', slot: 'Gear', summary: 'Alchemical Crimson Phial · Drink as a Bonus Action to restore 4d4 + 4 Hit Points.', bonusLabel: 'Bonus Action · Restores 4d4 + 4 HP', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'free', icon: 'heart', weightLb: 1, valueGp: 150, rarity: 'Uncommon', source: 'DMG' },
  { id: 'db-potion-invisibility', name: 'Potion of Invisibility', slot: 'Gear', summary: 'Distilled Glass Vial · Become Invisible for 1 hour or until you attack or cast a spell.', bonusLabel: 'Invisible for 1 Hour', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'free', icon: 'eye', weightLb: 1, valueGp: 300, rarity: 'Rare', source: 'DMG' },
  { id: 'db-thieves-tools', name: 'Masterwork Thieves Tools', slot: 'Gear', summary: 'Precision Lockpicks, Mirrors & Tension Keys for disarming traps and opening locks.', bonusLabel: 'DEX + Proficiency on Locks & Traps', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'free', icon: 'key', weightLb: 1, valueGp: 25, rarity: 'Common', source: 'PHB' },
  { id: 'db-dungeoneer-pack', name: 'Dungeoneer Pack', slot: 'Gear', summary: 'Crowbar, Hammer, Pitons, Torches, Tinderbox, Rations & 50 ft Hempen Rope.', bonusLabel: 'Complete Delving Supplies', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'free', icon: 'compass', weightLb: 24, valueGp: 12, rarity: 'Common', source: 'PHB' },
  { id: 'db-scholar-pack', name: 'Scholar Pack', slot: 'Gear', summary: 'Lore Tome, Ink, Parchment, Sand & Magnifying Lens for arcane field study.', bonusLabel: 'Field Research Kit', acBonus: 0, attackBonus: 0, equipped: false, entitlement: 'free', icon: 'book-open', weightLb: 10, valueGp: 40, rarity: 'Common', source: 'PHB' },
];

export const CREATOR_SPELL_DATABASE: readonly CharacterSpellVm[] = [
  { id: 'sp-fire-bolt', name: 'Fire Bolt', school: 'Evocation', icon: 'flame', tone: 'crimson', actionCost: '1 Action', level: 0, prepared: true, range: '120 ft', duration: 'Instantaneous', summary: 'Ranged spell attack dealing 1d10 Fire damage (scales at levels 5, 11, 17).' },
  { id: 'sp-mage-hand', name: 'Mage Hand', school: 'Conjuration', icon: 'hand', tone: 'gold', actionCost: '1 Action', level: 0, prepared: true, range: '30 ft', duration: '1 Minute', summary: 'Spectral floating hand manipulates objects up to 10 pounds.' },
  { id: 'sp-prestidigitation', name: 'Prestidigitation', school: 'Transmutation', icon: 'wand', tone: 'emerald', actionCost: '1 Action', level: 0, prepared: true, range: '10 ft', duration: 'Up to 1 Hour', summary: 'Minor arcane sensory effects, lighting candles, cleaning, or arcane marks.' },
  { id: 'sp-ray-of-frost', name: 'Ray of Frost', school: 'Evocation', icon: 'zap', tone: 'emerald', actionCost: '1 Action', level: 0, prepared: true, range: '60 ft', duration: 'Instantaneous', summary: '1d8 Cold damage and reduces the target speed by 10 feet until your next turn.' },
  { id: 'sp-eldritch-blast', name: 'Eldritch Blast', school: 'Evocation', icon: 'zap', tone: 'crimson', actionCost: '1 Action', level: 0, prepared: true, range: '120 ft', duration: 'Instantaneous', summary: 'Beam of crackling energy dealing 1d10 Force damage per beam.' },
  { id: 'sp-sacred-flame', name: 'Sacred Flame', school: 'Evocation', icon: 'flame', tone: 'gold', actionCost: '1 Action', level: 0, prepared: true, range: '60 ft', duration: 'Instantaneous', summary: 'DEX save or take 1d8 Radiant damage; ignores cover.' },
  { id: 'sp-guidance', name: 'Guidance', school: 'Divination', icon: 'compass', tone: 'emerald', actionCost: '1 Action', level: 0, prepared: true, range: 'Touch', duration: 'Concentration, 1 Min', concentration: true, summary: 'Touch a willing creature to add +1d4 to a chosen ability check.' },
  { id: 'sp-shield', name: 'Shield', school: 'Abjuration', icon: 'shield', tone: 'emerald', actionCost: '1 Reaction', level: 1, prepared: true, range: 'Self', duration: '1 Round', summary: '+5 bonus to AC until the start of your next turn and blocks Magic Missile.' },
  { id: 'sp-magic-missile', name: 'Magic Missile', school: 'Evocation', icon: 'zap', tone: 'gold', actionCost: '1 Action', level: 1, prepared: true, range: '120 ft', duration: 'Instantaneous', summary: 'Three glowing darts automatically strike for 1d4 + 1 Force damage each.' },
  { id: 'sp-mage-armor', name: 'Mage Armor', school: 'Abjuration', icon: 'shield', tone: 'emerald', actionCost: '1 Action', level: 1, prepared: true, range: 'Touch', duration: '8 Hours', summary: 'Unarmored target base AC becomes 13 + DEX modifier.' },
  { id: 'sp-detect-magic', name: 'Detect Magic', school: 'Divination', icon: 'eye', tone: 'gold', actionCost: '1 Action (Ritual)', level: 1, prepared: false, ritual: true, concentration: true, range: 'Self (30 ft)', duration: 'Concentration, 10 Min', summary: 'Sense the presence and school of magical auras within 30 feet.' },
  { id: 'sp-identify', name: 'Identify', school: 'Divination', icon: 'book-open', tone: 'gold', actionCost: '1 Minute (Ritual)', level: 1, prepared: false, ritual: true, range: 'Touch', duration: 'Instantaneous', summary: 'Learn magical properties, attunement rules, and charges of an object.' },
  { id: 'sp-find-familiar', name: 'Find Familiar', school: 'Conjuration', icon: 'feather', tone: 'emerald', actionCost: '1 Hour (Ritual)', level: 1, prepared: false, ritual: true, range: '10 ft', duration: 'Instantaneous', summary: 'Summon a fey, celestial, or drake spirit companion.' },
  { id: 'sp-chromatic-orb', name: 'Chromatic Orb', school: 'Evocation', icon: 'flame', tone: 'crimson', actionCost: '1 Action', level: 1, prepared: false, range: '90 ft', duration: 'Instantaneous', summary: '3d8 elemental damage of your chosen type; can leap to a second target on doubles.' },
  { id: 'sp-cure-wounds', name: 'Cure Wounds', school: 'Abjuration', icon: 'heart', tone: 'emerald', actionCost: '1 Action', level: 1, prepared: true, range: 'Touch', duration: 'Instantaneous', summary: 'Restore 2d8 + Spellcasting Ability Modifier Hit Points.' },
  { id: 'sp-healing-word', name: 'Healing Word', school: 'Abjuration', icon: 'heart', tone: 'emerald', actionCost: '1 Bonus Action', level: 1, prepared: true, range: '60 ft', duration: 'Instantaneous', summary: 'Bonus action heal for 2d4 + Spellcasting Ability Modifier HP at range.' },
  { id: 'sp-bless', name: 'Bless', school: 'Enchantment', icon: 'shield', tone: 'gold', actionCost: '1 Action', level: 1, prepared: true, concentration: true, range: '30 ft', duration: 'Concentration, 1 Min', summary: 'Up to 3 allies add +1d4 to Attack Rolls and Saving Throws.' },
  { id: 'sp-hunters-mark', name: "Hunter's Mark", school: 'Divination', icon: 'compass', tone: 'emerald', actionCost: '1 Bonus Action', level: 1, prepared: true, concentration: true, range: '90 ft', duration: 'Concentration, 1 Hour', summary: 'Deal +1d6 Force/Weapon damage whenever you hit your marked quarry.' },
  { id: 'sp-misty-step', name: 'Misty Step', school: 'Conjuration', icon: 'zap', tone: 'emerald', actionCost: '1 Bonus Action', level: 2, prepared: true, range: 'Self (30 ft)', duration: 'Instantaneous', summary: 'Briefly surrounded by silvery mist, teleport up to 30 feet to an unoccupied space.' },
  { id: 'sp-mirror-image', name: 'Mirror Image', school: 'Illusion', icon: 'eye', tone: 'gold', actionCost: '1 Action', level: 2, prepared: false, range: 'Self', duration: '1 Minute', summary: 'Three illusory duplicates deflect incoming attacks away from you.' },
  { id: 'sp-hold-person', name: 'Hold Person', school: 'Enchantment', icon: 'shield', tone: 'crimson', actionCost: '1 Action', level: 2, prepared: false, concentration: true, range: '60 ft', duration: 'Concentration, 1 Min', summary: 'WIS save or humanoid target is Paralyzed.' },
  { id: 'sp-invisibility', name: 'Invisibility', school: 'Illusion', icon: 'eye', tone: 'emerald', actionCost: '1 Action', level: 2, prepared: false, concentration: true, range: 'Touch', duration: 'Concentration, 1 Hour', summary: 'A creature you touch becomes Invisible until it attacks or casts a spell.' },
  { id: 'sp-counterspell', name: 'Counterspell', school: 'Abjuration', icon: 'shield', tone: 'gold', actionCost: '1 Reaction', level: 3, prepared: true, range: '60 ft', duration: 'Instantaneous', summary: 'Interrupt a creature in the process of casting a spell (CON save or slot wasted).' },
  { id: 'sp-fireball', name: 'Fireball', school: 'Evocation', icon: 'flame', tone: 'crimson', actionCost: '1 Action', level: 3, prepared: true, range: '150 ft (20 ft sphere)', duration: 'Instantaneous', summary: 'DEX save or take 8d6 Fire damage in a 20-foot-radius explosion.' },
  { id: 'sp-fly', name: 'Fly', school: 'Transmutation', icon: 'feather', tone: 'emerald', actionCost: '1 Action', level: 3, prepared: false, concentration: true, range: 'Touch', duration: 'Concentration, 10 Min', summary: 'Grant a willing creature a Flying Speed of 60 feet.' },
  { id: 'sp-haste', name: 'Haste', school: 'Transmutation', icon: 'zap', tone: 'gold', actionCost: '1 Action', level: 3, prepared: false, concentration: true, range: '30 ft', duration: 'Concentration, 1 Min', summary: 'Double speed, +2 AC, advantage on DEX saves, and an extra Action each turn.' },
  { id: 'sp-revivify', name: 'Revivify', school: 'Necromancy', icon: 'heart', tone: 'gold', actionCost: '1 Action', level: 3, prepared: true, range: 'Touch', duration: 'Instantaneous', summary: 'Return a creature that died within the last minute to life with 1 HP.' },
  { id: 'sp-dimension-door', name: 'Dimension Door', school: 'Conjuration', icon: 'compass', tone: 'emerald', actionCost: '1 Action', level: 4, prepared: true, range: '500 ft', duration: 'Instantaneous', summary: 'Teleport yourself and one willing ally up to 500 feet.' },
];

export const DEFAULT_MET_ENTITIES: readonly CharacterMetEntityVm[] = [];

export const DEFAULT_CAMPAIGN_HISTORY: readonly CharacterCampaignHistoryEventVm[] = [];

export const DEFAULT_MENTIONABLE_ENTITIES: readonly LwNoteMentionTagVm[] = [];

export const ALL_DND5E_SKILLS: readonly { id: string; label: string; abilityCode: AbilityScoreVm['code'] }[] = [
  { id: 'acrobatics', label: 'Acrobatics', abilityCode: 'DEX' },
  { id: 'animal-handling', label: 'Animal Handling', abilityCode: 'WIS' },
  { id: 'arcana', label: 'Arcana', abilityCode: 'INT' },
  { id: 'athletics', label: 'Athletics', abilityCode: 'STR' },
  { id: 'deception', label: 'Deception', abilityCode: 'CHA' },
  { id: 'history', label: 'History', abilityCode: 'INT' },
  { id: 'insight', label: 'Insight', abilityCode: 'WIS' },
  { id: 'intimidation', label: 'Intimidation', abilityCode: 'CHA' },
  { id: 'investigation', label: 'Investigation', abilityCode: 'INT' },
  { id: 'medicine', label: 'Medicine', abilityCode: 'WIS' },
  { id: 'nature', label: 'Nature', abilityCode: 'INT' },
  { id: 'perception', label: 'Perception', abilityCode: 'WIS' },
  { id: 'performance', label: 'Performance', abilityCode: 'CHA' },
  { id: 'persuasion', label: 'Persuasion', abilityCode: 'CHA' },
  { id: 'religion', label: 'Religion', abilityCode: 'INT' },
  { id: 'sleight-of-hand', label: 'Sleight of Hand', abilityCode: 'DEX' },
  { id: 'stealth', label: 'Stealth', abilityCode: 'DEX' },
  { id: 'survival', label: 'Survival', abilityCode: 'WIS' },
];

export function buildSavingThrows(
  abilities: readonly AbilityScoreVm[],
  proficiencyBonus: number,
  proficientCodes: readonly AbilityScoreVm['code'][]
): readonly SavingThrowVm[] {
  return abilities.map((a) => {
    const proficient = proficientCodes.includes(a.code);
    return { code: a.code, label: a.label, proficient, bonus: a.modifier + (proficient ? proficiencyBonus : 0) };
  });
}

export function buildSkillsList(
  abilities: readonly AbilityScoreVm[],
  proficiencyBonus: number,
  proficientLabels: readonly string[]
): readonly CharacterSkillVm[] {
  const normalizedSet = new Set(proficientLabels.map((s) => s.toLowerCase()));
  return ALL_DND5E_SKILLS.map((sk) => {
    const ability = abilities.find((a) => a.code === sk.abilityCode);
    const mod = ability?.modifier ?? 0;
    const proficient = normalizedSet.has(sk.label.toLowerCase()) || normalizedSet.has(sk.id.toLowerCase());
    return { id: sk.id, label: sk.label, abilityCode: sk.abilityCode, proficient, bonus: mod + (proficient ? proficiencyBonus : 0) };
  });
}

const POINT_BUY_COST_TABLE: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export function getPointBuyCostForScore(baseScore: number): number {
  const clamped = Math.max(8, Math.min(15, Math.floor(baseScore)));
  return POINT_BUY_COST_TABLE[clamped] ?? 0;
}

export function calculatePointBuySpent(scores: Readonly<Record<string, number>>): number {
  return Object.values(scores).reduce((sum, score) => (score <= 15 ? sum + getPointBuyCostForScore(score) : sum + 9 + (score - 15) * 2), 0);
}

export function calculateLevelUpAsiPoints(level: number, classId: string): number {
  const normalizedClass = (classId || '').toLowerCase();
  const asiThresholds = [4, 8, 12, 16, 19];
  if (normalizedClass.includes('fighter')) asiThresholds.push(6, 14);
  else if (normalizedClass.includes('rogue')) asiThresholds.push(10);
  return asiThresholds.filter((lvl) => level >= lvl).length * 2;
}

export function calculateMaxPreparedSpells(level: number, primaryAbilityScore: number): number {
  return Math.max(1, level + Math.floor((primaryAbilityScore - 10) / 2));
}

export function getSpellPreparationRuleExplanation(
  className: string,
  level: number,
  spellName: string,
  spellLevel: number,
  makingPrepared: boolean
): { title: string; ruleHeading: string; durationBadge: string; explanation: string; levelFeatureNote: string } {
  const normalizedClass = (className || 'Wizard').toLowerCase();
  const prepMinutes = Math.max(1, spellLevel);
  const isWizard = normalizedClass.includes('wizard');
  const isDivineOrArtificer = ['cleric', 'druid', 'paladin', 'artificer'].some((c) => normalizedClass.includes(c));
  const title = makingPrepared ? `Prepare "${spellName}"` : `Unprepare "${spellName}"`;

  if (isWizard && level >= 5) {
    return {
      title,
      ruleHeading: 'D&D 5e Rule: Preparing Spells & Wizard Memorize Spell (Level 5+)',
      durationBadge: `Long Rest (8 Hours) + ${prepMinutes} Min Study — OR 1 Minute / Short Rest (Memorize Spell)`,
      explanation: `Under standard D&D 5e rules ("Preparing and Casting Spells"), changing your list of prepared Wizard spells requires finishing a Long Rest (8 hours) and spending at least ${prepMinutes} minute${prepMinutes > 1 ? 's' : ''} (1 minute per spell level) studying your spellbook.`,
      levelFeatureNote: `Level ${level} Wizard Feature — Memorize Spell: Because you are at least Level 5, you can also replace one prepared Wizard spell with another spell from your Spellbook after a Short Rest (1 hour) or 1 minute of focused study.`,
    };
  }
  if (isDivineOrArtificer) {
    return {
      title,
      ruleHeading: `D&D 5e Rule: Preparing ${className} Spells`,
      durationBadge: `Long Rest (8 Hours) + ${prepMinutes} Min Prayer / Study`,
      explanation: `Per D&D 5e rules ("Preparing and Casting Spells"), you can change your list of prepared spells when you finish a Long Rest (8 hours). Preparing a new spell list requires at least ${prepMinutes} minute${prepMinutes > 1 ? 's' : ''} (1 minute per spell level for each spell on your list) of prayer, meditation, or tinkering.`,
      levelFeatureNote: `At higher levels, your maximum number of prepared spells increases automatically (Level ${level} + Spellcasting Ability Modifier).`,
    };
  }
  return {
    title,
    ruleHeading: 'D&D 5e Rule: Preparing & Swapping Spells',
    durationBadge: `Long Rest (8 Hours) + ${prepMinutes} Min Arcane Study`,
    explanation: `Per D&D 5e rules ("Preparing and Casting Spells"), changing your list of prepared spells requires finishing a Long Rest (8 hours) and spending ${prepMinutes} minute${prepMinutes > 1 ? 's' : ''} (1 minute per spell level) studying your spellbook or arcane focus.`,
    levelFeatureNote: `Scribing a brand-new spell into a Wizard Spellbook takes 2 hours and 50 gp per spell level (${spellLevel * 2 || 1} hours / ${spellLevel * 50 || 25} gp), halved to 1 hour and 25 gp per level for your Arcane Tradition school.`,
  };
}
