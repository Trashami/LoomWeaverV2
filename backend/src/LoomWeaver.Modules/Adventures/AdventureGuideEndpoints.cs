using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.Neo4j;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Adventures;

public static class AdventureGuideEndpoints
{
    public static RouteGroupBuilder MapAdventureGuideEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/adventure-guide", (
            int campaignId,
            string? role,
            string? scopeKind,
            string? scopeId,
            string? filter,
            HttpContext httpContext) =>
        {
            var isGm = CampaignAccessResolver.Resolve(httpContext, campaignId, role).IsEffectiveGm;
            var guide = AdventureGuideStateStore.BuildGuide(campaignId, isGm, scopeKind, scopeId, filter);
            return Results.Ok(guide);
        });

        api.MapPost("/campaigns/{campaignId:int}/adventure-guide/beats/{beatId}/toggle", (
            int campaignId,
            string beatId,
            string? role,
            string? scopeKind,
            string? scopeId,
            string? filter,
            HttpContext httpContext) =>
        {
            var access = CampaignAccessResolver.Resolve(httpContext, campaignId, role);
            if (!access.IsAccountGm)
                return Results.Json(new { message = "GM authorization required." }, statusCode: 403);
            AdventureGuideStateStore.ToggleBeat(beatId);
            return Results.Ok(AdventureGuideStateStore.BuildGuide(campaignId, access.IsEffectiveGm, scopeKind, scopeId, filter));
        });

        api.MapPost("/campaigns/{campaignId:int}/adventure-guide/nodes/{nodeId}/state", (
            int campaignId,
            string nodeId,
            UpdateNodeProgressStateRequest req,
            string? scopeKind,
            string? scopeId,
            string? filter,
            HttpContext httpContext) =>
        {
            var access = CampaignAccessResolver.Resolve(httpContext, campaignId, req.Role);
            if (!access.IsAccountGm)
                return Results.Json(new { message = "GM authorization required." }, statusCode: 403);
            AdventureGuideStateStore.UpdateNodeState(nodeId, req.ProgressState, req.OutcomeNotes);
            return Results.Ok(AdventureGuideStateStore.BuildGuide(campaignId, access.IsEffectiveGm, scopeKind, scopeId, filter));
        });

        api.MapPost("/campaigns/{campaignId:int}/adventure-guide/grants", (
            int campaignId,
            GrantAdventureKnowledgeRequest req,
            string? role,
            string? scopeKind,
            string? scopeId,
            string? filter,
            HttpContext httpContext) =>
        {
            var access = CampaignAccessResolver.Resolve(httpContext, campaignId, role);
            if (!access.IsAccountGm)
                return Results.Json(new { message = "GM authorization required to grant knowledge." }, statusCode: 403);
            AdventureGuideStateStore.GrantKnowledge(req);
            return Results.Ok(AdventureGuideStateStore.BuildGuide(campaignId, access.IsEffectiveGm, scopeKind, scopeId, filter));
        });

        api.MapPost("/campaigns/{campaignId:int}/adventure-guide/rewards/award", async (
            int campaignId,
            AwardAdventureRewardRequest req,
            string? role,
            string? scopeKind,
            string? scopeId,
            string? filter,
            HttpContext httpContext,
            LoomWeaver.Infrastructure.MySql.LoomWeaverMySqlRepository repo,
            CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(httpContext, campaignId, role, ct);
            if (!access.IsAccountGm)
                return Results.Json(new { message = "GM authorization required to award rewards." }, statusCode: 403);
            if (string.IsNullOrWhiteSpace(req.NodeId) || req.NodeId.Length > 128)
                return Results.BadRequest(new { message = "A valid node is required." });
            var key = $"adventure:{campaignId}:{(string.IsNullOrWhiteSpace(req.IdempotencyKey) ? req.NodeId : req.IdempotencyKey)}";
            key = key[..Math.Min(key.Length, 120)];
            var award = await LoomWeaver.Modules.Encounters.EncounterRewardService.AwardPartyAsync(
                repo, campaignId, req.NodeId, key, Math.Max(0, req.XpAmount),
                $"Adventure reward {req.CurrencyOrItemLabel}", "adventure_xp", access.Username, false, ct);
            var newlyAwarded = award.Result is not null;
            if (newlyAwarded) AdventureGuideStateStore.AwardReward(req with { IdempotencyKey = key });
            var guide = AdventureGuideStateStore.BuildGuide(campaignId, access.IsEffectiveGm, scopeKind, scopeId, filter);
            return Results.Ok(new
            {
                newlyAwarded,
                xpAwarded = award.Result?.TotalXpAwarded ?? 0,
                message = award.Result?.Summary ?? award.Error,
                guide
            });
        });

        api.MapPost("/campaigns/{campaignId:int}/adventure-guide/npcs", async (
            int campaignId,
            CreateAdventureNpcRequest req,
            LoomWeaverNeo4jService graph,
            string? role,
            string? scopeKind,
            string? scopeId,
            string? filter,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var access = CampaignAccessResolver.Resolve(httpContext, campaignId, role);
            if (!access.IsAccountGm)
                return Results.Json(new { message = "GM authorization required." }, statusCode: 403);
            var isGm = access.IsEffectiveGm;
            var cleanName = string.IsNullOrWhiteSpace(req.Name) ? "Wandering Chapel Pilgrim" : req.Name.Trim();
            var slug = cleanName.ToLowerInvariant().Replace(' ', '-');
            var nodeId = $"node-npc-{slug}";
            var compositeKey = $"{campaignId}:NPC:npc-{slug}";
            var disp = string.IsNullOrWhiteSpace(req.DispositionLabel) ? "Cautious" : req.DispositionLabel.Trim();
            var tone = disp.Equals("Hostile", StringComparison.OrdinalIgnoreCase)
                ? "crimson"
                : disp.Equals("Allied", StringComparison.OrdinalIgnoreCase) || disp.Equals("Guarded", StringComparison.OrdinalIgnoreCase)
                    ? "emerald"
                    : "gold";
            var locNode = string.IsNullOrWhiteSpace(req.LocationNodeId) ? "node-room-c1-nave" : req.LocationNodeId;
            var sesId = string.IsNullOrWhiteSpace(req.SessionId) ? "session-15" : req.SessionId;
            var vis = string.Equals(req.Visibility, "gm", StringComparison.OrdinalIgnoreCase) ? "gm" : "players";

            var item = AdventureGuideStateStore.RegisterCharacterOrNpc(
                campaignId,
                nodeId,
                compositeKey,
                cleanName,
                string.IsNullOrWhiteSpace(req.Role) ? $"Chapel Envoy · {disp}" : req.Role.Trim(),
                disp,
                tone,
                string.IsNullOrWhiteSpace(req.ArtworkUrl) ? "/icrandor_world_dashboard.jpg" : req.ArtworkUrl.Trim(),
                string.IsNullOrWhiteSpace(req.Motive) ? "Investigate the tremors beneath the Ruined Chapel." : req.Motive.Trim(),
                string.IsNullOrWhiteSpace(req.DialogueExcerpt) ? $"\"The lantern light in {locNode} does not reach the crypt steps.\"" : req.DialogueExcerpt.Trim(),
                $"Present in {locNode.Replace("node-room-", "").ToUpperInvariant()} · Linked to {sesId}",
                $"/campaigns?inspect=npc-{slug}",
                vis);

            await graph.ProjectCharacterOrNpcNodeAsync(
                campaignId,
                new EntitySummaryDto(
                    compositeKey,
                    campaignId,
                    "NPC",
                    $"npc-{slug}",
                    item.Name,
                    item.Role,
                    item.Motive,
                    vis,
                    "approved",
                    item.RouteLink),
                sesId,
                $"{campaignId}:Location:{locNode}",
                ct);

            return Results.Ok(AdventureGuideStateStore.BuildGuide(campaignId, isGm, scopeKind, scopeId, filter));
        });

        api.MapPost("/campaigns/{campaignId:int}/adventure-guide/assign-map", async (
            int campaignId,
            AssignBattlemapToAdventureRequest req,
            LoomWeaverNeo4jService graph,
            string? role,
            string? scopeKind,
            string? scopeId,
            string? filter,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var access = CampaignAccessResolver.Resolve(httpContext, campaignId, role);
            if (!access.IsAccountGm)
                return Results.Json(new { message = "GM authorization required." }, statusCode: 403);
            var isGm = access.IsEffectiveGm;
            var assigned = AdventureGuideStateStore.AssignBattlemap(req);

            await graph.ProjectBattlemapAssignmentAsync(
                campaignId,
                assigned.SceneKey,
                assigned.Title,
                assigned.SessionId,
                $"{campaignId}:Location:{assigned.LocationNodeId}",
                ct);

            return Results.Ok(AdventureGuideStateStore.BuildGuide(campaignId, isGm, scopeKind, scopeId, filter));
        });

        return api;
    }
}
