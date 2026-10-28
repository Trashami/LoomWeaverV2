import {
  DEFAULT_DICE_PHYSICS_CONFIG,
  DiceBlendMode,
  DicePhysicsConfig,
  DicePulseWaveform
} from '../dice-physics.types';
import { DiceSizePreset } from '../models/dice-model.types';

export type DiceTextureStyle =
  | 'stone'
  | 'wood'
  | 'obsidian'
  | 'void'
  | 'metal'
  | 'glass'
  | 'plastic'
  | 'resin';

export type DiceSkinSurfaceStyle = DiceTextureStyle;

export type DiceOverlayType = 'none' | 'celtic-cage' | 'arcane-runes' | 'recessed-plate';

export type DiceUnlockSource = 'free' | 'purchase' | 'reward' | 'loommarks' | 'tier';

export interface DiceMaterialOptions {
  readonly metalness: number;
  readonly roughness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly bumpScale: number;
  readonly emissive: string;
  readonly emissiveIntensity: number;
  readonly envMapIntensity?: number;
  readonly transmission?: number;
  readonly ior?: number;
  readonly thickness?: number;
  readonly transparent?: boolean;
  readonly opacity?: number;
  readonly textureStyle: DiceTextureStyle;
  readonly accentColor?: string;
  readonly overlayType: DiceOverlayType;
  readonly numberEngraving: 'recessed' | 'raised' | 'flush';
  readonly veinPulse: boolean;
}

export interface DiceSkinConfig {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly description?: string;
  readonly materialFamily: string;
  readonly tier: string;
  readonly rarity: string;
  readonly unlockSource: DiceUnlockSource;
  readonly priceLabel: string;
  readonly loommarksCost?: number;
  readonly priceUsdCents?: number;
  readonly rewardMilestoneId?: string;
  readonly rewardRequirementText?: string;
  readonly isDefaultUnlocked: boolean;
  readonly defaultModelId: string;
  readonly defaultSoundProfileId: string;
  readonly defaultNat20EffectId: string;
  readonly defaultCritFailEffectId: string;
  readonly baseColor: string;
  readonly accentColor: string;
  readonly emissiveColor: string;
  readonly borderColor: string;
  readonly surfaceStyle: DiceSkinSurfaceStyle;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly refractionAlpha?: number;
  readonly indexOfRefraction?: number;
  readonly textStyle: 'recessed' | 'raised' | 'flush';
  readonly textColor: string;
  readonly textStrokeColor: string;
  readonly textStrokeWidth: number;
  readonly textEmissive: boolean;
  readonly emissiveIntensity: number;
  readonly fontFamily: string;
  readonly bumpScale: number;
  readonly hasVeinPulse: boolean;
  readonly hasCelticBorder?: boolean;
  readonly hasArcaneRunes?: boolean;
  readonly particleColor: string;
}

export type DiceSkinDefinition = DiceSkinConfig;

export interface DiceCustomRuntimeConfig {
  readonly customName: string;
  readonly skinId: string;
  readonly modelId: string;
  readonly sizePreset: DiceSizePreset;
  readonly diceSize?: DiceSizePreset;
  readonly surfaceStyleOverride?: DiceSkinSurfaceStyle;
  readonly bumpMapIntensity: number;
  readonly chamferBevelFactor: number;

  // Core Color & Layer FX (Photoshop / After Effects style)
  readonly coreColorHex: string;
  readonly coreSecondaryColorHex: string;
  readonly coreGradientEnabled: boolean;
  readonly coreGradientType: 'linear' | 'radial';
  readonly coreGradientAngle: number;
  readonly coreOpacity: number;
  readonly coreBlendMode: DiceBlendMode;
  readonly coreInnerGlowEnabled: boolean;
  readonly coreInnerGlowColor: string;
  readonly coreInnerGlowOpacity: number;
  readonly coreInnerGlowSize: number;
  readonly coreInnerGlowChoke: number;
  readonly coreOuterGlowEnabled: boolean;
  readonly coreOuterGlowColor: string;
  readonly coreOuterGlowOpacity: number;
  readonly coreOuterGlowSize: number;
  readonly coreOuterGlowSpread: number;
  readonly corePulseEnabled: boolean;
  readonly corePulseWaveform: DicePulseWaveform;
  readonly corePulseSpeed: number;
  readonly corePulseMin: number;
  readonly corePulseMax: number;

