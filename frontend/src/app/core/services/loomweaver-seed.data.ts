import {
  EntityCardVm,
  NavDestination,
} from '../models/loomweaver.models';

export const LW_NAVIGATION: readonly NavDestination[] = [
  { id: 'home', label: 'Overview Hub', subtitle: 'Architecture & active table', route: '/home', icon: 'home', group: 'Core' },
  { id: 'campaigns', label: 'Campaigns', subtitle: 'Acts, sessions & story beats', route: '/campaigns', icon: 'landmark', group: 'Core' },
  { id: 'characters', label: 'Characters', subtitle: 'Party sheets & advancement', route: '/characters', icon: 'users', group: 'Core' },
  { id: 'items', label: 'Items', subtitle: 'Equipment, homebrew & GM collections', route: '/items', icon: 'shopping-bag', group: 'Core' },
  { id: 'bestiary', label: 'Bestiary', subtitle: 'Monsters, homebrew & DM collections', route: '/bestiary', icon: 'book-open', group: 'Core' },
  { id: 'maps', label: 'Map Studio', subtitle: '2D/3D terrain, walls & scatter', route: '/maps', icon: 'map', group: 'Core' },
  { id: 'encounters', label: 'Encounters', subtitle: 'Build encounters, maps, tokens & traps', route: '/encounters', icon: 'swords', group: 'Play & Engines' },
  { id: 'arcane-screen', label: 'Arcane Screen VTT', subtitle: 'Live GM/Player encounter & VTT table', route: '/arcane-screen', icon: 'shield', group: 'Play & Engines' },
  { id: 'dice', label: 'Dice Forge', subtitle: '3D physics & server rolls', route: '/dice', icon: 'dices', group: 'Play & Engines' },
  { id: 'effects', label: 'Action & FX', subtitle: 'Rules & spell trajectories', route: '/effects', icon: 'zap', group: 'Play & Engines' },
  { id: 'assets', label: 'Assets & Audio', subtitle: 'Stamps, GLBs & ambience', route: '/assets', icon: 'layers', group: 'Platform' },
  { id: 'marketplace', label: 'Marketplace', subtitle: '85/15 creator store & tiers', route: '/marketplace', icon: 'shopping-bag', group: 'Platform' },
  { id: 'statistics', label: 'Statistics', subtitle: 'Radar charts & combat logs', route: '/statistics', icon: 'bar-chart', group: 'Platform' },
  { id: 'loom', label: 'The Loom', subtitle: 'Zero-invented canon memory', route: '/loom', icon: 'book-open', group: 'Platform' },
  { id: 'weave', label: 'The Weave', subtitle: 'Optional AI drafts & Neo4j graph', route: '/weave', icon: 'network', group: 'Platform', requiresWeave: true },
];

export const LW_ENTITIES: readonly EntityCardVm[] = [];
