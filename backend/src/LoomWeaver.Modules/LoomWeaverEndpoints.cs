using LoomWeaver.Domain;
using LoomWeaver.GameSystems;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;
using LoomWeaver.Infrastructure.Neo4j;
using LoomWeaver.Modules.Actions;
using LoomWeaver.Modules.ActionStudio;
using LoomWeaver.Modules.Adventures;
using LoomWeaver.Modules.Audio;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Bestiary;
using LoomWeaver.Modules.Items;
using LoomWeaver.Modules.Characters;
using LoomWeaver.Modules.Dice;
using LoomWeaver.Modules.EffectStudio;
using LoomWeaver.Modules.Encounters;
using LoomWeaver.Modules.Knowledge;
using LoomWeaver.Modules.Maps;
using LoomWeaver.Modules.Marketplace;
using LoomWeaver.Modules.Realtime;
using LoomWeaver.Modules.Sessions;
using LoomWeaver.Modules.Statistics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules;

public static class LoomWeaverEndpoints
{
    public static IEndpointRouteBuilder MapLoomWeaverModules(this IEndpointRouteBuilder app)
    {
        foreach (var prefix in new[] { "/api/v2", "/api/v1", "/api" })
        {
            var api = app.MapGroup(prefix);
            api.MapCharacterStudioEndpoints();
            api.MapLoomMapsEndpoints();
            api.MapCombatEncounterEndpoints();
            api.MapActionAndEffectEndpoints();
            api.MapActionStudioEndpoints();
            api.MapEffectStudioEndpoints();
            api.MapDiceForgeEndpoints();
            api.MapAudioAmbienceEndpoints();
            api.MapCampaignAnalyticsEndpoints();
            api.MapLoomAndWeaveEndpoints();
            api.MapWorldLoreEndpoints();
            api.MapConnectedStoryEndpoints();
            api.MapMarketplaceAndQuestEndpoints();
            api.MapSessionChronicleEndpoints();
            api.MapCampaignDashboardEndpoints();
            api.MapAdventureGuideEndpoints();
            api.MapTableRealtimeEndpoints();
            api.MapAuthAndCheckoutEndpoints();
            api.MapCampaignInviteEndpoints();
            api.MapCompendiumAndStudioEndpoints();
            api.MapDeckEndpoints();
            api.MapSourceBookEndpoints();
            api.MapBestiaryEndpoints();
            api.MapItemsEndpoints();
            MapCoreEndpoints(api);
        }

        return app;
    }

