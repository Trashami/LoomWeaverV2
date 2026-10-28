using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Bestiary;

/// <summary>
/// Campaign-aware bestiary endpoints. Authorization is per campaign (a user can be DM in one campaign and a player in
/// another): DM prep data (collections, token/3D assignments, placements) and Loom canon writes require the caller to be
/// the effective GM of <c>campaignId</c>; players only ever receive sightings they are allowed to know.
/// </summary>
public static class BestiaryCampaignEndpoints
{
    private static readonly object Forbidden = new { message = "Only the DM of this campaign can manage its bestiary prep." };

    public static RouteGroupBuilder MapBestiaryCampaignEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/bestiary/state", async (
            int campaignId, string? role, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
            if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
            if (!access.IsEffectiveGm) return Results.Json(Forbidden, statusCode: 403);
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            return Results.Ok(new CampaignBestiaryStateDto(
                campaignId, true,
                BestiaryCreatorStore.OwnedCollections(user.Id).Select(BestiaryCreatorStore.ToDto).ToList(),
                BestiaryCampaignStore.AssignmentsFor(campaignId),
                BestiaryCampaignStore.PlacementsFor(campaignId)));
        });

        api.MapPost("/campaigns/{campaignId:int}/bestiary/collections", (
            int campaignId, string? role, SaveMonsterCollectionRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
            SaveCollection(campaignId, role, null, req, ctx, mysql, ct));

        api.MapPut("/campaigns/{campaignId:int}/bestiary/collections/{collectionId}", (
            int campaignId, string collectionId, string? role, SaveMonsterCollectionRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
            SaveCollection(campaignId, role, collectionId.Trim(), req, ctx, mysql, ct));

        api.MapDelete("/campaigns/{campaignId:int}/bestiary/collections/{collectionId}", async (
            int campaignId, string collectionId, string? role, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
            if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
            if (!access.IsEffectiveGm) return Results.Json(Forbidden, statusCode: 403);
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var error = await BestiaryCreatorStore.DeleteCollectionAsync(mysql, user.Id, collectionId.Trim(), ct);
            return error is null ? Results.NoContent() : Results.Json(new { message = error }, statusCode: error.StartsWith("Only") ? 403 : 404);
        });

        api.MapPut("/campaigns/{campaignId:int}/bestiary/assignments/{monsterKey}", async (
            int campaignId, string monsterKey, string? role, SaveMonsterAssignmentRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
            if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
            if (!access.IsEffectiveGm) return Results.Json(Forbidden, statusCode: 403);
            if (string.IsNullOrWhiteSpace(monsterKey) || monsterKey.Length > 64) return Results.BadRequest(new { message = "Invalid monster key." });
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var saved = await BestiaryCampaignStore.SaveAssignmentAsync(mysql, campaignId, monsterKey.Trim(), req, user.Id, BestiaryEndpoints.CreditName(user), ct);
            return Results.Ok(saved);
        });

        api.MapPost("/campaigns/{campaignId:int}/bestiary/placements", async (
            int campaignId, string? role, AddMonsterPlacementRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
            if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
            if (!access.IsEffectiveGm) return Results.Json(Forbidden, statusCode: 403);
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var (placement, error) = await BestiaryCampaignStore.AddPlacementAsync(mysql, campaignId, req, BestiaryEndpoints.CreditName(user), ct);
            return placement is null ? Results.BadRequest(new { message = error }) : Results.Ok(placement);
        });

        api.MapDelete("/campaigns/{campaignId:int}/bestiary/placements/{placementId}", async (
            int campaignId, string placementId, string? role, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
            if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
            if (!access.IsEffectiveGm) return Results.Json(Forbidden, statusCode: 403);
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            return await BestiaryCampaignStore.RemovePlacementAsync(mysql, campaignId, placementId.Trim(), ct) ? Results.NoContent() : Results.NotFound();
        });

        api.MapGet("/campaigns/{campaignId:int}/bestiary/sightings", async (
            int campaignId, string? monsterKey, string? role, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
            if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var key = string.IsNullOrWhiteSpace(monsterKey) ? null : monsterKey.Trim();
            return Results.Ok(BestiaryCampaignStore.SightingsVisibleTo(campaignId, access.IsEffectiveGm, access.BoundCharacterKey, key));
        });

        api.MapPost("/campaigns/{campaignId:int}/bestiary/sightings", async (
            int campaignId, string? role, RecordMonsterSightingRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
            if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
            if (!access.IsEffectiveGm) return Results.Json(new { message = "Only the DM can record what the party met. The Loom never invents canon." }, statusCode: 403);
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var (sighting, error) = await BestiaryCampaignStore.RecordSightingAsync(mysql, campaignId, req, BestiaryEndpoints.CreditName(user), ct);
            if (sighting is null) return Results.BadRequest(new { message = error });
            if (sighting.Visibility == "party")
                TableRealtimeEndpoints.RecordEvent(campaignId, "monster_sighting", "The Loom", $"{sighting.MonsterName}: {sighting.Outcome}", "{}");
            return Results.Ok(sighting);
        });

        api.MapPost("/campaigns/{campaignId:int}/bestiary/encounters/concluded", async (
            int campaignId, string? role, MonsterEncounterConcludedRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
            if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
            if (!access.IsEffectiveGm) return Results.Json(Forbidden, statusCode: 403);
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var recorded = new List<MonsterSightingDto>();
            foreach (var m in (req.Monsters ?? Array.Empty<MonsterOutcomeEntry>()).Take(40))
            {
                var (sighting, _) = await BestiaryCampaignStore.RecordSightingAsync(mysql, campaignId, new RecordMonsterSightingRequest(
                    m.MonsterKey, m.MonsterName, string.IsNullOrWhiteSpace(m.Outcome) ? "defeated" : m.Outcome,
                    req.SessionId, req.SessionLabel, req.LocationName, req.EncounterId, req.EncounterLabel,
                    req.WitnessCharacterKeys, "party", "Recorded automatically when the encounter concluded.", null),
                    BestiaryEndpoints.CreditName(user), ct);
                if (sighting is not null) recorded.Add(sighting);
            }
            return Results.Ok(recorded);
        });

        return api;
    }

    private static async Task<IResult> SaveCollection(
        int campaignId, string? role, string? collectionId, SaveMonsterCollectionRequest req,
        HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct)
    {
        var (user, access) = await ResolveAsync(ctx, campaignId, role, mysql, ct);
        if (user is null) return Results.Unauthorized();
            if (access.UserId == 0) return Results.Json(Forbidden, statusCode: 403);
        if (!access.IsEffectiveGm) return Results.Json(Forbidden, statusCode: 403);
        await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
        var allowedCampaigns = new HashSet<int>();
        foreach (var cid in req.AssignedCampaignIds ?? Array.Empty<int>())
            if ((await ResolveAsync(ctx, cid, role, mysql, ct)).Access.IsEffectiveGm) allowedCampaigns.Add(cid);
        var (record, error) = await BestiaryCreatorStore.SaveCollectionAsync(
            mysql, user.Id, BestiaryEndpoints.CreditName(user), collectionId, req,
            cid => allowedCampaigns.Contains(cid), ct);
        return record is null
            ? Results.Json(new { message = error }, statusCode: error?.StartsWith("Only") == true || error?.Contains("DM") == true ? 403 : 400)
            : Results.Ok(BestiaryCreatorStore.ToDto(record));
    }

    public static async Task<(StoredUserRecord? User, ResolvedCampaignAccess Access)> ResolveAsync(
        HttpContext ctx, int campaignId, string? role, LoomWeaverMySqlRepository mysql, CancellationToken ct)
    {
        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        var denied = new ResolvedCampaignAccess(0, "", "", "players", "players", false, false, "");
        if (user is null) return (null, denied);
        await using var db = await mysql.OpenConnectionAsync(ct);
        var member = await LoomWeaver.Modules.Items.ItemRepository.MemberAsync(db, campaignId, user.Id, ct);
        if (member is null) return (user, denied);
        var gm = BestiaryAccessPolicy.IsEffectiveGm(member.Value.Role, role);
        return (user, new ResolvedCampaignAccess(user.Id, user.Email, user.Username, member.Value.Role,
            gm ? "gm" : "players", member.Value.Role == "gm", gm, member.Value.Character));
    }
}
