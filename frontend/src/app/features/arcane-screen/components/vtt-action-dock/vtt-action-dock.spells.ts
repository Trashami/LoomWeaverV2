import { DockAction } from './vtt-action-dock.models';

export const SPELL_LEVEL_ORDER: readonly string[] = [
  'Cantrips',
  'Level 1 (4/4)',
  'Level 2 (3/3)',
  'Level 3 (3/3)',
  'Level 4 (3/3)',
  'Level 5 (2/2)',
  'Level 6 (1/1)',
  'Level 7 (1/1)',
  'Level 8 (1/1)',
  'Level 9 (1/1)',
];

/** Name-based heuristics carried over from MythWeaver; unmatched spells fall back to a book icon. */
export function getSpellIcon(action: DockAction): string {
  const name = action.name.toLowerCase();
  const dmg = (action.damageType || '').toLowerCase();
  if (name.includes('fire') || dmg.includes('fire')) return 'local_fire_department';
  if (name.includes('lightning') || name.includes('shock') || dmg.includes('lightning')) return 'bolt';
  if (name.includes('shield') || name.includes('armor') || name.includes('ward') || name.includes('globe')) return 'shield';
  if (name.includes('detect') || name.includes('scrying') || name.includes('see') || name.includes('sight')) return 'visibility';
  if (name.includes('teleport') || name.includes('step') || name.includes('door') || name.includes('plane')) return 'explore';
  if (name.includes('heal') || name.includes('cure') || dmg.includes('heal')) return 'favorite';
  return 'auto_stories';
}

export function getSpellLevel(action: DockAction): string {
  const name = action.name.toLowerCase();
  if (name.includes('fire bolt') || name.includes('thorn whip') || name.includes('light') || name.includes('mage hand') || name.includes('prestidigitation') || name.includes('shocking grasp') || name.includes('acid splash') || name.includes('ray of frost') || name.includes('sacred flame') || name.includes('toll the dead') || name.includes('eldritch blast') || name.includes('vicious mockery') || name.includes('minor illusion') || name.includes('poison spray') || name.includes('guidance') || name.includes('mending') || name.includes('druidcraft') || name.includes('thaumaturgy')) {
    return 'Cantrips';
  }
  if (name.includes('detect magic') || name.includes('identify') || name.includes('mage armor') || name.includes('magic missile') || name.includes('shield') || name.includes('burning hands') || name.includes('faerie fire') || name.includes('thunderwave') || name.includes('cure wounds') || name.includes('healing word') || name.includes('disguise self') || name.includes('sleep') || name.includes('guiding bolt') || name.includes('bless') || name.includes('bane')) {
    return 'Level 1 (4/4)';
  }
  if (name.includes('detect thoughts') || name.includes('invisibility') || name.includes('mirror image') || name.includes('misty step') || name.includes('hold person') || name.includes('scorching ray') || name.includes('shatter') || name.includes('web') || name.includes('darkness') || name.includes('moonbeam') || name.includes('spiritual weapon')) {
    return 'Level 2 (3/3)';
  }
  if (name.includes('counterspell') || name.includes('fireball') || name.includes('fly') || name.includes('lightning bolt') || name.includes('hypnotic pattern') || name.includes('haste') || name.includes('slow') || name.includes('dispel magic') || name.includes('fear') || name.includes('spirit guardians')) {
    return 'Level 3 (3/3)';
  }
  if (name.includes('banishment') || name.includes('fire shield') || name.includes('stoneskin') || name.includes('dimension door') || name.includes('polymorph') || name.includes('wall of fire') || name.includes('greater invisibility') || name.includes('blight') || name.includes('ice storm')) {
    return 'Level 4 (3/3)';
  }
  if (name.includes('cone of cold') || name.includes('scrying') || name.includes('wall of force') || name.includes('synaptic static') || name.includes('hold monster') || name.includes('cloudkill')) {
    return 'Level 5 (2/2)';
  }
  if (name.includes('globe of invulnerability') || name.includes('disintegrate') || name.includes('chain lightning') || name.includes('sunbeam') || name.includes('true seeing')) {
    return 'Level 6 (1/1)';
  }
  if (name.includes('teleport') || name.includes('forcecage') || name.includes('plane shift') || name.includes('finger of death') || name.includes('prismatic spray')) {
    return 'Level 7 (1/1)';
  }
  if (name.includes('mind blank') || name.includes('dominate monster') || name.includes('sunburst') || name.includes('antimagic field') || name.includes('maze')) {
    return 'Level 8 (1/1)';
  }
  if (name.includes('time stop') || name.includes('wish') || name.includes('meteor swarm') || name.includes('power word kill') || name.includes('foresight')) {
    return 'Level 9 (1/1)';
  }
  return 'Level 1 (4/4)';
}

export interface SpellTags {
  vsm: string;
  concentration: boolean;
  ritual: boolean;
}

export function getSpellTags(action: DockAction): SpellTags {
  const name = action.name.toLowerCase();
  let vsm = 'VSM';
  if (name.includes('misty step') || name.includes('teleport') || name.includes('time stop') || name.includes('vicious mockery')) vsm = 'V';
  else if (name.includes('shield') || name.includes('counterspell') || name.includes('minor illusion')) vsm = 'S';
  else if (name.includes('magic missile') || name.includes('fire bolt') || name.includes('disguise self') || name.includes('mirror image')) vsm = 'VS';

  const concentration = action.requiresConcentration === true || name.includes('fly') || name.includes('invisibility') || name.includes('faerie fire') || name.includes('hold person') || name.includes('banishment') || name.includes('stoneskin') || name.includes('wall of') || name.includes('hypnotic') || name.includes('haste') || name.includes('globe') || name.includes('scrying') || name.includes('detect') || name.includes('web') || name.includes('moonbeam') || name.includes('polymorph');
  const ritual = name.includes('detect magic') || name.includes('identify') || name.includes('comprehend languages') || name.includes('alarm') || name.includes('unseen servant');

  return { vsm, concentration, ritual };
}

export interface SpellLevelGroup {
  levelName: string;
  spells: DockAction[];
}

/** Groups spells by level label in the canonical display order, skipping empty levels. */
export function groupSpellsByLevel(spells: readonly DockAction[]): SpellLevelGroup[] {
  const groups = new Map<string, DockAction[]>();
  for (const level of SPELL_LEVEL_ORDER) groups.set(level, []);
  for (const spell of spells) {
    const level = getSpellLevel(spell);
    const bucket = groups.get(level);
    if (bucket) bucket.push(spell);
    else groups.set(level, [spell]);
  }
  return SPELL_LEVEL_ORDER
    .filter((level) => (groups.get(level)?.length ?? 0) > 0)
    .map((level) => ({ levelName: level, spells: groups.get(level) ?? [] }));
}
