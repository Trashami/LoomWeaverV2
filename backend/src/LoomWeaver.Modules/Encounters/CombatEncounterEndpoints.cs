using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.ActionStudio.Engine;
using LoomWeaver.Modules.ActionStudio.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Encounters;

public static class CombatEncounterEndpoints
{
    private static readonly List<VttTokenDto> ActiveTokens = SeedVttTokens();

    public static void MapCombatEncounterEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapGet("/campaigns/{campaignId:int}/vtt-tokens", (int campaignId) =>
            Results.Ok(ActiveTokens));

        group.MapGet("/campaigns/{campaignId:int}/encounters", async (
            int campaignId, string? role, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var (user, access) = await Bestiary.BestiaryCampaignEndpoints.ResolveAsync(ctx, campaignId, role, repo, ct);
            if (user is null) return Results.Unauthorized();
            if (!access.IsEffectiveGm) return Results.StatusCode(403);
            return Results.Ok(await CampaignEncounterRepository.ListAsync(repo, campaignId, ct));
        });

        group.MapPost("/campaigns/{campaignId:int}/encounters", async (
            int campaignId, System.Text.Json.JsonElement encounterPayload, string? role,
            HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var (user, access) = await Bestiary.BestiaryCampaignEndpoints.ResolveAsync(ctx, campaignId, role, repo, ct);
            if (user is null) return Results.Unauthorized();
            if (!access.IsEffectiveGm) return Results.StatusCode(403);
            if (encounterPayload.ValueKind != System.Text.Json.JsonValueKind.Object ||
                !encounterPayload.TryGetProperty("id", out var id) || id.ValueKind != System.Text.Json.JsonValueKind.String ||
                string.IsNullOrWhiteSpace(id.GetString()) || id.GetString()!.Length > 64 ||
                !encounterPayload.TryGetProperty("campaignId", out var campaign) || !campaign.TryGetInt32(out var cid) || cid != campaignId)
                return Results.BadRequest(new { message = "An encounter must belong to this campaign and have a valid ID." });
            await CampaignEncounterRepository.SaveAsync(repo, campaignId, id.GetString()!, encounterPayload, ct);
            return Results.Ok(encounterPayload);
        });

        group.MapPost("/campaigns/{campaignId:int}/combat/resolve", (
            int campaignId,
            CombatResolutionRequest req) =>
        {
            var attacker = ActiveTokens.FirstOrDefault(t => t.Key == req.AttackerKey) ?? ActiveTokens[0];
            var targetIdx = ActiveTokens.FindIndex(t => t.Key == req.TargetKey);
            if (targetIdx < 0)
            {
                targetIdx = ActiveTokens.FindIndex(t => t.Faction == "hostile");
            }
            var target = ActiveTokens[Math.Max(0, targetIdx)];

            var dx = attacker.X - target.X;
            var dz = attacker.Z - target.Z;
            var distFeet = Math.Round(Math.Sqrt(dx * dx + dz * dz) * 2.5, 1);
            var inRange = distFeet <= Math.Max(5, req.RangeFeet);

            var d20 = Random.Shared.Next(1, 21);
            var isCrit = d20 == 20;
            var totalAttack = d20 + req.AttackBonus;
            var hit = inRange && (isCrit || (d20 != 1 && totalAttack >= target.ArmorClass));

            var dmg = 0;
            if (hit)
            {
                var diceCount = isCrit ? req.DamageDiceCount * 2 : Math.Max(1, req.DamageDiceCount);
                var sides = Math.Max(4, req.DamageDiceSides);
                for (var i = 0; i < diceCount; i++)
                {
                    dmg += Random.Shared.Next(1, sides + 1);
                }
                dmg += req.DamageBonus;
            }

            var remainingHp = Math.Max(0, target.CurrentHp - dmg);
            ActiveTokens[Math.Max(0, targetIdx)] = target with { CurrentHp = remainingHp };

            var log = !inRange
                ? $"{attacker.Name} attempted {req.ActionName} on {target.Name}, but target is out of range ({distFeet}ft > {req.RangeFeet}ft)."
                : hit
                    ? $"{attacker.Name} hit {target.Name} with {req.ActionName} (rolled {d20}+{req.AttackBonus}={totalAttack} vs AC {target.ArmorClass}) for {dmg} damage! ({remainingHp}/{target.MaxHp} HP left)"
                    : $"{attacker.Name} missed {target.Name} with {req.ActionName} (rolled {d20}+{req.AttackBonus}={totalAttack} vs AC {target.ArmorClass}).";

            return Results.Ok(new CombatResolutionResultDto(
                AttackerKey: attacker.Key,
                TargetKey: target.Key,
                ActionName: req.ActionName,
                DistanceFeet: distFeet,
                InRange: inRange,
                RawD20: d20,
                TotalAttackOrSave: totalAttack,
                TargetDefense: target.ArmorClass,
                Hit: hit,
                IsCritical: isCrit,
                DamageDealt: dmg,
                TargetRemainingHp: remainingHp,
                TargetDefeated: remainingHp == 0,
                ParticlePresetId: req.ParticlePresetId,
                LogMessage: log
            ));
        });

