import { CreatureCardVm } from '../../../shared/ui/creature-card/creature-card.component';
import { EncounterCardVm } from '../../../shared/ui/encounter-card/encounter-card.component';
import { NpcCardVm } from '../../../shared/ui/npc-card/npc-card.component';
import {
  ActionRuleVm,
  EffectTimelinePresetVm,
  VttTokenVm,
} from '../../effects/engine/effect-timeline.contract';

export const SEED_ENCOUNTERS: readonly EncounterCardVm[] = [];

export const SEED_CREATURES: readonly CreatureCardVm[] = [];

export const SEED_NPCS: readonly NpcCardVm[] = [];

export const SEED_EFFECT_PRESETS: readonly EffectTimelinePresetVm[] = [
  { id: 'fx-cinder-arc', name: 'Cinder Arc', trajectoryType: 'arc', primaryColorHex: '#ff6b4a', secondaryColorHex: '#ffd166', particleCount: 90, durationMs: 1150, keyframes: ['cast', 'arc', 'impact'] },
  { id: 'fx-eldritch-beam', name: 'Eldritch Beam', trajectoryType: 'beam', primaryColorHex: '#49e892', secondaryColorHex: '#2ee66b', particleCount: 110, durationMs: 950, keyframes: ['charge', 'beam', 'burst'] },
  { id: 'fx-moonlight-sigil', name: 'Moonlight Sigil', trajectoryType: 'sigil', primaryColorHex: '#d9b77a', secondaryColorHex: '#49e892', particleCount: 85, durationMs: 1200, keyframes: ['sigil', 'pulse', 'fade'] },
  { id: 'fx-void-cone', name: 'Void Cone', trajectoryType: 'cone', primaryColorHex: '#a388ee', secondaryColorHex: '#ef5d72', particleCount: 120, durationMs: 1100, keyframes: ['origin', 'cone', 'dissipate'] },
];

export const SEED_ACTION_RULES: readonly ActionRuleVm[] = [];

export const SEED_VTT_TOKENS: readonly VttTokenVm[] = [];