    private static void MapCoreEndpoints(RouteGroupBuilder api)
    {

        api.MapGet("/health", () => Results.Ok(new
        {
            status = "healthy",
            application = "LoomWeaverV2",
            mysqlDatabase = "loomweaver",
            neo4jNamespace = "loomweaver",
            timestamp = DateTimeOffset.UtcNow
        }));

        api.MapGet("/campaigns", async (HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            // Only campaigns where the caller holds a lw_campaign_members row are listed.
            var memberships = await CampaignMembershipStore.ListForUserAsync(repo, caller, ct);
            var baseCampaigns = await repo.GetCampaignsAsync(ct);
            var list = new List<object>();

            foreach (var m in memberships)
            {
                var match = baseCampaigns.FirstOrDefault(b => b.Id == m.CampaignId);
                var name = match?.Name ?? $"Campaign {m.CampaignId}";
                var desc = match?.Subtitle ?? "Living World Campaign";

                list.Add(new
                {
                    id = m.CampaignId,
                    slug = match?.Slug ?? $"campaign-{m.CampaignId}",
                    name,
                    subtitle = desc,
                    description = desc,
                    systemCode = match?.SystemCode ?? "dnd5e",
                    worldName = match?.WorldName ?? "Your World",
                    currentAct = match?.CurrentAct ?? "ACT I",
                    currentSessionNumber = match?.CurrentSessionNumber ?? 1,
                    currentLocationName = match?.CurrentLocationName ?? "Starting Location",
                    weaveEnabled = match?.WeaveEnabled ?? true,
                    my_role = m.IsGm ? "dm" : "player",
                    my_character_key = m.CharacterKey
                });
            }

            return Results.Ok(list);
        });

        api.MapGet("/campaigns/{campaignId:int}", async (int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            var membership = (ctx.Items[CampaignAccessResolver.ItemKey] as CampaignAccessContext)?.Membership;
            var baseCampaigns = await repo.GetCampaignsAsync(ct);
            var c = baseCampaigns.FirstOrDefault(x => x.Id == campaignId);
            var isGm = access.IsAccountGm;
            return Results.Ok(new
            {
                id = campaignId,
                slug = c?.Slug ?? $"campaign-{campaignId}",
                name = c?.Name ?? $"Campaign {campaignId}",
                subtitle = c?.Subtitle ?? string.Empty,
                description = c?.Subtitle ?? string.Empty,
                systemCode = c?.SystemCode ?? "dnd5e",
                worldName = c?.WorldName ?? "Your World",
                currentAct = c?.CurrentAct ?? "ACT I",
                currentSessionNumber = c?.CurrentSessionNumber ?? 1,
                currentLocationName = c?.CurrentLocationName ?? "Starting Location",
                weaveEnabled = c?.WeaveEnabled ?? true,
                my_role = isGm ? "dm" : "player",
                my_character_key = membership?.CharacterKey
            });
        });

        api.MapGet("/campaigns/{campaignId:int}/entities", async (
            int campaignId,
            string? role,
            string? type,
            HttpContext ctx,
            LoomWeaverMySqlRepository repo,
            CancellationToken ct) =>
        {
            var viewerRole = CampaignAccessResolver.Resolve(ctx, campaignId, role).EffectiveViewerRole;
            var entities = await repo.GetAuthorizedEntitiesAsync(campaignId, viewerRole, type, ct);
            return Results.Ok(entities);
        });

        api.MapGet("/campaigns/{campaignId:int}/scenes", async (
            int campaignId,
            string? role,
            HttpContext ctx,
            LoomWeaverMySqlRepository repo,
            CancellationToken ct) =>
        {
            var viewerRole = CampaignAccessResolver.Resolve(ctx, campaignId, role).EffectiveViewerRole;
            var scenes = await repo.GetAuthorizedScenesAsync(campaignId, viewerRole, ct);
            return Results.Ok(scenes);
        });

        api.MapGet("/campaigns/{campaignId:int}/graph", async (
            int campaignId,
            string? role,
            HttpContext ctx,
            LoomWeaverNeo4jService graph,
            CancellationToken ct) =>
        {
            var viewerRole = CampaignAccessResolver.Resolve(ctx, campaignId, role).EffectiveViewerRole;
            var subgraph = await graph.GetAuthorizedSubgraphAsync(campaignId, viewerRole, ct);
            return Results.Ok(subgraph);
        });

        api.MapGet("/campaigns/{campaignId:int}/loom", async (
            int campaignId,
            string? q,
            string? role,
            HttpContext ctx,
            LoomWeaverMySqlRepository repo,
            CancellationToken ct) =>
        {
            var viewerRole = CampaignAccessResolver.Resolve(ctx, campaignId, role).EffectiveViewerRole;
            var queryText = string.IsNullOrWhiteSpace(q) ? "What is happening in my campaign?" : q.Trim();
            var entities = await repo.GetAuthorizedEntitiesAsync(campaignId, viewerRole, null, ct);
            var matches = entities
                .Where(e =>
                    e.Name.Contains(queryText, StringComparison.OrdinalIgnoreCase) ||
                    e.Summary.Contains(queryText, StringComparison.OrdinalIgnoreCase) ||
                    e.Subtitle.Contains(queryText, StringComparison.OrdinalIgnoreCase))
                .Take(5)
                .ToList();

            if (matches.Count == 0)
            {
                matches = entities.Take(4).ToList();
            }

            var citations = matches
                .Select(m => new LoomCitationDto(
                    m.CompositeKey,
                    m.Name,
                    m.EntityType,
                    m.Summary,
                    m.RouteLink,
                    m.Visibility))
                .ToList();

            var synthesis = $"[The Loom · Role-Scoped ({viewerRole.ToUpperInvariant()}) Canon Synthesis]: Grounded in {citations.Count} authorized campaign record(s) from the 'loomweaver' database and graph. Zero invented lore.";
            return Results.Ok(new LoomQueryResponseDto(campaignId, queryText, viewerRole, synthesis, citations));
        });

        api.MapGet("/assets", async (string? category, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var assets = await repo.GetAssetsAsync(category, ct);
            return Results.Ok(assets);
        });

        api.MapPost("/dice/roll", (int sides, int count, int modifier, string? label) =>
        {
            var clampedSides = Math.Clamp(sides, 2, 100);
            var clampedCount = Math.Clamp(count, 1, 20);
            var rolls = Enumerable.Range(0, clampedCount)
                .Select(_ => Random.Shared.Next(1, clampedSides + 1))
                .ToArray();
            var rawSum = rolls.Sum();
            return Results.Ok(new
            {
                label = string.IsNullOrWhiteSpace(label) ? $"{clampedCount}d{clampedSides}" : label,
                sides = clampedSides,
                count = clampedCount,
                rolls,
                modifier,
                total = rawSum + modifier,
                isNat20 = clampedSides == 20 && rolls.Contains(20),
                isNat1 = clampedSides == 20 && rolls.Contains(1),
                serverAuthoritative = true,
                timestamp = DateTimeOffset.UtcNow
            });
        });
    }

    private static string NormalizeRole(string? role) =>
        string.Equals(role, "gm", StringComparison.OrdinalIgnoreCase) ? "gm" : "players";
}
