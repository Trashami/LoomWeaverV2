using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Merchants;

public static class MerchantGenerationService
{
    private static readonly Regex TagRe = new(@"\{@\w+\s+([^|}]*)(?:\|[^}]*)?\}", RegexOptions.Compiled);

    public static async Task<MerchantDto> GenerateRandomMerchantAsync(
        LoomWeaverMySqlRepository repo, int campaignId, GenerateRandomMerchantRequest req, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        var rng = new Random();
        var type = !string.IsNullOrWhiteSpace(req.MerchantType) && req.MerchantType != "random"
            ? req.MerchantType
            : MerchantGeneratorData.MerchantTypes[rng.Next(MerchantGeneratorData.MerchantTypes.Count)];

        var storeName = !string.IsNullOrWhiteSpace(req.StoreName)
            ? req.StoreName.Trim()
            : MerchantGeneratorData.GenerateStoreName(type);
        var locName = !string.IsNullOrWhiteSpace(req.LocationName) ? req.LocationName.Trim() : "Local Settlement";
        var npc = MerchantGeneratorData.GenerateNpc(type, locName);
        if (!string.IsNullOrWhiteSpace(req.MerchantName))
        {
            npc = npc with { Name = req.MerchantName.Trim() };
        }

        var tagline = GetTagline(type);
        var greeting = GetGreeting(type, npc);
        var desc = $"A well-established {type.ToLower()} in {locName}, run by {npc.Name}.";
        var npcJson = JsonSerializer.Serialize(npc);

        var mid = await MerchantStore.InsertMerchantAsync(
            db, campaignId, storeName, npc.Name, tagline, desc, greeting,
            $"/assets/5e-tools/races/PHB/{npc.Race}.webp",
            "/campaigns/market-banner.jpg",
            req.LocationKey ?? $"loc-{Guid.NewGuid():N}", locName,
            $"npc-{Guid.NewGuid():N}", npc.Name,
            1, "Magic Item Table A", 50, 100, type, 0, npcJson, ct);

        if (req.PopulateInventory)
        {
            var starterItems = MerchantGeneratorData.GetTypeStarterStock(type, 100);
            foreach (var itm in starterItems)
            {
                await MerchantStore.InsertItemAsync(
                    db, mid, $"seed-{Guid.NewGuid():N}", itm.Name, itm.Type, itm.Rarity,
                    itm.Desc, itm.BaseGp, itm.PriceGp, itm.Qty, itm.Featured, ct);
            }
        }

        var created = await MerchantRepository.GetMerchantAsync(repo, mid, campaignId, null, ct);
        return created!;
    }

    public static async Task<MerchantDto?> GenerateRandomNpcAsync(
        LoomWeaverMySqlRepository repo, int campaignId, long merchantId, GenerateRandomNpcRequest req, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        var merchant = await MerchantRepository.GetMerchantAsync(repo, merchantId, campaignId, null, ct);
        if (merchant is null) return null;

        var type = !string.IsNullOrWhiteSpace(req.MerchantType) ? req.MerchantType : merchant.MerchantType;
        var npc = MerchantGeneratorData.GenerateNpc(type, merchant.LocationName);
        var npcJson = JsonSerializer.Serialize(npc);
        var npcKey = $"npc-{Guid.NewGuid():N}";

        await using var cmd = new MySqlCommand("""
            UPDATE lw_merchants SET
              merchant_name = @mname, npc_name = @nname, npc_key = @nkey,
              npc_details_json = @npcjson
            WHERE id = @mid AND campaign_id = @cid;
            """, db);
        cmd.Parameters.AddWithValue("@mid", merchantId);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@mname", npc.Name);
        cmd.Parameters.AddWithValue("@nname", npc.Name);
        cmd.Parameters.AddWithValue("@nkey", npcKey);
        cmd.Parameters.AddWithValue("@npcjson", npcJson);
        await cmd.ExecuteNonQueryAsync(ct);

        return await MerchantRepository.GetMerchantAsync(repo, merchantId, campaignId, null, ct);
    }

