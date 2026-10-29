using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Maps.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Maps.Features.SaveScene;

public sealed record SaveMapSceneDocumentRequest(int ExpectedRevision, JsonElement Document);

public static class MapSceneDocumentEndpoints
{
    public static void MapMapSceneDocumentEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapGet("/campaigns/{campaignId:int}/maps/{sceneKey}/document", LoadAsync);
        group.MapPut("/campaigns/{campaignId:int}/maps/{sceneKey}/document", SaveAsync);
    }

    private static async Task<IResult> LoadAsync(
        int campaignId,
        string sceneKey,
        HttpContext context,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct)
    {
        var access = await CampaignAccessResolver.ResolveAsync(context, campaignId, null, ct);
        if (!access.IsAccountGm) return Results.Forbid();
        var stored = await MapSceneDocumentRepository.LoadAsync(mysql, campaignId, sceneKey, ct);
        return stored is null
            ? Results.NotFound(new { error = "No saved server scene exists yet." })
            : Results.Ok(new { revision = stored.Revision, document = stored.Document });
    }

    private static async Task<IResult> SaveAsync(
        int campaignId,
        string sceneKey,
        SaveMapSceneDocumentRequest request,
        HttpContext context,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct)
    {
        var access = await CampaignAccessResolver.ResolveAsync(context, campaignId, null, ct);
        if (!access.IsAccountGm) return Results.Forbid();
        if (sceneKey.Length is < 1 or > 64 || request.ExpectedRevision < 0 ||
            request.Document.ValueKind != JsonValueKind.Object)
            return Results.BadRequest(new { error = "A valid scene key, revision and scene document are required." });

        if (!request.Document.TryGetProperty("sceneKey", out var key) ||
            key.ValueKind != JsonValueKind.String ||
            !string.Equals(key.GetString(), sceneKey, StringComparison.Ordinal))
            return Results.BadRequest(new { error = "Scene document key must match the route." });

        var json = request.Document.GetRawText();
        if (json.Length > 10 * 1024 * 1024)
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

        var revision = await MapSceneDocumentRepository.SaveAsync(
            mysql, campaignId, sceneKey, request.ExpectedRevision, json, access.Username, ct);
        return revision is null
            ? Results.Conflict(new { error = "A newer server scene exists. Reload before saving again." })
            : Results.Ok(new { revision });
    }
}
