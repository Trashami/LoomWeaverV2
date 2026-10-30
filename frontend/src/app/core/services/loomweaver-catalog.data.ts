import {
  AssetCardVm,
  CombatTelemetryVm,
  GraphEdgeVm,
  SceneVm,
  SubscriptionTierVm,
} from '../models/loomweaver.models';

export const LW_SCENES: readonly SceneVm[] = [];

export const LW_ASSETS: readonly AssetCardVm[] = [];

export const LW_GRAPH_EDGES: readonly GraphEdgeVm[] = [];

export const LW_TELEMETRY: readonly CombatTelemetryVm[] = [];

export const LW_SUBSCRIPTION_TIERS: readonly SubscriptionTierVm[] = [
  {
    code: 'spark',
    name: 'Spark Free',
    monthlyPrice: '$0 / mo',
    annualPrice: '$0 / yr',
    maxCampaigns: 'Join Unlimited + 1 Starter',
    storageLimit: '250 MB',
    includesWeave: false,
    royaltySplit: '85% Creator / 15% Platform',
    summary: '100% free player seat, The Loom campaign memory, 2D map export, and full character sheets.',
  },
  {
    code: 'threadkeeper',
    name: 'Threadkeeper',
    monthlyPrice: '$6 / mo',
    annualPrice: '$60 / yr (2 mos free)',
    maxCampaigns: '3 Active Campaigns',
    storageLimit: '2 GB',
    includesWeave: true,
    royaltySplit: '85% Creator / 15% Platform',
    summary: 'Host campaigns, 2D/3D Map Studio, custom stamps, and The Loom deep-link canon synthesis.',
  },
  {
    code: 'weaver',
    name: 'Weaver',
    monthlyPrice: '$12 / mo',
    annualPrice: '$120 / yr (2 mos free)',
    maxCampaigns: '10 Active Campaigns',
    storageLimit: '10 GB',
    includesWeave: true,
    royaltySplit: '85% Creator / 15% Platform',
    summary: 'Full 3D VTT lighting & weather, Action/Effect Builder, The Weave AI draft companion, and Neo4j World Graph.',
  },
  {
    code: 'archweaver',
    name: 'Archweaver',
    monthlyPrice: '$24 / mo',
    annualPrice: '$240 / yr (2 mos free)',
    maxCampaigns: 'Unlimited Campaigns',
    storageLimit: '50 GB',
    includesWeave: true,
    royaltySplit: '85% Creator / 15% Platform',
    summary: 'Unlimited campaigns, creator storefront publishing with 85/15 split, and included studio asset bundles.',
  },
];
