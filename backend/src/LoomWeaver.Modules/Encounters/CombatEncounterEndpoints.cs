using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.ActionStudio.Engine;
using LoomWeaver.Modules.ActionStudio.Infrastructure;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Encounters;

public sealed record AddHostileTokenRequest(string Name, string? RoleLabel, int MaxHp, int ArmorClass, double X, double Z, int SpeedFeet);

public sealed record MoveTokenRequest(string? TokenKey, double X, double Z);

public static class CombatEncounterEndpoints
{
    // The ping carries no data; each client re-fetches through the authorized endpoints.
    private static Task NotifyAsync(IHubContext<TableRealtimeHub> hub, int campaignId, CancellationToken ct) =>
        hub.Clients.Group(TableRealtimeHub.GroupName(campaignId)).SendAsync("CombatStateChanged", new { campaignId }, ct);

    private static async Task<IResult> RespondAsync(
        CombatStepOutcome outcome, IHubContext<TableRealtimeHub> hub, int campaignId, CancellationToken ct)
    {
        if (outcome.Error is not null) return Results.Json(new { error = outcome.Error }, statusCode: outcome.StatusCode);
        await NotifyAsync(hub, campaignId, ct);
        return Results.Ok(outcome.Body);
    }

    public static void MapCombatEncounterEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapGet("/campaigns/{campaignId:int}/vtt-tokens", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            return access.IsMember ? Results.Ok(await CombatTokenStore.ListAsync(repo, campaignId, ct)) : Results.StatusCode(403);
        });

        group.MapPost("/campaigns/{campaignId:int}/combat/start", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, IHubContext<TableRealtimeHub> hub, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsAccountGm) return Results.StatusCode(403);
            await CombatTokenStore.SeedPartyAsync(repo, campaignId, ct);
            await CombatTurnStore.ResetAsync(repo, campaignId, ct);
            await NotifyAsync(hub, campaignId, ct);
            return Results.Ok(await CombatTokenStore.ListAsync(repo, campaignId, ct));
        });

        group.MapPost("/campaigns/{campaignId:int}/vtt-tokens", async (
            int campaignId, AddHostileTokenRequest req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsAccountGm) return Results.StatusCode(403);
            if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length > 120 || req.MaxHp is < 1 or > 10_000 ||
                req.ArmorClass is < 1 or > 40 || req.SpeedFeet is < 0 or > 400)
                return Results.BadRequest(new { error = "Invalid combatant." });
            var token = await CombatTokenStore.AddHostileAsync(repo, campaignId, req.Name.Trim(), req.RoleLabel?.Trim() ?? "Hostile",
                req.MaxHp, req.ArmorClass, req.X, req.Z, req.SpeedFeet, ct);
            return Results.Ok(token);
        });

        group.MapGet("/campaigns/{campaignId:int}/combat/state", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            return access.IsMember ? Results.Ok(await CombatTurnStore.GetStateAsync(repo, campaignId, ct)) : Results.StatusCode(403);
        });

        group.MapPost("/campaigns/{campaignId:int}/vtt-tokens/move", async (
            int campaignId, MoveTokenRequest req, HttpContext ctx, LoomWeaverMySqlRepository repo,
            IHubContext<TableRealtimeHub> hub, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Results.StatusCode(403);
            var outcome = await CombatTurnStore.MoveAsync(repo, campaignId, access, req.TokenKey ?? "", req.X, req.Z, ct);
            return await RespondAsync(outcome, hub, campaignId, ct);
        });

        group.MapPost("/campaigns/{campaignId:int}/combat/next-turn", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo,
            IHubContext<TableRealtimeHub> hub, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Results.StatusCode(403);
            var outcome = await CombatTurnStore.NextTurnAsync(repo, campaignId, access, ct);
            return await RespondAsync(outcome, hub, campaignId, ct);
        });

        group.MapGet("/campaigns/{campaignId:int}/encounters", async (
            int campaignId, string? role, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var (user, access) = await Bestiary.BestiaryCampaignEndpoints.ResolveAsync(ctx, campaignId, role, repo, ct);
            if (user is null) return Results.Unauthorized();
            if (!access.IsEffectiveGm) return Results.StatusCode(403);
            return Results.Ok(await CampaignEncounterRepository.ListAsync(repo, campaignId, ct));
        });

        group.MapPost("/campaigns/{campaignId:int}/encounters", async (
            int campaignId, JsonElement encounterPayload, string? role,
            HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var (user, access) = await Bestiary.BestiaryCampaignEndpoints.ResolveAsync(ctx, campaignId, role, repo, ct);
            if (user is null) return Results.Unauthorized();
            if (!access.IsEffectiveGm) return Results.StatusCode(403);
            if (encounterPayload.ValueKind != JsonValueKind.Object ||
                !encounterPayload.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(id.GetString()) || id.GetString()!.Length > 64 ||
                !encounterPayload.TryGetProperty("campaignId", out var campaign) || !campaign.TryGetInt32(out var cid) || cid != campaignId)
                return Results.BadRequest(new { message = "An encounter must belong to this campaign and have a valid ID." });
            await CampaignEncounterRepository.SaveAsync(repo, campaignId, id.GetString()!, encounterPayload, ct);
            return Results.Ok(encounterPayload);
        });

        group.MapPost("/campaigns/{campaignId:int}/combat/resolve", async (
            int campaignId, CombatResolutionRequest req, HttpContext ctx, LoomWeaverMySqlRepository repo,
            IHubContext<TableRealtimeHub> hub, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Results.StatusCode(403);
            var outcome = await CombatTokenStore.AttackAsync(repo, campaignId, access, req, ct);
            if (outcome.Result is null) return Results.Json(new { error = outcome.Error }, statusCode: outcome.StatusCode);
            await NotifyAsync(hub, campaignId, ct);
            return Results.Ok(outcome.Result);
        });

        group.MapPost("/campaigns/{campaignId:int}/combat/resolve-step", async (
            int campaignId, EncounterAttackStepRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsAccountGm) return Results.StatusCode(403);
            var pipeline = new EncounterReactionPipelineService(new ActionStudioMySqlRepository(mysql));
            return Results.Ok(await pipeline.ExecuteAttackStepAsync(req with { CampaignId = campaignId }, ct));
        });

        group.MapPost("/campaigns/{campaignId:int}/encounters/{encounterId}/complete", async (
            int campaignId, string encounterId, EncounterCompletionRequest req,
            HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsAccountGm)
                return Results.Json(new { error = "Only the GM can conclude an encounter and award XP." }, statusCode: 403);
            if (string.IsNullOrWhiteSpace(encounterId) || encounterId.Length > 64)
                return Results.BadRequest(new { error = "Invalid encounter." });
            var outcome = await EncounterRewardService.AwardAsync(repo, campaignId, encounterId, req.TotalXp, access.Username, ct);
            return outcome.Result is null
                ? Results.Json(new { error = outcome.Error }, statusCode: outcome.StatusCode)
                : Results.Ok(outcome.Result);
        });
    }
}
