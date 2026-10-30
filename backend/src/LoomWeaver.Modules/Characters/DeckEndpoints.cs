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

    // Loads the deck's refs from dnd_deck_card_refs (ordered by ref_index). A ref with copies N yields N draw slots,
    // so a uniform draw from the expanded list is weighted by copies. replacement=1 returns the card to the pool after it is drawn.
    private static async Task<Dictionary<string, object?>?> LoadDeckAsync(MySqlConnection db, int id, CancellationToken ct)
    {
        Dictionary<string, object?>? deck = null;
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = "SELECT `id`, `name`, `source_book`, `description`, `image_path`, `back_image_json` FROM `dnd_decks` WHERE `id` = @id LIMIT 1;";
            cmd.Parameters.AddWithValue("@id", id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                deck = ReadRow(r);
            }
        }
        if (deck is null)
        {
            return null;
        }

        var cards = new List<Dictionary<string, object?>>();
        var unique = new HashSet<long>();
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = """
                SELECT r.`ref_index`, r.`copies`, r.`replacement`, c.`id`, c.`name`, c.`set_name`, c.`source_book`,
                       c.`face_image_url`, c.`back_image_url`
                FROM `dnd_deck_card_refs` r
                JOIN `dnd_deck_cards` c ON c.`id` = r.`card_id`
                WHERE r.`deck_id` = @id
                ORDER BY r.`ref_index`;
                """;
            cmd.Parameters.AddWithValue("@id", id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var refIndex = r.GetInt32(0);
                var copies = Math.Max(1, r.GetInt32(1));
                var replacement = r.GetBoolean(2);
                var source = ReadRow(r);
                source.Remove("ref_index");
                source.Remove("copies");
                source.Remove("replacement");
                unique.Add(Convert.ToInt64(source["id"]));
                for (var copy = 0; copy < copies; copy++)
                {
                    var card = new Dictionary<string, object?>(source, StringComparer.OrdinalIgnoreCase)
                    {
                        ["key"] = $"{refIndex}-{copy}",
                        ["replacement"] = replacement,
                    };
                    cards.Add(card);
                }
            }
        }
        deck["cards"] = cards;
        deck["uniqueCardCount"] = unique.Count;
        return deck;
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
