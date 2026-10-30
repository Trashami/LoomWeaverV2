using System.Globalization;
using System.Text.Json.Nodes;
using MySqlConnector;

namespace LoomWeaver.Modules.Items;

/// <summary>
/// Official 5etools items from loomweaver.dnd_items, mapped to the V2 catalog item shape the Items page renders.
/// Ids are "db-{id}", matching the convention already used by the in-code catalog.
/// </summary>
public static class ItemDbCatalog
{
    private const string Columns = """
        id, name, source_id, item_type, rarity, weight, value_gp, requires_attunement,
        image_path, description, is_homebrew, ac_value, damage_dice, damage_type
        """;

    public static async Task<List<JsonObject>> ListAsync(MySqlConnection db, CancellationToken ct)
    {
        var rows = new List<JsonObject>();
        await using var cmd = new MySqlCommand(
            $"SELECT {Columns} FROM dnd_items WHERE is_canonical = 1 AND campaign_id IS NULL ORDER BY name, source_id;", db);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) rows.Add(Map(reader));
        return rows;
    }

    public static async Task<JsonObject?> FindAsync(MySqlConnection db, string id, CancellationToken ct)
    {
        if (!id.StartsWith("db-", StringComparison.Ordinal) || !long.TryParse(id[3..], out var dbId)) return null;
        await using var cmd = new MySqlCommand(
            $"SELECT {Columns} FROM dnd_items WHERE id = @id AND is_canonical = 1 AND campaign_id IS NULL LIMIT 1;", db);
        cmd.Parameters.AddWithValue("@id", dbId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? Map(reader) : null;
    }

    private static JsonObject Map(MySqlDataReader r)
    {
        var description = Str(r, "description") ?? "";
        var itemType = Str(r, "item_type") ?? "";
        var category = Category(itemType);
        var rarity = Title(Str(r, "rarity") ?? "none");
        var source = Str(r, "source_id") ?? "";
        var gp = Dec(r, "value_gp");
        var priceLabel = gp is null ? "—" : $"{gp.Value.ToString("0.##", CultureInfo.InvariantCulture)} GP";
        var damage = $"{Str(r, "damage_dice")} {Str(r, "damage_type")}".Trim();

        return new JsonObject
        {
            ["id"] = $"db-{r.GetInt64("id")}",
            ["name"] = Str(r, "name") ?? "",
            ["imageUrl"] = Str(r, "image_path") ?? "",
            ["shortDescription"] = Short(description),
            ["fullDescription"] = description,
            ["loreNotes"] = "",
            ["priceGp"] = gp is null ? 0d : (double)gp.Value,
            ["priceLabel"] = priceLabel,
            ["category"] = category,
            ["slot"] = Slot(category),
            ["rarity"] = rarity,
            ["weightLb"] = Dec(r, "weight") is { } w ? (double)w : 0d,
            ["acBonus"] = Int(r, "ac_value") ?? 0,
            ["attackBonus"] = 0,
            ["damageOrEffectLabel"] = damage,
            ["requiresAttunement"] = r.GetBoolean("requires_attunement"),
            ["properties"] = new JsonArray(JsonValue.Create(category), JsonValue.Create(rarity), JsonValue.Create(source)),
            ["source"] = source,
            ["isHomebrew"] = r.GetBoolean("is_homebrew"),
            ["creatorUsername"] = "Core Ruleset",
            ["publishedToStore"] = false,
            ["storePriceLabel"] = priceLabel,
            ["icon"] = "inventory_2",
        };
    }

    private static string Category(string itemType) => itemType switch
    {
        "M" or "R" => "Weapon",
        "LA" or "MA" or "HA" => "Armor",
        "S" => "Shield",
        "SCF" => "Focus",
        "P" or "SC" or "FD" => "Potion & Consumable",
        "T" or "AT" or "GS" or "INS" or "TB" => "Tool & Kit",
        "MNT" or "TAH" or "VEH" or "SHP" or "AIR" => "Companion Gear",
        _ => "Wondrous Gear",
    };

    private static string Slot(string category) => category switch
    {
        "Weapon" => "Main Hand",
        "Shield" => "Off Hand",
        "Armor" => "Armor",
        "Focus" => "Focus",
        "Companion Gear" => "Companion",
        _ => "Gear",
    };

    private static string Title(string value) =>
        CultureInfo.InvariantCulture.TextInfo.ToTitleCase(value.ToLowerInvariant());

    private static string Short(string description)
    {
        var firstLine = description.Split('\n', 2)[0].Trim();
        return firstLine.Length <= 600 ? firstLine : firstLine[..600];
    }

    private static string? Str(MySqlDataReader r, string column) =>
        r.IsDBNull(r.GetOrdinal(column)) ? null : r.GetString(column);

    private static int? Int(MySqlDataReader r, string column) =>
        r.IsDBNull(r.GetOrdinal(column)) ? null : r.GetInt32(column);

    private static decimal? Dec(MySqlDataReader r, string column) =>
        r.IsDBNull(r.GetOrdinal(column)) ? null : r.GetDecimal(column);
}
