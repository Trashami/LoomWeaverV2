export type VttGmTableId = 'complication' | 'surge' | 'loot';

export interface VttGmTable {
  readonly id: VttGmTableId;
  readonly label: string;
  readonly die: 6 | 8 | 10;
  readonly entries: readonly string[];
}

export const VTT_GM_TABLES: readonly VttGmTable[] = [
  {
    id: 'complication',
    label: 'Dungeon Complication',
    die: 6,
    entries: [
      'A loose keystone dislodges, raining debris (DC 13 Dex save or 2d4 bludgeoning)',
      'A hostile presence senses the party and manifests beside the rearmost adventurer',
      'The emerald glow intensifies, casting wild shadows (disadvantage on Stealth)',
      'Echoing footsteps resonate from the southern portal',
      'An ancient glyph releases a calming mist (DC 12 Wis save or charmed)',
      'A concealed alcove slides open, revealing a dusty bronze chest',
    ],
  },
  {
    id: 'surge',
    label: 'Arcane Surge',
    die: 8,
    entries: [
      'Wild sparks fly: the next spell slot cast is amplified (+1 die damage)',
      'Gravity inverts for 1 round in a 10 ft radius around the caster',
      'A telepathic whisper fills the room: "The Weaver awakens"',
      'All metal weapons glow with cold violet fire for 1 minute',
      "A spectral raven perches on the caster's shoulder and caws once",
      'Arcane shock: the caster takes 1d6 force damage',
      'A gentle rain of petals falls from the ceiling',
      'A translucent duplicate of the caster appears for 1 turn',
    ],
  },
  {
    id: 'loot',
    label: 'Archive Curios',
    die: 10,
    entries: [
      'Engraved silver bookmark with ancient elven script (25 gp)',
      'Vial of luminescent archive ink (glows in the dark)',
      'Sealed parchment containing a forgotten cantrip',
      'Carved obsidian chess piece shaped like a crowned serpent',
      'Brass monocle that detects faint magical runes',
      'Tiny crystal prism that refracts light into musical hums',
      'Ancient coin stamped with the mark of a lost dynasty',
      'Locket holding dried mountain wildflowers from centuries ago',
      'Velvet pouch with 4 polished emerald chips (10 gp each)',
      'A key to a sealed upper vault',
    ],
  },
];
