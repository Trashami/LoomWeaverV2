using LoomWeaver.Domain;
using LoomWeaver.GameSystems;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Adventures;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Characters;

public static class CharacterStudioEndpoints
{
    private static readonly CharacterCalculationEngine Engine = new();
    private static readonly string[] AbilityCodes = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    private static readonly Dictionary<string, string> AbilityLabels = new()
    {
        ["STR"] = "Strength", ["DEX"] = "Dexterity", ["CON"] = "Constitution",
        ["INT"] = "Intelligence", ["WIS"] = "Wisdom", ["CHA"] = "Charisma",
    };

    public static void MapCharacterStudioEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapCharacterSheetLiveTelemetryEndpoints();

        group.MapGet("/campaigns/{campaignId:int}/character-studio", async (
            int campaignId, string? role, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, role, ct);
            if (!access.IsMember) return Denied();

            var stored = await CharacterStore.ListAsync(repo, campaignId, ct);
            var visible = access.IsEffectiveGm
                ? stored
                : stored.Where(c => IsOwnerOrBound(c, access)).ToList();
            return Results.Ok(visible.Select(c => Engine.RecalculateSheet(c.Sheet)).ToList());
        });

        group.MapPost("/campaigns/{campaignId:int}/character-studio/create", async (
            int campaignId, CreateCharacterRequest req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Denied();

            var name = req.Name?.Trim() ?? string.Empty;
            var key = BuildKey(name);
            if (key is null || name.Length > 128)
            {
                return Results.BadRequest(new { error = "A character name of 1-128 letters or digits is required." });
            }

            var scores = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var code in AbilityCodes)
            {
                var score = req.AbilityScores?.GetValueOrDefault(code, 10) ?? 10;
                if (score is < 1 or > 30)
                {
                    return Results.BadRequest(new { error = $"{code} must be between 1 and 30." });
                }

                scores[code] = score;
            }

            var systemCode = string.IsNullOrWhiteSpace(req.SystemCode) ? "dnd5e" : req.SystemCode.Trim();
            var level = access.IsAccountGm ? Math.Clamp(req.Level, 1, CharacterCalculationEngine.MaxLevel) : 1;
            var archetype = (req.ClassOrArchetype ?? string.Empty).Trim();
            var draft = new CharacterSheetDto(
                CompositeKey: $"{campaignId}:Character:{key}",
                CharacterKey: key,
                CampaignId: campaignId,
                Name: name,
                AncestryOrClan: (req.AncestryOrClan ?? string.Empty).Trim(),
                ClassOrArchetype: archetype,
                SystemCode: systemCode,
                Level: level,
                CurrentXp: CharacterCalculationEngine.XpForLevel(systemCode, level),
                NextLevelXp: CharacterCalculationEngine.XpForLevel(systemCode, level + 1),
                LevelUpEligible: false,
                MaxHp: 1, CurrentHp: 0, ArmorClass: 10, InitiativeBonus: 0, SpeedFeet: 30, ProficiencyBonus: 2,
                ActionEconomySummary: string.Empty,
                Abilities: AbilityCodes.Select(c => new AbilityScoreDto(c, AbilityLabels[c], scores[c], 0)).ToList(),
                Equipment: [],
                Features: archetype.Length == 0 ? [] : [$"Archetype Core: {archetype}"]);

            var calculated = Engine.RecalculateSheet(draft);
            var created = await CharacterStore.CreateAsync(repo, calculated, access.UserId, ct);
            if (created is null)
            {
                return Results.Conflict(new { error = $"A character named '{name}' already exists in this campaign." });
            }

            AdventureGuideStateStore.RegisterCharacterOrNpc(
                campaignId, $"node-{key}", calculated.CompositeKey, calculated.Name,
                $"{calculated.AncestryOrClan} {calculated.ClassOrArchetype} · Lv.{calculated.Level}",
                "Party Hero", "gold", "/characters-showcase.jpg",
                "Active party adventurer.",
                $"\"Ready at the table with {calculated.ClassOrArchetype} capabilities.\"",
                "Party Roster · Populated from Character Studio",
                $"/characters?focus={key}", "players");

            return Results.Ok(calculated);
        });

        group.MapPost("/campaigns/{campaignId:int}/character-studio/{characterKey}/level-up", async (
            int campaignId, string characterKey, LevelUpCharacterRequest req,
            HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Denied();

            var result = await CharacterStore.MutateAsync(repo, campaignId, characterKey, current =>
            {
                if (!CanEdit(current, access)) return CharacterMutation.Reject(403, "You cannot change this character.");
                var sheet = Engine.RecalculateSheet(current.Sheet);
                if (!sheet.LevelUpEligible) return CharacterMutation.Reject(409, "Not enough XP to level up.");

                var feature = (req.SelectedFeature ?? string.Empty).Trim();
                var ability = (req.AbilityIncreaseCode ?? string.Empty).Trim().ToUpperInvariant();
                if (feature.Length is 0 or > 200) return CharacterMutation.Reject(400, "A feature of up to 200 characters is required.");
                if (ability.Length > 0 && !AbilityCodes.Contains(ability)) return CharacterMutation.Reject(400, "Unknown ability code.");
                return CharacterMutation.Ok(Engine.ApplyLevelUp(sheet, feature, ability));
            }, ct);
            return ToResult(result);
        });

        group.MapPost("/campaigns/{campaignId:int}/character-studio/{characterKey}/equipment", async (
            int campaignId, string characterKey, ToggleEquipmentRequest req,
            HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Denied();

            var result = await CharacterStore.MutateAsync(repo, campaignId, characterKey, current =>
            {
                if (!CanEdit(current, access)) return CharacterMutation.Reject(403, "You cannot change this character.");
                if (!current.Sheet.Equipment.Any(e => e.Id == req.EquipmentId)) return CharacterMutation.Reject(404, "Equipment not found.");
                var equipment = current.Sheet.Equipment
                    .Select(e => e.Id == req.EquipmentId ? e with { Equipped = req.Equipped } : e).ToList();
                return CharacterMutation.Ok(Engine.RecalculateSheet(current.Sheet with { Equipment = equipment }));
            }, ct);
            return ToResult(result);
        });
    }

    private static bool CanEdit(StoredCharacter c, ResolvedCampaignAccess access) =>
        access.IsAccountGm || IsOwnerOrBound(c, access);

    public static bool IsOwnerOrBound(StoredCharacter c, ResolvedCampaignAccess access)
    {
        if (c.OwnerUserId is long owner && owner == access.UserId) return true;
        var bound = access.BoundCharacterKey.Replace("pc-", "char-", StringComparison.OrdinalIgnoreCase);
        return !string.Equals(access.BoundCharacterKey, CampaignAccessResolver.NoCharacter, StringComparison.OrdinalIgnoreCase)
            && c.Sheet.CharacterKey.Equals(bound, StringComparison.OrdinalIgnoreCase);
    }

    private static string? BuildKey(string name)
    {
        var slug = new string(name.ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray()).Trim('-');
        while (slug.Contains("--", StringComparison.Ordinal)) slug = slug.Replace("--", "-", StringComparison.Ordinal);
        return slug.Length == 0 ? null : $"char-{slug}"[..Math.Min(slug.Length + 5, 64)];
    }

    private static IResult Denied() =>
        Results.Json(new { error = "Campaign membership is required." }, statusCode: StatusCodes.Status403Forbidden);

    private static IResult ToResult(CharacterMutation result) =>
        result.Updated is not null
            ? Results.Ok(result.Updated)
            : Results.Json(new { error = result.Error }, statusCode: result.StatusCode);
}
