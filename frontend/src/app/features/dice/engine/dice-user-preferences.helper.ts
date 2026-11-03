import { Color3, LinesMesh, MeshBuilder, Scene, Vector3 } from '@babylonjs/core';
import { DEFAULT_DICE_PHYSICS_CONFIG, DicePhysicsConfig } from './dice-physics.types';
import {
  createDefaultRuntimeConfigFromSkin,
  DiceCustomRuntimeConfig,
  resolveDiceSkin,
  SavedUserDicePreset,
} from './skins';

const ACTIVE_CONFIG_KEY_PREFIX = 'lw_active_dice_config_v2';
const USER_PRESETS_KEY_PREFIX = 'lw_saved_dice_presets_v2';

export function getActiveDiceStorageKey(userId?: number | string | null): string {
  return userId ? `${ACTIVE_CONFIG_KEY_PREFIX}_user_${userId}` : ACTIVE_CONFIG_KEY_PREFIX;
}

export function getSavedPresetsStorageKey(userId?: number | string | null): string {
  return userId ? `${USER_PRESETS_KEY_PREFIX}_user_${userId}` : USER_PRESETS_KEY_PREFIX;
}

export function normalizeCustomRuntimeConfig(raw: unknown): DiceCustomRuntimeConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<DiceCustomRuntimeConfig>;
  const skin = resolveDiceSkin(candidate.skinId || 'skin-obsidian-gold');
  const defaults = createDefaultRuntimeConfigFromSkin(skin);
  return {
    ...defaults,
    ...candidate,
    skinId: skin.id,
    critVignetteEnabled: candidate.critVignetteEnabled ?? true,
    critVignetteIntensity: candidate.critVignetteIntensity ?? 0.78,
    critVignetteSpread: candidate.critVignetteSpread ?? 0.45,
    physics: {
      ...DEFAULT_DICE_PHYSICS_CONFIG,
      ...(candidate.physics ?? {}),
    },
  };
}

export function readStoredActiveDiceConfig(userId?: number | string | null): DiceCustomRuntimeConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const userRaw = userId ? window.localStorage.getItem(getActiveDiceStorageKey(userId)) : null;
    const raw = userRaw || window.localStorage.getItem(ACTIVE_CONFIG_KEY_PREFIX);
    if (!raw) return null;
    return normalizeCustomRuntimeConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStoredActiveDiceConfig(
  config: DiceCustomRuntimeConfig,
  userId?: number | string | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(config);
    window.localStorage.setItem(ACTIVE_CONFIG_KEY_PREFIX, serialized);
    if (userId) {
      window.localStorage.setItem(getActiveDiceStorageKey(userId), serialized);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function readStoredUserPresets(userId?: number | string | null): SavedUserDicePreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const userRaw = userId ? window.localStorage.getItem(getSavedPresetsStorageKey(userId)) : null;
    const raw = userRaw || window.localStorage.getItem(USER_PRESETS_KEY_PREFIX);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeStoredUserPresets(
  presets: readonly SavedUserDicePreset[],
  userId?: number | string | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(presets);
    window.localStorage.setItem(USER_PRESETS_KEY_PREFIX, serialized);
    if (userId) {
      window.localStorage.setItem(getSavedPresetsStorageKey(userId), serialized);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function buildServerLoadoutPayload(next: DiceCustomRuntimeConfig): Record<string, unknown> {
  return {
    skinId: next.skinId,
    modelId: next.modelId,
    sizePreset: next.sizePreset,
    coreColorHex: next.coreColorHex,
    numberColorHex: next.numberColorHex,
    glowColorHex: next.glowColorHex,
    glowIntensity: next.glowIntensity,
    reflectionMetallic: next.reflectionMetallic,
    surfaceRoughness: next.surfaceRoughness,
    recessedNumbers: next.recessedNumbers,
    veinPulse: next.veinPulse,
    nat20EffectId: next.nat20EffectId,
    critFailEffectId: next.critFailEffectId,
    soundProfileId: next.soundProfileId,
    customConfig: next,
  };
}

export function createDiceBoundaryWireframe(scene: Scene, phys: DicePhysicsConfig): LinesMesh | null {
  if (!phys.showBoundaryBox) return null;
  const hw = Math.max(2, (phys.boundaryWidth ?? 14) * 0.5);
  const hd = Math.max(2, (phys.boundaryDepth ?? 10) * 0.5);
  const h = Math.max(2.5, (phys.startingHeight ?? 8) * 0.55);
  const lines = [
    [new Vector3(-hw, 0, -hd), new Vector3(hw, 0, -hd), new Vector3(hw, 0, hd), new Vector3(-hw, 0, hd), new Vector3(-hw, 0, -hd)],
    [new Vector3(-hw, h, -hd), new Vector3(hw, h, -hd), new Vector3(hw, h, hd), new Vector3(-hw, h, hd), new Vector3(-hw, 0, -hd)],
    [new Vector3(-hw, 0, -hd), new Vector3(-hw, h, -hd)],
    [new Vector3(hw, 0, -hd), new Vector3(hw, h, -hd)],
    [new Vector3(hw, 0, hd), new Vector3(hw, h, hd)],
    [new Vector3(-hw, 0, hd), new Vector3(-hw, h, hd)],
  ];
  const box = MeshBuilder.CreateLineSystem('lw-dice-boundary-box', { lines }, scene);
  box.color = new Color3(0.286, 0.91, 0.573);
  box.alpha = 0.65;
  return box;
}
