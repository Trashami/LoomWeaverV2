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

export const SEED_EFFECT_PRESETS: readonly EffectTimelinePresetVm[] = [];

export const SEED_ACTION_RULES: readonly ActionRuleVm[] = [];

export const SEED_VTT_TOKENS: readonly VttTokenVm[] = [];
