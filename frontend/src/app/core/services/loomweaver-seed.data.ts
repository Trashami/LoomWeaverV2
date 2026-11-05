import {
  CampaignPlayerMemberVm,
  CampaignSessionVm,
  CampaignVm,
  EntityCardVm,
  NavDestination,
} from '../models/loomweaver.models';

export const NO_CAMPAIGN: CampaignVm = {
  id: 0, slug: '', name: 'No campaign selected', subtitle: '', systemCode: 'dnd5e', systemLabel: 'D&D 5e',
  worldName: '', currentAct: '', currentSessionNumber: 0, currentLocationName: '', weaveEnabled: false,
};

export const SYSTEM_LABELS: Record<CampaignVm['systemCode'], string> = {
  dnd5e: 'D&D 5e', pf2e: 'Pathfinder 2e', vampire_v5: 'Vampire: The Masquerade V5',
};

export const DEFAULT_PARTY_PLAYERS: readonly CampaignPlayerMemberVm[] = [
  { accountId: 'acc-gm-geojason', username: 'GeoJason', displayName: 'Jason (GeoJason)', email: 'jason@loom-weaver.com', role: 'gm', joinedViaInvite: false, joinedAtLabel: 'Campaign Founder', inviteStatus: 'active', assignedCharacterKey: 'char-ciaran', assignedCharacterName: 'Ciaran Fiachra' },
  { accountId: 'acc-player-dal', username: 'SBrogan', displayName: 'Scott', email: 'sbrogan@loomweaver.com', role: 'players', joinedViaInvite: true, joinedAtLabel: 'Joined via Invite Link', inviteStatus: 'active', assignedCharacterKey: 'char-dal', assignedCharacterName: 'Dal Riata' },
  { accountId: 'acc-player-fivi', username: 'DallasCrow', displayName: 'Dallas Crow', email: 'dallas@loom-weaver.com', role: 'players', joinedViaInvite: true, joinedAtLabel: 'Joined via Invite Link', inviteStatus: 'active', assignedCharacterKey: 'char-fivi', assignedCharacterName: 'Fivi' },
  { accountId: 'acc-player-kildrid', username: 'RyanIssak', displayName: 'Ryan Issak', email: 'ryan@loom-weaver.com', role: 'players', joinedViaInvite: true, joinedAtLabel: 'Joined via Invite Link', inviteStatus: 'active', assignedCharacterKey: 'char-kildrid', assignedCharacterName: 'Kildrid' },
  { accountId: 'acc-player-kycius', username: 'StickHazen', displayName: 'Stick Hazen', email: 'stick@loom-weaver.com', role: 'players', joinedViaInvite: true, joinedAtLabel: 'Joined via Invite Link', inviteStatus: 'active', assignedCharacterKey: 'char-kycius', assignedCharacterName: 'Kycius' },
  { accountId: 'acc-player-munk', username: 'PeteHigano', displayName: 'Pete Higano', email: 'pete@loom-weaver.com', role: 'players', joinedViaInvite: true, joinedAtLabel: 'Joined via Invite Link', inviteStatus: 'active', assignedCharacterKey: 'char-munk', assignedCharacterName: 'Munk' },
];

export interface ServerMemberDto {
  readonly accountId?: string;
  readonly username: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: 'gm' | 'players';
  readonly inviteStatus?: 'pending' | 'active';
  readonly assignedCharacterKey?: string | null;
  readonly assignedCharacterName?: string | null;
}

export function mergeServerCampaignMembersHelper(
  existing: readonly CampaignPlayerMemberVm[],
  serverRows: readonly ServerMemberDto[]
): readonly CampaignPlayerMemberVm[] {
  const byUsername = new Map<string, CampaignPlayerMemberVm>();
  for (const p of existing) {
    byUsername.set(p.username.toLowerCase(), p);
  }
  for (const row of serverRows) {
    const uname = (row.username || row.email?.split('@')[0] || 'player').trim();
    const key = uname.toLowerCase();
    const prev = byUsername.get(key);
    const status = row.role === 'gm'
      ? 'active'
      : (row.inviteStatus === 'pending' && !row.assignedCharacterKey ? 'pending' : (row.assignedCharacterKey ? 'active' : (row.inviteStatus ?? prev?.inviteStatus ?? 'pending')));
    byUsername.set(key, {
      accountId: row.accountId || prev?.accountId || `acc-player-${key}`,
      username: uname,
      displayName: row.displayName || prev?.displayName || uname,
      email: row.email || prev?.email || `${key}@loom-weaver.com`,
      role: row.role === 'gm' ? 'gm' : 'players',
      joinedViaInvite: row.role !== 'gm',
      joinedAtLabel: row.role === 'gm' ? 'Campaign Founder' : (status === 'pending' ? 'Pending Invite' : 'Joined Campaign'),
      inviteStatus: status,
      assignedCharacterKey: row.assignedCharacterKey ?? prev?.assignedCharacterKey ?? undefined,
      assignedCharacterName: row.assignedCharacterName ?? prev?.assignedCharacterName ?? undefined,
    });
  }
  return Array.from(byUsername.values());
}

