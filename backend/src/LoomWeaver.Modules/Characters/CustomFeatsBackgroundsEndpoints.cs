using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Characters;

public sealed record CustomFeatRequest(
    string Name,
    string? Description,
    string? Category,
    string? Prerequisite,
    bool IsPublic
);

public sealed record CustomBackgroundRequest(
    string Name,
    string? Description,
    string? FeatureName,
    string? FeatureDesc,
    IReadOnlyList<string>? Skills,
    IReadOnlyList<string>? Tools,
    bool IsPublic
);

// Custom feats and backgrounds live in dnd_feats / dnd_backgrounds with is_canonical = 0 and owner_id = lw_users.id.
public static class CustomFeatsBackgroundsEndpoints
{
    private const string HomebrewSource = "Homebrew";
    private const int MaxNameLength = 255;
    private const int MaxTextLength = 20000;

    public static RouteGroupBuilder MapCustomFeatsBackgroundsEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/catalog/custom/{kind}", async (string kind, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            if (!IsKind(kind)) return Results.NotFound();
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            await using var db = await mysql.OpenConnectionAsync(ct);
            return Results.Ok(await ReadAsync(db, kind, user.Id, publicOnly: false, ct));
        });

        api.MapGet("/marketplace/catalog/{kind}", async (string kind, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            if (!IsKind(kind)) return Results.NotFound();
            await using var db = await mysql.OpenConnectionAsync(ct);
            return Results.Ok(await ReadAsync(db, kind, 0, publicOnly: true, ct));
        });

        api.MapPost("/catalog/custom/feats", async (CustomFeatRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            var name = CleanName(req.Name);
            if (name is null) return Results.BadRequest(new { error = "Name is required and must be 255 characters or fewer." });
            if (IsTooLong(req.Description) || IsTooLong(req.Prerequisite)) return Results.BadRequest(new { error = "Text fields must be 20000 characters or fewer." });
            var description = CleanText(req.Description);
            var prerequisite = CleanText(req.Prerequisite);
            var prerequisiteJson = prerequisite is null
                ? null
                : JsonSerializer.Serialize(new object[] { new { other = prerequisite } });

            await using var db = await mysql.OpenConnectionAsync(ct);
            return await InsertAsync(db, """
                INSERT INTO dnd_feats (name, source_book, is_canonical, owner_id, is_public, description, category, prerequisite_json)
                VALUES (@name, @source, 0, @owner, @public, @description, @category, @prerequisite);
                """, cmd => cmd
                    .WithParameter("@name", name)
                    .WithParameter("@source", HomebrewSource)
                    .WithParameter("@owner", user.Id)
                    .WithParameter("@public", req.IsPublic ? 1 : 0)
                    .WithParameter("@description", description)
                    .WithParameter("@category", CleanName(req.Category))
                    .WithParameter("@prerequisite", prerequisiteJson), ct);
        });

        api.MapPost("/catalog/custom/backgrounds", async (CustomBackgroundRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            var name = CleanName(req.Name);
            if (name is null) return Results.BadRequest(new { error = "Name is required and must be 255 characters or fewer." });
            if (IsTooLong(req.Description) || IsTooLong(req.FeatureDesc)) return Results.BadRequest(new { error = "Text fields must be 20000 characters or fewer." });
            var description = CleanText(req.Description);
            var featureDesc = CleanText(req.FeatureDesc);

            await using var db = await mysql.OpenConnectionAsync(ct);
            return await InsertAsync(db, """
                INSERT INTO dnd_backgrounds (name, source_book, is_canonical, owner_id, is_public, description, feature_name, feature_desc, skill_proficiencies_json, tool_proficiencies_json)
                VALUES (@name, @source, 0, @owner, @public, @description, @featureName, @featureDesc, @skills, @tools);
                """, cmd => cmd
                    .WithParameter("@name", name)
                    .WithParameter("@source", HomebrewSource)
                    .WithParameter("@owner", user.Id)
                    .WithParameter("@public", req.IsPublic ? 1 : 0)
                    .WithParameter("@description", description)
                    .WithParameter("@featureName", CleanName(req.FeatureName))
                    .WithParameter("@featureDesc", featureDesc)
                    .WithParameter("@skills", ToJsonList(req.Skills))
                    .WithParameter("@tools", ToJsonList(req.Tools)), ct);
        });

        return api;
    }

    private static bool IsKind(string kind) => kind is "feats" or "backgrounds";

    private static string? CleanName(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed.Length > MaxNameLength) return null;
        return trimmed;
    }

    private static string? CleanText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static bool IsTooLong(string? value) => value is not null && value.Trim().Length > MaxTextLength;

    private static string? ToJsonList(IReadOnlyList<string>? values)
    {
        var cleaned = values?
            .Select(v => v?.Trim())
            .Where(v => !string.IsNullOrEmpty(v))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return cleaned is null || cleaned.Count == 0 ? null : JsonSerializer.Serialize(cleaned);
    }

    private static async Task<IResult> InsertAsync(MySqlConnection db, string sql, Func<MySqlCommand, MySqlCommand> bind, CancellationToken ct)
    {
        await using var cmd = bind(new MySqlCommand(sql, db));
        try
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (MySqlException ex) when (ex.Number == 1062)
        {
            return Results.Conflict(new { error = "You already have a custom entry with this name." });
        }
        return Results.Ok(new { id = cmd.LastInsertedId });
    }

    private static async Task<List<object>> ReadAsync(MySqlConnection db, string kind, long ownerId, bool publicOnly, CancellationToken ct)
    {
        var rows = new List<object>();
        var isFeats = kind == "feats";
        var select = isFeats
            ? "t.id, t.name, t.description, t.category, t.prerequisite_json, t.is_public, u.username"
            : "t.id, t.name, t.description, t.feature_name, t.feature_desc, t.skill_proficiencies_json, t.tool_proficiencies_json, t.is_public, u.username";
        var table = isFeats ? "dnd_feats" : "dnd_backgrounds";
        var filter = publicOnly ? "t.is_public = 1" : "t.owner_id = @owner";
        var sql = $"""
            SELECT {select}
            FROM {table} t
            JOIN lw_users u ON u.id = t.owner_id
            WHERE t.is_canonical = 0 AND {filter}
            ORDER BY t.name ASC
            LIMIT 500;
            """;

        await using var cmd = new MySqlCommand(sql, db);
        if (!publicOnly) cmd.Parameters.AddWithValue("@owner", ownerId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            rows.Add(isFeats
                ? new
                {
                    id = r.GetInt64(0),
                    name = r.GetString(1),
                    description = r.IsDBNull(2) ? "" : r.GetString(2),
                    category = r.IsDBNull(3) ? "" : r.GetString(3),
                    prerequisiteJson = r.IsDBNull(4) ? "" : r.GetString(4),
                    isPublic = r.GetBoolean(5),
                    creatorUsername = r.GetString(6)
                }
                : new
                {
                    id = r.GetInt64(0),
                    name = r.GetString(1),
                    description = r.IsDBNull(2) ? "" : r.GetString(2),
                    featureName = r.IsDBNull(3) ? "" : r.GetString(3),
                    featureDesc = r.IsDBNull(4) ? "" : r.GetString(4),
                    skillsJson = CatalogProficiencyJson.ToStringArray(r.IsDBNull(5) ? null : r.GetString(5)),
                    toolsJson = CatalogProficiencyJson.ToStringArray(r.IsDBNull(6) ? null : r.GetString(6)),
                    isPublic = r.GetBoolean(7),
                    creatorUsername = r.GetString(8)
                });
        }
        return rows;
    }
}

internal static class CatalogCommandExtensions
{
    public static MySqlCommand WithParameter(this MySqlCommand cmd, string name, object? value)
    {
        cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return cmd;
    }
}
