using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Merchants;

public static class MerchantEndpoints
{
    public static RouteGroupBuilder MapMerchantEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/merchants", async (
            int campaignId, string? characterKey, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var merchants = await MerchantRepository.ListMerchantsAsync(mysql, campaignId, characterKey, ct);
            return Results.Ok(merchants);
        });

        api.MapPost("/campaigns/{campaignId:int}/merchants", async (
            int campaignId, CreateMerchantRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var id = await MerchantTradeService.CreateMerchantAsync(mysql, campaignId, req, ct);
            var created = await MerchantRepository.GetMerchantAsync(mysql, id, campaignId, null, ct);
            return Results.Created($"/campaigns/{campaignId}/merchants/{id}", created);
        });

        api.MapGet("/campaigns/{campaignId:int}/merchants/{merchantId:long}", async (
            int campaignId, long merchantId, string? characterKey, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var merchant = await MerchantRepository.GetMerchantAsync(mysql, merchantId, campaignId, characterKey, ct);
            if (merchant is null) return Results.NotFound(new { message = $"Merchant {merchantId} not found." });
            return Results.Ok(merchant);
        });

        api.MapPut("/campaigns/{campaignId:int}/merchants/{merchantId:long}", async (
            int campaignId, long merchantId, UpdateMerchantRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var ok = await MerchantTradeService.UpdateMerchantAsync(mysql, merchantId, campaignId, req, ct);
            if (!ok) return Results.NotFound(new { message = $"Merchant {merchantId} not found." });
            var updated = await MerchantRepository.GetMerchantAsync(mysql, merchantId, campaignId, null, ct);
            return Results.Ok(updated);
        });

        api.MapDelete("/campaigns/{campaignId:int}/merchants/{merchantId:long}", async (
            int campaignId, long merchantId, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var ok = await MerchantTradeService.DeleteMerchantAsync(mysql, merchantId, campaignId, ct);
            return ok ? Results.NoContent() : Results.NotFound();
        });

        api.MapGet("/campaigns/{campaignId:int}/merchants/{merchantId:long}/inventory", async (
            int campaignId, long merchantId, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var items = await MerchantRepository.ListInventoryAsync(mysql, merchantId, ct);
            return Results.Ok(items);
        });

        api.MapPost("/campaigns/{campaignId:int}/merchants/{merchantId:long}/inventory", async (
            int campaignId, long merchantId, CreateInventoryItemRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var id = await MerchantTradeService.AddInventoryItemAsync(mysql, merchantId, req, ct);
            return Results.Ok(new { id, message = "Item added to merchant inventory." });
        });

        api.MapPut("/campaigns/{campaignId:int}/merchants/{merchantId:long}/inventory/{inventoryId:long}", async (
            int campaignId, long merchantId, long inventoryId, UpdateInventoryItemRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var ok = await MerchantTradeService.UpdateInventoryItemAsync(mysql, inventoryId, req, ct);
            return ok ? Results.Ok(new { message = "Item updated." }) : Results.NotFound();
        });

        api.MapDelete("/campaigns/{campaignId:int}/merchants/{merchantId:long}/inventory/{inventoryId:long}", async (
            int campaignId, long merchantId, long inventoryId, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var ok = await MerchantTradeService.DeleteInventoryItemAsync(mysql, inventoryId, ct);
            return ok ? Results.NoContent() : Results.NotFound();
        });

        api.MapGet("/campaigns/{campaignId:int}/merchants/{merchantId:long}/wallet", async (
            int campaignId, long merchantId, string? characterKey, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var wallet = await MerchantRepository.GetWalletAsync(mysql, campaignId, characterKey, ct);
            return Results.Ok(wallet);
        });

        api.MapPost("/campaigns/{campaignId:int}/merchants/{merchantId:long}/wallet", async (
            int campaignId, long merchantId, string characterKey, UpdateWalletRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            await using var db = await mysql.OpenConnectionAsync(ct);
            await MerchantStore.SetWalletAsync(db, campaignId, "character", characterKey, req.PersonalGoldGp, 0, 0, ct);
            await MerchantStore.SetWalletAsync(db, campaignId, "party", "party-pool", req.PartyGoldGp, 0, 0, ct);
            var updated = await MerchantRepository.GetWalletAsync(mysql, campaignId, characterKey, ct);
            return Results.Ok(updated);
        });

        api.MapPost("/campaigns/{campaignId:int}/merchants/{merchantId:long}/buy", async (
            int campaignId, long merchantId, BuyItemRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            var userId = caller?.Id ?? 1;

            var result = await MerchantTradeService.ProcessBuyAsync(mysql, merchantId, campaignId, req, userId, ct);
            if (!result.Success)
            {
                return Results.BadRequest(new { message = result.Message });
            }
            return Results.Ok(new { success = true, message = result.Message, wallet = result.Wallet });
        });

        api.MapPost("/campaigns/{campaignId:int}/merchants/{merchantId:long}/sell", async (
            int campaignId, long merchantId, SellItemRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            var userId = caller?.Id ?? 1;

            var result = await MerchantTradeService.ProcessSellAsync(mysql, merchantId, campaignId, req, userId, ct);
            if (!result.Success)
            {
                return Results.BadRequest(new { message = result.Message });
            }
            return Results.Ok(new { success = true, message = result.Message, wallet = result.Wallet });
        });

        api.MapPost("/campaigns/{campaignId:int}/merchants/{merchantId:long}/restock", async (
            int campaignId, long merchantId, RestockFromTableRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var count = await MerchantRollTableService.RestockFromTableAsync(mysql, merchantId, campaignId, req, ct);
            var updatedItems = await MerchantRepository.ListInventoryAsync(mysql, merchantId, ct);
            return Results.Ok(new { itemsAdded = count, inventory = updatedItems });
        });

        api.MapGet("/campaigns/{campaignId:int}/merchants/{merchantId:long}/transactions", async (
            int campaignId, long merchantId, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var txs = await MerchantRollTableService.ListTransactionsAsync(mysql, merchantId, campaignId, ct);
            return Results.Ok(txs);
        });

        api.MapGet("/campaigns/{campaignId:int}/campaign-roll-tables", async (
            int campaignId, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var tables = await MerchantRollTableService.ListCampaignRollTablesAsync(mysql, campaignId, ct);
            return Results.Ok(tables);
        });

        api.MapPost("/campaigns/{campaignId:int}/campaign-roll-tables", async (
            int campaignId, AttachRollTableRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var id = await MerchantRollTableService.AttachRollTableAsync(mysql, campaignId, req, ct);
            return Results.Ok(new { id, message = "Roll table attached to campaign/session/merchant." });
        });

        api.MapDelete("/campaigns/{campaignId:int}/campaign-roll-tables/{id:long}", async (
            int campaignId, long id, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (caller is null) return Results.Unauthorized();

            var ok = await MerchantRollTableService.RemoveRollTableAttachmentAsync(mysql, id, campaignId, ct);
            return ok ? Results.NoContent() : Results.NotFound();
        });

        return api;
    }
}
