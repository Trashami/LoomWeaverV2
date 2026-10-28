using System.Text.Json.Nodes;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using static LoomWeaver.Modules.Items.ItemRepository;

namespace LoomWeaver.Modules.Items;

public static class ItemInventoryEndpoints
{
    public static void MapItemInventoryEndpoints(this IEndpointRouteBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/items-context", async (int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            if (member is null) return Results.Forbid();
            return Results.Ok(new { characterKey = CharacterKey(member.Value.Character), isGm = member.Value.Role == "gm" });
        });
        api.MapGet("/campaigns/{campaignId:int}/characters/{characterKey}/items", async (int campaignId, string characterKey, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            if (member is null || !ItemAccessPolicy.CanUseCharacter(member.Value.Character, characterKey)) return Results.Forbid();
            var rows = await ReadAsync(db, "inventory", user.Id, false, campaignId, ct);
            return Results.Ok(rows.Where(x => Text(x, "characterKey") == CharacterKey(characterKey)).Select(x => x["equipment"]));
        });
        api.MapPost("/campaigns/{campaignId:int}/characters/{characterKey}/items", async (int campaignId, string characterKey, JsonObject req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await OpenAsync(repo, ct);
            var member = await MemberAsync(db, campaignId, user.Id, ct);
            // Always require an actual campaign character binding; never infer one from global account role.
            if (member is null || string.IsNullOrEmpty(member.Value.Character) || !ItemAccessPolicy.CanUseCharacter(member.Value.Character, characterKey)) return Results.Forbid();
            var item = ItemCatalog.Find(Text(req, "itemId")) ?? await FindAsync(db, Text(req, "itemId"), user.Id, ct);
            if (item is null || item["category"] is null) return Results.NotFound();
            var equipment = new JsonObject
            {
                ["id"] = $"inv-{Guid.NewGuid():N}", ["name"] = Text(item, "name"),
                ["slot"] = Text(item, "slot"), ["summary"] = Text(item, "shortDescription"),
                ["bonusLabel"] = Text(item, "damageOrEffectLabel"), ["acBonus"] = item["acBonus"]?.DeepClone(),
                ["attackBonus"] = item["attackBonus"]?.DeepClone(), ["equipped"] = req["equipNow"]?.GetValue<bool>() ?? false,
                ["entitlement"] = "free", ["icon"] = "inventory_2", ["weightLb"] = item["weightLb"]?.DeepClone(),
                ["valueGp"] = item["priceGp"]?.DeepClone(), ["rarity"] = Text(item, "rarity"), ["source"] = Text(item, "source")
            };
            var row = new JsonObject { ["id"] = Text(equipment, "id"), ["characterKey"] = CharacterKey(characterKey), ["equipment"] = equipment };
            await SaveAsync(db, "inventory", user.Id, campaignId, row, ct);
            return Results.Ok(equipment);
        });
    }
}