  // Dice Font Typography
  readonly fontFamily: string;
  readonly fontWeight: string;
  readonly fontScale: number;
  readonly fontTracking: number;
  readonly numberStrokeWidth: number;
  readonly numberStrokeColorHex: string;
  readonly numberDropShadowEnabled: boolean;
  readonly numberShadowColorHex: string;
  readonly numberShadowBlur: number;
  readonly numberShadowOffsetX: number;
  readonly numberShadowOffsetY: number;

  // Dice Numbers, Engraving Depth & Number Glow/Pulse
  readonly numberColorHex: string;
  readonly numberDepth: number; // -1.0 deep recessed carve .. 0 flush .. +1.0 raised relief
  readonly recessedNumbers: boolean;
  readonly numberEngraving?: 'recessed' | 'raised' | 'flush';
  readonly numberOpacity: number;
  readonly numberBlendMode: DiceBlendMode;
  readonly numberInnerGlowEnabled: boolean;
  readonly numberInnerGlowColor: string;
  readonly numberInnerGlowOpacity: number;
  readonly numberInnerGlowSize: number;
  readonly numberInnerGlowChoke: number;
  readonly numberOuterGlowEnabled: boolean;
  readonly numberOuterGlowColor: string;
  readonly numberOuterGlowOpacity: number;
  readonly numberOuterGlowSize: number;
  readonly numberOuterGlowSpread: number;
  readonly numberPulseEnabled: boolean;
  readonly numberPulseWaveform: DicePulseWaveform;
  readonly numberPulseSpeed: number;
  readonly numberPulseMin: number;
  readonly numberPulseMax: number;
  readonly faceOverlayStyle: DiceOverlayType;
  readonly borderColorHex: string;
  readonly sixNineIndicator: 'dot' | 'underline' | 'none';

  // Material & Ambient Effects
  readonly glowColorHex: string;
  readonly glowIntensity: number;
  readonly reflectionMetallic: number;
  readonly surfaceRoughness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly fresnelIntensity: number;
  readonly veinPulse: boolean;
  readonly nat20EffectId: string;
  readonly critFailEffectId: string;
  readonly critBurstIntensity: number;
  readonly critRingScale: number;
  readonly soundProfileId: string;

  // World & Physics Settings
  readonly physics: DicePhysicsConfig;
}

export interface SavedUserDicePreset {
  readonly id: string;
  readonly name: string;
  readonly ownerUsername: string;
  readonly updatedAt: string;
  readonly isPublishedToMarket?: boolean;
  readonly config: DiceCustomRuntimeConfig;
}

export interface MarketplaceDicePreset {
  readonly id: string;
  readonly name: string;
  readonly creatorHandle: string;
  readonly tagline: string;
  readonly downloadsCount: number;
  readonly rating: number;
  readonly publishedAt: string;
  readonly config: DiceCustomRuntimeConfig;
}

