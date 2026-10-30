using LoomWeaver.Domain;

namespace LoomWeaver.Modules.EffectStudio.Domain;

public static class EffectEmitterCatalog
{
    public static IReadOnlyList<EffectEmitterCardDto> GetAllEmitters() => Emitters;

    private static readonly IReadOnlyList<EffectEmitterCardDto> Emitters =
    [
        // 18 Extracted Core Building Blocks from Legacy Vtt3d Engine
        new("fx-projectile", "Projectile", "Projectiles & Paths", "Projectile", "Curved Flight", 1.2, 2.5, 95, 1.4, 4.2, 18, "Solar Ember", "#ff6a00", "#ffd54f", 0.20, 0.90, 92, "Additive", true, 1.8, false, "#ff6a00", "Fire", 1, 1.0),
        new("fx-projectile-volley", "Projectile Volley", "Projectiles & Paths", "Projectile Volley", "Curved Flight", 1.5, 2.8, 120, 1.5, 4.5, 32, "Arcane Plasma", "#a855f7", "#e9d5ff", 0.15, 0.75, 94, "Additive", true, 1.5, false, "#a855f7", "Spectral", 3, 1.0),
        new("fx-object-projectile", "Object Projectile", "Projectiles & Paths", "Object Projectile", "Linear Ray", 0.8, 1.2, 45, 1.2, 5.2, 10, "Basalt", "#fef08a", "#ffffff", 0.25, 0.85, 100, "AlphaBlend", true, 0.9, false, "#eab308", "Radiant", 1, 1.0),
        new("fx-trail", "Trail", "Projectiles & Paths", "Trail", "Curved Flight", 0.9, 1.5, 110, 1.2, 3.8, 12, "Solar Ember", "#fb923c", "#fde047", 0.12, 0.65, 88, "Additive", false, 0.6, false, "#fb923c", "Fire", 1, 1.0),
        new("fx-beam", "Beam", "Beams & Volumes", "Beam", "Linear Ray", 1.5, 6.0, 165, 1.6, 4.4, 10, "Concentrated Aether", "#38bdf8", "#e0f2fe", 0.20, 1.35, 92, "Additive", true, 2.0, false, "#38bdf8", "Lightning", 1, 1.0),
        new("fx-cone-spray", "Cone Spray", "Beams & Volumes", "Cone Spray", "Directional Cone", 3.2, 4.5, 180, 1.6, 3.4, 55, "Crystalline Frost", "#38bdf8", "#e0f2fe", 0.22, 1.40, 88, "Additive", true, 1.4, false, "#38bdf8", "Ice", 1, 1.0),
        new("fx-energy-column", "Energy Column", "Beams & Volumes", "Energy Column", "Cylinder Pillar", 4.0, 6.0, 140, 2.6, 1.8, 35, "Golden Light", "#fcd34d", "#fffbeb", 0.20, 1.50, 85, "Additive", true, 1.6, false, "#f59e0b", "Radiant", 1, 1.0),
        new("fx-burst", "Burst", "Bursts & Impacts", "Burst", "Sphere Burst", 3.8, 4.2, 220, 1.8, 3.0, 75, "Solar Ember", "#f97316", "#fde047", 0.28, 1.80, 90, "Additive", true, 2.2, false, "#f97316", "Fire", 1, 1.0, "detailed"),
        new("fx-box-burst", "Box Burst", "Bursts & Impacts", "Box Burst", "Volumetric Cube", 3.4, 3.4, 150, 1.8, 2.4, 45, "Concentrated Aether", "#60a5fa", "#dbeafe", 0.25, 1.50, 86, "Additive", true, 1.6, false, "#60a5fa", "Lightning", 1, 1.0),
        new("fx-shockwave", "Shockwave", "Bursts & Impacts", "Shockwave", "Ring Fountain", 4.5, 0.8, 90, 1.2, 4.0, 85, "Solar Ember", "#fbbf24", "#fef3c7", 0.20, 1.60, 88, "Additive", false, 0.8, false, "#fbbf24", "Fire", 2, 1.0),
        new("fx-casting-charge", "Casting Charge", "Sigils & Auras", "Casting Charge", "Sphere Burst", 1.6, 2.2, 85, 0.9, 1.8, 40, "Golden Light", "#fcd34d", "#fef08a", 0.12, 0.75, 90, "Additive", true, 1.3, false, "#fcd34d", "Radiant", 1, 1.0),
        new("fx-magic-circle", "Magic Circle", "Sigils & Auras", "Magic Circle", "Circle (Area)", 4.0, 0.4, 60, 3.8, 0.5, 15, "Arcane Glyph", "#2dd4bf", "#fcd34d", 0.30, 1.40, 92, "Additive", true, 1.5, false, "#2dd4bf", "Radiant", 1, 1.0, null, "anelith-hex"),
        new("fx-swirling-aura", "Swirling Aura", "Sigils & Auras", "Swirling Aura", "Spiral Funnel", 3.4, 4.8, 130, 2.8, 1.6, 45, "Emerald Vitality", "#34d399", "#a7f3d0", 0.18, 1.30, 84, "Additive", true, 1.3, false, "#34d399", "Spectral", 1, 1.0),
        new("fx-smoke-mist", "Smoke / Mist", "Particles & Aftermath", "Smoke / Mist", "Circle (Area)", 3.8, 4.6, 75, 3.6, 0.9, 65, "Charcoal Plume", "#94a3b8", "#334155", 0.50, 2.40, 70, "AlphaBlend", false, 0.0, true, "#94a3b8", "Shadow", 1, 1.0),
        new("fx-sparks-embers", "Sparks / Embers", "Particles & Aftermath", "Sparks / Embers", "Circle (Area)", 3.6, 5.4, 155, 2.4, 2.6, 58, "Solar Ember", "#fb923c", "#fef08a", 0.08, 0.55, 92, "Additive", true, 1.1, false, "#fb923c", "Fire", 36, 1.0),
        new("fx-debris", "Debris", "Particles & Aftermath", "Debris", "Sphere Burst", 3.5, 3.2, 65, 2.0, 3.4, 70, "Basalt", "#78716c", "#f97316", 0.18, 0.85, 95, "AlphaBlend", false, 0.0, true, "#a8a29e", "Fire", 18, 1.0),
        new("fx-light", "Light", "Stage & Audio", "Light", "Sphere Burst", 5.0, 4.0, 20, 2.2, 1.0, 30, "Golden Light", "#fde047", "#ffffff", 0.50, 2.00, 90, "Additive", true, 2.6, false, "#fde047", "Radiant", 1, 1.0),
        new("fx-surface-mark", "Surface Mark", "Stage & Audio", "Surface Mark", "Circle (Area)", 3.8, 0.2, 30, 4.5, 0.2, 10, "Charcoal Plume", "#451a03", "#ea580c", 0.40, 1.80, 82, "AlphaBlend", false, 0.2, true, "#ea580c", "Fire", 1, 1.0),
        // 6 New Priority Effects
        new("fx-chain-lightning", "Chain Lightning", "Projectiles & Paths", "Chain Lightning", "Arc Chain", 2.4, 5.5, 175, 1.3, 4.8, 28, "Concentrated Aether", "#38bdf8", "#e0f2fe", 0.14, 0.95, 96, "Additive", true, 2.3, false, "#38bdf8", "Lightning", 3, 1.0),
        new("fx-wall", "Wall", "Barriers & Terrain", "Wall", "Segmented Wall", 5.2, 3.8, 160, 3.6, 1.6, 25, "Solar Ember", "#f97316", "#fde047", 0.30, 1.70, 88, "Additive", true, 1.8, false, "#f97316", "Fire", 5, 1.0),
        new("fx-shield-dome", "Shield / Dome", "Barriers & Terrain", "Shield / Dome", "Hemisphere Dome", 3.6, 3.6, 110, 3.2, 1.1, 35, "Arcane Glyph", "#38bdf8", "#bae6fd", 0.25, 1.50, 78, "Additive", true, 1.4, false, "#38bdf8", "Spectral", 1, 1.0),
        new("fx-ground-area", "Ground Area", "Barriers & Terrain", "Ground Area", "Circle (Area)", 4.4, 0.9, 95, 4.0, 0.7, 65, "Spore Vapor", "#84cc16", "#d9f99d", 0.35, 1.90, 80, "AlphaBlend", true, 0.9, true, "#84cc16", "Acid", 1, 1.0),
        new("fx-particle-emitter", "Particle Emitter", "Particles & Aftermath", "Particle Emitter", "Spiral Funnel", 3.8, 4.8, 125, 3.0, 1.5, 48, "Gold", "#d97706", "#fef08a", 0.15, 0.90, 86, "Additive", true, 1.1, false, "#d97706", "Arcane", 48, 1.0),
        new("fx-sound", "Sound", "Stage & Audio", "Sound", "Sphere Burst", 4.0, 2.0, 10, 2.5, 1.0, 15, "Golden Light", "#c084fc", "#f3e8ff", 0.10, 0.50, 100, "Additive", false, 0.0, false, "#c084fc", "Spectral", 1, 1.0),
    ];
}
