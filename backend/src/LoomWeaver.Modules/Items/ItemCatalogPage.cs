using System.Text.Json.Nodes;
using MySqlConnector;

namespace LoomWeaver.Modules.Items;

public sealed record ItemPageRequest(string? Search, string Category, string Rarity, string Source, string Sort, IReadOnlyList<string>? Ids);

public sealed record ItemPageResult(IReadOnlyList<JsonObject> Items, int Total, int Offset, int Limit);

/// <summary>
/// Serves one page of the Items catalog. Official rows are filtered, sorted and paged in SQL.
/// User items (homebrew and store items) are small in number, so they are filtered and sorted in memory
/// and placed before official rows.
/// </summary>
public static class ItemCatalogPage
{
    private static readonly Dictionary<string, int> RarityRank = new()
    {
        ["Common"] = 1, ["Uncommon"] = 2, ["Rare"] = 3, ["Very Rare"] = 4, ["Legendary"] = 5, ["Artifact"] = 6,
    };

    public static async Task<ItemPageResult> QueryAsync(MySqlConnection db, ItemPageRequest req, long userId, int offset, int limit, CancellationToken ct)
    {
        var userMatches = SortUser(
            (await ItemRepository.ReadAsync(db, "item", userId, false, null, ct)).Where(item => MatchesUser(item, req)),
            req.Sort).ToList();

        var items = userMatches.Skip(offset).Take(limit).ToList();
        var officialTotal = await ItemDbCatalog.CountOfficialAsync(db, req, ct);
        var remaining = limit - items.Count;
        if (remaining > 0)
        {
            var officialSkip = Math.Max(0, offset - userMatches.Count);
            items.AddRange(await ItemDbCatalog.PageOfficialAsync(db, req, officialSkip, remaining, ct));
        }

        return new ItemPageResult(items, userMatches.Count + officialTotal, offset, limit);
    }

    private static bool MatchesUser(JsonObject item, ItemPageRequest req)
    {
        var isHomebrew = item["isHomebrew"]?.GetValue<bool>() ?? false;
        var published = item["publishedToStore"]?.GetValue<bool>() ?? false;
        var category = Text(item, "category");
        var rarity = Text(item, "rarity");

        if (req.Category != "All" && category != req.Category) return false;
        if (req.Rarity != "All" && rarity != req.Rarity) return false;
        switch (req.Source)
        {
            case "Official" when isHomebrew: return false;
            case "Homebrew" when !isHomebrew: return false;
            case "StoreFree" when !(isHomebrew && published): return false;
        }
        if (req.Ids is not null && !req.Ids.Contains(Text(item, "id"))) return false;

        var query = req.Search?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(query)) return true;

        var fields = new[]
        {
            Text(item, "name"), Text(item, "shortDescription"), Text(item, "fullDescription"), category, rarity,
            Text(item, "damageOrEffectLabel"), Text(item, "creatorUsername"),
        };
        var properties = (item["properties"] as JsonArray)?.Select(p => p?.GetValue<string>() ?? "") ?? [];
        return fields.Concat(properties).Any(value => value.ToLowerInvariant().Contains(query, StringComparison.Ordinal));
    }

    private static IEnumerable<JsonObject> SortUser(IEnumerable<JsonObject> items, string sort) => sort switch
    {
        "name-desc" => items.OrderByDescending(i => Text(i, "name"), StringComparer.CurrentCultureIgnoreCase),
        "price-asc" => items.OrderBy(i => Number(i, "priceGp")).ThenBy(i => Text(i, "name"), StringComparer.CurrentCultureIgnoreCase),
        "price-desc" => items.OrderByDescending(i => Number(i, "priceGp")).ThenBy(i => Text(i, "name"), StringComparer.CurrentCultureIgnoreCase),
        "rarity-asc" => items.OrderBy(Rank).ThenBy(i => Text(i, "name"), StringComparer.CurrentCultureIgnoreCase),
        "rarity-desc" => items.OrderByDescending(Rank).ThenBy(i => Text(i, "name"), StringComparer.CurrentCultureIgnoreCase),
        "weight-asc" => items.OrderBy(i => Number(i, "weightLb")).ThenBy(i => Text(i, "name"), StringComparer.CurrentCultureIgnoreCase),
        _ => items.OrderBy(i => Text(i, "name"), StringComparer.CurrentCultureIgnoreCase),
    };

    private static int Rank(JsonObject item) => RarityRank.GetValueOrDefault(Text(item, "rarity"), 1);

    private static string Text(JsonObject item, string key) => item[key]?.GetValue<string>() ?? "";

    private static double Number(JsonObject item, string key) => item[key]?.GetValue<double>() ?? 0d;
}