    public static async Task<(bool Success, int ItemsAdded, string MerchantName, string Message)> ApplyTableInventoryAsync(
        LoomWeaverMySqlRepository repo, int campaignId, long merchantId, long rollTableId, bool clearExisting, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        var merchant = await MerchantRepository.GetMerchantAsync(repo, merchantId, campaignId, null, ct);
        if (merchant is null)
        {
            return (false, 0, string.Empty, $"Merchant {merchantId} was not found.");
        }

        await using var tCmd = new MySqlCommand(
            "SELECT name, source_book, rows_json FROM dnd_tables WHERE id = @id LIMIT 1;", db);
        tCmd.Parameters.AddWithValue("@id", rollTableId);

        string tableName = string.Empty;
        string sourceBook = string.Empty;
        string? rowsJson = null;

        await using (var tr = await tCmd.ExecuteReaderAsync(ct))
        {
            if (await tr.ReadAsync(ct))
            {
                tableName = tr.GetString(0);
                sourceBook = tr.GetString(1);
                rowsJson = tr.IsDBNull(2) ? null : tr.GetString(2);
            }
        }

        if (string.IsNullOrWhiteSpace(rowsJson))
        {
            return (false, 0, merchant.StoreName, $"Roll table {rollTableId} contains no rows.");
        }

        if (clearExisting)
        {
            await using var clrCmd = new MySqlCommand(
                "DELETE FROM lw_merchant_inventory WHERE merchant_id = @mid;", db);
            clrCmd.Parameters.AddWithValue("@mid", merchantId);
            await clrCmd.ExecuteNonQueryAsync(ct);
        }

        var itemsAdded = 0;
        var markup = merchant.MarkupPercent > 0 ? merchant.MarkupPercent : 100;
        var rng = new Random();

        try
        {
            using var doc = JsonDocument.Parse(rowsJson);
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                var rowTexts = ExtractRowCells(item);
                if (rowTexts.Count == 0) continue;

                var rawName = rowTexts[0];
                if (string.IsNullOrWhiteSpace(rawName)) continue;

                var cleanName = StripTags(rawName);
                if (cleanName.Length > 150) cleanName = cleanName[..150];

                var desc = rowTexts.Count > 1
                    ? StripTags(string.Join(". ", rowTexts.Skip(1)))
                    : $"Sourced from roll table '{tableName}' ({sourceBook}).";

                var (itemType, rarity, basePrice) = InferItemAttributes(cleanName);
                var finalPrice = Math.Round(basePrice * (decimal)markup / 100m, 2);
                if (finalPrice <= 0) finalPrice = 10m;
                var qty = itemType is "Potion" or "Scroll" or "Ammunition" ? rng.Next(2, 6) : 1;

                await MerchantStore.InsertItemAsync(
                    db, merchantId, $"table-{Guid.NewGuid():N}", cleanName, itemType,
                    rarity, desc, basePrice, finalPrice, qty, false, ct);
                itemsAdded++;
            }
        }
        catch (Exception ex)
        {
            return (false, itemsAdded, merchant.StoreName, $"Error parsing roll table rows: {ex.Message}");
        }

        // Link table to merchant
        await using var linkCmd = new MySqlCommand("""
            UPDATE lw_merchants SET
              roll_table_id = @rtid, roll_table_name = @rtname
            WHERE id = @mid AND campaign_id = @cid;

            INSERT INTO lw_campaign_roll_tables
              (campaign_id, roll_table_id, table_name, source_book, merchant_id, merchant_name, notes, is_pinned)
            VALUES
              (@cid, @rtid, @rtname, @src, @mid, @mname, 'Applied table inventory stock', 1);
            """, db);
        linkCmd.Parameters.AddWithValue("@rtid", rollTableId);
        linkCmd.Parameters.AddWithValue("@rtname", tableName);
        linkCmd.Parameters.AddWithValue("@mid", merchantId);
        linkCmd.Parameters.AddWithValue("@cid", campaignId);
        linkCmd.Parameters.AddWithValue("@src", sourceBook);
        linkCmd.Parameters.AddWithValue("@mname", merchant.StoreName);
        await linkCmd.ExecuteNonQueryAsync(ct);

