using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Items;
using MySqlConnector;

namespace LoomWeaver.Modules.Merchants;

public static class MerchantTradeService
{
    public static async Task<long> CreateMerchantAsync(
        LoomWeaverMySqlRepository repo, int campaignId, CreateMerchantRequest req, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_merchants
              (campaign_id, store_name, merchant_name, tagline, description, greeting, image_url, banner_url,
               location_key, location_name, npc_key, npc_name, roll_table_id, roll_table_name, buy_rate_percent, markup_percent, is_unlocked)
            VALUES
              (@cid, @sname, @mname, @tag, @desc, @greet, @img, @bnr, @lkey, @lname, @nkey, @nname, @rtid, @rtname, @buy, @markup, @unlocked);
            SELECT LAST_INSERT_ID();
            """, db);

        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@sname", req.StoreName.Trim());
        cmd.Parameters.AddWithValue("@mname", req.MerchantName?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@tag", req.Tagline?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@desc", req.Description?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@greet", req.Greeting?.Trim() ?? "Welcome! How may I assist you today?");
        cmd.Parameters.AddWithValue("@img", req.ImageUrl?.Trim() ?? "/portraits/default-merchant.png");
        cmd.Parameters.AddWithValue("@bnr", req.BannerUrl?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@lkey", string.IsNullOrWhiteSpace(req.LocationKey) ? (object)DBNull.Value : req.LocationKey.Trim());
        cmd.Parameters.AddWithValue("@lname", req.LocationName?.Trim() ?? "Local Market");
        cmd.Parameters.AddWithValue("@nkey", string.IsNullOrWhiteSpace(req.NpcKey) ? (object)DBNull.Value : req.NpcKey.Trim());
        cmd.Parameters.AddWithValue("@nname", req.NpcName?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@rtid", req.RollTableId.HasValue ? (object)req.RollTableId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@rtname", req.RollTableName?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@buy", req.BuyRatePercent ?? 50);
        cmd.Parameters.AddWithValue("@markup", req.MarkupPercent ?? 100);
        cmd.Parameters.AddWithValue("@unlocked", req.IsUnlocked ?? true ? 1 : 0);

        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
    }

    public static async Task<bool> UpdateMerchantAsync(
        LoomWeaverMySqlRepository repo, long merchantId, int campaignId, UpdateMerchantRequest req, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        await using var cmd = new MySqlCommand("""
            UPDATE lw_merchants SET
              store_name = @sname, merchant_name = @mname, tagline = @tag, description = @desc,
              greeting = @greet, image_url = @img, banner_url = @bnr, location_key = @lkey,
              location_name = @lname, npc_key = @nkey, npc_name = @nname, roll_table_id = @rtid,
              roll_table_name = @rtname, buy_rate_percent = @buy, markup_percent = @markup, is_unlocked = @unlocked
            WHERE id = @mid AND campaign_id = @cid;
            """, db);

        cmd.Parameters.AddWithValue("@mid", merchantId);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@sname", req.StoreName.Trim());
        cmd.Parameters.AddWithValue("@mname", req.MerchantName?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@tag", req.Tagline?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@desc", req.Description?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@greet", req.Greeting?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@img", req.ImageUrl?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@bnr", req.BannerUrl?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@lkey", string.IsNullOrWhiteSpace(req.LocationKey) ? (object)DBNull.Value : req.LocationKey.Trim());
        cmd.Parameters.AddWithValue("@lname", req.LocationName?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@nkey", string.IsNullOrWhiteSpace(req.NpcKey) ? (object)DBNull.Value : req.NpcKey.Trim());
        cmd.Parameters.AddWithValue("@nname", req.NpcName?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@rtid", req.RollTableId.HasValue ? (object)req.RollTableId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@rtname", req.RollTableName?.Trim() ?? string.Empty);
        cmd.Parameters.AddWithValue("@buy", req.BuyRatePercent ?? 50);
        cmd.Parameters.AddWithValue("@markup", req.MarkupPercent ?? 100);
        cmd.Parameters.AddWithValue("@unlocked", req.IsUnlocked ?? true ? 1 : 0);

        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows > 0;
    }

    public static async Task<bool> DeleteMerchantAsync(
        LoomWeaverMySqlRepository repo, long merchantId, int campaignId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        await using var cmd = new MySqlCommand(
            "DELETE FROM lw_merchants WHERE id = @mid AND campaign_id = @cid;", db);
        cmd.Parameters.AddWithValue("@mid", merchantId);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows > 0;
    }

    public static async Task<long> AddInventoryItemAsync(
        LoomWeaverMySqlRepository repo, long merchantId, CreateInventoryItemRequest req, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        return await MerchantStore.InsertItemAsync(
            db, merchantId, req.ItemKey, req.Name, req.ItemType ?? "Item",
            req.Rarity ?? "common", req.Description ?? string.Empty,
            req.BaseValueGp, req.PriceGp, req.Quantity, req.IsFeatured ?? false, ct);
    }

    public static async Task<bool> UpdateInventoryItemAsync(
        LoomWeaverMySqlRepository repo, long inventoryId, UpdateInventoryItemRequest req, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        await using var cmd = new MySqlCommand("""
            UPDATE lw_merchant_inventory SET
              price_gp = @price, quantity = @qty, is_featured = @feat
            WHERE id = @id;
            """, db);
        cmd.Parameters.AddWithValue("@id", inventoryId);
        cmd.Parameters.AddWithValue("@price", req.PriceGp);
        cmd.Parameters.AddWithValue("@qty", req.Quantity);
        cmd.Parameters.AddWithValue("@feat", req.IsFeatured ? 1 : 0);

        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows > 0;
    }

    public static async Task<bool> DeleteInventoryItemAsync(
        LoomWeaverMySqlRepository repo, long inventoryId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        await using var cmd = new MySqlCommand("DELETE FROM lw_merchant_inventory WHERE id = @id;", db);
        cmd.Parameters.AddWithValue("@id", inventoryId);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    public static async Task<(bool Success, string Message, WalletDto? Wallet)> ProcessBuyAsync(
        LoomWeaverMySqlRepository repo, long merchantId, int campaignId, BuyItemRequest req, long callerUserId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);
        await using var tx = await db.BeginTransactionAsync(ct);

        // Fetch item
        await using var itemCmd = new MySqlCommand(
            "SELECT id, name, item_key, item_type, rarity, description, price_gp, quantity FROM lw_merchant_inventory WHERE id = @id AND merchant_id = @mid FOR UPDATE;", db, tx);
        itemCmd.Parameters.AddWithValue("@id", req.InventoryItemId);
        itemCmd.Parameters.AddWithValue("@mid", merchantId);

        await using var r = await itemCmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (false, "Item not found in this store.", null);

        var itemName = r.GetString(r.GetOrdinal("name"));
        var itemKey = r.GetString(r.GetOrdinal("item_key"));
        var itemType = r.GetString(r.GetOrdinal("item_type"));
        var rarity = r.GetString(r.GetOrdinal("rarity"));
        var desc = r.GetString(r.GetOrdinal("description"));
        var priceGp = r.GetDecimal(r.GetOrdinal("price_gp"));
        var currentQty = r.GetInt32(r.GetOrdinal("quantity"));
        await r.CloseAsync();

        if (currentQty != -1 && currentQty < req.Quantity)
            return (false, "Not enough stock available.", null);

        var totalCost = priceGp * req.Quantity;

        // Check wallet
        var walletType = req.UsePartyFunds ? "party" : "character";
        var ownerKey = req.UsePartyFunds ? "party-pool" : req.CharacterKey;

        await using var wCmd = new MySqlCommand(
            "SELECT gold_gp, silver_sp, copper_cp FROM lw_wallets WHERE campaign_id = @cid AND wallet_type = @wtype AND owner_key = @owner FOR UPDATE;", db, tx);
        wCmd.Parameters.AddWithValue("@cid", campaignId);
        wCmd.Parameters.AddWithValue("@wtype", walletType);
        wCmd.Parameters.AddWithValue("@owner", ownerKey);

        decimal curGp = 0, curSp = 0, curCp = 0;
        await using var wr = await wCmd.ExecuteReaderAsync(ct);
        if (await wr.ReadAsync(ct))
        {
            curGp = wr.GetDecimal(0);
            curSp = wr.GetDecimal(1);
            curCp = wr.GetDecimal(2);
        }
        await wr.CloseAsync();

        if (curGp < totalCost)
            return (false, $"Insufficient gold. Needed {totalCost:F1} GP, but only {curGp:F1} GP available.", null);

        // Deduct gold
        var newGp = curGp - totalCost;
        await using var updWCmd = new MySqlCommand("""
            INSERT INTO lw_wallets (campaign_id, wallet_type, owner_key, gold_gp, silver_sp, copper_cp)
            VALUES (@cid, @wtype, @owner, @gp, @sp, @cp)
            ON DUPLICATE KEY UPDATE gold_gp = @gp, silver_sp = @sp, copper_cp = @cp;
            """, db, tx);
        updWCmd.Parameters.AddWithValue("@cid", campaignId);
        updWCmd.Parameters.AddWithValue("@wtype", walletType);
        updWCmd.Parameters.AddWithValue("@owner", ownerKey);
        updWCmd.Parameters.AddWithValue("@gp", newGp);
        updWCmd.Parameters.AddWithValue("@sp", curSp);
        updWCmd.Parameters.AddWithValue("@cp", curCp);
        await updWCmd.ExecuteNonQueryAsync(ct);

        // Decrement merchant stock if not infinite
        if (currentQty != -1)
        {
            await using var updStock = new MySqlCommand(
                "UPDATE lw_merchant_inventory SET quantity = quantity - @buyQty WHERE id = @id;", db, tx);
            updStock.Parameters.AddWithValue("@buyQty", req.Quantity);
            updStock.Parameters.AddWithValue("@id", req.InventoryItemId);
            await updStock.ExecuteNonQueryAsync(ct);
        }

        // Record transaction
        await using var txInsert = new MySqlCommand("""
            INSERT INTO lw_merchant_transactions
              (merchant_id, campaign_id, character_key, character_name, transaction_type, item_name, quantity, unit_price_gp, total_gp, used_party_funds)
            VALUES
              (@mid, @cid, @ckey, @cname, 'buy', @iname, @qty, @unit, @total, @party);
            """, db, tx);
        txInsert.Parameters.AddWithValue("@mid", merchantId);
        txInsert.Parameters.AddWithValue("@cid", campaignId);
        txInsert.Parameters.AddWithValue("@ckey", req.CharacterKey);
        txInsert.Parameters.AddWithValue("@cname", req.CharacterName ?? req.CharacterKey);
        txInsert.Parameters.AddWithValue("@iname", itemName);
        txInsert.Parameters.AddWithValue("@qty", req.Quantity);
        txInsert.Parameters.AddWithValue("@unit", priceGp);
        txInsert.Parameters.AddWithValue("@total", totalCost);
        txInsert.Parameters.AddWithValue("@party", req.UsePartyFunds ? 1 : 0);
        await txInsert.ExecuteNonQueryAsync(ct);

        // Add to player inventory
        for (var i = 0; i < req.Quantity; i++)
        {
            var invId = $"inv-{Guid.NewGuid():N}";
            var equipment = new JsonObject
            {
                ["id"] = invId,
                ["name"] = itemName,
                ["slot"] = itemType,
                ["summary"] = desc,
                ["bonusLabel"] = string.Empty,
                ["acBonus"] = 0,
                ["attackBonus"] = 0,
                ["equipped"] = false,
                ["entitlement"] = "free",
                ["icon"] = "inventory_2",
                ["valueGp"] = (double)priceGp,
                ["rarity"] = rarity,
                ["source"] = "merchant"
            };
            var row = new JsonObject
            {
                ["id"] = invId,
                ["characterKey"] = ItemRepository.CharacterKey(req.CharacterKey),
                ["equipment"] = equipment
            };
            await ItemRepository.SaveAsync(db, "inventory", callerUserId, campaignId, row, ct);
        }

        await tx.CommitAsync(ct);

        var updatedWallet = await MerchantRepository.GetWalletAsync(repo, campaignId, req.CharacterKey, ct);
        return (true, $"Successfully purchased {req.Quantity}x {itemName} for {totalCost:F1} GP!", updatedWallet);
    }

    public static async Task<(bool Success, string Message, WalletDto? Wallet)> ProcessSellAsync(
        LoomWeaverMySqlRepository repo, long merchantId, int campaignId, SellItemRequest req, long callerUserId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        // Fetch merchant buyback rate
        await using var mCmd = new MySqlCommand(
            "SELECT buy_rate_percent FROM lw_merchants WHERE id = @mid AND campaign_id = @cid LIMIT 1;", db);
        mCmd.Parameters.AddWithValue("@mid", merchantId);
        mCmd.Parameters.AddWithValue("@cid", campaignId);
        var rateObj = await mCmd.ExecuteScalarAsync(ct);
        var rate = rateObj is not null ? Convert.ToInt32(rateObj) : 50;

        var unitPayout = Math.Round(req.BaseValueGp * (decimal)rate / 100m, 2);
        if (unitPayout <= 0) unitPayout = 1;
        var totalPayout = unitPayout * req.Quantity;

        await using var tx = await db.BeginTransactionAsync(ct);

        // Add gold to wallet
        var walletType = req.DepositToParty ? "party" : "character";
        var ownerKey = req.DepositToParty ? "party-pool" : req.CharacterKey;

        await using var wCmd = new MySqlCommand(
            "SELECT gold_gp, silver_sp, copper_cp FROM lw_wallets WHERE campaign_id = @cid AND wallet_type = @wtype AND owner_key = @owner FOR UPDATE;", db, tx);
        wCmd.Parameters.AddWithValue("@cid", campaignId);
        wCmd.Parameters.AddWithValue("@wtype", walletType);
        wCmd.Parameters.AddWithValue("@owner", ownerKey);

        decimal curGp = 0, curSp = 0, curCp = 0;
        await using var wr = await wCmd.ExecuteReaderAsync(ct);
        if (await wr.ReadAsync(ct))
        {
            curGp = wr.GetDecimal(0);
            curSp = wr.GetDecimal(1);
            curCp = wr.GetDecimal(2);
        }
        await wr.CloseAsync();

        var newGp = curGp + totalPayout;
        await using var updWCmd = new MySqlCommand("""
            INSERT INTO lw_wallets (campaign_id, wallet_type, owner_key, gold_gp, silver_sp, copper_cp)
            VALUES (@cid, @wtype, @owner, @gp, @sp, @cp)
            ON DUPLICATE KEY UPDATE gold_gp = @gp, silver_sp = @sp, copper_cp = @cp;
            """, db, tx);
        updWCmd.Parameters.AddWithValue("@cid", campaignId);
        updWCmd.Parameters.AddWithValue("@wtype", walletType);
        updWCmd.Parameters.AddWithValue("@owner", ownerKey);
        updWCmd.Parameters.AddWithValue("@gp", newGp);
        updWCmd.Parameters.AddWithValue("@sp", curSp);
        updWCmd.Parameters.AddWithValue("@cp", curCp);
        await updWCmd.ExecuteNonQueryAsync(ct);

        // Increase or add to merchant inventory
        await using var checkInv = new MySqlCommand(
            "SELECT id FROM lw_merchant_inventory WHERE merchant_id = @mid AND name = @name LIMIT 1 FOR UPDATE;", db, tx);
        checkInv.Parameters.AddWithValue("@mid", merchantId);
        checkInv.Parameters.AddWithValue("@name", req.ItemName.Trim());
        var existingInvId = await checkInv.ExecuteScalarAsync(ct);

        if (existingInvId is not null)
        {
            await using var updInv = new MySqlCommand(
                "UPDATE lw_merchant_inventory SET quantity = quantity + @qty WHERE id = @id;", db, tx);
            updInv.Parameters.AddWithValue("@qty", req.Quantity);
            updInv.Parameters.AddWithValue("@id", existingInvId);
            await updInv.ExecuteNonQueryAsync(ct);
        }
        else
        {
            await using var addInv = new MySqlCommand("""
                INSERT INTO lw_merchant_inventory
                  (merchant_id, item_key, name, item_type, rarity, description, base_value_gp, price_gp, quantity, is_featured)
                VALUES
                  (@mid, @ikey, @name, @itype, @rarity, @desc, @base, @price, @qty, 0);
                """, db, tx);
            addInv.Parameters.AddWithValue("@mid", merchantId);
            addInv.Parameters.AddWithValue("@ikey", req.ItemKey);
            addInv.Parameters.AddWithValue("@name", req.ItemName.Trim());
            addInv.Parameters.AddWithValue("@itype", req.ItemType ?? "Item");
            addInv.Parameters.AddWithValue("@rarity", req.Rarity ?? "common");
            addInv.Parameters.AddWithValue("@desc", req.Description ?? string.Empty);
            addInv.Parameters.AddWithValue("@base", req.BaseValueGp);
            addInv.Parameters.AddWithValue("@price", req.BaseValueGp);
            addInv.Parameters.AddWithValue("@qty", req.Quantity);
            await addInv.ExecuteNonQueryAsync(ct);
        }

        // Record transaction
        await using var txInsert = new MySqlCommand("""
            INSERT INTO lw_merchant_transactions
              (merchant_id, campaign_id, character_key, character_name, transaction_type, item_name, quantity, unit_price_gp, total_gp, used_party_funds)
            VALUES
              (@mid, @cid, @ckey, @cname, 'sell', @iname, @qty, @unit, @total, @party);
            """, db, tx);
        txInsert.Parameters.AddWithValue("@mid", merchantId);
        txInsert.Parameters.AddWithValue("@cid", campaignId);
        txInsert.Parameters.AddWithValue("@ckey", req.CharacterKey);
        txInsert.Parameters.AddWithValue("@cname", req.CharacterName ?? req.CharacterKey);
        txInsert.Parameters.AddWithValue("@iname", req.ItemName.Trim());
        txInsert.Parameters.AddWithValue("@qty", req.Quantity);
        txInsert.Parameters.AddWithValue("@unit", unitPayout);
        txInsert.Parameters.AddWithValue("@total", totalPayout);
        txInsert.Parameters.AddWithValue("@party", req.DepositToParty ? 1 : 0);
        await txInsert.ExecuteNonQueryAsync(ct);

        // Remove item from character's inventory row if exists
        await using var delInv = new MySqlCommand(
            "DELETE FROM lw_item_library WHERE id = @id AND owner_id = @owner AND kind = 'inventory' LIMIT 1;", db, tx);
        delInv.Parameters.AddWithValue("@id", req.ItemKey);
        delInv.Parameters.AddWithValue("@owner", callerUserId);
        await delInv.ExecuteNonQueryAsync(ct);

        await tx.CommitAsync(ct);

        var updatedWallet = await MerchantRepository.GetWalletAsync(repo, campaignId, req.CharacterKey, ct);
        return (true, $"Sold {req.Quantity}x {req.ItemName} to merchant for {totalPayout:F1} GP!", updatedWallet);
    }
}
