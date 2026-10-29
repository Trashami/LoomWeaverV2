using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Characters;

public static class DeckEndpoints
{
    public static RouteGroupBuilder MapDeckEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/decks", async (string? source, string? search, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                await using var cmd = db.CreateCommand();
                var conditions = new List<string>();
                if (!string.IsNullOrWhiteSpace(source))
                {
                    conditions.Add("LOWER(`source_book`) = LOWER(@source)");
                    cmd.Parameters.AddWithValue("@source", source.Trim());
                }
                if (!string.IsNullOrWhiteSpace(search))
                {
                    conditions.Add("`name` LIKE @search");
                    cmd.Parameters.AddWithValue("@search", $"%{search.Trim()}%");
                }
                var whereSql = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";
                cmd.CommandText = $"SELECT `id`, `name`, `source_book`, `description`, `image_path` FROM `dnd_decks` {whereSql} ORDER BY `source_book`, `name` LIMIT 500;";

                var decks = new List<Dictionary<string, object?>>();
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    decks.Add(ReadRow(r));
                }
                return Results.Ok(new { decks, total = decks.Count });
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        api.MapGet("/decks/{id:int}", async (int id, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var deck = await LoadDeckAsync(db, id, ct);
                if (deck is null)
                {
                    return Results.NotFound(new { message = $"Deck {id} was not found." });
                }
                return Results.Ok(deck);
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        // exclude is a comma-separated list of card keys ("refIndex-copy") already drawn from this deck.
        // Replacement cards are always eligible; non-replacement copies are removed once drawn.
        api.MapGet("/decks/{id:int}/draw", async (int id, string? exclude, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var deck = await LoadDeckAsync(db, id, ct);
                if (deck is null)
                {
                    return Results.NotFound(new { message = $"Deck {id} was not found." });
                }
                var cards = (List<Dictionary<string, object?>>)deck["cards"]!;
                if (cards.Count == 0)
                {
                    return Results.Problem("This deck has no resolvable cards.");
                }
                var excluded = (exclude ?? string.Empty)
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                var eligible = cards
                    .Where(c => (bool)c["replacement"]! || !excluded.Contains((string)c["key"]!))
                    .ToList();
                if (eligible.Count == 0)
                {
                    return Results.Ok(new { deckId = id, deckName = deck["name"], exhausted = true, card = (object?)null });
                }
                var card = eligible[Random.Shared.Next(eligible.Count)];
                return Results.Ok(new { deckId = id, deckName = deck["name"], exhausted = false, card });
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        return api;
    }

    // Resolves cards_ref_json (uid = "name|set|source", optional count) to dnd_deck_cards rows.
    // A count of N adds the card N times, so a uniform draw from the expanded list is weighted by count.
    private static async Task<Dictionary<string, object?>?> LoadDeckAsync(MySqlConnection db, int id, CancellationToken ct)
    {
        Dictionary<string, object?>? deck = null;
        string? cardsJson = null;
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = "SELECT `id`, `name`, `source_book`, `description`, `image_path`, `back_image_json`, `cards_ref_json` FROM `dnd_decks` WHERE `id` = @id LIMIT 1;";
            cmd.Parameters.AddWithValue("@id", id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                deck = ReadRow(r);
                cardsJson = deck.GetValueOrDefault("cards_ref_json") as string;
                deck.Remove("cards_ref_json");
            }
        }
        if (deck is null)
        {
            return null;
        }

        var refs = ParseCardRefs(cardsJson);
        var sourceBook = deck["source_book"] as string ?? string.Empty;

        // Index every card in the deck's source by "name|set" so each uid resolves to its own set.
        var bySetKey = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = "SELECT `name`, `set_name`, `source_book`, `face_image_url`, `back_image_url` FROM `dnd_deck_cards` WHERE `source_book` = @src;";
            cmd.Parameters.AddWithValue("@src", sourceBook);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var row = ReadRow(r);
                bySetKey[$"{row["name"]}|{row["set_name"]}"] = row;
            }
        }

        var cards = new List<Dictionary<string, object?>>();
        var unique = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var refIndex = 0; refIndex < refs.Count; refIndex++)
        {
            var (key, count, replacement) = refs[refIndex];
            if (!bySetKey.TryGetValue(key, out var source))
            {
                continue;
            }
            unique.Add(key);
            for (var copy = 0; copy < count; copy++)
            {
                var card = new Dictionary<string, object?>(source, StringComparer.OrdinalIgnoreCase)
                {
                    ["key"] = $"{refIndex}-{copy}",
                    ["replacement"] = replacement,
                };
                cards.Add(card);
            }
        }
        deck["cards"] = cards;
        deck["uniqueCardCount"] = unique.Count;
        return deck;
    }

    // uid is "name|set|source"; the key is "name|set" because the source is the deck's own source_book.
    // replacement:true means the card returns to the pool after it is drawn. Absent or false means it is removed.
    private static List<(string Key, int Count, bool Replacement)> ParseCardRefs(string? json)
    {
        var result = new List<(string Key, int Count, bool Replacement)>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return result;
        }
        using var doc = JsonDocument.Parse(json);
        foreach (var entry in doc.RootElement.EnumerateArray())
        {
            if (!entry.TryGetProperty("uid", out var uidEl) || uidEl.GetString() is not { } uid)
            {
                continue;
            }
            var parts = uid.Split('|');
            if (parts.Length < 2)
            {
                continue;
            }
            var count = entry.TryGetProperty("count", out var countEl) && countEl.TryGetInt32(out var c) && c > 0 ? c : 1;
            var replacement = entry.TryGetProperty("replacement", out var replEl) && replEl.ValueKind == JsonValueKind.True;
            result.Add(($"{parts[0]}|{parts[1]}", count, replacement));
        }
        return result;
    }

    private static Dictionary<string, object?> ReadRow(MySqlDataReader r)
    {
        var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < r.FieldCount; i++)
        {
            row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
        }
        return row;
    }
}