        group.MapPost("/campaigns/{campaignId:int}/combat/resolve-step", async (
            int campaignId,
            EncounterAttackStepRequest req,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var repo = new ActionStudioMySqlRepository(mysql);
            var pipeline = new EncounterReactionPipelineService(repo);
            var stepReq = req with { CampaignId = campaignId > 0 ? campaignId : req.CampaignId };
            var result = await pipeline.ExecuteAttackStepAsync(stepReq, ct);
            return Results.Ok(result);
        });

        group.MapPost("/campaigns/{campaignId:int}/encounters/{encounterId}/complete", (
            int campaignId,
            string encounterId,
            EncounterCompletionRequest req) =>
        {
            if (!string.Equals(req.ViewerRole, "gm", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Json(
                    new { error = "Forbidden: Only the GM can conclude an encounter and award campaign XP." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var count = Math.Max(1, req.PartySize);
            var xpEach = req.TotalXp / count;
            return Results.Ok(new EncounterCompletionResultDto(
                EncounterId: encounterId,
                TotalXpAwarded: req.TotalXp,
                XpPerHero: xpEach,
                LevelUpTriggeredHeroes: ["Dallas (Dal)", "Fivi", "Kildrid", "Kycius", "Munk"],
                Summary: $"Awarded {req.TotalXp:N0} XP ({xpEach:N0} XP per hero). All 5 party members crossed the Level 8 threshold!"
            ));
        });
    }

    private static List<VttTokenDto> SeedVttTokens() =>
    [
        new("1:Character:char-dal", "Dallas (Dal)", "Ranger · Party", "party", 21, 68, 68, 17, -6, -3, "#2ed39a", false, false, false, 35),
        new("1:Character:char-fivi", "Fivi & Dolly", "Fey Trickster · Party", "party", 19, 58, 58, 17, -3, -5, "#d4a853", false, false, false, 30),
        new("1:Encounter:vamp-1", "Cinth Vampire Sovereign", "Undead Boss · CR 11", "hostile", 18, 144, 144, 16, 4, 2, "#ef5d72", false, false, false, 40),
        new("1:Character:char-munk", "Munk", "Frontline Vanguard · Party", "party", 16, 84, 84, 18, 1, 0, "#38bdf8", false, false, false, 30),
        new("1:Encounter:vamp-2", "Crimson Court Stalker", "Undead Elite · CR 7", "hostile", 14, 82, 82, 15, 7, -3, "#f43f5e", false, false, false, 35),
        new("1:Character:char-kildrid", "Kildrid", "Rune Scholar · Party", "party", 13, 72, 72, 18, -2, 3, "#a78bfa", false, false, false, 25),
        new("1:Character:char-kycius", "Kycius & Laksis", "Truth-Watcher · Party", "party", 12, 60, 60, 16, -7, 2, "#fb923c", false, false, false, 35),
    ];
}
