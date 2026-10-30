import { ActionRuleVm } from '../../effects/engine/effect-timeline.contract';
import type { ActionBarSkinId } from '../components/vtt-action-bar/action-bar-skins';

export type VttFogMode = 'los-only' | 'explored-los' | 'no-fog';

export type VttRightTabId =
  | 'chat'
  | 'combat-log'
  | 'initiative'
  | 'quests'
  | 'npcs'
  | 'lore'
  | 'guide'
  | 'trackers'
  | 'settings';

export type VttMeasureSubMode = 'spell' | 'movement';

export type VttOpenDmDrawer =
  | 'none'
  | 'dm-session'
  | 'quick-add'
  | 'fog-settings'
  | 'scene-roster';

export type VttTurnActionCategory =
  | 'all'
  | 'melee'
  | 'ranged'
  | 'spell'
  | 'bonus'
  | 'reaction'
  | 'free';

export interface VttPoint2D {
  readonly x: number;
  readonly z: number;
}

export interface VttWallSegmentVm {
  readonly id: string;
  readonly label: string;
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  readonly blocksVision: boolean;
  readonly blocksMovement: boolean;
}

export interface VttEncounterVisionConfigVm {
  readonly encounterId: string;
  readonly fogMode: VttFogMode;
  readonly hideOutOfSightMonsters: boolean;
  readonly defaultPlayerSightFeet: number;
}

export type VttAbilityTargetMode = 'single' | 'multi-target' | 'aoe';

export interface VttTacticalAbilityVm extends ActionRuleVm {
  readonly turnCategory: Exclude<VttTurnActionCategory, 'all'>;
  readonly targetMode: VttAbilityTargetMode;
  readonly maxTargets: number;
  readonly aoeShape: 'none' | 'circle' | 'cone' | 'line';
  readonly aoeRadiusFeet: number;
  readonly requiresLineOfSight: boolean;
  readonly ownerKey?: string;
}

export interface VttActionBarSettingsVm {
  readonly skin: ActionBarSkinId;
  readonly opacity: number;
  readonly compactMode: boolean;
  readonly snapSensitivityFeet: number;
  readonly showHotbarKeybinds: boolean;
  readonly showMapRangeLabels: boolean;
  readonly autoCenterActiveTurn: boolean;
}

export interface VttChatMessageVm {
  readonly id: string;
  readonly senderName: string;
  readonly senderRole: 'gm' | 'player' | 'system';
  readonly timestamp: string;
  readonly text: string;
  readonly revealedToPlayers: boolean;
}

export interface VttScopedQuestVm {
  readonly id: string;
  readonly title: string;
  readonly giverName: string;
  readonly status: 'Active' | 'Completed';
  readonly summary: string;
  readonly objectiveSteps: readonly string[];
  readonly gmSecret: string;
  readonly revealedToPlayers: boolean;
}

export interface VttScopedNpcVm {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly scope: 'Encounter' | 'Region';
  readonly disposition: 'Friendly' | 'Neutral' | 'Deceptive' | 'Hostile';
  readonly locationName: string;
  readonly summary: string;
  readonly gmSecret: string;
  readonly revealedToPlayers: boolean;
  readonly onBattleMap: boolean;
}

export interface VttRevealedLoreVm {
  readonly id: string;
  readonly title: string;
  readonly category: 'History' | 'Architecture' | 'Religion' | 'Arcana';
  readonly summary: string;
  readonly gmNotes: string;
  readonly revealedToPlayers: boolean;
}

export interface VttClampedLineResult {
  readonly start: VttPoint2D;
  readonly end: VttPoint2D;
  readonly distanceFeet: number;
  readonly maxRangeFeet: number;
  readonly blockedByWall: boolean;
  readonly blockingWallLabel: string | null;
}
