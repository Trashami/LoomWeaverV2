export type ActionBarSkinId = 'loom-emerald' | 'raven-gold' | 'ember-forge' | 'loom-raven';

/** Skins that render a full artwork frame and overlay controls on its zones. */
export const ART_ACTION_BAR_SKINS: readonly ActionBarSkinId[] = ['loom-raven'];
export const LOOM_RAVEN_SKIN_IMAGE = '/assets/ui/action-bar-loom-raven.png';

export interface ActionBarSkinOption {
  readonly id: ActionBarSkinId;
  readonly label: string;
}

/** Skins only change CSS variables (see vtt-action-bar.component.scss); layout and behavior stay shared. */
export const ACTION_BAR_SKINS: readonly ActionBarSkinOption[] = [
  { id: 'loom-emerald', label: 'Loom Emerald' },
  { id: 'raven-gold', label: 'Raven and Gold' },
  { id: 'ember-forge', label: 'Ember Forge' },
  { id: 'loom-raven', label: 'Loom Raven (Artwork)' },
];

export const DEFAULT_ACTION_BAR_SKIN: ActionBarSkinId = 'loom-emerald';

export function isActionBarSkin(value: unknown): value is ActionBarSkinId {
  return ACTION_BAR_SKINS.some((s) => s.id === value);
}
