using System.Text.Json.Nodes;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using static LoomWeaver.Modules.Items.ItemRepository;

namespace LoomWeaver.Modules.Items;

public static class ItemCollectionEndpoints
{
    public static void MapItemCollectionEndpoints(this IEndpointRouteBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/item-collections", async (int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            if (member?.Role != "gm") return Results.Forbid();
            var list = await ReadAsync(db, "collection", user.Id, false, campaignId, ct);
            return Results.Ok(list.Where(x => Text(x, "creatorAccountId") == user.AccountId));
        });
        api.MapPost("/campaigns/{campaignId:int}/item-collections", async (int campaignId, JsonObject req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            if (member?.Role != "gm") return Results.Forbid();
            if (Text(req, "name").Length is < 1 or > 140 || Text(req, "description").Length > 2000)
                return Results.BadRequest(new { error = "A collection needs a name of up to 140 characters and description up to 2000 characters." });
            var id = Text(req, "id");
            if (id.Length > 0)
            {
                var existing = await FindAsync(db, id, user.Id, ct, "collection");
                if (existing is null || Text(existing, "creatorAccountId") != user.AccountId || existing["campaignId"]?.GetValue<int>() != campaignId)
                    return Results.NotFound();
            }
            else id = $"col-{Guid.NewGuid():N}";
            if (req["itemIds"] is not JsonArray ids || ids.Count > 500) return Results.BadRequest(new { error = "Choose up to 500 items." });
            var publish = req["publishedToStore"]?.GetValue<bool>() ?? false;
            foreach (var node in ids)
            {
                var key = node?.GetValue<string>() ?? "";
                var item = ItemCatalog.Find(key) ?? await ItemDbCatalog.FindAsync(db, key, ct) ?? await FindAsync(db, key, user.Id, ct);
                if (item is null || (publish && item["isHomebrew"]?.GetValue<bool>() == true && item["publishedToStore"]?.GetValue<bool>() != true))
                    return Results.BadRequest(new { error = "Collections may only contain accessible items. Publish each homebrew item before publishing its collection." });
            }
            req["id"] = id; req["campaignId"] = campaignId;
            req["creatorAccountId"] = user.AccountId; req["createdByUsername"] = user.Username;
            req["storePriceLabel"] = "Free ($0.00)"; req["updatedAtLabel"] = "Saved";
            await SaveAsync(db, "collection", user.Id, campaignId, req, ct);
            return Results.Ok(req);
        });
    }
}