export function formatSessionLocationLabelHelper(raw: string | undefined, sessionTitle = ''): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return sessionTitle || 'Campaign Frontier';
  const known: Record<string, string> = {
    'sotm-seed-loc-grove': 'The Whispering Grove', 'sotm-seed-ch09': 'Cinth · The Guild of Scars',
    'sotm-seed-ch07': 'The Plains of Red', 'sotm-seed-ch05': 'The Well of Life',
    'sotm-seed-ch04': 'Vandia · The Knot & Knife', 'sotm-seed-ch01': 'Edhellain · High Court',
  };
  if (known[trimmed.toLowerCase()]) return known[trimmed.toLowerCase()];
  if (/^[a-z0-9]+-(seed|node|loc|ch)-/i.test(trimmed)) {
    const cleaned = trimmed.replace(/^[a-z0-9]+-(seed|node)-(loc-|ch\d*-?)?/i, '').replace(/[-_]+/g, ' ').trim();
    return (!cleaned || /^ch\d+$/i.test(cleaned)) ? (sessionTitle || 'Campaign Frontier') : cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  return trimmed;
}

export function buildFallbackSessionsHelper(camp: CampaignVm | undefined): CampaignSessionVm[] {
  const curNum = camp?.currentSessionNumber || 15;
  const loc = camp?.currentLocationName || 'The Ruined Chapel (C1–C3)';
  return [
    {
      sessionId: 'session-15', sessionNumber: curNum, title: 'Session 15 — The Ruined Chapel',
      label: 'Session 15 — The Ruined Chapel', locationName: loc, locationLabel: loc,
      dateLabel: 'Current / Upcoming', statusLabel: 'Current / Upcoming', xpAwarded: 0,
      summary: camp?.subtitle || 'Active gameplay & planning session.', highlights: [], status: 'upcoming',
    },
    {
      sessionId: 'session-14', sessionNumber: Math.max(1, curNum - 1), title: 'Session 14 — Brass Gears & Velvet Fangs',
      label: 'Session 14 — Brass Gears & Velvet Fangs', locationName: 'Cinth — Vampire Gala', locationLabel: 'Cinth — Vampire Gala',
      dateLabel: 'Vampire Session', statusLabel: 'Active / Planned', xpAwarded: 1850,
      summary: 'Lord of Cinth gala infiltration, Artificers Guild alliance, and vampire court ambush.', highlights: [], status: 'active',
    },
    {
      sessionId: 'session-13', sessionNumber: Math.max(1, curNum - 2), title: 'Session 13 — Crossing the Plains of Red',
      label: 'Session 13 — Crossing the Plains of Red', locationName: 'The Plains of Red', locationLabel: 'The Plains of Red',
      dateLabel: 'Completed', statusLabel: 'Chronicled', xpAwarded: 1500,
      summary: 'Escorted the caravan across the Plains of Red toward Cinth while sensing ancient mountain wards.', highlights: [], status: 'completed',
    },
  ];
}

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
  { id: 'effect-builder', label: 'Effect Builder', subtitle: 'Spell animations & VTT shaders', route: 'https://effectbuilder.loom-weaver.com', icon: 'wand', group: 'Play & Engines' },
  { id: 'action-builder', label: 'Action Builder', subtitle: 'Combat rules & action sequences', route: 'https://actionbuilder.loom-weaver.com', icon: 'swords', group: 'Play & Engines' },
  { id: 'assets', label: 'Assets & Audio', subtitle: 'Stamps, GLBs & ambience', route: '/assets', icon: 'layers', group: 'Platform' },
  { id: 'marketplace', label: 'Marketplace', subtitle: '85/15 creator store & tiers', route: '/marketplace', icon: 'shopping-bag', group: 'Platform' },
  { id: 'statistics', label: 'Statistics', subtitle: 'Radar charts & combat logs', route: '/statistics', icon: 'bar-chart', group: 'Platform' },
  { id: 'loom', label: 'The Loom', subtitle: 'Zero-invented canon memory', route: '/loom', icon: 'book-open', group: 'Platform' },
  { id: 'weave', label: 'The Weave', subtitle: 'Optional AI drafts & Neo4j graph', route: '/weave', icon: 'network', group: 'Platform', requiresWeave: true },
];

export const LW_ENTITIES: readonly EntityCardVm[] = [];
