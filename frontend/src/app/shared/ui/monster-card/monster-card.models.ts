/**
 * Bestiary view models. These mirror the authorized DTOs returned by the .NET Bestiary module
 * (`BestiaryContracts.cs`); DM-only data (collections, token/3D assignments, placements) is only
 * ever present when the server resolved the caller as the effective GM of the active campaign.
 */

export type LwMonsterSourceFilter = 'all' | 'official' | 'community' | 'mine';
export type LwMonsterSortOption = 'name' | 'name-desc' | 'cr' | 'cr-desc';
export type LwMonsterPlacementScope = 'campaign' | 'session' | 'encounter';
export type LwMonsterSightingVisibility = 'party' | 'witnesses' | 'gm';

export const LW_MONSTER_OUTCOMES = [
  'encountered',
  'observed',
  'fought',
  'defeated',
  'killed',
  'fled',
  'escaped',
  'captured',
  'spared',
  'saved',
  'befriended',
  'allied',
  'negotiated',
  'recruited',
  'tamed',
  'betrayed',
] as const;
export type LwMonsterOutcome = (typeof LW_MONSTER_OUTCOMES)[number];

export const LW_CREATURE_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const;

export const LW_CHALLENGE_RATINGS = [
  '0', '1/8', '1/4', '1/2',
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
] as const;

export interface LwMonsterSummaryVm {
  readonly key: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly tokenUrl: string;
  readonly shortDescription: string;
  readonly challengeRating: string;
  readonly crValue: number;
  readonly creatureType: string;
  readonly size: string;
  readonly source: string;
  readonly armorClass: number;
  readonly hitPoints: number;
  readonly isCustom: boolean;
  readonly isPublished: boolean;
  readonly creatorUsername: string | null;
  readonly ownedByViewer: boolean;
}

export interface LwMonsterFeatureVm {
  readonly name: string;
  readonly text: string;
}

export interface LwMonsterDetailVm {
  readonly summary: LwMonsterSummaryVm;
  readonly alignment: string;
  readonly armorClassLabel: string;
  readonly hitPointsLabel: string;
  readonly speedLabel: string;
  readonly str: number;
  readonly dex: number;
  readonly con: number;
  readonly int: number;
  readonly wis: number;
  readonly cha: number;
  readonly savingThrows: string;
  readonly skills: string;
  readonly damageResistances: string;
  readonly damageImmunities: string;
  readonly conditionImmunities: string;
  readonly senses: string;
  readonly languages: string;
  readonly experiencePoints: number;
  readonly traits: readonly LwMonsterFeatureVm[];
  readonly actions: readonly LwMonsterFeatureVm[];
  readonly bonusActions: readonly LwMonsterFeatureVm[];
  readonly reactions: readonly LwMonsterFeatureVm[];
  readonly legendaryActions: readonly LwMonsterFeatureVm[];
  readonly loreText: string;
  readonly environments: readonly string[];
  readonly createdAt: string | null;
}

export interface LwMonsterPageVm {
  readonly items: readonly LwMonsterSummaryVm[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly databaseOnline: boolean;
}

export interface LwMonsterCollectionVm {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly ownerUsername: string;
  readonly assignedCampaignIds: readonly number[];
  readonly monsterKeys: readonly string[];
  readonly updatedAt: string;
}

export interface LwSaveMonsterCollectionDraft {
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly assignedCampaignIds: readonly number[];
  readonly monsterKeys: readonly string[];
}

export interface LwMonsterAssignmentVm {
  readonly campaignId: number;
  readonly monsterKey: string;
  readonly primaryTokenUrl: string | null;
  readonly secondaryTokenUrl: string | null;
  readonly primaryModelUrl: string | null;
  readonly secondaryModelUrl: string | null;
  readonly updatedBy: string;
  readonly updatedAt: string;
}

export type LwMonsterAssignmentSlot =
  | 'primaryTokenUrl'
  | 'secondaryTokenUrl'
  | 'primaryModelUrl'
  | 'secondaryModelUrl';

export interface LwMonsterPlacementVm {
  readonly id: string;
  readonly campaignId: number;
  readonly monsterKey: string;
  readonly monsterName: string;
  readonly scope: LwMonsterPlacementScope;
  readonly sessionId: string | null;
  readonly sessionLabel: string | null;
  readonly encounterId: string | null;
  readonly encounterLabel: string | null;
  readonly count: number;
  readonly addedBy: string;
  readonly addedAt: string;
}

export interface LwMonsterPlacementRequest {
  readonly scope: LwMonsterPlacementScope;
  readonly sessionId?: string;
  readonly encounterId?: string;
  readonly count: number;
}

export interface LwMonsterSightingVm {
  readonly id: string;
  readonly campaignId: number;
  readonly monsterKey: string;
  readonly monsterName: string;
  readonly outcome: LwMonsterOutcome;
  readonly sessionId: string | null;
  readonly sessionLabel: string | null;
  readonly locationName: string | null;
  readonly encounterId: string | null;
  readonly encounterLabel: string | null;
  readonly witnessCharacterKeys: readonly string[];
  readonly visibility: LwMonsterSightingVisibility;
  readonly notes: string | null;
  readonly occurredAt: string;
  readonly recordedBy: string;
}

export interface LwMonsterSightingDraft {
  readonly outcome: LwMonsterOutcome;
  readonly sessionId: string;
  readonly locationName: string;
  readonly encounterId: string;
  readonly witnessCharacterKeys: readonly string[];
  readonly visibility: LwMonsterSightingVisibility;
  readonly notes: string;
}

/** Selectable option used by the campaign prep and Loom panels (sessions, encounters, characters). */
export interface LwMonsterPickOptionVm {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
}

/** A 2D token or 3D model from the token library, scored against a monster name. */
export interface LwMonsterTokenOptionVm {
  readonly id: string;
  readonly name: string;
  readonly kind: '2d' | '3d';
  readonly previewUrl: string;
  readonly assetUrl: string;
  readonly origin: string;
  readonly matchScore: number;
}

export interface LwCustomMonsterDraft {
  readonly name: string;
  readonly shortDescription: string;
  readonly loreText: string;
  readonly imageUrl: string;
  readonly size: string;
  readonly creatureType: string;
  readonly alignment: string;
  readonly challengeRating: string;
  readonly armorClass: number;
  readonly armorClassNote: string;
  readonly hitPoints: number;
  readonly hitDice: string;
  readonly speed: string;
  readonly str: number;
  readonly dex: number;
  readonly con: number;
  readonly int: number;
  readonly wis: number;
  readonly cha: number;
  readonly savingThrows: string;
  readonly skills: string;
  readonly damageResistances: string;
  readonly damageImmunities: string;
  readonly conditionImmunities: string;
  readonly senses: string;
  readonly languages: string;
  readonly traits: readonly LwMonsterFeatureVm[];
  readonly actions: readonly LwMonsterFeatureVm[];
  readonly bonusActions: readonly LwMonsterFeatureVm[];
  readonly reactions: readonly LwMonsterFeatureVm[];
  readonly legendaryActions: readonly LwMonsterFeatureVm[];
  readonly publishToMarket: boolean;
}

export const LW_MONSTER_PLACEHOLDER_IMAGE = '/assets/previews-png/obj-c4468a17dd78e8a4.png';

/** Ability score modifier label, e.g. 14 -> "+2". */
export function lwAbilityModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}
