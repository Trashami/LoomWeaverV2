using LoomWeaver.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Marketplace;

public static class MarketplaceAndQuestEndpoints
{
    // Quests and marketplace listings start empty; they are created per campaign, not hardcoded here.
    private static readonly List<MultiStepQuestContract> CampaignQuests = new();

    private static readonly List<MarketplaceCreatorModuleContract> CreatorModules = new();

    public static RouteGroupBuilder MapMarketplaceAndQuestEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/quests", (int campaignId) =>
            Results.Ok(CampaignQuests));

        api.MapPost("/campaigns/{campaignId:int}/quests/{questId}/steps/{stepId}/toggle", async (
            int campaignId,
            string questId,
            string stepId,
            HttpContext ctx,
            LoomWeaver.Infrastructure.MySql.LoomWeaverMySqlRepository repo,
            CancellationToken ct) =>
        {
            var access = await LoomWeaver.Modules.Auth.CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsAccountGm) return Results.StatusCode(403);
            var idx = CampaignQuests.FindIndex(q => q.Id == questId);
            if (idx < 0)
            {
                return Results.NotFound(new { message = "Quest not found." });
            }

            var quest = CampaignQuests[idx];
            var wasCompleted = quest.Status == "completed";
            var updatedSteps = quest.Steps
                .Select(s => s.StepId == stepId ? s with { Completed = !s.Completed } : s)
                .ToList();

            var allDone = updatedSteps.All(s => s.Completed);
            var updatedQuest = quest with
            {
                Steps = updatedSteps,
                Status = allDone ? "completed" : "active"
            };

            CampaignQuests[idx] = updatedQuest;

            var awardedXp = 0;
            var message = $"Updated objective '{stepId}' for '{updatedQuest.Title}'.";
            if (allDone && !wasCompleted && updatedQuest.XpReward > 0)
            {
                var award = await LoomWeaver.Modules.Encounters.EncounterRewardService.AwardPartyAsync(
                    repo, campaignId, questId, $"quest:{campaignId}:{questId}:xp", updatedQuest.XpReward,
                    $"Quest '{updatedQuest.Title}'", "quest_xp", access.Username, false, ct);
                awardedXp = award.Result?.TotalXpAwarded ?? 0;
                message = award.Result?.Summary ?? $"Quest '{updatedQuest.Title}' completed; {award.Error}";
            }

            return Results.Ok(new { quest = updatedQuest, awardedXp, message });
        });

        api.MapGet("/marketplace/modules", () =>
            Results.Ok(CreatorModules));

        api.MapPost("/marketplace/modules/{moduleId}/import", (string moduleId) =>
        {
            var idx = CreatorModules.FindIndex(m => m.Id == moduleId);
            if (idx < 0)
            {
                return Results.NotFound(new { message = "Marketplace module not found." });
            }

            var updated = CreatorModules[idx] with
            {
                Installed = true,
                PopularityImports = CreatorModules[idx].PopularityImports + 1
            };
            CreatorModules[idx] = updated;

            return Results.Ok(new
            {
                module = updated,
                message = $"Imported '{updated.Title}' (creator share ${updated.CreatorShareUsd:F2} to {updated.CreatorHandle})."
            });
        });

        api.MapGet("/campaigns/{campaignId:int}/export-package", (int campaignId) =>
        {
            return Results.Ok(new
            {
                schemaVersion = "loomweaver-package-v2.0",
                campaignId,
                campaignTitle = "",
                exportedAt = DateTimeOffset.UtcNow,
                databaseSource = "loomweaver",
                neo4jNamespace = "loomweaver",
                royaltyStandard = "85/15 Creator Split",
                questsCount = CampaignQuests.Count,
                quests = CampaignQuests,
                installedModules = CreatorModules.Where(m => m.Installed).Select(m => m.Id).ToArray()
            });
        });

        return api;
    }
}
