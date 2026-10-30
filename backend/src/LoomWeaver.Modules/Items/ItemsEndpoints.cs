using System.Text.Json.Nodes;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using static LoomWeaver.Modules.Items.ItemRepository;

namespace LoomWeaver.Modules.Items;

public static class ItemsEndpoints
{
    public static void MapItemsEndpoints(this IEndpointRouteBuilder api)
    {
        api.MapGet("/items", async (HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            await using var db = await OpenAsync(repo, ct);
            var items = await ItemDbCatalog.ListAsync(db, ct);
            items.AddRange(await ReadAsync(db, "item", user?.Id ?? -1, false, null, ct));
            return Results.Ok(items);
        });
        api.MapGet("/marketplace/items", async (LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            await using var db = await OpenAsync(repo, ct);
            return Results.Ok(await ReadAsync(db, "item", -1, true, null, ct));
        });
        api.MapGet("/marketplace/item-collections", async (LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            await using var db = await OpenAsync(repo, ct);
            // Merchant/location preparations stay private even when the collection is published.
            var collections = await ReadAsync(db, "collection", -1, true, null, ct);
            foreach (var c in collections)
            {
                c.Remove("assignedMerchantName"); c.Remove("assignedLocationKey"); c.Remove("assignedLocationName");
                c.Remove("campaignId"); c.Remove("creatorAccountId");
            }
            return Results.Ok(collections);
        });
        api.MapPost("/items/custom", async (JsonObject req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            var error = ItemCatalog.Validate(req);
            if (error is not null) return Results.BadRequest(new { error });
            req["id"] = $"hb-{Guid.NewGuid():N}";
            req["creatorUsername"] = user.Username; req["creatorAccountId"] = user.AccountId;
            req["isHomebrew"] = true; req["source"] = "Homebrew";
            req["priceLabel"] = $"{req["priceGp"]} GP"; req["storePriceLabel"] = "Free ($0.00)";
            await using var db = await OpenAsync(repo, ct);
            await SaveAsync(db, "item", user.Id, 0, req, ct);
            return Results.Ok(req);
        });
        api.MapPost("/items/{id}/publish-store", async (string id, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var item = await FindAsync(db, id, user.Id, ct);
            if (item is null || Text(item, "creatorAccountId") != user.AccountId) return Results.NotFound();
            item["publishedToStore"] = true; item["storePriceLabel"] = "Free ($0.00)";
            await SaveAsync(db, "item", user.Id, 0, item, ct);
            return Results.Ok(item);
        });
        api.MapItemCollectionEndpoints();
        api.MapItemInventoryEndpoints();
    }
}
