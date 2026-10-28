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
            api.MapCompendiumAndStudioEndpoints();
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
            var baseCampaigns = await repo.GetCampaignsAsync(ct);
            var list = new List<object>();

            try
            {
                await using var db = await repo.OpenConnectionAsync(ct);
                var uid = caller?.Id ?? 1L;
                await using var cmd = new MySqlCommand("""
                    SELECT c.id, c.name, COALESCE(c.description, ''), c.dm_user_id,
                           COALESCE(m.role, CASE WHEN c.dm_user_id = @u THEN 'dm' ELSE 'player' END) AS my_role,
                           m.character_id, m.character_name
                    FROM jane_scrum.mw_campaigns c
                    LEFT JOIN jane_scrum.mw_campaign_members m ON m.campaign_id = c.id AND m.user_id = @u
                    WHERE c.dm_user_id = @u OR m.user_id = @u OR @isAdmin = 1
                    ORDER BY c.id
                    """, db);
                var isAdmin = caller is null || caller.Id == 1 || caller.Role == "gm";
                cmd.Parameters.AddWithValue("@u", uid);
                cmd.Parameters.AddWithValue("@isAdmin", isAdmin ? 1 : 0);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var cid = r.GetInt32(0);
                    var name = r.GetString(1);
                    var desc = r.GetString(2);
                    var dmId = r.GetInt64(3);
                    var rawRole = r.GetString(4);
                    var myRole = rawRole is "gm" or "dm" ? "dm" : "player";
                    var myCharId = r.IsDBNull(5) ? (long?)null : r.GetInt64(5);
                    var myCharName = r.IsDBNull(6) ? null : r.GetString(6);
                    var match = baseCampaigns.FirstOrDefault(b => b.Id == cid) ?? baseCampaigns.FirstOrDefault();

                    list.Add(new
                    {
                        id = cid,
                        slug = match?.Slug ?? $"campaign-{cid}",
                        name,
                        subtitle = string.IsNullOrWhiteSpace(desc) ? (match?.Subtitle ?? "Living World Campaign") : desc,
                        description = desc,
                        systemCode = match?.SystemCode ?? "dnd5e",
                        worldName = match?.WorldName ?? "Icrandor",
                        currentAct = match?.CurrentAct ?? "ACT I",
                        currentSessionNumber = match?.CurrentSessionNumber ?? 1,
                        currentLocationName = match?.CurrentLocationName ?? "Cinth",
                        weaveEnabled = match?.WeaveEnabled ?? true,
                        dm_user_id = dmId,
                        my_role = myRole,
                        my_character_id = myCharId,
                        my_character_name = myCharName ?? (myRole == "dm" ? "Dungeon Master" : caller?.BoundCharacter)
                    });
                }
            }
            catch { }

            if (list.Count == 0)
            {
                var isGm = caller is null || caller.Role == "gm";
                foreach (var c in baseCampaigns)
                {
                    list.Add(new
                    {
                        id = c.Id,
                        slug = c.Slug,
                        name = c.Name,
                        subtitle = c.Subtitle,
                        description = c.Subtitle,
                        systemCode = c.SystemCode,
                        worldName = c.WorldName,
                        currentAct = c.CurrentAct,
                        currentSessionNumber = c.CurrentSessionNumber,
                        currentLocationName = c.CurrentLocationName,
                        weaveEnabled = c.WeaveEnabled,
                        dm_user_id = 1L,
                        my_role = isGm ? "dm" : "player",
                        my_character_id = isGm ? (long?)null : 16L,
                        my_character_name = isGm ? "Dungeon Master" : (caller?.BoundCharacter ?? "Dal Riata")
                    });
                }
            }

            return Results.Ok(list);
        });

        api.MapGet("/campaigns/{campaignId:int}", async (int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            var isGm = caller is null || caller.Role == "gm";
            var baseCampaigns = await repo.GetCampaignsAsync(ct);
            var c = baseCampaigns.FirstOrDefault(x => x.Id == campaignId) ?? baseCampaigns[0];
            return Results.Ok(new
            {
                id = campaignId,
                slug = c.Slug,
                name = c.Name,
                subtitle = c.Subtitle,
                description = c.Subtitle,
                systemCode = c.SystemCode,
                worldName = c.WorldName,
                currentAct = c.CurrentAct,
                currentSessionNumber = c.CurrentSessionNumber,
                currentLocationName = c.CurrentLocationName,
                weaveEnabled = c.WeaveEnabled,
                dm_user_id = 1L,
                my_role = isGm ? "dm" : "player",
                my_character_id = isGm ? (long?)null : 16L,
                my_character_name = isGm ? "Dungeon Master" : (caller?.BoundCharacter ?? "Dal Riata")
            });
        });

        api.MapGet("/campaigns/{campaignId:int}/entities", async (
            int campaignId,
            string? role,
            string? type,
            LoomWeaverMySqlRepository repo,
            CancellationToken ct) =>
        {
            var viewerRole = NormalizeRole(role);
            var entities = await repo.GetAuthorizedEntitiesAsync(campaignId, viewerRole, type, ct);
            return Results.Ok(entities);
        });

        api.MapGet("/campaigns/{campaignId:int}/scenes", async (
            int campaignId,
            string? role,
            LoomWeaverMySqlRepository repo,
            CancellationToken ct) =>
        {
            var viewerRole = NormalizeRole(role);
            var scenes = await repo.GetAuthorizedScenesAsync(campaignId, viewerRole, ct);
            return Results.Ok(scenes);
        });

        api.MapGet("/campaigns/{campaignId:int}/graph", async (
            int campaignId,
            string? role,
            LoomWeaverNeo4jService graph,
            CancellationToken ct) =>
        {
            var viewerRole = NormalizeRole(role);
            var subgraph = await graph.GetAuthorizedSubgraphAsync(campaignId, viewerRole, ct);
            return Results.Ok(subgraph);
        });

        api.MapGet("/campaigns/{campaignId:int}/loom", async (
            int campaignId,
            string? q,
            string? role,
            LoomWeaverMySqlRepository repo,
            CancellationToken ct) =>
        {
            var viewerRole = NormalizeRole(role);
            var queryText = string.IsNullOrWhiteSpace(q) ? "What is happening in Cinth?" : q.Trim();
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
