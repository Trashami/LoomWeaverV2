export type ViewerRole = 'gm' | 'players';
export type AudienceVisibility = 'public' | 'players' | 'gm';
export type CanonStatus = 'approved' | 'draft';
export type AssetEntitlement = 'free' | 'included' | 'purchased' | 'locked';
export type QualityProfile = 'Auto' | 'Cinematic' | 'Balanced' | 'Performance 3D' | 'Classic 2D';

export interface CampaignVm {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly subtitle: string;
  readonly systemCode: 'dnd5e' | 'pf2e' | 'vampire_v5';
  readonly systemLabel: string;
  readonly worldName: string;
  readonly currentAct: string;
  readonly currentSessionNumber: number;
  readonly currentLocationName: string;
  readonly weaveEnabled: boolean;
  readonly dmAccountIds?: readonly string[];
  readonly dmUsernames?: readonly string[];
  readonly dmDisplayName?: string;
  readonly myRole?: 'dm' | 'player';
}

export interface EntityCardVm {
  readonly compositeKey: string;
  readonly campaignId: number;
  readonly entityType: string;
  readonly entityKey: string;
  readonly name: string;
  readonly subtitle: string;
  readonly summary: string;
  readonly visibility: AudienceVisibility;
  readonly canonStatus: CanonStatus;
  readonly routeLink: string;
  readonly statsLabel?: string;
  readonly levelUpEligible?: boolean;
}

export interface GraphEdgeVm {
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly relationshipType: string;
  readonly visibility: AudienceVisibility;
  readonly label?: string;
}

export interface LoomCitationVm {
  readonly compositeKey: string;
  readonly title: string;
  readonly entityType: string;
  readonly excerpt: string;
  readonly routeLink: string;
  readonly visibility: AudienceVisibility;
}

export interface AssetCardVm {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly creatorName: string;
  readonly entitlement: AssetEntitlement;
  readonly priceLabel?: string;
  readonly priceCents: number;
  readonly previewUrl: string | null;
  readonly summary: string;
  readonly systemCode: string;
}

export interface SceneVm {
  readonly sceneKey: string;
  readonly campaignId: number;
  readonly name: string;
  readonly regionName: string;
  readonly modeSupport: string;
  readonly gridCols: number;
  readonly gridRows: number;
  readonly biome: string;
  readonly weatherPreset: string;
  readonly lightingProfile: string;
  readonly visibility: AudienceVisibility;
  readonly revision: number;
}

export interface CombatTelemetryVm {
  readonly characterKey: string;
  readonly characterName: string;
  readonly classSummary: string;
  readonly totalDamageDealt: number;
  readonly damageVsDragons: number;
  readonly damageVsUndead: number;
  readonly damageVsConstructs: number;
  readonly lastHits: number;
  readonly natural20Count: number;
  readonly natural1Count: number;
  readonly healingDone: number;
  readonly cluesDiscovered: number;
  readonly radarAxes: readonly { readonly label: string; readonly value: number }[];
}

export interface SubscriptionTierVm {
  readonly code: string;
  readonly name: string;
  readonly monthlyPrice: string;
  readonly annualPrice: string;
  readonly maxCampaigns: string;
  readonly storageLimit: string;
  readonly includesWeave: boolean;
  readonly royaltySplit: string;
  readonly summary: string;
}

export interface NavDestination {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly route: string;
  readonly icon: string;
  readonly group: 'Core' | 'Play & Engines' | 'Platform';
  readonly requiresWeave?: boolean;
}
