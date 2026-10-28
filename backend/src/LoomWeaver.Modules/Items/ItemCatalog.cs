using System.Text.Json.Nodes;

namespace LoomWeaver.Modules.Items;

public static class ItemCatalog
{
    public static readonly IReadOnlyList<JsonObject> Items = Load();
    private static IReadOnlyList<JsonObject> Load()
    {
        using var stream = typeof(ItemCatalog).Assembly.GetManifestResourceStream("LoomWeaver.Modules.Items.catalog.json")!;
        using var reader = new StreamReader(stream);
        return JsonNode.Parse(reader.ReadToEnd())!.AsArray().Select(n => n!.AsObject()).ToList();
    }
    public static JsonObject? Find(string id) => Items.FirstOrDefault(x => ItemRepository.Text(x, "id") == id)?.DeepClone().AsObject();
    public static string? Validate(JsonObject value)
    {
        try { return ValidateFields(value); }
        catch (InvalidOperationException) { return "Invalid item field type."; }
        catch (FormatException) { return "Invalid item field format."; }
    }
    private static string? ValidateFields(JsonObject value)
    {
        foreach (var (key, limit) in new[] { ("name", 140), ("shortDescription", 600), ("fullDescription", 20000), ("loreNotes", 10000), ("damageOrEffectLabel", 1000) })
        {
            var text = ItemRepository.Text(value, key);
            if (text.Length > limit || (key is "name" or "shortDescription" or "fullDescription" && text.Length == 0)) return $"Invalid {key}.";
        }
        foreach (var key in new[] { "priceGp", "weightLb", "acBonus", "attackBonus" })
            if (value[key] is not JsonValue n || !n.TryGetValue<double>(out var number) || !double.IsFinite(number) || number < 0 || number > 10000000) return $"Invalid {key}.";
        var image = ItemRepository.Text(value, "imageUrl");
        if (image.Contains('\\') || image.Any(char.IsControl) || image.Length > 2000 || (image.Length > 0 && !(image.StartsWith('/') && !image.StartsWith("//")) && !(Uri.TryCreate(image, UriKind.Absolute, out var url) && url.Scheme == "https"))) return "Use a local image path or HTTPS image URL.";
        if (value["properties"] is not JsonArray props || props.Count > 50 || props.Any(p => p is not JsonValue v || !v.TryGetValue<string>(out var t) || t.Length > 200)) return "Invalid item properties.";
        if (!new[] { "Weapon", "Armor", "Shield", "Focus", "Wondrous Gear", "Potion & Consumable", "Tool & Kit", "Companion Gear" }.Contains(ItemRepository.Text(value, "category"))) return "Invalid category.";
        if (!new[] { "Main Hand", "Off Hand", "Armor", "Focus", "Gear", "Companion" }.Contains(ItemRepository.Text(value, "slot"))) return "Invalid equipment slot.";
        if (!new[] { "Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact" }.Contains(ItemRepository.Text(value, "rarity"))) return "Invalid rarity.";
        return null;
    }
}