export function createDefaultRuntimeConfigFromSkin(skin: DiceSkinConfig): DiceCustomRuntimeConfig {
  const overlayStyle: DiceOverlayType = skin.hasCelticBorder
    ? 'celtic-cage'
    : skin.hasArcaneRunes
      ? 'arcane-runes'
      : 'none';

  return {
    customName: skin.name,
    skinId: skin.id,
    modelId: skin.defaultModelId || 'model-classic-chamfer',
    sizePreset: 'medium',
    diceSize: 'medium',
    surfaceStyleOverride: skin.surfaceStyle,
    bumpMapIntensity: Math.max(0.4, Math.min(2.5, (skin.bumpScale || 0.03) * 32)),
    chamferBevelFactor: 0.955,

    coreColorHex: skin.baseColor,
    coreSecondaryColorHex: skin.accentColor,
    coreGradientEnabled: false,
    coreGradientType: 'radial',
    coreGradientAngle: 135,
    coreOpacity: skin.surfaceStyle === 'glass' ? (skin.refractionAlpha ?? 0.78) : 1.0,
    coreBlendMode: 'normal',
    coreInnerGlowEnabled: false,
    coreInnerGlowColor: skin.emissiveColor,
    coreInnerGlowOpacity: 0.55,
    coreInnerGlowSize: 16,
    coreInnerGlowChoke: 0.25,
    coreOuterGlowEnabled: false,
    coreOuterGlowColor: skin.emissiveColor,
    coreOuterGlowOpacity: 0.65,
    coreOuterGlowSize: 18,
    coreOuterGlowSpread: 0.3,
    corePulseEnabled: false,
    corePulseWaveform: 'heartbeat',
    corePulseSpeed: 1.4,
    corePulseMin: 0.35,
    corePulseMax: 1.0,

    fontFamily: skin.fontFamily || 'Cinzel, Georgia, serif',
    fontWeight: '700',
    fontScale: 1.0,
    fontTracking: 0,
    numberStrokeWidth: skin.textStrokeWidth ?? 1.5,
    numberStrokeColorHex: skin.textStrokeColor || '#080a0c',
    numberDropShadowEnabled: true,
    numberShadowColorHex: '#000000',
    numberShadowBlur: 5,
    numberShadowOffsetX: -2,
    numberShadowOffsetY: -3,

    numberColorHex: skin.textColor,
    numberDepth: skin.textStyle === 'recessed' ? -0.75 : skin.textStyle === 'raised' ? 0.65 : 0.0,
    recessedNumbers: skin.textStyle === 'recessed',
    numberEngraving: skin.textStyle,
    numberOpacity: 1.0,
    numberBlendMode: 'normal',
    numberInnerGlowEnabled: skin.textEmissive,
    numberInnerGlowColor: skin.emissiveColor,
    numberInnerGlowOpacity: 0.6,
    numberInnerGlowSize: 8,
    numberInnerGlowChoke: 0.2,
    numberOuterGlowEnabled: skin.textEmissive,
    numberOuterGlowColor: skin.emissiveColor,
    numberOuterGlowOpacity: Math.min(1, skin.emissiveIntensity),
    numberOuterGlowSize: 14,
    numberOuterGlowSpread: 0.35,
    numberPulseEnabled: skin.hasVeinPulse,
    numberPulseWaveform: 'sine',
    numberPulseSpeed: 1.6,
    numberPulseMin: 0.45,
    numberPulseMax: 1.0,
    faceOverlayStyle: overlayStyle,
    borderColorHex: skin.borderColor || skin.accentColor,
    sixNineIndicator: 'dot',

    glowColorHex: skin.emissiveColor,
    glowIntensity: skin.emissiveIntensity,
    reflectionMetallic: skin.metalness,
    surfaceRoughness: skin.roughness,
    clearcoat: skin.clearcoat,
    clearcoatRoughness: skin.clearcoatRoughness ?? 0.15,
    fresnelIntensity: skin.surfaceStyle === 'glass' ? 0.85 : 0.35,
    veinPulse: skin.hasVeinPulse,
    nat20EffectId: skin.defaultNat20EffectId,
    critFailEffectId: skin.defaultCritFailEffectId,
    critBurstIntensity: 1.0,
    critRingScale: 1.0,
    soundProfileId: skin.defaultSoundProfileId,
    physics: { ...DEFAULT_DICE_PHYSICS_CONFIG }
  };
}