        return (true, itemsAdded, merchant.StoreName, $"Successfully added {itemsAdded} items from '{tableName}' to {merchant.StoreName}.");
    }

    public static async Task<bool> AdjustStandingAsync(
        LoomWeaverMySqlRepository repo, int campaignId, long merchantId, int delta, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        await using var cmd = new MySqlCommand("""
            UPDATE lw_merchants SET
              standing = GREATEST(-5, LEAST(10, standing + @delta))
            WHERE id = @mid AND campaign_id = @cid;
            """, db);
        cmd.Parameters.AddWithValue("@mid", merchantId);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@delta", delta);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    private static List<string> ExtractRowCells(JsonElement elem)
    {
        var list = new List<string>();
        if (elem.ValueKind == JsonValueKind.Array)
        {
            foreach (var cell in elem.EnumerateArray())
            {
                var txt = CellText(cell);
                if (!string.IsNullOrWhiteSpace(txt)) list.Add(txt);
            }
        }
        else if (elem.ValueKind == JsonValueKind.Object)
        {
            if (elem.TryGetProperty("row", out var r) && r.ValueKind == JsonValueKind.Array)
            {
                return ExtractRowCells(r);
            }
            if (elem.TryGetProperty("entry", out var e))
            {
                var txt = CellText(e);
                if (!string.IsNullOrWhiteSpace(txt)) list.Add(txt);
            }
        }
        else if (elem.ValueKind == JsonValueKind.String)
        {
            list.Add(elem.GetString() ?? "");
        }
        return list;
    }

    private static string CellText(JsonElement cell)
    {
        if (cell.ValueKind == JsonValueKind.String) return cell.GetString() ?? "";
        if (cell.ValueKind == JsonValueKind.Number) return cell.GetRawText();
        if (cell.ValueKind == JsonValueKind.Object && cell.TryGetProperty("entry", out var entry))
        {
            return CellText(entry);
        }
        return "";
    }

    private static (string ItemType, string Rarity, decimal BasePrice) InferItemAttributes(string name)
    {
        var lower = name.ToLower();
        if (lower.Contains("potion") || lower.Contains("elixir") || lower.Contains("draught") || lower.Contains("philter"))
            return ("Potion", lower.Contains("greater") || lower.Contains("superior") ? "uncommon" : "common", 50m);
        if (lower.Contains("scroll"))
            return ("Scroll", "common", 75m);
        if (lower.Contains("sword") || lower.Contains("blade") || lower.Contains("bow") || lower.Contains("axe") || lower.Contains("dagger") || lower.Contains("spear") || lower.Contains("mace"))
            return ("Weapon", lower.Contains("+2") ? "rare" : lower.Contains("+1") ? "uncommon" : "common", 35m);
        if (lower.Contains("armor") || lower.Contains("shield") || lower.Contains("plate") || lower.Contains("mail") || lower.Contains("leather"))
            return ("Armor", lower.Contains("+1") ? "uncommon" : "common", 65m);
        if (lower.Contains("ring") || lower.Contains("wand") || lower.Contains("amulet") || lower.Contains("cloak") || lower.Contains("boots") || lower.Contains("staff") || lower.Contains("bag of"))
            return ("Wondrous Item", lower.Contains("rare") ? "rare" : "uncommon", 300m);
        if (lower.Contains("gem") || lower.Contains("ruby") || lower.Contains("diamond") || lower.Contains("sapphire") || lower.Contains("gold"))
            return ("Valuables", "uncommon", 100m);
        return ("Adventuring Gear", "common", 20m);
    }

    private static string GetTagline(string type) => type switch
    {
        "Blacksmith & Armory" => "Honest steel, tempered armor, and precision blades.",
        "Alchemist & Apothecary" => "Potions, distilled herbs, and rare elemental extracts.",
        "Arcane & Wandmaker" => "Curated scrolls, resonant wands, and magical curiosities.",
        "Jeweler & Gemcutter" => "Fine cut gemstones, enchanted rings, and gilded filigree.",
        "Tavern & Brewer" => "Hearty flagons, warm hearths, and clandestine rumors.",
        "Fletcher & Bowyer" => "Yew longbows, balanced crossbows, and trueflight arrows.",
        "Curios & Antiquities" => "Ancient relics, planar oddities, and forgotten tomes.",
        _ => "Sundries, provisions, and dependable supplies for any traveler.",
    };

    private static string GetGreeting(string type, MerchantNpcDto npc) => type switch
    {
        "Blacksmith & Armory" => $"Hail! Keep your hands clear of the forge. What steel do you seek today?",
        "Alchemist & Apothecary" => $"Welcome. Mind the glass; some reagents are unstable. Looking for remedies or something with a kick?",
        "Arcane & Wandmaker" => $"Ah, fellow students of the Weave! Step into the light. What arcane instruments do you need?",
        "Jeweler & Gemcutter" => $"Greetings, traveler. Our gems are certified pure by the local guild. Feast your eyes.",
        "Tavern & Brewer" => $"Find a seat by the fire! What'll it be — an ale, a hot meal, or the latest talk of the town?",
        _ => $"Welcome! Browse freely and let me know if you need anything wrapped for travel.",
    };

    private static string StripTags(string text) =>
        TagRe.Replace(text, m => m.Groups[1].Value).Trim();
}
