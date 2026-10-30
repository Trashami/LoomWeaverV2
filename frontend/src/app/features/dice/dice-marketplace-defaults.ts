import {
  createDefaultRuntimeConfigFromSkin,
  DICE_SKIN_CATALOG,
  MarketplaceDicePreset,
} from './engine/skins';

export function buildDefaultMarketplaceDicePresets(): MarketplaceDicePreset[] {
  const obsidianBase = createDefaultRuntimeConfigFromSkin(DICE_SKIN_CATALOG[0]);
  const feyBase = createDefaultRuntimeConfigFromSkin(
    DICE_SKIN_CATALOG.find((s) => s.id === 'skin-fey-emerald') ?? DICE_SKIN_CATALOG[0],
  );
  const astralBase = createDefaultRuntimeConfigFromSkin(
    DICE_SKIN_CATALOG.find((s) => s.id === 'skin-astral-void') ?? DICE_SKIN_CATALOG[0],
  );
  const brassBase = createDefaultRuntimeConfigFromSkin(
    DICE_SKIN_CATALOG.find((s) => s.id === 'skin-clockwork-brass') ?? DICE_SKIN_CATALOG[0],
  );

  return [
    {
      id: 'mkt-preset-shadow-mountain',
      name: 'Runestone Dice',
      creatorHandle: 'Stone-Delver',
      tagline:
        'Deep carved basalt runes with crimson inner glow, heavy mass (2.4), and high spin for subterranean delves.',
      downloadsCount: 418,
      rating: 4.9,
      publishedAt: '2d ago',
      config: {
        ...obsidianBase,
        customName: 'Runestone Dice',
        modelId: 'model-dwarven-heavy',
        coreColorHex: '#161118',
        coreInnerGlowEnabled: true,
        coreInnerGlowColor: '#ff3b5c',
        coreInnerGlowOpacity: 0.9,
        corePulseEnabled: true,
        corePulseSpeed: 1.4,
        corePulseWaveform: 'heartbeat',
        numberColorHex: '#ffd978',
        numberDepth: -0.78,
        bumpMapIntensity: 1.45,
        physics: {
          ...obsidianBase.physics,
          gravity: 12.5,
          mass: 2.4,
          throwForce: 6.5,
          restitution: 0.32,
        },
      },
    },
    {
      id: 'mkt-preset-feywild-prism',
      name: 'Feywild Scatter-Glass',
      creatorHandle: 'Feywild Studio',
      tagline:
        'Translucent emerald fey glass with floating raised numbers, low gravity float, and high bounce restitution.',
      downloadsCount: 329,
      rating: 4.8,
      publishedAt: '4d ago',
      config: {
        ...feyBase,
        customName: 'Feywild Scatter-Glass',
        modelId: 'model-sharp-gem',
        coreColorHex: '#0e3b28',
        coreOpacity: 0.72,
        coreOuterGlowEnabled: true,
        coreOuterGlowColor: '#2ee66b',
        coreOuterGlowOpacity: 0.95,
        numberColorHex: '#f5ffe8',
        numberDepth: 0.45,
        numberOuterGlowEnabled: true,
        numberOuterGlowColor: '#49e892',
        numberOuterGlowOpacity: 0.95,
        physics: {
          ...feyBase.physics,
          gravity: 6.2,
          restitution: 0.74,
          spinForce: 9.2,
          startingHeight: 11,
        },
      },
    },
    {
      id: 'mkt-preset-cinth-artificer',
      name: 'Artificer Overclock Brass',
      creatorHandle: 'Guildmaster Studio',
      tagline:
        'Precision-milled brass with cyan aether conduit numbers, raised relief numerals, and crisp metallic clatter.',
      downloadsCount: 276,
      rating: 4.9,
      publishedAt: '1w ago',
      config: {
        ...brassBase,
        customName: 'Artificer Overclock Brass',
        coreColorHex: '#2d2112',
        reflectionMetallic: 0.94,
        surfaceRoughness: 0.2,
        numberColorHex: '#38e8ff',
        numberDepth: 0.55,
        numberOuterGlowEnabled: true,
        numberOuterGlowColor: '#38e8ff',
        numberOuterGlowOpacity: 0.9,
        numberPulseEnabled: true,
        numberPulseWaveform: 'sine',
      },
    },
    {
      id: 'mkt-preset-anelith-luminary',
      name: 'Radiant Singularity',
      creatorHandle: 'Guild Artisan',
      tagline:
        'Semi-transparent astral crystal with dual-tone void gradient, pulsing violet glyphs, and top-down arena bounds.',
      downloadsCount: 512,
      rating: 5.0,
      publishedAt: '1w ago',
      config: {
        ...astralBase,
        customName: 'Radiant Singularity',
        modelId: 'model-sharp-gem',
        coreOpacity: 0.78,
        coreGradientEnabled: true,
        coreSecondaryColorHex: '#2a0944',
        coreBlendMode: 'screen',
        numberColorHex: '#f3d28f',
        numberOuterGlowEnabled: true,
        numberOuterGlowColor: '#c06cff',
      },
    },
  ];
}
