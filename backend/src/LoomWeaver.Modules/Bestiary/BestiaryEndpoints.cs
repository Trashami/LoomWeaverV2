using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Bestiary;

/// <summary>
/// Account-level bestiary endpoints: browse the monster database, read full statblocks, and create/publish custom
/// monsters. Any signed-in user may create and publish; published community monsters are always free and credit
/// the creator's username (taken from the authenticated account, never from the request body).
/// </summary>
public static class BestiaryEndpoints
{
    public static RouteGroupBuilder MapBestiaryEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/bestiary/monsters", async (
            string? search, string? type, string? source, double? crMin, double? crMax, string? sort, int? offset, int? limit,
            string? keys, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            if (!string.IsNullOrWhiteSpace(keys))
            {
                var keyList = keys.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Where(k => k.Length <= 64).Distinct(StringComparer.OrdinalIgnoreCase).Take(500).ToList();
                return Results.Ok(await BestiaryCatalogRepository.ListByKeysAsync(mysql, user.Id, keyList, ct));
            }
            var page = await BestiaryCatalogRepository.ListAsync(mysql, user.Id,
                new BestiaryListQuery(search, type, source, crMin, crMax, sort, offset ?? 0, limit ?? 48), ct);
            return Results.Ok(page);
        });

        api.MapGet("/bestiary/monsters/{key}", async (string key, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var detail = await BestiaryCatalogRepository.GetDetailAsync(mysql, key.Trim(), user.Id, ct);
            return detail is null ? Results.NotFound(new { message = "Monster not found or not visible to your account." }) : Results.Ok(detail);
        });

        api.MapPost("/bestiary/custom-monsters", async (
            SaveCustomMonsterRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var (record, error) = await BestiaryCreatorStore.SaveCustomAsync(mysql, user.Id, CreditName(user), null, req, ct);
            return record is null
                ? Results.BadRequest(new { message = error })
                : Results.Ok(BestiaryDetailFactory.FromCustom(BestiaryCreatorStore.Summarize(record, user.Id), record.Statblock, record.CreatedAt));
        });

        api.MapPut("/bestiary/custom-monsters/{key}", async (
            string key, SaveCustomMonsterRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var (record, error) = await BestiaryCreatorStore.SaveCustomAsync(mysql, user.Id, CreditName(user), key.Trim(), req, ct);
            return record is null
                ? Results.Json(new { message = error }, statusCode: error?.StartsWith("Only") == true ? 403 : 400)
                : Results.Ok(BestiaryDetailFactory.FromCustom(BestiaryCreatorStore.Summarize(record, user.Id), record.Statblock, record.CreatedAt));
        });

        api.MapPost("/bestiary/custom-monsters/{key}/publish", async (
            string key, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await BestiaryPersistence.EnsureReadyAsync(mysql, ct);
            var (record, error) = await BestiaryCreatorStore.PublishAsync(mysql, user.Id, key.Trim(), ct);
            return record is null
                ? Results.Json(new { message = error }, statusCode: error?.StartsWith("Only") == true ? 403 : 404)
                : Results.Ok(BestiaryCreatorStore.Summarize(record, user.Id));
        });

        api.MapBestiaryCampaignEndpoints();
        return api;
    }

    /// <summary>Public creator credit: the account username (falls back to display name).</summary>
    public static string CreditName(StoredUserRecord user) =>
        !string.IsNullOrWhiteSpace(user.Username) ? user.Username.Trim() : (user.DisplayName ?? "Adventurer").Trim();
}
