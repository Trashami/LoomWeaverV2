export type ActionBarSkinId = 'loom-emerald' | 'raven-gold' | 'ember-forge';

export interface ActionBarSkinOption {
  readonly id: ActionBarSkinId;
  readonly label: string;
}

/** Skins only change CSS variables (see vtt-action-bar.component.scss); layout and behavior stay shared. */
export const ACTION_BAR_SKINS: readonly ActionBarSkinOption[] = [
  { id: 'loom-emerald', label: 'Loom Emerald' },
  { id: 'raven-gold', label: 'Raven and Gold' },
  { id: 'ember-forge', label: 'Ember Forge' },
];

export const DEFAULT_ACTION_BAR_SKIN: ActionBarSkinId = 'loom-emerald';

export function isActionBarSkin(value: unknown): value is ActionBarSkinId {
  return ACTION_BAR_SKINS.some((s) => s.id === value);
}
