using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System.Text.Json;
using MySqlConnector;

namespace LoomWeaver.Modules.Characters;

public static class SourceBookEndpoints
{
    public static RouteGroupBuilder MapSourceBookEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/sources", async (string? search, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                await using var cmd = db.CreateCommand();
                var whereSql = "";
                if (!string.IsNullOrWhiteSpace(search))
                {
                    whereSql = "WHERE s.`name` LIKE @search OR s.`id` LIKE @search";
                    cmd.Parameters.AddWithValue("@search", $"%{search.Trim()}%");
                }
                cmd.CommandText = $@"
                    SELECT s.`id`, s.`name`, s.`source_type`, s.`source_group`, s.`published`, s.`author`, s.`cover_path`,
                           (SELECT COUNT(*) FROM `dnd_decks` d WHERE d.`source_book` = s.`id`) AS `deck_count`
                    FROM `dnd_sources` s {whereSql}
                    ORDER BY s.`source_group`, s.`published` DESC, s.`name`
                    LIMIT 500;";

                var sources = new List<Dictionary<string, object?>>();
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    sources.Add(ReadRow(r));
                }
                return Results.Ok(new { sources, total = sources.Count });
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        api.MapGet("/sources/{code}", async (string code, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var source = await LoadSourceAsync(db, code, ct);
                if (source is null)
                {
                    return Results.NotFound(new { message = $"Source {code} was not found." });
                }
                return Results.Ok(source);
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        api.MapGet("/sources/{code}/nodes/{nodeId:long}", async (string code, long nodeId, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var node = await LoadNodeAsync(db, code, nodeId, ct);
                return node is null
                    ? Results.NotFound(new { message = $"Section {nodeId} was not found in {code}." })
                    : Results.Ok(node);
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        return api;
    }

    // One book section with its parsed 5etools entries (data_json) and direct child sections.
    private static async Task<Dictionary<string, object?>?> LoadNodeAsync(MySqlConnection db, string code, long nodeId, CancellationToken ct)
    {
        Dictionary<string, object?>? node = null;
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = @"
                SELECT `id`, `source_id`, `parent_id`, `seq`, `node_type`, `name`, `page`, `text`, `data_json`
                FROM `dnd_book_nodes`
                WHERE `id` = @nodeId AND `source_id` = @code
                LIMIT 1;";
            cmd.Parameters.AddWithValue("@nodeId", nodeId);
            cmd.Parameters.AddWithValue("@code", code.Trim());
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                node = ReadRow(r);
            }
        }
        if (node is null)
        {
            return null;
        }

        var rawJson = node["data_json"]?.ToString();
        node["data_json"] = string.IsNullOrWhiteSpace(rawJson)
            ? null
            : JsonSerializer.Deserialize<JsonElement>(rawJson);

        var children = new List<Dictionary<string, object?>>();
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = @"
                SELECT `id`, `name`, `node_type`, `page`, `seq`
                FROM `dnd_book_nodes`
                WHERE `parent_id` = @nodeId
                ORDER BY `seq`, `id`
                LIMIT 300;";
            cmd.Parameters.AddWithValue("@nodeId", nodeId);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                children.Add(ReadRow(r));
            }
        }

        node["children"] = children;
        return node;
    }

    // Top-level book sections (parent_id IS NULL) plus the decks published for the same source code.
    private static async Task<Dictionary<string, object?>?> LoadSourceAsync(MySqlConnection db, string code, CancellationToken ct)
    {
        Dictionary<string, object?>? source = null;
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = "SELECT `id`, `name`, `source_type`, `source_group`, `published`, `author`, `cover_path` FROM `dnd_sources` WHERE `id` = @code LIMIT 1;";
            cmd.Parameters.AddWithValue("@code", code.Trim());
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                source = ReadRow(r);
            }
        }
        if (source is null)
        {
            return null;
        }

        var sections = new List<Dictionary<string, object?>>();
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = @"
                SELECT `id`, `name`, `node_type`, `page`, `seq`
                FROM `dnd_book_nodes`
                WHERE `source_id` = @code AND `parent_id` IS NULL
                ORDER BY `seq`, `id`
                LIMIT 300;";
            cmd.Parameters.AddWithValue("@code", code.Trim());
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                sections.Add(ReadRow(r));
            }
        }

        var decks = new List<Dictionary<string, object?>>();
        await using (var cmd = db.CreateCommand())
        {
            cmd.CommandText = "SELECT `id`, `name`, `cards_count`, `image_path` FROM `dnd_decks` WHERE `source_book` = @code ORDER BY `name` LIMIT 200;";
            cmd.Parameters.AddWithValue("@code", code.Trim());
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                decks.Add(ReadRow(r));
            }
        }

        source["sections"] = sections;
        source["decks"] = decks;
        return source;
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
