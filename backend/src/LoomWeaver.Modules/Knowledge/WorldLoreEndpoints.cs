using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Knowledge;

public static class WorldLoreEndpoints
{
    public static RouteGroupBuilder MapWorldLoreEndpoints(this RouteGroupBuilder api)
    {
        var world=Maps.Features.WorldAtlas.AtlasAccess.WorldLoreGroup(api);
        world.MapGet("", async (
            int campaignId,
            string? role,
            string? mapId,
            HttpContext httpContext, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            await Maps.Features.WorldAtlas.AtlasLocationBridge.Hydrate(repo,campaignId,ct);
            var isGm = IsGm(httpContext, campaignId, role);
            return Results.Ok(BuildWorkspace(campaignId, isGm, mapId));
        });

        world.MapGet("/locations/{locationKey}", async (
            int campaignId,
            string locationKey,
            string? role,
            HttpContext httpContext, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            await Maps.Features.WorldAtlas.AtlasLocationBridge.Hydrate(repo,campaignId,ct);
            var isGm = IsGm(httpContext, campaignId, role);
            var list = GetCampaignList(WorldLoreStateStore.LocationsByCampaign, campaignId);
            var found = list.FirstOrDefault(l =>
                string.Equals(l.LocationKey, locationKey, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(l.CompositeKey, locationKey, StringComparison.OrdinalIgnoreCase));

            if (found is null || (!isGm && (found.Visibility == "gm" || found.DiscoveryStatus == "undiscovered")))
            {
                return Results.NotFound(new { message = "Location not found or not authorized." });
            }

            return Results.Ok(SanitizeLocationForViewer(found, isGm));
        });

        world.MapPost("/locations", async (
            int campaignId,
            string? role,
            UpsertLocationRequest req,
            HttpContext httpContext, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            if (!IsGm(httpContext, campaignId, role))
            {
                return Results.Json(new { message = "GM authorization required to create or edit locations." }, statusCode: 403);
            }

            var locs = EnsureCampaignList(WorldLoreStateStore.LocationsByCampaign, campaignId);
            var markers = EnsureCampaignList(WorldLoreCatalogStore.MarkersByCampaign, campaignId);
            var maps = EnsureCampaignList(WorldLoreStateStore.MapsByCampaign, campaignId);

            var cleanName = string.IsNullOrWhiteSpace(req.Name) ? "New World Landmark" : req.Name.Trim();
            var key = string.IsNullOrWhiteSpace(req.LocationKey)
                ? $"loc-{Slugify(cleanName)}-{DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 10000}"
                : req.LocationKey.Trim();
            var compositeKey = $"{campaignId}:Location:{key}";
            var targetMapId = !string.IsNullOrWhiteSpace(req.MapId)
                ? req.MapId.Trim()
                : (maps.FirstOrDefault()?.MapId ?? $"map-campaign-{campaignId}");

            var existingIdx = locs.FindIndex(l => l.LocationKey == key);
            var existing = existingIdx >= 0 ? locs[existingIdx] : null;

            var updated = new LocationInspectorDetailDto(
                key,
                compositeKey,
                campaignId,
                cleanName,
                string.IsNullOrWhiteSpace(req.LocationType) ? "Settlement" : req.LocationType.Trim(),
                string.IsNullOrWhiteSpace(req.HierarchyLevel) ? "Settlement" : req.HierarchyLevel.Trim(),
                req.ParentLocationKey,
                existing?.ParentLocationName ?? "Campaign Realm",
                string.IsNullOrWhiteSpace(req.ArtworkUrl) ? (existing?.ArtworkUrl ?? "/icrandor_world_dashboard.jpg") : req.ArtworkUrl.Trim(),
                string.IsNullOrWhiteSpace(req.Description) ? "Recorded in the campaign world atlas." : req.Description.Trim(),
                string.IsNullOrWhiteSpace(req.DiscoveryStatus) ? "known" : req.DiscoveryStatus.Trim(),
                $"{req.YPercent:F1}° N, {req.XPercent:F1}° E",
                targetMapId,
                req.ChildMapId ?? existing?.ChildMapId,
                req.LinkedSceneKey ?? existing?.LinkedSceneKey,
                NormalizeVis(req.Visibility),
                req.Attributes ?? existing?.Attributes ?? [new("Region", "Charted Frontier")],
                req.HistoricalBackground ?? existing?.HistoricalBackground ?? "Chronicled by the Game Master.",
                req.CultureAndTraditions ?? existing?.CultureAndTraditions ?? "Local customs awaiting further observation.",
                req.LocalMyths ?? existing?.LocalMyths ?? "Whispers travel along the trade roads.",
                req.Tags ?? existing?.Tags ?? ["Locations"],
                existing?.LinkedLoreIds ?? [],
                existing?.RelatedEntities ?? [],
                existing?.HistoryEvents ?? [],
                existing?.Secrets ?? [],
                req.AttachedSessionId ?? existing?.AttachedSessionId,
                req.AttachedSessionLabel ?? existing?.AttachedSessionLabel,
                req.PlayerVisibilityPolicy ?? existing?.PlayerVisibilityPolicy ?? "auto_lore_revealed",
                req.Style ?? existing?.Style
            );

            if (existingIdx >= 0) locs[existingIdx] = updated;
            else locs.Insert(0, updated);

            var mIdx = markers.FindIndex(m => m.LocationKey == key && m.MapId == targetMapId);
            var existingMarker = mIdx >= 0 ? markers[mIdx] : null;
            var markerCategory = existingMarker?.Category ?? MapLocationTypeToLayer(updated.LocationType, updated.Visibility);
            var markerDto = new WorldMapMarkerDto(
                existingMarker?.MarkerId ?? $"m-{key}",
                targetMapId,
                key,
                compositeKey,
                updated.Name,
                updated.LocationType,
                markerCategory,
                updated.HierarchyLevel,
                Math.Clamp(req.XPercent <= 0 ? (existingMarker?.XPercent ?? 50) : req.XPercent, 2, 98),
                Math.Clamp(req.YPercent <= 0 ? (existingMarker?.YPercent ?? 50) : req.YPercent, 2, 98),
                updated.DiscoveryStatus,
                updated.Visibility,
                updated.ChildMapId,
                updated.LinkedSceneKey,
                updated.RelatedEntities.Count(r => r.EntityType == "Quest"),
                updated.RelatedEntities.Count(r => r.EntityType == "NPC"),
                updated.Secrets.Count,
                updated.AttachedSessionId,
                updated.AttachedSessionLabel,
                updated.PlayerVisibilityPolicy,
                updated.Style
            );
            if (mIdx >= 0) markers[mIdx] = markerDto;
            else markers.Add(markerDto);

            await Maps.Features.WorldAtlas.AtlasLocationBridge.PersistExisting(repo,campaignId,updated,req.XPercent,req.YPercent,ct);
            return Results.Ok(updated);
        });

        world.MapPost("/locations/{locationKey}/links", (
            int campaignId,
            string locationKey,
            string? role,
            LinkEntityToLocationRequest req,
            HttpContext httpContext) =>
        {
            if (!IsGm(httpContext, campaignId, role))
            {
                return Results.Json(new { message = "GM authorization required." }, statusCode: 403);
            }

            var locs = EnsureCampaignList(WorldLoreStateStore.LocationsByCampaign, campaignId);
            var idx = locs.FindIndex(l => l.LocationKey == locationKey || l.CompositeKey == locationKey);
            if (idx < 0) return Results.NotFound(new { message = "Location not found." });

            var cur = locs[idx];
            var relList = cur.RelatedEntities.ToList();
            var newRel = new LocationRelatedEntityDto(
                string.IsNullOrWhiteSpace(req.TargetCompositeKey) ? $"{campaignId}:NPC:linked-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}" : req.TargetCompositeKey.Trim(),
                string.IsNullOrWhiteSpace(req.TargetName) ? "Linked World Entity" : req.TargetName.Trim(),
                string.IsNullOrWhiteSpace(req.TargetSubtitle) ? req.EntityType : req.TargetSubtitle.Trim(),
                string.IsNullOrWhiteSpace(req.EntityType) ? "NPC" : req.EntityType.Trim(),
                string.IsNullOrWhiteSpace(req.RelationshipLabel) ? "Connected" : req.RelationshipLabel.Trim(),
                "/campaigns",
                NormalizeVis(req.Visibility)
            );

            if (!relList.Any(r => r.CompositeKey == newRel.CompositeKey))
            {
                relList.Insert(0, newRel);
            }

            var updated = cur with { RelatedEntities = relList };
            locs[idx] = updated;
            return Results.Ok(updated);
        });

        world.MapPost("/locations/{locationKey}/secrets/{secretId}/reveal", (
            int campaignId,
            string locationKey,
            string secretId,
            string? role,
            HttpContext httpContext) =>
        {
            if (!IsGm(httpContext, campaignId, role))
            {
                return Results.Json(new { message = "GM authorization required to reveal secrets." }, statusCode: 403);
            }

            var locs = EnsureCampaignList(WorldLoreStateStore.LocationsByCampaign, campaignId);
            var idx = locs.FindIndex(l => l.LocationKey == locationKey || l.CompositeKey == locationKey);
            if (idx < 0) return Results.NotFound(new { message = "Location not found." });

            var cur = locs[idx];
            var secrets = cur.Secrets
                .Select(s => s.Id == secretId ? s with { RevealedToPlayers = !s.RevealedToPlayers } : s)
                .ToList();

            // Keep secret text strictly inside protected Secret blocks; never mutate public Description prose
            var updated = cur with
            {
                Visibility = "players",
                DiscoveryStatus = cur.DiscoveryStatus == "undiscovered" ? "known" : cur.DiscoveryStatus,
                Secrets = secrets
            };
            locs[idx] = updated;
            return Results.Ok(updated);
        });

        world.MapPost("/maps/assign", (
            int campaignId,
            string? role,
            WorldMapSummaryDto req,
            HttpContext httpContext) =>
        {
            if (!IsGm(httpContext, campaignId, role))
            {
                return Results.Json(new { message = "GM authorization required." }, statusCode: 403);
            }

            var maps = EnsureCampaignList(WorldLoreStateStore.MapsByCampaign, campaignId);
            var mapId = string.IsNullOrWhiteSpace(req.MapId) ? $"map-{campaignId}-{DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 10000}" : req.MapId.Trim();
            var created = new WorldMapSummaryDto(
                mapId,
                campaignId,
                string.IsNullOrWhiteSpace(req.Name) ? "Campaign World Atlas" : req.Name.Trim(),
                string.IsNullOrWhiteSpace(req.ScopeLevel) ? "World" : req.ScopeLevel.Trim(),
                req.ParentMapId,
                req.ParentLocationKey,
                string.IsNullOrWhiteSpace(req.ImageUrl) ? "/icrandor_world_dashboard.jpg" : req.ImageUrl.Trim(),
                req.LinkedSceneKey,
                string.IsNullOrWhiteSpace(req.ScaleLabel) ? "0 — 100 — 200 Miles" : req.ScaleLabel.Trim(),
                string.IsNullOrWhiteSpace(req.CompassOrientation) ? "Top-Right North" : req.CompassOrientation.Trim(),
                1000,
                560,
                NormalizeVis(req.Visibility)
            );

            maps.RemoveAll(m => m.MapId == mapId);
            maps.Insert(0, created);
            return Results.Ok(BuildWorkspace(campaignId, true, mapId));
        });

        world.MapPost("/regions", async (
            int campaignId,
            string? role,
            UpsertRegionOverlayRequest req,
            LoomWeaverMySqlRepository repo,
            LoomWeaver.Infrastructure.Neo4j.LoomWeaverNeo4jService graph,
            HttpContext httpContext) =>
        {
            if (!IsGm(httpContext, campaignId, role))
            {
                return Results.Json(new { message = "GM authorization required to edit regions." }, statusCode: 403);
            }

            var updated = await ConnectedStoryEngine.UpsertRegionAndSyncAsync(campaignId, req, repo, graph);
            return Results.Ok(updated);
        });

        MapLoreAndHistoryEndpoints(world);
        return api;
    }

    private static void MapLoreAndHistoryEndpoints(RouteGroupBuilder world)
    {
        world.MapPost("/lore", (
            int campaignId,
            string? role,
            UpsertLoreEntryRequest req,
            HttpContext httpContext) =>
        {
            if (!IsGm(httpContext, campaignId, role))
            {
                return Results.Json(new { message = "GM authorization required." }, statusCode: 403);
            }

            if (string.IsNullOrWhiteSpace(req.Title) || string.IsNullOrWhiteSpace(req.Category))
            {
                return Results.BadRequest(new { message = "Title and category are required." });
            }

            var list = EnsureCampaignList(WorldLoreCatalogStore.LoreByCampaign, campaignId);
            var cleanTitle = req.Title.Trim();
            var cleanCat = req.Category.Trim();
            if (!WorldLoreStateStore.DefaultCategories.Contains(cleanCat, StringComparer.OrdinalIgnoreCase))
            {
                WorldLoreStateStore.DefaultCategories.Add(cleanCat);
            }

            var id = string.IsNullOrWhiteSpace(req.Id)
                ? $"lore-{Slugify(cleanTitle)}-{DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 10000}"
                : req.Id.Trim();
            var existingIdx = list.FindIndex(e => e.Id == id);
            var existing = existingIdx >= 0 ? list[existingIdx] : null;
            var content = string.IsNullOrWhiteSpace(req.Content)
                ? (req.Excerpt ?? $"{cleanTitle} — cataloged under {cleanCat}.")
                : req.Content.Trim();
            var excerpt = string.IsNullOrWhiteSpace(req.Excerpt)
                ? (content.Length > 160 ? content[..157] + "..." : content)
                : req.Excerpt.Trim();

            var entry = new LoreEntryDto(
                id,
                $"{campaignId}:Lore:{id}",
                campaignId,
                cleanTitle,
                string.IsNullOrWhiteSpace(req.Subtitle) ? cleanCat : req.Subtitle.Trim(),
                cleanCat,
                excerpt,
                content,
                string.IsNullOrWhiteSpace(req.ArtworkUrl) ? (existing?.ArtworkUrl ?? "/icrandor_world_dashboard.jpg") : req.ArtworkUrl.Trim(),
                req.Tags ?? existing?.Tags ?? [cleanCat],
                req.LinkedEntityKeys ?? existing?.LinkedEntityKeys ?? [],
                existing?.ResolvedLinks ?? [],
                NormalizeVis(req.Visibility),
                req.Archived,
                existing?.CreatedAtLabel ?? "Just now",
                "Just now",
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            );

            if (existingIdx >= 0) list[existingIdx] = entry;
            else list.Insert(0, entry);

            return Results.Ok(entry);
        });

        world.MapPost("/history", (
            int campaignId,
            string? role,
            CreateWorldHistoryEventRequest req,
            HttpContext httpContext) =>
        {
            if (!IsGm(httpContext, campaignId, role))
            {
                return Results.Json(new { message = "GM authorization required." }, statusCode: 403);
            }

            var list = EnsureCampaignList(WorldLoreCatalogStore.HistoryByCampaign, campaignId);
            var ev = new WorldHistoryChronicleEventDto(
                $"ev-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                campaignId,
                string.IsNullOrWhiteSpace(req.Title) ? "Recorded Historical Milestone" : req.Title.Trim(),
                string.IsNullOrWhiteSpace(req.EraName) ? "Current Campaign Chronicle" : req.EraName.Trim(),
                string.IsNullOrWhiteSpace(req.WorldDateLabel) ? "1004 A.M." : req.WorldDateLabel.Trim(),
                list.Count * 10 + 10,
                req.SessionNumber,
                req.SessionNumber.HasValue ? $"Session {req.SessionNumber.Value}" : "World Lore Record",
                string.IsNullOrWhiteSpace(req.Category) ? "Major Historical Events" : req.Category.Trim(),
                string.IsNullOrWhiteSpace(req.Summary) ? "Added to the campaign world timeline." : req.Summary.Trim(),
                req.LocationKey,
                req.LocationKey,
                null,
                [],
                NormalizeVis(req.Visibility)
            );
            list.Add(ev);
            return Results.Ok(ev);
        });

        world.MapGet("/autocomplete", async (
            int campaignId,
            string? role,
            string? q,
            LoomWeaverMySqlRepository repo,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var isGm = IsGm(httpContext, campaignId, role);
            var entities = await repo.GetAuthorizedEntitiesAsync(campaignId, isGm ? "gm" : "players", null, ct);
            var query = (q ?? "").Trim();
            var matches = entities
                .Where(e => string.IsNullOrEmpty(query) ||
                            e.Name.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                            e.EntityType.Contains(query, StringComparison.OrdinalIgnoreCase))
                .Take(8)
                .Select(e => new
                {
                    e.CompositeKey,
                    e.Name,
                    e.EntityType,
                    e.Subtitle,
                    e.Visibility
                })
                .ToList();
            return Results.Ok(matches);
        });
    }

    public static WorldLoreWorkspaceDto BuildWorkspace(int campaignId, bool isGm, string? requestedMapId)
    {
        var campaign = FallbackSeedData.Campaigns.FirstOrDefault(c => c.Id == campaignId)
            ?? new CampaignDto(campaignId, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, 0, string.Empty, false);
        var maps = GetCampaignList(WorldLoreStateStore.MapsByCampaign, campaignId)
            .Where(m => isGm || m.Visibility != "gm")
            .ToList();

        var activeMapId = !string.IsNullOrWhiteSpace(requestedMapId) && maps.Any(m => m.MapId == requestedMapId)
            ? requestedMapId
            : maps.FirstOrDefault()?.MapId;

        var overlays = GetCampaignList(WorldLoreStateStore.OverlaysByCampaign, campaignId)
            .Where(o => isGm || o.Visibility != "gm")
            .ToList();

        var markers = GetCampaignList(WorldLoreCatalogStore.MarkersByCampaign, campaignId)
            .Where(m => isGm || (m.Visibility != "gm" && m.DiscoveryStatus != "undiscovered"))
            .Select(m => isGm ? m : m with { SecretCount = 0 })
            .ToList();

        var waypoints = GetCampaignList(WorldLoreCatalogStore.WaypointsByCampaign, campaignId)
            .Where(w => isGm || w.Visibility != "gm")
            .ToList();

        var lore = GetCampaignList(WorldLoreCatalogStore.LoreByCampaign, campaignId)
            .Where(l => !l.Archived && (isGm || l.Visibility != "gm"))
            .ToList();

        var history = GetCampaignList(WorldLoreCatalogStore.HistoryByCampaign, campaignId)
            .Where(h => isGm || h.Visibility != "gm")
            .OrderBy(h => h.SortOrder)
            .ToList();

        var discoveries = GetCampaignList(WorldLoreCatalogStore.DiscoveriesByCampaign, campaignId)
            .Where(d => isGm || d.Visibility != "gm")
            .ToList();

        var visibleLocations = GetCampaignList(WorldLoreStateStore.LocationsByCampaign, campaignId)
            .Where(l => isGm || (l.Visibility != "gm" && l.DiscoveryStatus != "undiscovered"))
            .ToList();

        var stats = new WorldStatisticsSummaryDto(
            RegionCount: overlays.Count(o => o.OverlayType == "region") + visibleLocations.Count(l => l.HierarchyLevel == "Region"),
            LocationCount: visibleLocations.Count,
            NpcCount: FallbackSeedData.FilterEntities(campaignId, isGm, "NPC").Count,
            FactionCount: FallbackSeedData.FilterEntities(campaignId, isGm, "Faction").Count,
            ActiveQuestCount: FallbackSeedData.FilterEntities(campaignId, isGm, "Quest").Count,
            UnresolvedMysteryCount: isGm
                ? visibleLocations.Sum(l => l.Secrets.Count(s => !s.RevealedToPlayers)) + FallbackSeedData.FilterEntities(campaignId, true, "Clue").Count
                : FallbackSeedData.FilterEntities(campaignId, false, "Clue").Count
        );

        return new WorldLoreWorkspaceDto(
            campaign.Id, campaign.Name, campaign.WorldName, campaign.Subtitle,
            isGm ? "gm" : "players", campaign.WeaveEnabled, activeMapId,
            maps, overlays, markers, waypoints, lore,
            WorldLoreStateStore.DefaultCategories, history, discoveries, stats);
    }

    private static LocationInspectorDetailDto SanitizeLocationForViewer(LocationInspectorDetailDto loc, bool isGm)
    {
        if (isGm) return loc;
        return loc with
        {
            ChildMapId = loc.ChildMapId == "map-mountain-prison" ? null : loc.ChildMapId,
            RelatedEntities = loc.RelatedEntities.Where(r => r.Visibility != "gm").ToList(),
            HistoryEvents = loc.HistoryEvents.Where(h => h.Visibility != "gm").ToList(),
            Secrets = loc.Secrets.Where(s => s.RevealedToPlayers).ToList()
        };
    }

    private static bool IsGm(HttpContext httpContext, int campaignId, string? role) =>
        httpContext.Items.TryGetValue("world-lore-is-gm",out var permitted)
            ? permitted is true && !string.Equals(role,"players",StringComparison.OrdinalIgnoreCase)
            : false;

    private static string NormalizeVis(string? vis) =>
        string.Equals(vis, "gm", StringComparison.OrdinalIgnoreCase) ? "gm" : "players";

    private static string Slugify(string value) =>
        string.Join("-", value.ToLowerInvariant().Split([' ', '/', '\'', ':', ','], StringSplitOptions.RemoveEmptyEntries));

    private static string MapLocationTypeToLayer(string locationType, string visibility)
    {
        if (visibility == "gm") return "Secrets";
        var lower = locationType.ToLowerInvariant();
        if (lower.Contains("city") || lower.Contains("settlement") || lower.Contains("port") || lower.Contains("hold")) return "Settlements";
        if (lower.Contains("region") || lower.Contains("forest") || lower.Contains("plain")) return "Regions";
        if (lower.Contains("quest")) return "Quests";
        if (lower.Contains("faction") || lower.Contains("guild")) return "Factions";
        if (lower.Contains("encounter") || lower.Contains("ambush")) return "Encounters";
        return "Locations";
    }

    private static List<T> GetCampaignList<T>(Dictionary<int, List<T>> dict, int campaignId) =>
        dict.TryGetValue(campaignId, out var list) ? list : [];

    private static List<T> EnsureCampaignList<T>(Dictionary<int, List<T>> dict, int campaignId)
    {
        if (!dict.TryGetValue(campaignId, out var list))
        {
            list = [];
            dict[campaignId] = list;
        }
        return list;
    }
}
