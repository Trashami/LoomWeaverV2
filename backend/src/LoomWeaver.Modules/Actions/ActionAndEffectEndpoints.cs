using LoomWeaver.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Actions;

public static class ActionAndEffectEndpoints
{
    private static readonly List<ActionRuleDefinitionDto> Rules = SeedActionRules();
    private static readonly List<EffectTimelinePresetDto> Effects = SeedEffects();

    public static void MapActionAndEffectEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapGet("/campaigns/{campaignId:int}/actions-and-effects", (int campaignId) =>
            Results.Ok(new { actions = Rules, effects = Effects }));

        group.MapPost("/campaigns/{campaignId:int}/actions", (
            int campaignId,
            CreateActionRuleRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name))
            {
                return Results.BadRequest(new { error = "Action name is required." });
            }

            var status = string.Equals(req.ViewerRole, "gm", StringComparison.OrdinalIgnoreCase)
                ? "approved"
                : "draft";

            var created = new ActionRuleDefinitionDto(
                Id: $"act-{Rules.Count + 101}",
                Name: req.Name.Trim(),
                Category: req.Category,
                ActionCost: req.ActionCost,
                RangeFeet: Math.Clamp(req.RangeFeet, 5, 300),
                TriggerWhen: req.TriggerWhen,
                ConditionIf: req.ConditionIf,
                ExecuteThen: req.ExecuteThen,
                AttackBonus: 9,
                SaveDc: 16,
                DamageFormula: string.IsNullOrWhiteSpace(req.DamageFormula) ? "3d8 + 4" : req.DamageFormula,
                LinkedEffectPresetId: req.LinkedEffectPresetId,
                CanonStatus: status
            );

            Rules.Insert(0, created);
            return Results.Ok(created);
        });
    }

    private static List<ActionRuleDefinitionDto> SeedActionRules() =>
    [
        new(
            "act-fivi-tooth",
            "Ranged Ricochet Slingshot",
            "Ranged Weapon Attack",
            "1 Action",
            60,
            "WHEN: Ranged Slingshot Attack Declared",
            "IF: Target within 60ft & Attack Roll >= Target AC",
            "THEN: Deal 3d8+5 Piercing + Spawn Fey Gold Ricochet Arc",
            9, 16, "3d8 + 5", "fx-projectile-arc", "approved"
        ),
        new(
            "act-kildrid-seal",
            "Hexagonal Binding Pulse",
            "Abjuration Spell / Rune",
            "1 Action",
            30,
            "WHEN: Rune Chisel Struck Against Stone Floor",
            "IF: Hostiles within 30ft Hex Sigil Fail DC 16 WIS Save",
            "THEN: Deal 4d10 Radiant + Apply Restrained + Spawn Hex Sigil",
            8, 16, "4d10 + 4", "fx-ground-sigil", "approved"
        ),
        new(
            "act-laksis-cone",
            "Fire-Drake Cinder Breath",
            "Companion Bonus Action",
            "1 Bonus Action",
            20,
            "WHEN: Familiar Commands Bonus Action",
            "IF: Targets in 20ft Cone Fail DC 15 DEX Save",
            "THEN: Deal 4d6 Fire + Ignite Ground + Emit Ember Cone",
            8, 15, "4d6 + 3", "fx-ember-cone", "approved"
        ),
        new(
            "act-munk-cleave",
            "Sky-Breaker Cleave",
            "Melee Weapon Attack",
            "1 Action",
            10,
            "WHEN: Heavy Greatsword Strike Connects",
            "IF: Target AC Beat or Critical Hit Rolled",
            "THEN: Deal 4d6+6 Slashing + Trigger Vertical Shockwave Beam",
            9, 16, "4d6 + 6", "fx-vertical-beam", "approved"
        )
    ];

    internal static List<EffectTimelinePresetDto> SeedEffects() =>
    [
        new(
            "fx-projectile-arc",
            "Fey Gold Ricochet Projectile Arc",
            "arc",
            "#d4a853",
            "#2ed39a",
            320,
            1100,
            ["0ms: Muzzle Flash", "180ms: Parabolic Gold Trail", "750ms: Target Impact Burst", "1100ms: Fade"]
        ),
        new(
            "fx-ground-sigil",
            "Hexagonal Ground Sigil & Pillars",
            "sigil",
            "#2ed39a",
            "#d4a853",
            520,
            1600,
            ["0ms: Floor Rune Etch", "400ms: Hexagonal Ring Expansion", "950ms: Ascendant Light Pillars", "1600ms: Decal Persist"]
        ),
        new(
            "fx-ember-cone",
            "Dragonfire Cinder Cone",
            "cone",
            "#ff6b35",
            "#ffd166",
            600,
            1250,
            ["0ms: Drake Maw Ignition", "250ms: 20ft Directional Flame Cone", "900ms: Swirling Ash Vortex", "1250ms: Ember Settle"]
        ),
        new(
            "fx-vertical-beam",
            "Moonlight Orbital Judgement Beam",
            "beam",
            "#60a5fa",
            "#e0f2fe",
            450,
            1400,
            ["0ms: Zenith Halo Convergence", "300ms: Vertical Beam Strike", "850ms: Radial Shockwave Ring", "1400ms: Dissolve"]
        )
    ];
}
