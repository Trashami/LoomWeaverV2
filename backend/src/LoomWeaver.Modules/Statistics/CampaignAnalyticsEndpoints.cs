using LoomWeaver.Domain;
using LoomWeaver.Modules.Characters;
using LoomWeaver.Modules.Dice;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Statistics;

public static class CampaignAnalyticsEndpoints
{
    public static RouteGroupBuilder MapCampaignAnalyticsEndpoints(this RouteGroupBuilder api)
    {
        // Only live dice and telemetry are reported. Party radar, character telemetry,
        // damage breakdowns, and achievements are empty until they are backed by the database.
        api.MapGet("/campaigns/{campaignId:int}/analytics", (int campaignId) =>
        {
            var recentRolls = DiceForgeEndpoints.GetRecentRolls();
            var sheetStats = CharacterSheetLiveTelemetryEndpoints.GetAllTelemetry();
            var d20Rolls = recentRolls
                .Where(r => r.Sides == 20)
                .SelectMany(r => r.KeptRolls)
                .ToList();

            var baseRollCount = sheetStats.Sum(s => s.TotalSessionRolls) + recentRolls.Count;
            var nat20Count = sheetStats.Sum(s => s.Nat20Count) + recentRolls.Count(r => r.IsNat20);
            var nat1Count = sheetStats.Sum(s => s.CritFailCount) + recentRolls.Count(r => r.IsNat1);
            var avgD20 = d20Rolls.Count > 0
                ? Math.Round(d20Rolls.Average(), 2)
                : 0d;

            return Results.Ok(new CampaignAnalyticsDashboardContract(
                campaignId,
                string.Empty,
                0,
                0,
                0,
                baseRollCount,
                nat20Count,
                nat1Count,
                avgD20,
                Array.Empty<RadarMetricContract>(),
                Array.Empty<CharacterTelemetryContract>(),
                Array.Empty<DamageTypeBreakdownContract>(),
                Array.Empty<CampaignAchievementContract>(),
                recentRolls
            ));
        });

        return api;
    }
}
